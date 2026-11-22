package auth

import (
	"context"
	"crypto/rand"
	"crypto/rsa"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/url"
	"strings"
	"testing"
	"time"

	"github.com/go-jose/go-jose/v4"
	"golang.org/x/oauth2"
	"gorm.io/gorm"

	"infinite-canvas/backend/internal/kernel"
	"infinite-canvas/backend/internal/model"
)

type googleTestTransport func(*http.Request) (*http.Response, error)

func (f googleTestTransport) RoundTrip(req *http.Request) (*http.Response, error) { return f(req) }

func newGoogleTest(t *testing.T) (*Service, *gorm.DB, *GoogleLoginStart) {
	t.Helper()
	svc, db := newRegistrationTestService(t)
	if err := db.Create(&model.User{ID: "admin", Username: "admin", Role: model.UserRoleAdmin, Status: model.UserStatusActive}).Error; err != nil {
		t.Fatal(err)
	}
	for _, setting := range []model.SystemSetting{
		{Key: registrationSettingKey, ValueJSON: `{"enabled":true}`},
		{Key: googleSettingKey, ValueJSON: `{"enabled":true,"clientId":"test-client","clientSecret":"test-only-secret","redirectUrl":"https://canvas.example/api/auth/google/callback"}`},
	} {
		if err := db.Create(&setting).Error; err != nil {
			t.Fatal(err)
		}
	}
	start, err := svc.BeginGoogleLogin("/canvas/project?view=storyboard", true)
	if err != nil {
		t.Fatal(err)
	}
	return svc, db, start
}

// Exercise the real OAuth exchange and RS256/JWKS verifier with an isolated HTTP transport.
func googleTestHTTP(t *testing.T, svc *Service, start *GoogleLoginStart, mutate func(map[string]any)) *int {
	t.Helper()
	key, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		t.Fatal(err)
	}
	signer, err := jose.NewSigner(jose.SigningKey{Algorithm: jose.RS256, Key: key}, &jose.SignerOptions{ExtraHeaders: map[jose.HeaderKey]any{"kid": "test-key"}})
	if err != nil {
		t.Fatal(err)
	}
	u, _ := url.Parse(start.URL)
	claims := map[string]any{
		"iss": googleIssuer, "aud": "test-client", "sub": "google-subject-1", "nonce": u.Query().Get("nonce"),
		"exp": time.Now().Add(time.Hour).Unix(), "iat": time.Now().Unix(),
		"email": "creator@example.com", "email_verified": true, "name": "Creator", "picture": "https://example.com/avatar.png",
	}
	if mutate != nil {
		mutate(claims)
	}
	body, _ := json.Marshal(claims)
	signed, err := signer.Sign(body)
	if err != nil {
		t.Fatal(err)
	}
	rawToken, err := signed.CompactSerialize()
	if err != nil {
		t.Fatal(err)
	}
	requests := 0
	svc.googleHTTP = &http.Client{Transport: googleTestTransport(func(req *http.Request) (*http.Response, error) {
		requests++
		var data []byte
		switch req.URL.String() {
		case "https://oauth2.googleapis.com/token":
			if req.Method != "POST" {
				t.Fatalf("token method: %s", req.Method)
			}
			if err := req.ParseForm(); err != nil {
				t.Fatal(err)
			}
			if req.Form.Get("code") != "test-code" || req.Form.Get("client_secret") != "test-only-secret" || req.Form.Get("redirect_uri") != "https://canvas.example/api/auth/google/callback" || req.Form.Get("grant_type") != "authorization_code" {
				t.Fatal("incorrect token exchange contract")
			}
			if oauth2.S256ChallengeFromVerifier(req.Form.Get("code_verifier")) != u.Query().Get("code_challenge") {
				t.Fatal("PKCE verifier does not match authorization challenge")
			}
			data, _ = json.Marshal(map[string]any{"access_token": "test-access", "token_type": "Bearer", "id_token": rawToken})
		case googleJWKSURL:
			data, _ = json.Marshal(jose.JSONWebKeySet{Keys: []jose.JSONWebKey{{Key: &key.PublicKey, KeyID: "test-key", Algorithm: "RS256", Use: "sig"}}})
		default:
			t.Fatalf("unexpected external endpoint: %s", req.URL)
		}
		return &http.Response{StatusCode: 200, Header: http.Header{"Content-Type": {"application/json"}}, Body: io.NopCloser(strings.NewReader(string(data)))}, nil
	})}
	return &requests
}

