package auth

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/url"
	"strings"
	"testing"
	"time"

	"golang.org/x/oauth2"
	"gorm.io/gorm"

	"infinite-canvas/backend/internal/model"
)

func newGitHubTest(t *testing.T) (*Service, *gorm.DB, *GitHubLoginStart) {
	t.Helper()
	svc, db := newRegistrationTestService(t)
	for _, value := range []any{
		&model.User{ID: "admin", Username: "admin", Role: model.UserRoleAdmin, Status: model.UserStatusActive},
		&model.SystemSetting{Key: registrationSettingKey, ValueJSON: `{"enabled":true}`},
		&model.SystemSetting{Key: githubSettingKey, ValueJSON: `{"enabled":true,"clientId":"test-client","clientSecret":"test-only-secret","redirectUrl":"https://canvas.example/api/auth/github/callback"}`},
	} {
		if err := db.Create(value).Error; err != nil {
			t.Fatal(err)
		}
	}
	start, err := svc.BeginGitHubLogin("/canvas/project?view=storyboard", true)
	if err != nil {
		t.Fatal(err)
	}
	return svc, db, start
}

func githubTestHTTP(t *testing.T, svc *Service, start *GitHubLoginStart, mode string) *int {
	t.Helper()
	authorization, _ := url.Parse(start.URL)
	requests := 0
	svc.githubHTTP = &http.Client{Transport: googleTestTransport(func(req *http.Request) (*http.Response, error) {
		requests++
		status := http.StatusOK
		var data any
		switch req.URL.Path {
		case "/login/oauth/access_token":
			if req.URL.Host != "github.com" || req.Method != http.MethodPost {
				t.Fatal("wrong token endpoint")
			}
			if err := req.ParseForm(); err != nil {
				t.Fatal(err)
			}
			if req.Form.Get("code") != "test-code" || req.Form.Get("client_id") != "test-client" || req.Form.Get("client_secret") != "test-only-secret" || req.Form.Get("redirect_uri") != "https://canvas.example/api/auth/github/callback" || req.Form.Get("grant_type") != "authorization_code" {
				t.Fatal("incorrect GitHub token exchange contract")
			}
			if oauth2.S256ChallengeFromVerifier(req.Form.Get("code_verifier")) != authorization.Query().Get("code_challenge") {
				t.Fatal("PKCE verifier does not match challenge")
			}
			data = map[string]any{"access_token": "test-access", "token_type": "bearer", "scope": "user:email"}
			if mode == "token error" {
				status = http.StatusBadRequest
				data = map[string]any{"error": "invalid_grant", "error_description": "test-only-secret test-code test-access"}
			}
		case "/user":
			data = map[string]any{"id": 123456, "login": "creator", "name": "Creator", "avatar_url": "https://avatars.githubusercontent.com/u/123456", "email": "unverified@example.com"}
			if mode == "invalid identity" {
				data.(map[string]any)["id"] = 0
			}
			if mode == "profile error" {
				status = http.StatusUnauthorized
			}
		case "/user/emails":
			data = []githubEmail{{Email: "creator@example.com", Primary: true, Verified: true}}
			switch mode {
			case "unverified email":
				data = []githubEmail{{Email: "creator@example.com", Primary: true}}
			case "secondary only":
				data = []githubEmail{{Email: "creator@example.com", Verified: true}}
			case "no email":
				data = []githubEmail{}
			case "invalid email":
				data = []githubEmail{{Email: "not-an-email", Primary: true, Verified: true}}
			case "email error":
				status = http.StatusForbidden
			case "paginated email":
				if req.URL.Query().Get("page") == "1" {
					data = make([]githubEmail, 100)
				}
			}
		default:
			t.Fatalf("unexpected external endpoint: %s", req.URL)
		}
		if req.URL.Path != "/login/oauth/access_token" && (req.URL.Host != "api.github.com" || req.Header.Get("Authorization") != "Bearer test-access" || req.Method != http.MethodGet || req.Header.Get("User-Agent") == "") {
			t.Fatal("unsafe GitHub API request")
		}
		body, _ := json.Marshal(data)
		if mode == "oversized response" && req.URL.Path == "/user" {
			body = []byte(strings.Repeat(" ", (1<<20)+1))
		}
		return &http.Response{StatusCode: status, Header: http.Header{"Content-Type": {"application/json"}}, Body: io.NopCloser(strings.NewReader(string(body)))}, nil
	})}
	return &requests
}

