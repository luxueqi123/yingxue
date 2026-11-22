package handler

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
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

func TestCanvasDocumentCollectionHTTPBoundary(t *testing.T) {
	gin.SetMode(gin.TestMode)
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	if err != nil {
		t.Fatal(err)
	}
	sqlDB, _ := db.DB()
	sqlDB.SetMaxOpenConns(1)
	t.Cleanup(func() { _ = sqlDB.Close() })
	if err := database.MigrateSchema(db); err != nil {
		t.Fatal(err)
	}
	for _, record := range []any{
		&model.User{ID: "collection-user", Username: "collection-user", Role: model.UserRoleUser, Status: model.UserStatusActive},
		&model.AuthSession{ID: "collection-session", UserID: "collection-user", TokenHash: auth.HashToken("test-token"), ExpiresAt: time.Now().Add(time.Hour)},
	} {
		if err := db.Create(record).Error; err != nil {
			t.Fatal(err)
		}
	}
	router := gin.New()
	svc := service.New(repository.New(db), t.TempDir())
	previous := runtimeService
	ConfigureRuntime(svc)
	t.Cleanup(func() { ConfigureRuntime(previous) })
	RegisterUserDataRoutes(router.Group("/api"), svc)
	call := func(method, path, body string) *httptest.ResponseRecorder {
		req := httptest.NewRequest(method, path, bytes.NewBufferString(body))
		req.Header.Set("Content-Type", "application/json")
		req.AddCookie(&http.Cookie{Name: service.SessionCookieName, Value: "collection-session.test-token"})
		recorder := httptest.NewRecorder()
		router.ServeHTTP(recorder, req)
		return recorder
	}
	path := "/api/canvas-projects/collection-canvas"
	initial := call(http.MethodPut, path, `{"project":{"id":"collection-canvas","revision":0,"nodes":[],"connections":[],"chatSessions":[]}}`)
	if initial.Code != http.StatusOK {
		t.Fatalf("valid create: %d %s", initial.Code, initial.Body.String())
	}
	before := call(http.MethodGet, path, "")
	for _, extra := range []string{"", `,"repairMissingResources":true`} {
		rejected := call(http.MethodPut, path, `{"project":{"id":"collection-canvas","revision":1,"nodes":[],"connections":[]}`+extra+`}`)
		var envelope struct {
			Code    int    `json:"code"`
			Message string `json:"msg"`
		}
		if err := json.Unmarshal(rejected.Body.Bytes(), &envelope); err != nil {
			t.Fatal(err)
		}
		if rejected.Code != http.StatusBadRequest || envelope.Code == 0 {
			t.Fatalf("invalid write: %d %s", rejected.Code, rejected.Body.String())
		}
	}
	after := call(http.MethodGet, path, "")
	if before.Code != http.StatusOK || after.Code != http.StatusOK || before.Body.String() != after.Body.String() {
		t.Fatal("rejected HTTP write changed saved content or revision")
	}
}