func TestGoogleCreatesVerifiedAccountSessionAndRejectsReplay(t *testing.T) {
	svc, db, start := newGoogleTest(t)
	u, _ := url.Parse(start.URL)
	if u.Host != "accounts.google.com" || u.Query().Get("code_challenge_method") != "S256" || u.Query().Get("scope") != "openid email profile" || strings.Contains(start.URL, "test-only-secret") {
		t.Fatal("unsafe Google authorization URL")
	}
	googleTestHTTP(t, svc, start, nil)
	result, err := svc.CompleteGoogleLogin(context.Background(), start.State, start.BrowserToken, "test-code")
	if err != nil {
		t.Fatal(err)
	}
	if result.Next != "/canvas/project?view=storyboard" || result.Session.Session == "" || result.Session.User.Role != model.UserRoleUser || result.Session.User.EmailVerifiedAt == nil || result.Session.User.IdentityProvider != "google" {
		t.Fatalf("invalid Google session: next=%s user=%+v", result.Next, result.Session.User)
	}
	if _, err := svc.CompleteGoogleLogin(context.Background(), start.State, start.BrowserToken, "test-code"); err == nil {
		t.Fatal("replayed state accepted")
	}
	var accounts, identities, sessions int64
	db.Model(&model.CreditAccount{}).Count(&accounts)
	db.Model(&model.UserIdentity{}).Count(&identities)
	db.Model(&model.AuthSession{}).Count(&sessions)
	if accounts != 1 || identities != 1 || sessions != 1 {
		t.Fatalf("unexpected writes: %d %d %d", accounts, identities, sessions)
	}
}

func TestGoogleBrowserBindingAndExpiryPreventExchange(t *testing.T) {
	for _, mode := range []string{"wrong browser", "missing browser", "expired"} {
		t.Run(mode, func(t *testing.T) {
			svc, db, start := newGoogleTest(t)
			requests := googleTestHTTP(t, svc, start, nil)
			browser := start.BrowserToken
			if mode == "wrong browser" {
				browser = "other-browser"
			}
			if mode == "missing browser" {
				browser = ""
			}
			if mode == "expired" {
				db.Model(&model.OAuthState{}).Where("provider = ?", "google").Update("expires_at", time.Now().Add(-time.Minute))
			}
			if _, err := svc.CompleteGoogleLogin(context.Background(), start.State, browser, "test-code"); err == nil {
				t.Fatal("invalid browser/state accepted")
			}
			if *requests != 0 {
				t.Fatal("invalid state made an upstream request")
			}
			if mode == "wrong browser" {
				if _, err := svc.CompleteGoogleLogin(context.Background(), start.State, start.BrowserToken, "test-code"); err != nil {
					t.Fatalf("wrong browser consumed real state: %v", err)
				}
			}
		})
	}
}

func TestGoogleRejectsInvalidIDTokensBeforeAccountWrites(t *testing.T) {
	for name, mutate := range map[string]func(map[string]any){
		"issuer":           func(c map[string]any) { c["iss"] = "https://evil.example" },
		"audience":         func(c map[string]any) { c["aud"] = "other-client" },
		"authorized party": func(c map[string]any) { c["azp"] = "other-client" },
		"multiple audiences without authorized party": func(c map[string]any) { c["aud"] = []string{"test-client", "another-client"} },
		"expired":          func(c map[string]any) { c["exp"] = time.Now().Add(-time.Hour).Unix() },
		"nonce":            func(c map[string]any) { c["nonce"] = "other-flow" },
		"unverified email": func(c map[string]any) { c["email_verified"] = false },
		"missing subject":  func(c map[string]any) { delete(c, "sub") },
	} {
		t.Run(name, func(t *testing.T) {
			svc, db, start := newGoogleTest(t)
			googleTestHTTP(t, svc, start, mutate)
			if _, err := svc.CompleteGoogleLogin(context.Background(), start.State, start.BrowserToken, "test-code"); err == nil {
				t.Fatal("invalid token accepted")
			}
			var identities, sessions int64
			db.Model(&model.UserIdentity{}).Count(&identities)
			db.Model(&model.AuthSession{}).Count(&sessions)
			if identities != 0 || sessions != 0 {
				t.Fatal("invalid token wrote an account/session")
			}
		})
	}
}