func TestGitHubCreatesVerifiedAccountSessionAndRejectsReplay(t *testing.T) {
	for _, mode := range []string{"normal", "paginated email"} {
		t.Run(mode, func(t *testing.T) {
			svc, db, start := newGitHubTest(t)
			u, _ := url.Parse(start.URL)
			if u.Host != "github.com" || u.Path != "/login/oauth/authorize" || u.Query().Get("scope") != "user:email" || u.Query().Get("code_challenge_method") != "S256" || strings.Contains(start.URL, "test-only-secret") {
				t.Fatal("unsafe authorization URL")
			}
			githubTestHTTP(t, svc, start, mode)
			result, err := svc.CompleteGitHubLogin(context.Background(), start.State, start.BrowserToken, "test-code")
			if err != nil {
				t.Fatal(err)
			}
			if result.Next != "/canvas/project?view=storyboard" || result.Session.Session == "" || result.Session.User.Role != model.UserRoleUser || result.Session.User.EmailVerifiedAt == nil || result.Session.User.Email != "creator@example.com" || result.Session.User.IdentityProvider != "github" || result.Session.User.IdentityID != "123456" {
				t.Fatalf("invalid GitHub account/session: %+v", result.Session.User)
			}
			if _, err := svc.CompleteGitHubLogin(context.Background(), start.State, start.BrowserToken, "test-code"); err == nil {
				t.Fatal("replayed state accepted")
			}
			for _, table := range []any{&model.CreditAccount{}, &model.UserIdentity{}, &model.AuthSession{}} {
				var count int64
				db.Model(table).Count(&count)
				if count != 1 {
					t.Fatalf("unexpected %T rows: %d", table, count)
				}
			}
		})
	}
}

func TestGitHubBrowserBindingAndExpiryPreventExchange(t *testing.T) {
	for _, mode := range []string{"wrong browser", "missing browser", "expired", "different provider"} {
		t.Run(mode, func(t *testing.T) {
			svc, db, start := newGitHubTest(t)
			requests := githubTestHTTP(t, svc, start, "normal")
			browser := start.BrowserToken
			switch mode {
			case "wrong browser":
				browser = "other-browser"
			case "missing browser":
				browser = ""
			case "expired":
				db.Model(&model.OAuthState{}).Where("provider = ?", "github").Update("expires_at", time.Now().Add(-time.Minute))
			case "different provider":
				db.Model(&model.OAuthState{}).Where("provider = ?", "github").Update("provider", "google")
			}
			if _, err := svc.CompleteGitHubLogin(context.Background(), start.State, browser, "test-code"); err == nil || *requests != 0 {
				t.Fatal("invalid state reached upstream or was accepted")
			}
			if mode == "wrong browser" {
				if _, err := svc.CompleteGitHubLogin(context.Background(), start.State, start.BrowserToken, "test-code"); err != nil {
					t.Fatalf("wrong browser consumed valid state: %v", err)
				}
			}
		})
	}
}

func TestGitHubRejectsUntrustedProfilesAndHidesUpstreamErrors(t *testing.T) {
	for _, mode := range []string{"invalid identity", "unverified email", "secondary only", "no email", "invalid email", "profile error", "email error", "token error", "oversized response"} {
		t.Run(mode, func(t *testing.T) {
			svc, db, start := newGitHubTest(t)
			githubTestHTTP(t, svc, start, mode)
			_, err := svc.CompleteGitHubLogin(context.Background(), start.State, start.BrowserToken, "test-code")
			if err == nil || strings.Contains(err.Error(), "test-only-secret") || strings.Contains(err.Error(), "test-code") || strings.Contains(err.Error(), "test-access") {
				t.Fatal("invalid profile accepted or error leaked credentials")
			}
			var count int64
			db.Model(&model.UserIdentity{}).Count(&count)
			if count != 0 {
				t.Fatal("rejected profile wrote an identity")
			}
		})
	}
}

