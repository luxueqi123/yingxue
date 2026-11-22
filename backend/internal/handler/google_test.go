package handler

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
	"infinite-canvas/backend/internal/database"
	"infinite-canvas/backend/internal/model"
	"infinite-canvas/backend/internal/repository"
	"infinite-canvas/backend/internal/service"
)

func TestGoogleHTTPSettingsCookieAndFailedCallback(t *testing.T) {
	gin.SetMode(gin.TestMode)
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	if err != nil {
		t.Fatal(err)
	}
	if err := database.MigrateSchema(db); err != nil {
		t.Fatal(err)
	}
	sqlDB, _ := db.DB()
	t.Cleanup(func() { _ = sqlDB.Close() })
	svc := service.New(repository.New(db), t.TempDir())
	previousRuntime := runtimeService
	ConfigureRuntime(svc)
	t.Cleanup(func() { ConfigureRuntime(previousRuntime); svc.Close() })
	session, err := svc.Register(service.RegisterRequest{Username: "admin", Password: "isolation-test-password", AcceptedTerms: true})
	if err != nil {
		t.Fatal(err)
	}
	router := gin.New()
	group := router.Group("/api")
	registerGoogleAuthRoutes(group, svc)
	registerGoogleSettingRoutes(group, svc)
	do := func(method, path, body string, cookie bool) *httptest.ResponseRecorder {
		req := httptest.NewRequest(method, path, strings.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("X-Forwarded-Proto", "https")
		if cookie {
			req.AddCookie(&http.Cookie{Name: service.SessionCookieName, Value: session.Session})
		}
		rec := httptest.NewRecorder()
		router.ServeHTTP(rec, req)
		return rec
	}
	body := `{"enabled":true,"clientId":"test-client","clientSecret":"private-test-secret","redirectUrl":"https://canvas.example/api/auth/google/callback"}`
	if response := do("PATCH", "/api/admin/settings/google", body, false); response.Code < 400 {
		t.Fatal("anonymous updated Google settings")
	}
	if response := do("GET", "/api/admin/settings/google", "", false); response.Code < 400 {
		t.Fatal("anonymous read Google settings")
	}
	response := do("PATCH", "/api/admin/settings/google", body, true)
	if response.Code != 200 || strings.Contains(response.Body.String(), "private-test-secret") || !strings.Contains(response.Body.String(), `"hasClientSecret":true`) {
		t.Fatalf("unsafe/failed setting response: %d %s", response.Code, response.Body)
	}
	var setting model.SystemSetting
	if err := db.First(&setting, "key = ?", "google_oauth").Error; err != nil {
		t.Fatal(err)
	}
	if strings.Contains(setting.ValueJSON, "private-test-secret") {
		t.Fatal("real host stored plaintext secret")
	}
	response = do("GET", "/api/admin/settings/google", "", true)
	if response.Code != 200 || strings.Contains(response.Body.String(), "private-test-secret") {
		t.Fatal("setting read leaked secret")
	}
	public, err := svc.PublicAuthSettings()
	if err != nil || !public.GoogleEnabled {
		t.Fatalf("Google public setting: %+v %v", public, err)
	}
	response = do("GET", "/api/auth/google/start?next=https%3A%2F%2Fevil.example", "", false)
	u, err := url.Parse(response.Header().Get("Location"))
	if err != nil || response.Code != 302 || u.Host != "accounts.google.com" {
		t.Fatalf("bad OAuth redirect: %d %v", response.Code, err)
	}
	state := u.Query().Get("state")
	var binding *http.Cookie
	for _, cookie := range response.Result().Cookies() {
		if cookie.Name == googleOAuthCookieName(state) {
			binding = cookie
		}
	}
	if binding == nil || !binding.HttpOnly || !binding.Secure || binding.SameSite != http.SameSiteLaxMode || binding.Path != "/api/auth/google/callback" || binding.MaxAge != 600 {
		t.Fatalf("unsafe browser binding cookie: %+v", binding)
	}
	if response.Header().Get("Cache-Control") != "no-store" {
		t.Fatal("OAuth redirect is cacheable")
	}
	var stored model.OAuthState
	if err := db.First(&stored, "provider = ?", "google").Error; err != nil {
		t.Fatal(err)
	}
	if stored.NextPath != "/create" || stored.StateHash == state || stored.StateHash == "" {
		t.Fatal("unsafe saved OAuth state")
	}
	// An attacker with only the URL must not obtain a session or consume the victim's state.
	response = do("GET", "/api/auth/google/callback?state="+url.QueryEscape(state)+"&code=untrusted", "", false)
	if response.Code != 302 || !strings.HasPrefix(response.Header().Get("Location"), "/login?oauth_error=") {
		t.Fatal("bad callback did not return login error")
	}
	for _, cookie := range response.Result().Cookies() {
		if cookie.Name == service.SessionCookieName && cookie.Value != "" {
			t.Fatal("bad callback issued session")
		}
	}
	if err := db.First(&stored, "provider = ?", "google").Error; err != nil || stored.UsedAt != nil {
		t.Fatal("wrong browser consumed OAuth state")
	}
	if response := do("GET", "/api/auth/google/callback?error=access_denied", "", false); response.Code != 302 {
		t.Fatal("authorization denial not handled")
	}
	user := model.User{ID: "normal", Username: "normal", Role: model.UserRoleUser, Status: model.UserStatusActive}
	if _, err := svc.UpdateGoogleSetting(&user, service.GoogleSettingRequest{}); err == nil {
		t.Fatal("non-admin changed settings through host")
	}
	encoded, _ := json.Marshal(public)
	if strings.Contains(string(encoded), "test-client") || strings.Contains(string(encoded), "secret") {
		t.Fatal("public settings exposed configuration")
	}
}
