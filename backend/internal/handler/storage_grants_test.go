package handler

import (
	"net/http"
	"testing"

	"infinite-canvas/backend/internal/service"

	"github.com/gin-gonic/gin"
)

func TestStorageGrantRoutesAreRegistered(t *testing.T) {
	gin.SetMode(gin.TestMode)
	router := gin.New()
	RegisterStorageGrantRoutes(router.Group("/api"), &service.Service{})
	wanted := map[string]bool{
		"GET /api/resources/storage-grants":         false,
		"GET /api/admin/users/:id/storage":          false,
		"POST /api/admin/users/:id/storage-grants":  false,
		"POST /api/admin/storage-grants/:id/revoke": false,
	}
	for _, route := range router.Routes() {
		key := route.Method + " " + route.Path
		if _, exists := wanted[key]; exists {
			wanted[key] = true
		}
	}
	for route, found := range wanted {
		if !found {
			t.Errorf("route %s is not registered", route)
		}
	}
}

func TestStorageReadOnlyGuardKeepsRecoveryAndCleanupRoutesAvailable(t *testing.T) {
	cases := []struct {
		method string
		path   string
		want   bool
	}{
		{method: http.MethodGet, path: "/api/resources/storage-usage", want: true},
		{method: http.MethodDelete, path: "/api/resources/1", want: true},
		{method: http.MethodPost, path: "/api/auth/session/refresh", want: true},
		{method: http.MethodPost, path: "/api/payments/topup-orders", want: true},
		{method: http.MethodPost, path: "/api/admin/storage-grants/1/revoke", want: true},
		{method: http.MethodPost, path: "/api/resources/access", want: true},
		{method: http.MethodPost, path: "/api/tasks/:id/cancel", want: true},
		{method: http.MethodPost, path: "/api/resources", want: false},
		{method: http.MethodPost, path: "/api/canvas-projects", want: false},
	}
	for _, test := range cases {
		t.Run(test.method+" "+test.path, func(t *testing.T) {
			fullPath := test.path
			if got := storageReadOnlyExempt(test.method, fullPath); got != test.want {
				t.Fatalf("storageReadOnlyExempt(%q,%q) = %v, want %v", test.method, fullPath, got, test.want)
			}
		})
	}
}
