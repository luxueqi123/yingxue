package auth

import (
	"context"
	"net/http"
	"strings"
	"testing"
	"time"

	"gorm.io/gorm"
	"infinite-canvas/backend/internal/model"
)

func newGitHubLinkTest(t *testing.T) (*Service, *gorm.DB, *model.User, *GitHubLoginStart, string) {
	t.Helper()
	svc, db, _ := newGitHubTest(t)
	var user model.User
	if err := db.First(&user, "id = ?", "admin").Error; err != nil {
		t.Fatal(err)
	}
	user.Email = "creator@example.com"
	if err := db.Save(&user).Error; err != nil {
		t.Fatal(err)
	}
	if err := db.Create(&model.AuthSession{ID: "link-session", UserID: user.ID, TokenHash: HashToken("link-token"), ExpiresAt: time.Now().Add(time.Hour)}).Error; err != nil {
		t.Fatal(err)
	}
	cookie := "link-session.link-token"
	start, err := svc.BeginGitHubBinding(&user, cookie)
	if err != nil {
		t.Fatal(err)
	}
	return svc, db, &user, start, cookie
}

func TestGitHubBindingPreservesAccountAndEnablesExistingAccountLogin(t *testing.T) {
	svc, db, user, start, cookie := newGitHubLinkTest(t)
	db.Model(&model.SystemSetting{}).Where("key = ?", registrationSettingKey).Update("value_json", `{"enabled":false}`)
	requests := githubTestHTTP(t, svc, start, "normal")
	if _, err := svc.CompleteGitHubLogin(context.Background(), start.State, start.BrowserToken, "test-code"); err == nil || *requests != 0 {
		t.Fatal("binding state accepted as login state")
	}
	if err := svc.CompleteGitHubBinding(context.Background(), start.State, start.BrowserToken, "test-code", cookie); err != nil {
		t.Fatal(err)
	}
	account, err := svc.GitHubAccount(user, cookie)
	if err != nil || !account.Linked || account.Username != "creator" {
		t.Fatalf("binding not readable: %+v %v", account, err)
	}
	var current model.User
	db.First(&current, "id = ?", user.ID)
	if current.Role != user.Role || current.Email != user.Email || current.Username != user.Username || current.PasswordHash != user.PasswordHash || current.EmailVerifiedAt != nil {
		t.Fatal("binding altered account credentials, role or email verification")
	}
	for _, row := range []struct {
		value any
		count int64
	}{{&model.User{}, 1}, {&model.AuthSession{}, 1}, {&model.UserIdentity{}, 1}, {&model.CreditAccount{}, 0}} {
		var count int64
		db.Model(row.value).Count(&count)
		if count != row.count {
			t.Fatalf("binding changed %T count: %d", row.value, count)
		}
	}
	if err := svc.CompleteGitHubBinding(context.Background(), start.State, start.BrowserToken, "test-code", cookie); err == nil {
		t.Fatal("binding replay accepted")
	}
	if _, err := svc.BeginGitHubBinding(user, cookie); err == nil {
		t.Fatal("already linked account allowed another binding")
	}
	login, err := svc.BeginGitHubLogin("/home", false)
	if err != nil {
		t.Fatal(err)
	}
	githubTestHTTP(t, svc, login, "normal")
	result, err := svc.CompleteGitHubLogin(context.Background(), login.State, login.BrowserToken, "test-code")
	if err != nil || result.Session.User.ID != user.ID || result.Session.User.Role != user.Role {
		t.Fatalf("linked identity failed normal login: %v", err)
	}
}

func TestGitHubBindingRequiresOriginalBrowserAndLiveSession(t *testing.T) {
	for _, mode := range []string{"missing browser", "wrong browser", "missing session", "wrong session token", "another session", "expired state", "revoked session", "disabled account", "disabled setting", "login state"} {
		t.Run(mode, func(t *testing.T) {
			svc, db, user, start, cookie := newGitHubLinkTest(t)
			browser := start.BrowserToken
			switch mode {
			case "missing browser":
				browser = ""
			case "wrong browser":
				browser = "other-browser"
			case "missing session":
				cookie = ""
			case "wrong session token":
				cookie = "link-session.wrong-token"
			case "another session":
				db.Create(&model.AuthSession{ID: "other-session", UserID: user.ID, TokenHash: HashToken("link-token"), ExpiresAt: time.Now().Add(time.Hour)})
				cookie = "other-session.link-token"
			case "expired state":
				db.Model(&model.OAuthState{}).Where("provider = ?", "github-link").Update("expires_at", time.Now().Add(-time.Minute))
			case "revoked session":
				db.Where("id = ?", "link-session").Delete(&model.AuthSession{})
			case "disabled account":
				db.Model(&model.User{}).Where("id = ?", user.ID).Update("status", model.UserStatusDisabled)
			case "disabled setting":
				db.Model(&model.SystemSetting{}).Where("key = ?", githubSettingKey).Update("value_json", `{"enabled":false}`)
			case "login state":
				var err error
				start, err = svc.BeginGitHubLogin("/home", true)
				if err != nil {
					t.Fatal(err)
				}
				browser = start.BrowserToken
			}
			requests := githubTestHTTP(t, svc, start, "normal")
			if err := svc.CompleteGitHubBinding(context.Background(), start.State, browser, "test-code", cookie); err == nil || *requests != 0 {
				t.Fatalf("invalid binding accepted or exchanged code: %v", err)
			}
			var count int64
			db.Model(&model.UserIdentity{}).Count(&count)
			if count != 0 {
				t.Fatal("rejected binding created an identity")
			}
		})
	}
}

func TestGitHubBindingCannotReplaceOrTakeOverAnIdentity(t *testing.T) {
	for _, mode := range []string{"foreign identity", "current account already linked", "session revoked during exchange", "unverified email"} {
		t.Run(mode, func(t *testing.T) {
			svc, db, user, start, cookie := newGitHubLinkTest(t)
			mockMode := "normal"
			if mode == "unverified email" {
				mockMode = mode
			}
			githubTestHTTP(t, svc, start, mockMode)
			if mode == "foreign identity" {
				db.Create(&model.User{ID: "other-user", Username: "other-user", Status: model.UserStatusActive})
				db.Create(&model.UserIdentity{ID: "prior", UserID: "other-user", Provider: "github", Subject: "123456"})
			} else if mode == "current account already linked" {
				db.Create(&model.UserIdentity{ID: "prior", UserID: user.ID, Provider: "github", Subject: "999"})
			} else if mode == "session revoked during exchange" {
				transport := svc.githubHTTP.Transport
				svc.githubHTTP.Transport = googleTestTransport(func(req *http.Request) (*http.Response, error) {
					if req.URL.Path == "/user/emails" {
						db.Where("id = ?", "link-session").Delete(&model.AuthSession{})
					}
					return transport.RoundTrip(req)
				})
			}
			if err := svc.CompleteGitHubBinding(context.Background(), start.State, start.BrowserToken, "test-code", cookie); err == nil {
				t.Fatal("unsafe binding accepted")
			}
			var count int64
			db.Model(&model.UserIdentity{}).Where("id <> ?", "prior").Count(&count)
			if count != 0 {
				t.Fatal("unsafe binding created an identity")
			}
			if strings.Contains(mode, "identity") || mode == "current account already linked" {
				var prior model.UserIdentity
				if err := db.First(&prior, "id = ?", "prior").Error; err != nil {
					t.Fatal("prior identity changed")
				}
			}
		})
	}
}
