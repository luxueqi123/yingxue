package handler

import (
	"bytes"
	"encoding/json"
	"fmt"
	"log/slog"
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

func TestCanvasOperationsHTTPBoundary(t *testing.T) {
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
	for _, record := range []any{
		&model.User{ID: "operations-user", Username: "operations-user", Role: model.UserRoleUser, Status: model.UserStatusActive},
		&model.AuthSession{ID: "operations-session", UserID: "operations-user", TokenHash: auth.HashToken("test-token"), ExpiresAt: time.Now().Add(time.Hour)},
		&model.User{ID: "rate-user", Username: "rate-user", Role: model.UserRoleUser, Status: model.UserStatusActive},
		&model.AuthSession{ID: "rate-session", UserID: "rate-user", TokenHash: auth.HashToken("rate-test-token"), ExpiresAt: time.Now().Add(time.Hour)},
		&model.User{ID: "operations-admin", Username: "operations-admin", Role: model.UserRoleAdmin, Status: model.UserStatusActive},
	} {
		if err := db.Create(record).Error; err != nil {
			t.Fatal(err)
		}
	}
	repo := repository.New(db)
	svc := service.New(repo, t.TempDir())
	previousRuntime := runtimeService
	ConfigureRuntime(svc)
	t.Cleanup(func() { ConfigureRuntime(previousRuntime) })
	previousLogger := slog.Default()
	var logOutput bytes.Buffer
	slog.SetDefault(slog.New(slog.NewTextHandler(&logOutput, nil)))
	t.Cleanup(func() { slog.SetDefault(previousLogger) })

	router := gin.New()
	api := router.Group("/api")
	api.Use(StorageReadOnlyGuard(svc))
	RegisterUserDataRoutes(api, svc)
	callWithSession := func(method, path, body, session string) *httptest.ResponseRecorder {
		req := httptest.NewRequest(method, path, strings.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		if session != "" {
			req.AddCookie(&http.Cookie{Name: service.SessionCookieName, Value: session})
		}
		recorder := httptest.NewRecorder()
		router.ServeHTTP(recorder, req)
		return recorder
	}
	call := func(method, path, body string, authenticated bool) *httptest.ResponseRecorder {
		session := ""
		if authenticated {
			session = "operations-session.test-token"
		}
		return callWithSession(method, path, body, session)
	}

	path := "/api/canvas-projects/operations-canvas"
	unauthorized := call(http.MethodPatch, path+"/operations", `{"mutationId":"unauthorized","operations":[]}`, false)
	if unauthorized.Code != http.StatusUnauthorized {
		t.Fatalf("unauthenticated operations write: %d %s", unauthorized.Code, unauthorized.Body.String())
	}
	created := call(http.MethodPut, path, `{"project":{"id":"operations-canvas","revision":0,"title":"项目","nodes":[{"id":"node-1","metadata":{"title":"旧标题"}}],"connections":[],"chatSessions":[]}}`, true)
	if created.Code != http.StatusOK {
		t.Fatalf("create canvas for operations write: %d %s", created.Code, created.Body.String())
	}

	requestBody := `{"mutationId":"mutation-1","baseRevision":1,"operations":[{"type":"patch_node","id":"node-1","patch":{"metadata.title":"新标题-日志不应包含"},"before":{"metadata.title":"旧标题"}}]}`
	updated := call(http.MethodPatch, path+"/operations", requestBody, true)
	if updated.Code != http.StatusOK {
		t.Fatalf("apply canvas operations: %d %s", updated.Code, updated.Body.String())
	}
	var writeEnvelope struct {
		Code int `json:"code"`
		Data struct {
			MutationID string `json:"mutationId"`
			Project    struct {
				ID       string `json:"id"`
				Revision int64  `json:"revision"`
			} `json:"project"`
		} `json:"data"`
	}
	if err := json.Unmarshal(updated.Body.Bytes(), &writeEnvelope); err != nil {
		t.Fatal(err)
	}
	if writeEnvelope.Code != service.CodeOK || writeEnvelope.Data.MutationID != "mutation-1" || writeEnvelope.Data.Project.ID != "operations-canvas" || writeEnvelope.Data.Project.Revision != 2 {
		t.Fatalf("operations response contract mismatch: %s", updated.Body.String())
	}

	replayed := call(http.MethodPatch, path+"/operations", requestBody, true)
	if replayed.Code != http.StatusOK {
		t.Fatalf("replay same mutation: %d %s", replayed.Code, replayed.Body.String())
	}
	var replayEnvelope struct {
		Data struct {
			Project struct {
				Revision int64 `json:"revision"`
			} `json:"project"`
		} `json:"data"`
	}
	if err := json.Unmarshal(replayed.Body.Bytes(), &replayEnvelope); err != nil {
		t.Fatal(err)
	}
	if replayEnvelope.Data.Project.Revision != 2 {
		t.Fatalf("idempotent replay advanced revision: %s", replayed.Body.String())
	}

	read := call(http.MethodGet, path, "", true)
	if read.Code != http.StatusOK {
		t.Fatalf("read canvas after operations write: %d %s", read.Code, read.Body.String())
	}
	var readEnvelope struct {
		Data struct {
			Project struct {
				Revision int64 `json:"revision"`
				Nodes    []struct {
					Metadata struct {
						Title string `json:"title"`
					} `json:"metadata"`
				} `json:"nodes"`
			} `json:"project"`
		} `json:"data"`
	}
	if err := json.Unmarshal(read.Body.Bytes(), &readEnvelope); err != nil {
		t.Fatal(err)
	}
	if readEnvelope.Data.Project.Revision != 2 || len(readEnvelope.Data.Project.Nodes) != 1 || readEnvelope.Data.Project.Nodes[0].Metadata.Title != "新标题-日志不应包含" {
		t.Fatalf("operations were not persisted through HTTP: %s", read.Body.String())
	}

	conflict := call(http.MethodPatch, path+"/operations", `{"mutationId":"mutation-stale","baseRevision":1,"operations":[{"type":"patch_node","id":"node-1","patch":{"metadata.title":"冲突标题"},"before":{"metadata.title":"旧标题"}}]}`, true)
	var conflictEnvelope struct {
		Code   int    `json:"code"`
		Reason string `json:"reason"`
	}
	if err := json.Unmarshal(conflict.Body.Bytes(), &conflictEnvelope); err != nil {
		t.Fatal(err)
	}
	if conflict.Code != http.StatusConflict || conflictEnvelope.Code != http.StatusConflict || conflictEnvelope.Reason != "canvas_field_conflict" {
		t.Fatalf("stale field must return structured 409: %d %s", conflict.Code, conflict.Body.String())
	}

	tooLargeBody := fmt.Sprintf(`{"mutationId":"too-large","operations":[],"padding":"%s"}`, strings.Repeat("x", 5<<20))
	tooLarge := call(http.MethodPatch, path+"/operations", tooLargeBody, true)
	if tooLarge.Code != http.StatusBadRequest {
		t.Fatalf("operations body over 5 MiB must be rejected: %d %s", tooLarge.Code, tooLarge.Body.String())
	}

	if strings.Contains(logOutput.String(), "新标题-日志不应包含") || strings.Contains(logOutput.String(), "冲突标题") {
		t.Fatalf("canvas audit log contains operation payload: %s", logOutput.String())
	}

	policy, err := svc.RuntimePolicy()
	if err != nil {
		t.Fatal(err)
	}
	usedBytes := int64(policy.Resource.StoredFileGB)*(1<<30) + 1
	if usedBytes < 1 {
		usedBytes = 1
	}
	if err := db.Create(&model.Resource{ID: "oversized-resource", UserID: "operations-user", Kind: "image", Status: model.ResourceStatusReady, ObjectKey: "oversized", Size: usedBytes}).Error; err != nil {
		t.Fatal(err)
	}
	if _, err := repo.MarkUserStorageOverLimit("operations-user", time.Now().Add(-8*24*time.Hour)); err != nil {
		t.Fatal(err)
	}
	usage, err := svc.AccountFileStorageUsage("operations-user")
	if err != nil {
		t.Fatal(err)
	}
	if !usage.ReadOnly {
		t.Fatalf("test account did not enter the existing seven-day read-only state: %+v", usage)
	}
	blocked := call(http.MethodPatch, path+"/operations", `{"mutationId":"blocked","operations":[{"type":"patch_node","id":"node-1","patch":{"metadata.title":"只读后不应写入"},"before":{"metadata.title":"新标题-日志不应包含"}}]}`, true)
	var blockedEnvelope struct {
		Code   int    `json:"code"`
		Reason string `json:"reason"`
	}
	if err := json.Unmarshal(blocked.Body.Bytes(), &blockedEnvelope); err != nil {
		t.Fatal(err)
	}
	if blocked.Code != http.StatusForbidden || blockedEnvelope.Code != 40302 || blockedEnvelope.Reason != "storage_read_only" {
		t.Fatalf("seven-day storage guard did not reject operations write: %d %s", blocked.Code, blocked.Body.String())
	}

	rateProject := json.RawMessage(`{"id":"rate-canvas","revision":0,"title":"速率画布","nodes":[{"id":"rate-node","metadata":{"title":"旧"}}],"connections":[],"chatSessions":[]}`)
	if _, err := svc.UpsertUserCanvasProject("rate-user", rateProject); err != nil {
		t.Fatal(err)
	}
	ratePolicy, err := svc.RuntimePolicy()
	if err != nil {
		t.Fatal(err)
	}
	ratePolicy.Request.CanvasWritePerMinute = 1
	if _, err := svc.UpdateRuntimePolicySetting(&model.User{ID: "operations-admin", Role: model.UserRoleAdmin}, ratePolicy); err != nil {
		t.Fatal(err)
	}
	ratePath := "/api/canvas-projects/rate-canvas/operations"
	rateSession := "rate-session.rate-test-token"
	firstRateLimitedWrite := callWithSession(http.MethodPatch, ratePath, `{"mutationId":"rate-first","operations":[{"type":"patch_node","id":"rate-node","patch":{"metadata.title":"新"},"before":{"metadata.title":"旧"}}]}`, rateSession)
	if firstRateLimitedWrite.Code != http.StatusOK {
		t.Fatalf("first write under per-minute limit: %d %s", firstRateLimitedWrite.Code, firstRateLimitedWrite.Body.String())
	}
	secondRateLimitedWrite := callWithSession(http.MethodPatch, ratePath, `{"mutationId":"rate-second","operations":[{"type":"patch_node","id":"rate-node","patch":{"metadata.title":"又新"},"before":{"metadata.title":"新"}}]}`, rateSession)
	if secondRateLimitedWrite.Code != http.StatusTooManyRequests || secondRateLimitedWrite.Header().Get("Retry-After") == "" {
		t.Fatalf("canvas-write limit must reject the next request: %d %s", secondRateLimitedWrite.Code, secondRateLimitedWrite.Body.String())
	}
}
