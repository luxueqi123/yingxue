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
)

func TestWorkbenchAPIRoutesEnforceSessionFeatureAndTaskOwnership(t *testing.T) {
	gin.SetMode(gin.TestMode)
	db, err := database.Open(database.Config{Driver: "sqlite", DSN: ":memory:"})
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
	now := time.Now().UTC()
	for _, record := range []any{
		&model.User{ID: "workbench-user", Username: "workbench-user", Role: model.UserRoleUser, Status: model.UserStatusActive},
		&model.AuthSession{ID: "workbench-session", UserID: "workbench-user", TokenHash: auth.HashToken("test-token"), ExpiresAt: now.Add(time.Hour)},
		&model.Task{ID: "workbench-user-task", UserID: "workbench-user", Type: "canvas_image", WorkbenchKind: model.WorkbenchKindImage, Status: model.TaskStatusQueued, Prompt: "own task", CreatedAt: now},
		&model.Task{ID: "foreign-workbench-task", UserID: "other-user", Type: "canvas_image", WorkbenchKind: model.WorkbenchKindImage, Status: model.TaskStatusQueued, Prompt: "foreign task", CreatedAt: now.Add(time.Second)},
	} {
		if err := db.Create(record).Error; err != nil {
			t.Fatal(err)
		}
	}
	svc := service.New(repository.New(db), t.TempDir())
	router := gin.New()
	RegisterCanvasAPI(router.Group("/api"), svc)
	request := func(path string, authenticated bool) *httptest.ResponseRecorder {
		req := httptest.NewRequest(http.MethodGet, path, nil)
		if authenticated {
			req.AddCookie(&http.Cookie{Name: service.SessionCookieName, Value: "workbench-session.test-token"})
		}
		recorder := httptest.NewRecorder()
		router.ServeHTTP(recorder, req)
		return recorder
	}

	if response := request("/api/workbench/tools?kind=image", false); response.Code != http.StatusUnauthorized {
		t.Fatalf("anonymous tool request while disabled: %d %s", response.Code, response.Body.String())
	}
	if response := request("/api/workbench/tools?kind=image", true); response.Code != http.StatusForbidden {
		t.Fatalf("disabled image workbench: %d %s", response.Code, response.Body.String())
	}
	if response := request("/api/workbench/tasks?kind=image", true); response.Code != http.StatusOK || !strings.Contains(response.Body.String(), "workbench-user-task") || strings.Contains(response.Body.String(), "foreign-workbench-task") {
		t.Fatalf("disabled image workbench must retain only owned history: %d %s", response.Code, response.Body.String())
	}
	if response := request("/api/admin/workbench/tools", false); response.Code != http.StatusUnauthorized {
		t.Fatalf("anonymous admin request: %d %s", response.Code, response.Body.String())
	}
	if response := request("/api/admin/workbench/tools", true); response.Code != http.StatusForbidden {
		t.Fatalf("regular user admin request: %d %s", response.Code, response.Body.String())
	}

	if err := db.Create(&model.SystemSetting{Key: "feature_availability", ValueJSON: `{"imageWorkbenchEnabled":true}`}).Error; err != nil {
		t.Fatal(err)
	}
	response := request("/api/workbench/tasks?kind=image", true)
	if response.Code != http.StatusOK {
		t.Fatalf("enabled workbench task list: %d %s", response.Code, response.Body.String())
	}
	var payload struct {
		Data []struct {
			ID string `json:"id"`
		} `json:"data"`
	}
	if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
		t.Fatal(err)
	}
	if len(payload.Data) != 1 || payload.Data[0].ID != "workbench-user-task" {
		t.Fatalf("workbench task list crossed user boundary: %#v", payload.Data)
	}
}
