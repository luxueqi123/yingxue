package auth

import (
	"context"
	"crypto/rand"
	"crypto/rsa"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"
	"time"

	"github.com/go-jose/go-jose/v4"
	"golang.org/x/oauth2"
	"gorm.io/gorm"

	"infinite-canvas/backend/internal/model"
	"infinite-canvas/backend/internal/outbound"
)

type oidcTestFlow struct {
	svc           *Service
	db            *gorm.DB
	issuer        string
	target        *url.URL
	state         string
	claims        map[string]any
	tokenRequests int
}

// Use the real discovery, HTTPS transport, PKCE exchange and RS256 verifier.
func newOIDCTestFlow(t *testing.T) *oidcTestFlow {
	t.Helper()
	svc, db := newRegistrationTestService(t)
	flow := &oidcTestFlow{svc: svc, db: db}
	if err := db.Create(&model.User{ID: "admin", Username: "admin", Role: model.UserRoleAdmin, Status: model.UserStatusActive}).Error; err != nil {
		t.Fatal(err)
	}
	if err := db.Create(&model.SystemSetting{Key: registrationSettingKey, ValueJSON: `{"enabled":true}`}).Error; err != nil {
		t.Fatal(err)
	}
	key, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		t.Fatal(err)
	}
	signer, err := jose.NewSigner(jose.SigningKey{Algorithm: jose.RS256, Key: key}, &jose.SignerOptions{ExtraHeaders: map[jose.HeaderKey]any{"kid": "oidc-test-key"}})
	if err != nil {
		t.Fatal(err)
	}
	server := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, req *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		switch req.URL.Path {
		case "/.well-known/openid-configuration":
			_ = json.NewEncoder(w).Encode(map[string]any{
				"issuer": flow.issuer, "authorization_endpoint": flow.issuer + "/authorize",
				"token_endpoint": flow.issuer + "/token", "jwks_uri": flow.issuer + "/keys",
				"response_types_supported": []string{"code"}, "subject_types_supported": []string{"public"},
				"id_token_signing_alg_values_supported": []string{"RS256"},
				"token_endpoint_auth_methods_supported": []string{"client_secret_post"},
			})
		case "/token":
			flow.tokenRequests++
			if err := req.ParseForm(); err != nil {
				t.Error(err)
				http.Error(w, "invalid form", http.StatusBadRequest)
				return
			}
			clientID, clientSecret, basicAuth := req.BasicAuth()
			if !basicAuth {
				clientID, clientSecret = req.Form.Get("client_id"), req.Form.Get("client_secret")
			}
			if req.Method != http.MethodPost || req.Form.Get("code") != "test-code" || req.Form.Get("grant_type") != "authorization_code" || clientID != "oidc-client" || clientSecret != "test-only-secret" || req.Form.Get("redirect_uri") != "https://canvas.example/api/auth/oidc/callback" {
				t.Error("incorrect OIDC exchange contract")
			}
			if flow.target == nil || oauth2.S256ChallengeFromVerifier(req.Form.Get("code_verifier")) != flow.target.Query().Get("code_challenge") {
				t.Error("OIDC exchange did not retain the authorization PKCE challenge")
			}
			claims, _ := json.Marshal(flow.claims)
			signed, err := signer.Sign(claims)
			if err != nil {
				t.Error(err)
				return
			}
			rawToken, err := signed.CompactSerialize()
			if err != nil {
				t.Error(err)
				return
			}
			_ = json.NewEncoder(w).Encode(map[string]any{"access_token": "test-access", "token_type": "Bearer", "id_token": rawToken})
		case "/keys":
			_ = json.NewEncoder(w).Encode(jose.JSONWebKeySet{Keys: []jose.JSONWebKey{{Key: &key.PublicKey, KeyID: "oidc-test-key", Algorithm: "RS256", Use: "sig"}}})
		default:
			http.NotFound(w, req)
		}
	}))
	t.Cleanup(server.Close)
	flow.issuer = server.URL
	t.Setenv("CANVAS_ALLOWED_PRIVATE_UPSTREAM_HOSTS", "127.0.0.1")
	t.Setenv("CANVAS_OIDC_ISSUER", flow.issuer)
	t.Setenv("CANVAS_OIDC_CLIENT_ID", "oidc-client")
	t.Setenv("CANVAS_OIDC_CLIENT_SECRET", "test-only-secret")
	t.Setenv("CANVAS_OIDC_REDIRECT_URL", "https://canvas.example/api/auth/oidc/callback")
	t.Setenv("CANVAS_OIDC_ALLOWED_GROUP", "")
	transport := outbound.OutboundHTTPClient(time.Second).Transport.(*http.Transport)
	previousTLS := transport.TLSClientConfig
	transport.CloseIdleConnections()
	transport.TLSClientConfig = server.Client().Transport.(*http.Transport).TLSClientConfig.Clone()
	if transport.TLSClientConfig.InsecureSkipVerify {
		t.Fatal("test must still verify TLS")
	}
	t.Cleanup(func() {
		transport.CloseIdleConnections()
		transport.TLSClientConfig = previousTLS
	})
	flow.begin(t, "/canvas/oidc-test?view=storyboard", true)
	return flow
}

