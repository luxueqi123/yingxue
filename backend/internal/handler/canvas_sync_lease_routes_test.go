package handler

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
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
	"gorm.io/gorm/logger"
)

func TestCanvasSyncLeaseHTTPBoundary(t *testing.T) {
	gin.SetMode(gin.TestMode)
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{Logger: logger.Default.LogMode(logger.Silent)})
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
	users := []struct {
		id, sessionID, token string
	}{
		{"lease-owner", "lease-owner-session", "lease-owner-token"},
		{"lease-other", "lease-other-session", "lease-other-token"},
		{"lease-readonly", "lease-readonly-session", "lease-readonly-token"},
		{"lease-rate", "lease-rate-session", "lease-rate-token"},
	}
	for _, user := range users {
		if err := db.Create(&model.User{ID: user.id, Username: user.id, Role: model.UserRoleUser, Status: model.UserStatusActive}).Error; err != nil {
			t.Fatal(err)
		}
		if err := db.Create(&model.AuthSession{ID: user.sessionID, UserID: user.id, TokenHash: auth.HashToken(user.token), ExpiresAt: time.Now().Add(time.Hour)}).Error; err != nil {
			t.Fatal(err)
		}
	}
	repo := repository.New(db)
	svc := service.New(repo, t.TempDir())
	previousRuntime := runtimeService
	ConfigureRuntime(svc)
	t.Cleanup(func() { ConfigureRuntime(previousRuntime) })
	router := gin.New()
	api := router.Group("/api")
	api.Use(StorageReadOnlyGuard(svc))
	RegisterUserDataRoutes(api, svc)
	call := func(method, path, body, userID string) *httptest.ResponseRecorder {
		t.Helper()
		req := httptest.NewRequest(method, path, strings.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		if userID != "" {
			for _, user := range users {
				if user.id == userID {
					req.AddCookie(&http.Cookie{Name: service.SessionCookieName, Value: user.sessionID + "." + user.token})
					break
				}
			}
		}
		recorder := httptest.NewRecorder()
		router.ServeHTTP(recorder, req)
		return recorder
	}
	createCanvas := func(userID, canvasID string) service.UserDataSummary {
		t.Helper()
		payload := json.RawMessage(fmt.Sprintf(`{"id":%q,"revision":0,"title":"Lease test","nodes":[],"connections":[],"chatSessions":[]}`, canvasID))
		summary, err := svc.UpsertUserCanvasProject(userID, payload)
		if err != nil {
			t.Fatalf("create canvas %s: %v", canvasID, err)
		}
		return summary
	}
	ownerCanvas := createCanvas("lease-owner", "lease-canvas")
	createCanvas("lease-other", "lease-other-canvas")
	createCanvas("lease-readonly", "lease-readonly-canvas")
	createCanvas("lease-rate", "lease-rate-canvas")

	statusPath := "/api/canvas-projects/lease-canvas/sync-status"
	leasePath := "/api/canvas-projects/lease-canvas/edit-lease"
	for _, request := range []struct {
		method, path, body string
	}{
		{http.MethodGet, statusPath, ""},
		{http.MethodPost, leasePath, `{"action":"acquire","nodeId":"node-1","sessionId":"browser-a"}`},
	} {
		response := call(request.method, request.path, request.body, "")
		if response.Code != http.StatusUnauthorized || response.Header().Get("Cache-Control") != "no-store" {
			t.Fatalf("unauthenticated %s %s: status=%d cache=%q body=%s", request.method, request.path, response.Code, response.Header().Get("Cache-Control"), response.Body.String())
		}
	}

	for _, request := range []struct {
		method, path, body string
	}{
		{http.MethodGet, statusPath, ""},
		{http.MethodPost, leasePath, `{"action":"acquire","nodeId":"node-1","sessionId":"browser-other"}`},
	} {
		response := call(request.method, request.path, request.body, "lease-other")
		if response.Code != http.StatusNotFound || response.Header().Get("Cache-Control") != "no-store" {
			t.Fatalf("cross-account %s %s: status=%d cache=%q body=%s", request.method, request.path, response.Code, response.Header().Get("Cache-Control"), response.Body.String())
		}
	}

	acquired := call(http.MethodPost, leasePath, `{"action":"acquire","nodeId":"node-1","sessionId":"browser-a"}`, "lease-owner")
	if acquired.Code != http.StatusOK || acquired.Header().Get("Cache-Control") != "no-store" {
		t.Fatalf("acquire lease: status=%d cache=%q body=%s", acquired.Code, acquired.Header().Get("Cache-Control"), acquired.Body.String())
	}
	var acquireEnvelope struct {
		Code int `json:"code"`
		Data struct {
			Token string         `json:"token"`
			Lease map[string]any `json:"lease"`
		} `json:"data"`
	}
	if err := json.Unmarshal(acquired.Body.Bytes(), &acquireEnvelope); err != nil {
		t.Fatal(err)
	}
	if acquireEnvelope.Code != service.CodeOK || acquireEnvelope.Data.Token == "" || acquireEnvelope.Data.Lease["nodeId"] != "node-1" {
		t.Fatalf("acquire response must return the proof token and lease: %s", acquired.Body.String())
	}
	if _, exposed := acquireEnvelope.Data.Lease["token"]; exposed {
		t.Fatalf("lease object must not expose its token: %s", acquired.Body.String())
	}
	token := acquireEnvelope.Data.Token

	renewBody := fmt.Sprintf(`{"action":"renew","nodeId":"node-1","sessionId":"browser-a","token":%q}`, token)
	renewed := call(http.MethodPost, leasePath, renewBody, "lease-owner")
	if renewed.Code != http.StatusOK || !bytes.Contains(renewed.Body.Bytes(), []byte(token)) || renewed.Header().Get("Cache-Control") != "no-store" {
		t.Fatalf("renew lease: status=%d cache=%q body=%s", renewed.Code, renewed.Header().Get("Cache-Control"), renewed.Body.String())
	}

	conflict := call(http.MethodPost, leasePath, `{"action":"acquire","nodeId":"node-1","sessionId":"browser-b"}`, "lease-owner")
	var conflictEnvelope struct {
		Code   int    `json:"code"`
		Reason string `json:"reason"`
	}
	if err := json.Unmarshal(conflict.Body.Bytes(), &conflictEnvelope); err != nil {
		t.Fatal(err)
	}
	if conflict.Code != http.StatusConflict || conflictEnvelope.Code != http.StatusConflict || conflictEnvelope.Reason != "canvas_edit_lease_conflict" || conflict.Header().Get("Cache-Control") != "no-store" {
		t.Fatalf("second browser must receive structured lease conflict: %d %s", conflict.Code, conflict.Body.String())
	}

	status := call(http.MethodGet, statusPath, "", "lease-owner")
	if status.Code != http.StatusOK || status.Header().Get("Cache-Control") != "no-store" {
		t.Fatalf("read sync status: status=%d cache=%q body=%s", status.Code, status.Header().Get("Cache-Control"), status.Body.String())
	}
	var statusEnvelope struct {
		Data struct {
			Revision int64            `json:"revision"`
			Leases   []map[string]any `json:"leases"`
		} `json:"data"`
	}
	if err := json.Unmarshal(status.Body.Bytes(), &statusEnvelope); err != nil {
		t.Fatal(err)
	}
	if statusEnvelope.Data.Revision != ownerCanvas.Revision || len(statusEnvelope.Data.Leases) != 1 || statusEnvelope.Data.Leases[0]["sessionId"] != "browser-a" {
		t.Fatalf("sync status did not report the current lease: %s", status.Body.String())
	}
	if bytes.Contains(status.Body.Bytes(), []byte(`"token"`)) || bytes.Contains(status.Body.Bytes(), []byte(token)) {
		t.Fatalf("sync status exposed a lease token: %s", status.Body.String())
	}

	tooLargeBody := fmt.Sprintf(`{"action":"acquire","nodeId":"node-large","sessionId":"browser-a","padding":"%s"}`, strings.Repeat("x", 2048))
	tooLarge := call(http.MethodPost, leasePath, tooLargeBody, "lease-owner")
	if tooLarge.Code != http.StatusBadRequest || tooLarge.Header().Get("Cache-Control") != "no-store" {
		t.Fatalf("edit lease body over 2048 bytes must be rejected: status=%d cache=%q body=%s", tooLarge.Code, tooLarge.Header().Get("Cache-Control"), tooLarge.Body.String())
	}

	releaseBody := fmt.Sprintf(`{"action":"release","nodeId":"node-1","sessionId":"browser-a","token":%q}`, token)
	released := call(http.MethodPost, leasePath, releaseBody, "lease-owner")
	if released.Code != http.StatusOK || released.Header().Get("Cache-Control") != "no-store" || bytes.Contains(released.Body.Bytes(), []byte(token)) || bytes.Contains(released.Body.Bytes(), []byte(`"token"`)) {
		t.Fatalf("release lease: status=%d cache=%q body=%s", released.Code, released.Header().Get("Cache-Control"), released.Body.String())
	}
	status = call(http.MethodGet, statusPath, "", "lease-owner")
	if status.Code != http.StatusOK || bytes.Contains(status.Body.Bytes(), []byte(`"token"`)) || !bytes.Contains(status.Body.Bytes(), []byte(`"leases":[]`)) {
		t.Fatalf("released lease must be absent from sync status: %d %s", status.Code, status.Body.String())
	}

	policy, err := svc.RuntimePolicy()
	if err != nil {
		t.Fatal(err)
	}
	usedBytes := int64(policy.Resource.StoredFileGB)*(1<<30) + 1
	if usedBytes < 1 {
		usedBytes = 1
	}
	if err := db.Create(&model.Resource{ID: "lease-readonly-resource", UserID: "lease-readonly", Kind: "image", Status: model.ResourceStatusReady, ObjectKey: "lease-readonly", Size: usedBytes}).Error; err != nil {
		t.Fatal(err)
	}
	if _, err := repo.MarkUserStorageOverLimit("lease-readonly", time.Now().Add(-8*24*time.Hour)); err != nil {
		t.Fatal(err)
	}
	usage, err := svc.AccountFileStorageUsage("lease-readonly")
	if err != nil || !usage.ReadOnly {
		t.Fatalf("test account must enter seven-day read-only state: usage=%+v err=%v", usage, err)
	}
	readonlyLease := call(http.MethodPost, "/api/canvas-projects/lease-readonly-canvas/edit-lease", `{"action":"acquire","nodeId":"node-1","sessionId":"browser-readonly"}`, "lease-readonly")
	if readonlyLease.Code != http.StatusOK || readonlyLease.Header().Get("Cache-Control") != "no-store" {
		t.Fatalf("read-only account may manage edit lease: status=%d cache=%q body=%s", readonlyLease.Code, readonlyLease.Header().Get("Cache-Control"), readonlyLease.Body.String())
	}

	ratePath := "/api/canvas-projects/lease-rate-canvas/edit-lease"
	// Seed both the required user key and a global-key trap. This checks the
	// exact per-user key and threshold without issuing 240 database writes.
	for _, key := range []string{"canvas-lease:lease-rate", "canvas-lease"} {
		for attempt := 0; attempt < 240; attempt++ {
			allowed, err := svc.AllowRequest(context.Background(), key, 240, time.Minute)
			if err != nil || !allowed {
				t.Fatalf("seed request %d for %q: allowed=%t err=%v", attempt+1, key, allowed, err)
			}
		}
	}
	limited := call(http.MethodPost, ratePath, `{"action":"acquire","nodeId":"node-rate","sessionId":"browser-rate"}`, "lease-rate")
	if limited.Code != http.StatusTooManyRequests || limited.Header().Get("Retry-After") == "" || limited.Header().Get("Cache-Control") != "no-store" {
		t.Fatalf("241st lease request must be rate limited: status=%d retry=%q cache=%q body=%s", limited.Code, limited.Header().Get("Retry-After"), limited.Header().Get("Cache-Control"), limited.Body.String())
	}
	otherUserLease := call(http.MethodPost, "/api/canvas-projects/lease-other-canvas/edit-lease", `{"action":"acquire","nodeId":"node-other","sessionId":"browser-other"}`, "lease-other")
	if otherUserLease.Code != http.StatusOK {
		t.Fatalf("lease rate limit must be scoped per user: %d %s", otherUserLease.Code, otherUserLease.Body.String())
	}
}
