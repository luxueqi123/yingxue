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

func TestGitHubHTTPSettingsCookieAndFailedCallback(t *testing.T) {
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
	registerGitHubAuthRoutes(group, svc)
	registerGitHubSettingRoutes(group, svc)
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
	body := `{"enabled":true,"clientId":"test-client","clientSecret":"private-test-secret","redirectUrl":"https://canvas.example/api/auth/github/callback"}`
	if response := do("PATCH", "/api/admin/settings/github", body, false); response.Code < 400 {
		t.Fatal("anonymous updated GitHub settings")
	}
	if response := do("GET", "/api/admin/settings/github", "", false); response.Code < 400 {
		t.Fatal("anonymous read GitHub settings")
	}
	response := do("PATCH", "/api/admin/settings/github", body, true)
	if response.Code != 200 || strings.Contains(response.Body.String(), "private-test-secret") || !strings.Contains(response.Body.String(), `"hasClientSecret":true`) {
		t.Fatalf("unsafe/failed setting response: %d %s", response.Code, response.Body)
	}
	var setting model.SystemSetting
	if err := db.First(&setting, "key = ?", "github_oauth").Error; err != nil {
		t.Fatal(err)
	}
	if strings.Contains(setting.ValueJSON, "private-test-secret") {
		t.Fatal("real host stored plaintext secret")
	}
	response = do("GET", "/api/admin/settings/github", "", true)
	if response.Code != 200 || strings.Contains(response.Body.String(), "private-test-secret") {
		t.Fatal("setting read leaked secret")
	}
	public, err := svc.PublicAuthSettings()
	if err != nil || !public.GitHubEnabled {
		t.Fatalf("GitHub public setting: %+v %v", public, err)
	}
	response = do("GET", "/api/auth/github/start?next=https%3A%2F%2Fevil.example", "", false)
	u, err := url.Parse(response.Header().Get("Location"))
	if err != nil || response.Code != 302 || u.Host != "github.com" {
		t.Fatalf("bad OAuth redirect: %d %v", response.Code, err)
	}
	state := u.Query().Get("state")
	var binding *http.Cookie
	for _, cookie := range response.Result().Cookies() {
		if cookie.Name == githubOAuthCookieName(state) {
			binding = cookie
		}
	}
	if binding == nil || !binding.HttpOnly || !binding.Secure || binding.SameSite != http.SameSiteLaxMode || binding.Path != "/api/auth/github/callback" || binding.MaxAge != 600 {
		t.Fatalf("unsafe browser binding cookie: %+v", binding)
	}
	if response.Header().Get("Cache-Control") != "no-store" {
		t.Fatal("OAuth redirect is cacheable")
	}
	var stored model.OAuthState
	if err := db.First(&stored, "provider = ?", "github").Error; err != nil {
		t.Fatal(err)
	}
	if stored.NextPath != "/create" || stored.StateHash == state || stored.StateHash == "" {
		t.Fatal("unsafe saved OAuth state")
	}
	// An attacker with only the URL must not obtain a session or consume the victim's state.
	response = do("GET", "/api/auth/github/callback?state="+url.QueryEscape(state)+"&code=untrusted", "", false)
	if response.Code != 302 || !strings.HasPrefix(response.Header().Get("Location"), "/login?oauth_error=") {
		t.Fatal("bad callback did not return login error")
	}
	for _, cookie := range response.Result().Cookies() {
		if cookie.Name == service.SessionCookieName && cookie.Value != "" {
			t.Fatal("bad callback issued session")
		}
	}
	if err := db.First(&stored, "provider = ?", "github").Error; err != nil || stored.UsedAt != nil {
		t.Fatal("wrong browser consumed OAuth state")
	}
	if response := do("GET", "/api/auth/github/callback?error=access_denied", "", false); response.Code != 302 {
		t.Fatal("authorization denial not handled")
	}
	user := model.User{ID: "normal", Username: "normal", Role: model.UserRoleUser, Status: model.UserStatusActive}
	if _, err := svc.UpdateGitHubSetting(&user, service.GitHubSettingRequest{}); err == nil {
		t.Fatal("non-admin changed settings through host")
	}
	encoded, _ := json.Marshal(public)
	if strings.Contains(string(encoded), "test-client") || strings.Contains(string(encoded), "secret") {
		t.Fatal("public settings exposed configuration")
	}
	for _, path := range []string{"/api/auth/profile/github", "/api/auth/profile/github/start"} {
		method := http.MethodGet
		if strings.HasSuffix(path, "/start") {
			method = http.MethodPost
		}
		if rec := do(method, path, `{"confirmed":true}`, false); rec.Code != 401 {
			t.Fatalf("anonymous profile access allowed: %s %d", path, rec.Code)
		}
	}
	if rec := do("POST", "/api/auth/profile/github/start", `{"confirmed":false}`, true); rec.Code < 400 {
		t.Fatal("unconfirmed linking accepted")
	}
	request := httptest.NewRequest("POST", "/api/auth/profile/github/start", strings.NewReader(`{"confirmed":true}`))
	request.Header.Set("Content-Type", "application/json")
	request.Header.Set("Sec-Fetch-Site", "cross-site")
	request.AddCookie(&http.Cookie{Name: service.SessionCookieName, Value: session.Session})
	recorder := httptest.NewRecorder()
	router.ServeHTTP(recorder, request)
	if recorder.Code != 403 {
		t.Fatal("cross-site binding accepted")
	}
	response = do("GET", "/api/auth/profile/github", "", true)
	if response.Code != 200 || !strings.Contains(response.Body.String(), `"linked":false`) || strings.Contains(response.Body.String(), "test-client") {
		t.Fatal("invalid profile binding status")
	}
	response = do("POST", "/api/auth/profile/github/start", `{"confirmed":true}`, true)
	var link struct {
		Data struct {
			URL string `json:"url"`
		} `json:"data"`
	}
	if err := json.Unmarshal(response.Body.Bytes(), &link); err != nil || response.Code != 200 {
		t.Fatalf("binding start failed: %d %s", response.Code, response.Body)
	}
	authorization, err := url.Parse(link.Data.URL)
	if err != nil || authorization.Host != "github.com" || !strings.HasPrefix(authorization.Query().Get("state"), "link.") {
		t.Fatal("invalid binding authorization")
	}
	var linkState model.OAuthState
	if err := db.First(&linkState, "provider = ?", "github-link").Error; err != nil || linkState.ReauthUserID != session.User.ID || linkState.ReauthSessionID == "" {
		t.Fatal("binding is not tied to authenticated account/session")
	}
	response = do("GET", "/api/auth/github/callback?state="+authorization.Query().Get("state")+"&code=untrusted", "", true)
	if response.Code != 302 || !strings.HasPrefix(response.Header().Get("Location"), "/settings?section=profile&github=error") {
		t.Fatal("binding callback did not return profile error")
	}
	if err := db.First(&linkState, "id = ?", linkState.ID).Error; err != nil || linkState.UsedAt != nil {
		t.Fatal("missing binding cookie consumed state")
	}
	for _, cookie := range response.Result().Cookies() {
		if cookie.Name == service.SessionCookieName {
			t.Fatal("failed binding replaced login session")
		}
	}
	response = do("GET", "/api/auth/github/callback?state=link.cancelled&error=access_denied", "", true)
	if response.Header().Get("Location") != "/settings?section=profile&github=cancelled" {
		t.Fatal("binding denial did not return profile")
	}
}