func TestGitHubRegistrationPoliciesCannotBeBypassed(t *testing.T) {
	for _, mode := range []string{"closed", "terms", "sms", "sms and email", "email domain", "existing email", "equivalent email", "disabled setting"} {
		t.Run(mode, func(t *testing.T) {
			svc, db, start := newGitHubTest(t)
			switch mode {
			case "closed":
				db.Model(&model.SystemSetting{}).Where("key = ?", registrationSettingKey).Update("value_json", `{"enabled":false}`)
			case "terms":
				db.Model(&model.OAuthState{}).Where("provider = ?", "github").Update("accepted_terms", false)
			case "sms", "sms and email":
				policy := `{"smsRegistration":true}`
				if mode == "sms and email" {
					policy = `{"smsAndEmailRegistration":true}`
				}
				db.Create(&model.SystemSetting{Key: authPolicyKey, ValueJSON: policy})
			case "email domain":
				db.Model(&model.SystemSetting{}).Where("key = ?", emailSettingKey).Update("value_json", `{"registrationAllowedDomains":["gmail.com"]}`)
			case "existing email", "equivalent email":
				email := "creator@example.com"
				if mode == "equivalent email" {
					email = "CREATOR@example.com"
				}
				db.Create(&model.User{ID: "original", Username: "original", Email: email, Status: model.UserStatusActive})
			case "disabled setting":
				db.Model(&model.SystemSetting{}).Where("key = ?", githubSettingKey).Update("value_json", `{"enabled":false}`)
			}
			githubTestHTTP(t, svc, start, "normal")
			if _, err := svc.CompleteGitHubLogin(context.Background(), start.State, start.BrowserToken, "test-code"); err == nil {
				t.Fatal("registration policy bypassed")
			}
			var count int64
			db.Model(&model.UserIdentity{}).Count(&count)
			if count != 0 {
				t.Fatal("rejected registration merged/created an identity")
			}
		})
	}
}

func TestGitHubExistingIdentityAndDisabledUser(t *testing.T) {
	for _, disabled := range []bool{false, true} {
		svc, db, start := newGitHubTest(t)
		status := model.UserStatusActive
		if disabled {
			status = model.UserStatusDisabled
		}
		db.Create(&model.User{ID: "existing", Username: "existing", Status: status, Role: model.UserRoleUser})
		db.Create(&model.UserIdentity{ID: "identity", UserID: "existing", Provider: "github", Subject: "123456"})
		db.Model(&model.SystemSetting{}).Where("key = ?", registrationSettingKey).Update("value_json", `{"enabled":false}`)
		githubTestHTTP(t, svc, start, "normal")
		result, err := svc.CompleteGitHubLogin(context.Background(), start.State, start.BrowserToken, "test-code")
		if disabled && err == nil {
			t.Fatal("disabled user logged in")
		}
		if !disabled && (err != nil || result.Session.User.ID != "existing") {
			t.Fatalf("existing identity failed: %v", err)
		}
	}
}

func TestGitHubSettingsProtectSecretAndAdminBoundary(t *testing.T) {
	svc, db := newRegistrationTestService(t)
	svc.host = googleSettingTestHost{}
	admin := &model.User{ID: "admin", Role: model.UserRoleAdmin}
	req := GitHubSettingRequest{Enabled: true, ClientID: "client", ClientSecret: "private-test-value", RedirectURL: "https://canvas.example/api/auth/github/callback"}
	if _, err := svc.UpdateGitHubSetting(&model.User{Role: model.UserRoleUser}, req); err == nil {
		t.Fatal("non-admin changed configuration")
	}
	if _, err := svc.AdminGitHubSetting(nil); err == nil {
		t.Fatal("anonymous read configuration")
	}
	setting, err := svc.UpdateGitHubSetting(admin, req)
	if err != nil {
		t.Fatal(err)
	}
	encoded, _ := json.Marshal(setting)
	if !setting.HasClientSecret || strings.Contains(string(encoded), req.ClientSecret) {
		t.Fatal("settings response leaked secret")
	}
	var stored model.SystemSetting
	db.First(&stored, "key = ?", githubSettingKey)
	if strings.Contains(stored.ValueJSON, "\"clientSecret\":\"private-test-value\"") || !strings.Contains(stored.ValueJSON, "encrypted:") {
		t.Fatal("secret was not encrypted")
	}
	req.ClientSecret = ""
	if _, err := svc.UpdateGitHubSetting(admin, req); err != nil {
		t.Fatal(err)
	}
	actual, _ := svc.readGitHubSetting()
	if actual.ClientSecret != "private-test-value" {
		t.Fatal("blank update removed existing secret")
	}
	for _, redirect := range []string{"http://canvas.example/api/auth/github/callback", "https://canvas.example/other", "https://user:password@canvas.example/api/auth/github/callback", "https://canvas.example/api/auth/github/callback?x=1", "https://canvas.example/api/auth/google/callback"} {
		req.RedirectURL = redirect
		if _, err := svc.UpdateGitHubSetting(admin, req); err == nil {
			t.Fatal("invalid redirect accepted")
		}
	}
}
