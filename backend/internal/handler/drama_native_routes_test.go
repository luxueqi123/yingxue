package handler

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"infinite-canvas/backend/internal/auth"
	"infinite-canvas/backend/internal/database"
	"infinite-canvas/backend/internal/model"
	"infinite-canvas/backend/internal/repository"
	"infinite-canvas/backend/internal/service"

	"github.com/gin-gonic/gin"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

func TestDramaNativeHTTPCreateOwnershipAndUnavailableStart(t *testing.T) {
	gin.SetMode(gin.TestMode)
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	if err != nil {
		t.Fatal(err)
	}
	sqlDB, err := db.DB()
	if err != nil {
		t.Fatal(err)
	}
	sqlDB.SetMaxOpenConns(1)
	t.Cleanup(func() { _ = sqlDB.Close() })
	if err := database.MigrateSchema(db); err != nil {
		t.Fatal(err)
	}
	for _, id := range []string{"owner", "other"} {
		for _, row := range []any{
			&model.User{ID: id, Username: id, Email: id + "@example.invalid", Role: model.UserRoleUser, Status: model.UserStatusActive},
			&model.AuthSession{ID: id, UserID: id, TokenHash: auth.HashToken("test-token"), ExpiresAt: time.Now().Add(time.Hour)},
		} {
			if err := db.Create(row).Error; err != nil {
				t.Fatal(err)
			}
		}
	}
	svc := service.New(repository.New(db), t.TempDir())
	router := gin.New()
	api := router.Group("/api")
	api.Use(RequireFeature(svc, service.FeatureShortDrama))
	RegisterProjectRoutes(api, svc)
	call := func(method, path, body, actor string) *httptest.ResponseRecorder {
		req := httptest.NewRequest(method, "/api"+path, strings.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		if actor != "" {
			req.AddCookie(&http.Cookie{Name: service.SessionCookieName, Value: actor + ".test-token"})
		}
		w := httptest.NewRecorder()
		router.ServeHTTP(w, req)
		return w
	}
	if w := call(http.MethodGet, "/dramas", "", ""); w.Code != http.StatusUnauthorized {
		t.Fatalf("unauthenticated: %d %s", w.Code, w.Body.String())
	}
	w := call(http.MethodPost, "/dramas", `{"name":"HTTP短剧","episodeMode":"chapter","chapters":[{"title":"第一集","text":"主角推门而入。"}]}`, "owner")
	if w.Code != http.StatusOK {
		t.Fatalf("create: %d %s", w.Code, w.Body.String())
	}
	var envelope struct {
		Code int `json:"code"`
		Data struct {
			Project struct {
				ID string `json:"id"`
			} `json:"project"`
		} `json:"data"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &envelope); err != nil || envelope.Code != 0 || envelope.Data.Project.ID == "" {
		t.Fatalf("create envelope: %s %v", w.Body.String(), err)
	}
	path := "/dramas/" + envelope.Data.Project.ID
	if w := call(http.MethodGet, path, "", "owner"); w.Code != http.StatusOK {
		t.Fatalf("read: %d %s", w.Code, w.Body.String())
	}
	if w := call(http.MethodGet, path, "", "other"); w.Code != http.StatusNotFound {
		t.Fatalf("ownership: %d %s", w.Code, w.Body.String())
	}
	if w := call(http.MethodPost, path+"/start", "", "owner"); w.Code != http.StatusBadRequest {
		t.Fatalf("missing models: %d %s", w.Code, w.Body.String())
	}
	var production model.DramaProduction
	if err := db.First(&production, "project_id = ?", envelope.Data.Project.ID).Error; err != nil || production.Status != model.DramaStatusDraft {
		t.Fatalf("failed start changed state: %+v %v", production, err)
	}
	var jobs int64
	if err := db.Model(&model.DramaJob{}).Count(&jobs).Error; err != nil || jobs != 0 {
		t.Fatalf("unavailable start dispatched jobs: %d %v", jobs, err)
	}
	for _, tc := range []struct {
		method string
		suffix string
		body   string
	}{
		{http.MethodGet, "", ""},
		{http.MethodPost, "/start", ""},
		{http.MethodGet, "/cast", ""},
		{http.MethodDelete, "", ""},
	} {
		t.Run("foreign-project/"+tc.method+tc.suffix, func(t *testing.T) {
			w := call(tc.method, path+tc.suffix, tc.body, "other")
			if w.Code != http.StatusNotFound {
				t.Fatalf("ownership: %d %s", w.Code, w.Body.String())
			}
		})
	}
	for _, tc := range []struct {
		method string
		suffix string
		body   string
	}{
		{http.MethodGet, "/chapters/missing", ""},
		{http.MethodPatch, "/chapters/missing", `{}`},
		{http.MethodGet, "/episodes/missing", ""},
		{http.MethodPatch, "/episodes/missing", `{}`},
		{http.MethodPost, "/episodes/missing/approve", ""},
		{http.MethodPost, "/episodes/missing/rescript", ""},
		{http.MethodPost, "/episodes/missing/segments/generate", `{"segments":[0]}`},
		{http.MethodPost, "/episodes/missing/segments/prompts", `{"segments":[0]}`},
		{http.MethodPost, "/episodes/missing/segments/0/reprocess", ""},
		{http.MethodPatch, "/episodes/missing/segments/0", `{}`},
		{http.MethodPatch, "/shots/missing", `{}`},
		{http.MethodPost, "/shots/missing/insert", `{"position":"after"}`},
		{http.MethodDelete, "/shots/missing", ""},
		{http.MethodPatch, "/cast/missing", `{}`},
		{http.MethodPut, "/cast/missing/image", `{}`},
		{http.MethodPost, "/cast/missing/regenerate", `{}`},
		{http.MethodGet, "/cast/missing/impact", ""},
		{http.MethodGet, "/jobs/missing", ""},
	} {
		t.Run("missing-child/"+tc.method+tc.suffix, func(t *testing.T) {
			w := call(tc.method, path+tc.suffix, tc.body, "owner")
			var envelope struct {
				Code int `json:"code"`
			}
			if err := json.Unmarshal(w.Body.Bytes(), &envelope); err != nil || w.Code != http.StatusNotFound || envelope.Code != http.StatusNotFound {
				t.Fatalf("missing object: %d %s, decode=%v", w.Code, w.Body.String(), err)
			}
		})
	}
	if w := call(http.MethodGet, "/dramas/missing", "", "owner"); w.Code != http.StatusNotFound {
		t.Fatalf("missing project: %d %s", w.Code, w.Body.String())
	}
	// A storage failure remains a server error instead of masquerading as a missing object.
	if err := db.Migrator().DropTable(&model.DramaCast{}); err != nil {
		t.Fatal(err)
	}
	if w := call(http.MethodPatch, path+"/cast/missing", `{}`, "owner"); w.Code != http.StatusInternalServerError {
		t.Fatalf("storage failure: %d %s", w.Code, w.Body.String())
	}
}
