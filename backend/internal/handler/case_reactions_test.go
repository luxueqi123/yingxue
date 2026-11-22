package handler

import (
	"encoding/json"
	"github.com/gin-gonic/gin"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
	"infinite-canvas/backend/internal/database"
	"infinite-canvas/backend/internal/repository"
	"infinite-canvas/backend/internal/service"
	"net/http/httptest"
	"testing"
)

func TestCaseReactionRoutesRejectAnonymousWrites(t *testing.T) {
	gin.SetMode(gin.TestMode)
	db, err := gorm.Open(sqlite.Open("file:case-reaction-http?mode=memory&cache=shared"), &gorm.Config{})
	if err != nil {
		t.Fatal(err)
	}
	if err := database.MigrateSchema(db); err != nil {
		t.Fatal(err)
	}
	svc := service.New(repository.New(db), t.TempDir())
	router := gin.New()
	RegisterCaseReactionRoutes(router.Group("/api"), svc)
	id := "case-9f636a3c07e248a7a530e6aa4976fd53"
	for _, tc := range []struct {
		method, path string
		status       int
	}{
		{"GET", "/api/public/cases/" + id + "/reaction", 200},
		{"GET", "/api/public/cases/case-missing/reaction", 404},
		{"GET", "/api/cases/" + id + "/reaction", 401},
		{"PUT", "/api/cases/" + id + "/like", 401},
		{"DELETE", "/api/cases/" + id + "/like", 401},
	} {
		response := httptest.NewRecorder()
		router.ServeHTTP(response, httptest.NewRequest(tc.method, tc.path, nil))
		if response.Code != tc.status {
			t.Fatalf("%s %s: %d %s", tc.method, tc.path, response.Code, response.Body.String())
		}
		var body struct{ Code int }
		if err := json.Unmarshal(response.Body.Bytes(), &body); err != nil {
			t.Fatal(err)
		}
		if (body.Code == 0) != (tc.status == 200) {
			t.Fatalf("invalid envelope: %s", response.Body.String())
		}
	}
}