func (flow *oidcTestFlow) begin(t *testing.T, next string, acceptedTerms bool) {
	t.Helper()
	target, state, err := flow.svc.BeginOIDCLogin(context.Background(), next, acceptedTerms)
	if err != nil {
		t.Fatal(err)
	}
	flow.target, err = url.Parse(target)
	if err != nil {
		t.Fatal(err)
	}
	flow.state = state
	flow.claims = map[string]any{
		"iss": flow.issuer, "aud": "oidc-client", "sub": "creator-1",
		"nonce": flow.target.Query().Get("nonce"), "exp": time.Now().Add(time.Hour).Unix(),
		"iat": time.Now().Unix(), "preferred_username": "oidc_creator", "name": "OIDC Creator",
		"email": "creator@example.com", "email_verified": true,
	}
}

func (flow *oidcTestFlow) complete() (*OAuthCallbackResult, error) {
	return flow.svc.CompleteOIDCLogin(context.Background(), flow.state, "test-code", LoginContext{})
}

func TestOIDCLoginCreatesSessionAndRejectsReplay(t *testing.T) {
	flow := newOIDCTestFlow(t)
	q := flow.target.Query()
	if flow.target.String() == "" || q.Get("state") != flow.state || q.Get("code_challenge_method") != "S256" || q.Get("nonce") == "" || strings.Contains(flow.target.String(), "test-only-secret") {
		t.Fatal("unsafe OIDC authorization URL")
	}
	result, err := flow.complete()
	if err != nil {
		t.Fatal(err)
	}
	if result.Next != "/canvas/oidc-test?view=storyboard" || result.Session.Session == "" || result.Session.User.Role != model.UserRoleUser {
		t.Fatal("OIDC login did not issue the expected user session and return path")
	}
	var identity model.UserIdentity
	if err := flow.db.First(&identity, "provider = ?", oidcProvider).Error; err != nil {
		t.Fatal(err)
	}
	if identity.Subject != HashToken(flow.issuer+"\x00creator-1") || identity.UserID != result.Session.User.ID {
		t.Fatal("OIDC identity is not scoped to its issuer")
	}
	if _, err := flow.complete(); err == nil || flow.tokenRequests != 1 {
		t.Fatal("replayed OIDC state reached the provider")
	}
}

func TestOIDCRejectsInvalidClaimsBeforeAccountWrites(t *testing.T) {
	for _, scenario := range []string{"issuer", "audience", "nonce", "expired", "authorized party", "multiple audiences", "missing subject", "missing group"} {
		t.Run(scenario, func(t *testing.T) {
			flow := newOIDCTestFlow(t)
			switch scenario {
			case "issuer":
				flow.claims["iss"] = "https://other.example"
			case "audience":
				flow.claims["aud"] = "other-client"
			case "nonce":
				flow.claims["nonce"] = "another-request"
			case "expired":
				flow.claims["exp"] = time.Now().Add(-time.Hour).Unix()
			case "authorized party":
				flow.claims["azp"] = "other-client"
			case "multiple audiences":
				flow.claims["aud"] = []string{"oidc-client", "other-client"}
			case "missing subject":
				delete(flow.claims, "sub")
			case "missing group":
				t.Setenv("CANVAS_OIDC_ALLOWED_GROUP", "creators")
				flow.claims["groups"] = []string{"viewers"}
			}
			if _, err := flow.complete(); err == nil {
				t.Fatal("invalid OIDC identity accepted")
			}
			var identities, sessions int64
			flow.db.Model(&model.UserIdentity{}).Count(&identities)
			flow.db.Model(&model.AuthSession{}).Count(&sessions)
			if identities != 0 || sessions != 0 {
				t.Fatal("failed OIDC verification wrote a user identity or session")
			}
		})
	}
}

func TestOIDCRegistrationAndVerifiedEmailPolicy(t *testing.T) {
	for _, scenario := range []string{"closed registration", "private group", "agreement missing", "unverified email"} {
		t.Run(scenario, func(t *testing.T) {
			flow := newOIDCTestFlow(t)
			switch scenario {
			case "closed registration", "private group":
				if err := flow.db.Model(&model.SystemSetting{}).Where("key = ?", registrationSettingKey).Update("value_json", `{"enabled":false}`).Error; err != nil {
					t.Fatal(err)
				}
				if scenario == "private group" {
					t.Setenv("CANVAS_OIDC_ALLOWED_GROUP", "creators")
					flow.claims["groups"] = []string{"creators"}
				}
			case "agreement missing":
				flow.begin(t, "https://other.example", false)
			case "unverified email":
				flow.claims["email_verified"] = false
			}
			result, err := flow.complete()
			if scenario == "closed registration" || scenario == "agreement missing" {
				if err == nil {
					t.Fatal("OIDC bypassed signup policy")
				}
				return
			}
			if err != nil {
				t.Fatal(err)
			}
			if scenario == "unverified email" && result.Session.User.Email != "" {
				t.Fatal("OIDC accepted an unverified email")
			}
		})
	}
}