func TestGoogleRegistrationPoliciesAndExistingEmailCannotBeBypassed(t *testing.T) {
	for _, mode := range []string{"closed", "terms", "sms", "sms and email", "email domain", "existing email", "disabled setting"} {
		t.Run(mode, func(t *testing.T) {
			svc, db, start := newGoogleTest(t)
			switch mode {
			case "closed":
				db.Model(&model.SystemSetting{}).Where("key = ?", registrationSettingKey).Update("value_json", `{"enabled":false}`)
			case "terms":
				db.Model(&model.OAuthState{}).Where("provider = ?", "google").Update("accepted_terms", false)
			case "sms":
				db.Create(&model.SystemSetting{Key: authPolicyKey, ValueJSON: `{"smsRegistration":true}`})
			case "sms and email":
				db.Create(&model.SystemSetting{Key: authPolicyKey, ValueJSON: `{"smsAndEmailRegistration":true}`})
			case "email domain":
				db.Model(&model.SystemSetting{}).Where("key = ?", emailSettingKey).Update("value_json", `{"registrationAllowedDomains":["gmail.com"]}`)
			case "existing email":
				db.Create(&model.User{ID: "original", Username: "original", Email: "creator@example.com", Status: model.UserStatusActive})
			case "disabled setting":
				db.Model(&model.SystemSetting{}).Where("key = ?", googleSettingKey).Update("value_json", `{"enabled":false}`)
			}
			googleTestHTTP(t, svc, start, nil)
			if _, err := svc.CompleteGoogleLogin(context.Background(), start.State, start.BrowserToken, "test-code"); err == nil {
				t.Fatal("registration policy bypassed")
			}
			var identities int64
			db.Model(&model.UserIdentity{}).Count(&identities)
			if identities != 0 {
				t.Fatal("rejected registration created/merged identity")
			}
		})
	}
}

func TestGoogleExistingIdentityCanLoginWhenRegistrationClosedButDisabledUserCannot(t *testing.T) {
	for _, disabled := range []bool{false, true} {
		svc, db, start := newGoogleTest(t)
		status := model.UserStatusActive
		if disabled {
			status = model.UserStatusDisabled
		}
		db.Create(&model.User{ID: "existing", Username: "existing", Status: status, Role: model.UserRoleUser})
		db.Create(&model.UserIdentity{ID: "identity", UserID: "existing", Provider: "google", Subject: "google-subject-1"})
		db.Model(&model.SystemSetting{}).Where("key = ?", registrationSettingKey).Update("value_json", `{"enabled":false}`)
		googleTestHTTP(t, svc, start, nil)
		result, err := svc.CompleteGoogleLogin(context.Background(), start.State, start.BrowserToken, "test-code")
		if disabled && err == nil {
			t.Fatal("disabled account logged in")
		}
		if !disabled && (err != nil || result.Session.User.ID != "existing") {
			t.Fatalf("existing identity login failed: %v", err)
		}
	}
}

type googleSettingTestHost struct{ nopHost }

func (googleSettingTestHost) RequireAdmin(user *model.User) error {
	if user == nil || user.Role != model.UserRoleAdmin {
		return kernel.Forbidden("admin required")
	}
	return nil
}
func (googleSettingTestHost) EncryptSecret(value string) (string, error) {
	return "encrypted:" + value, nil
}
func (googleSettingTestHost) DecryptSecret(value string) (string, error) {
	if !strings.HasPrefix(value, "encrypted:") && value != "" {
		return "", errors.New("invalid ciphertext")
	}
	return strings.TrimPrefix(value, "encrypted:"), nil
}

func TestGoogleSettingsProtectSecretAndAdminBoundary(t *testing.T) {
	svc, db := newRegistrationTestService(t)
	svc.host = googleSettingTestHost{}
	admin := &model.User{ID: "admin", Role: model.UserRoleAdmin}
	req := GoogleSettingRequest{Enabled: true, ClientID: "client", ClientSecret: "private-test-value", RedirectURL: "https://canvas.example/api/auth/google/callback"}
	if _, err := svc.UpdateGoogleSetting(&model.User{Role: model.UserRoleUser}, req); err == nil {
		t.Fatal("non-admin changed setting")
	}
	if _, err := svc.AdminGoogleSetting(nil); err == nil {
		t.Fatal("anonymous read setting")
	}
	value, err := svc.UpdateGoogleSetting(admin, req)
	if err != nil {
		t.Fatal(err)
	}
	encoded, _ := json.Marshal(value)
	if !value.HasClientSecret || strings.Contains(string(encoded), req.ClientSecret) {
		t.Fatal("public response leaked secret")
	}
	var stored model.SystemSetting
	db.First(&stored, "key = ?", googleSettingKey)
	if !strings.Contains(stored.ValueJSON, "encrypted:") {
		t.Fatal("secret was not encrypted")
	}
	req.ClientSecret = ""
	if _, err := svc.UpdateGoogleSetting(admin, req); err != nil {
		t.Fatal(err)
	}
	actual, _ := svc.readGoogleSetting()
	if actual.ClientSecret != "private-test-value" {
		t.Fatal("blank update discarded secret")
	}
	for _, redirect := range []string{"http://canvas.example/api/auth/google/callback", "https://evil.example/other", "https://user:password@canvas.example/api/auth/google/callback", "https://canvas.example/api/auth/google/callback?x=1"} {
		req.RedirectURL = redirect
		if _, err := svc.UpdateGoogleSetting(admin, req); err == nil {
			t.Fatal("invalid redirect accepted")
		}
	}
}

func TestGoogleHidesUpstreamSecretErrors(t *testing.T) {
	svc, _, start := newGoogleTest(t)
	svc.googleHTTP = &http.Client{Transport: googleTestTransport(func(req *http.Request) (*http.Response, error) {
		return &http.Response{StatusCode: 400, Header: http.Header{"Content-Type": {"application/json"}}, Body: io.NopCloser(strings.NewReader(`{"error":"invalid_grant","error_description":"test-only-secret test-code"}`))}, nil
	})}
	_, err := svc.CompleteGoogleLogin(context.Background(), start.State, start.BrowserToken, "test-code")
	if err == nil || strings.Contains(err.Error(), "test-only-secret") || strings.Contains(err.Error(), "test-code") {
		t.Fatal("upstream error leaked sensitive data")
	}
}

func TestGoogleRejectsTamperedSignature(t *testing.T) {
	svc, db, start := newGoogleTest(t)
	googleTestHTTP(t, svc, start, nil)
	transport := svc.googleHTTP.Transport
	svc.googleHTTP.Transport = googleTestTransport(func(req *http.Request) (*http.Response, error) {
		response, err := transport.RoundTrip(req)
		if err != nil || req.URL.Host != "oauth2.googleapis.com" {
			return response, err
		}
		defer response.Body.Close()
		var token map[string]any
		if err := json.NewDecoder(response.Body).Decode(&token); err != nil {
			t.Fatal(err)
		}
		parts := strings.Split(token["id_token"].(string), ".")
		parts[2] = "AA" + parts[2][2:]
		token["id_token"] = strings.Join(parts, ".")
		body, _ := json.Marshal(token)
		response.Body = io.NopCloser(strings.NewReader(string(body)))
		return response, nil
	})
	if _, err := svc.CompleteGoogleLogin(context.Background(), start.State, start.BrowserToken, "test-code"); err == nil {
		t.Fatal("tampered signature accepted")
	}
	var sessions int64
	db.Model(&model.AuthSession{}).Count(&sessions)
	if sessions != 0 {
		t.Fatal("tampered token issued a session")
	}
}
