package auth

import (
	"context"
	"crypto/subtle"
	"encoding/json"
	"errors"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/coreos/go-oidc/v3/oidc"
	"golang.org/x/oauth2"
	"gorm.io/gorm"

	"infinite-canvas/backend/internal/kernel"
	"infinite-canvas/backend/internal/model"
)

const googleSettingKey = "google_oauth"
const googleIssuer = "https://accounts.google.com"
const googleJWKSURL = "https://www.googleapis.com/oauth2/v3/certs"

type GoogleSettingRequest struct {
	Enabled      bool   `json:"enabled"`
	ClientID     string `json:"clientId"`
	ClientSecret string `json:"clientSecret"`
	RedirectURL  string `json:"redirectUrl"`
}

type PublicGoogleSetting struct {
	Enabled         bool   `json:"enabled"`
	ClientID        string `json:"clientId"`
	HasClientSecret bool   `json:"hasClientSecret"`
	RedirectURL     string `json:"redirectUrl"`
}

type GoogleLoginStart struct {
	URL          string
	BrowserToken string
	State        string
}

type GoogleCallbackResult struct {
	Session *AuthSessionResult
	Next    string
}

func (s *Service) AdminGoogleSetting(actor *model.User) (*PublicGoogleSetting, error) {
	if err := s.host.RequireAdmin(actor); err != nil {
		return nil, err
	}
	value, err := s.readGoogleSetting()
	if err != nil {
		return nil, err
	}
	return publicGoogleSetting(value), nil
}

func (s *Service) UpdateGoogleSetting(actor *model.User, req GoogleSettingRequest) (*PublicGoogleSetting, error) {
	if err := s.host.RequireAdmin(actor); err != nil {
		return nil, err
	}
	current, err := s.readGoogleSetting()
	if err != nil {
		return nil, err
	}
	req.ClientID = strings.TrimSpace(req.ClientID)
	req.ClientSecret = strings.TrimSpace(req.ClientSecret)
	req.RedirectURL = strings.TrimSpace(req.RedirectURL)
	if req.ClientSecret == "" {
		req.ClientSecret = current.ClientSecret
	}
	if err := validateGoogleSetting(req); err != nil {
		return nil, err
	}
	stored := req
	stored.ClientSecret, err = s.host.EncryptSecret(req.ClientSecret)
	if err != nil {
		return nil, err
	}
	encoded, err := json.Marshal(stored)
	if err != nil {
		return nil, err
	}
	if err := s.repo.SaveSystemSetting(&model.SystemSetting{Key: googleSettingKey, ValueJSON: string(encoded), UpdatedBy: actor.ID}); err != nil {
		return nil, err
	}
	return publicGoogleSetting(req), nil
}

func publicGoogleSetting(value GoogleSettingRequest) *PublicGoogleSetting {
	return &PublicGoogleSetting{Enabled: value.Enabled, ClientID: value.ClientID, HasClientSecret: value.ClientSecret != "", RedirectURL: value.RedirectURL}
}

func validateGoogleSetting(value GoogleSettingRequest) error {
	if !value.Enabled {
		return nil
	}
	if value.ClientID == "" || value.ClientSecret == "" {
		return kernel.BadAuthRequest("启用 Google 登录前请填写 Client ID 和 Client Secret")
	}
	u, err := url.Parse(value.RedirectURL)
	if err != nil || u.Host == "" || u.User != nil || u.RawQuery != "" || u.Fragment != "" || u.Path != "/api/auth/google/callback" ||
		(u.Scheme != "https" && !(u.Scheme == "http" && isLoopbackOAuthHost(u.Hostname()))) {
		return kernel.BadAuthRequest("Google 回调地址须为本站 HTTPS 地址加 /api/auth/google/callback，本地回环可使用 HTTP")
	}
	return nil
}

func (s *Service) readGoogleSetting() (GoogleSettingRequest, error) {
	var value GoogleSettingRequest
	setting, err := s.repo.SystemSetting(googleSettingKey)
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return value, nil
	}
	if err != nil {
		return value, err
	}
	if err := json.Unmarshal([]byte(setting.ValueJSON), &value); err != nil {
		return value, errors.New("Google 登录配置格式无效")
	}
	value.ClientSecret, err = s.host.DecryptSecret(value.ClientSecret)
	return value, err
}

func (s *Service) GoogleEnabled() bool {
	setting, err := s.readGoogleSetting()
	return err == nil && setting.Enabled && validateGoogleSetting(setting) == nil
}

func googleOAuthConfig(setting GoogleSettingRequest) oauth2.Config {
	return oauth2.Config{
		ClientID: setting.ClientID, ClientSecret: setting.ClientSecret, RedirectURL: setting.RedirectURL,
		Scopes:   []string{oidc.ScopeOpenID, "email", "profile"},
		Endpoint: oauth2.Endpoint{AuthURL: googleIssuer + "/o/oauth2/v2/auth", TokenURL: "https://oauth2.googleapis.com/token", AuthStyle: oauth2.AuthStyleInParams},
	}
}

func (s *Service) BeginGoogleLogin(nextPath string, acceptedTerms bool) (*GoogleLoginStart, error) {
	count, err := s.repo.UserCount()
	if err != nil {
		return nil, err
	}
	if count == 0 {
		return nil, kernel.Forbidden("请先创建本地管理员账号，再开放 Google 登录")
	}
	setting, err := s.readGoogleSetting()
	if err != nil {
		return nil, err
	}
	if !setting.Enabled {
		return nil, kernel.Forbidden("Google 登录尚未启用")
	}
	if err := validateGoogleSetting(setting); err != nil {
		return nil, err
	}
	state, browserToken, verifier := RandomToken(), RandomToken(), oauth2.GenerateVerifier()
	// 状态绑定发起授权的浏览器；只拿到授权链接无法把别人的身份登录到目标浏览器。
	if err := s.repo.CreateOAuthState(&model.OAuthState{
		ID: kernel.NewID(), Provider: "google", StateHash: HashToken(state + "." + browserToken), CodeVerifier: verifier,
		NextPath: safeOAuthNext(nextPath), AcceptedTerms: acceptedTerms, ExpiresAt: time.Now().Add(10 * time.Minute),
	}); err != nil {
		return nil, err
	}
	config := googleOAuthConfig(setting)
	return &GoogleLoginStart{
		URL:          config.AuthCodeURL(state, oauth2.S256ChallengeOption(verifier), oidc.Nonce(HashToken("google-nonce:"+verifier)), oauth2.SetAuthURLParam("prompt", "select_account")),
		BrowserToken: browserToken, State: state,
	}, nil
}

func (s *Service) CompleteGoogleLogin(ctx context.Context, stateValue, browserToken, code string, contexts ...LoginContext) (result *GoogleCallbackResult, err error) {
	var requestContext LoginContext
	if len(contexts) > 0 {
		requestContext = contexts[0]
	}
	event := NewLoginLog("google", "login", requestContext)
	defer func() {
		if err != nil {
			err = s.recordLoginFailure(event, err)
		}
	}()
	if stateValue == "" || browserToken == "" || code == "" || len(stateValue) > 128 || len(browserToken) > 128 || len(code) > 4096 {
		return nil, kernel.BadAuthRequest("Google 登录状态无效，请重新发起登录")
	}
	state, err := s.repo.ConsumeOAuthState("google", HashToken(stateValue+"."+browserToken))
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, kernel.BadAuthRequest("Google 登录状态无效或已过期，请重新发起登录")
	}
	if err != nil {
		return nil, err
	}
	setting, err := s.readGoogleSetting()
	if err != nil {
		return nil, err
	}
	if !setting.Enabled {
		return nil, kernel.Forbidden("Google 登录尚未启用")
	}
	if err := validateGoogleSetting(setting); err != nil {
		return nil, err
	}
	profile, err := s.exchangeGoogleProfile(ctx, setting, code, state.CodeVerifier)
	if err != nil {
		return nil, err
	}
	identity, err := s.repo.UserIdentity("google", profile.Subject)
	var user *model.User
	if err == nil {
		user, err = s.repo.User(identity.UserID)
		if err != nil {
			return nil, err
		}
	} else if errors.Is(err, gorm.ErrRecordNotFound) {
		event.Source = "registration"
		user, err = s.createGoogleUser(profile, state.AcceptedTerms)
		if err != nil {
			return nil, err
		}
	} else {
		return nil, err
	}
	loginLogUser(event, user)
	if user.Status != model.UserStatusActive {
		return nil, kernel.Forbidden("该账号已被禁用")
	}
	if err := s.host.EnsureSignupBonus(user.ID); err != nil {
		return nil, err
	}
	now := time.Now()
	if err := s.repo.UpdateUserLoginTime(user.ID, now); err != nil {
		return nil, err
	}
	user.LastLoginAt = &now
	session, err := s.createAuthSession(user, event)
	if err != nil {
		return nil, err
	}
	return &GoogleCallbackResult{Session: session, Next: safeOAuthNext(state.NextPath)}, nil
}

type googleProfile struct {
	Subject         string `json:"sub"`
	AuthorizedParty string `json:"azp"`
	Email           string `json:"email"`
	EmailVerified   bool   `json:"email_verified"`
	Name            string `json:"name"`
	Picture         string `json:"picture"`
}

func (s *Service) exchangeGoogleProfile(ctx context.Context, setting GoogleSettingRequest, code, verifier string) (*googleProfile, error) {
	ctx, cancel := context.WithTimeout(ctx, 25*time.Second)
	defer cancel()
	client := s.googleHTTP
	if client == nil {
		client = &http.Client{Timeout: 20 * time.Second, CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }}
	}
	ctx = context.WithValue(ctx, oauth2.HTTPClient, client)
	config := googleOAuthConfig(setting)
	token, err := config.Exchange(ctx, code, oauth2.VerifierOption(verifier))
	if err != nil {
		// 上游错误可能带授权码、密钥或响应正文，不传播给日志或浏览器。
		return nil, kernel.BadAuthRequest("Google 授权兑换失败，请重新登录")
	}
	rawIDToken, ok := token.Extra("id_token").(string)
	if !ok || rawIDToken == "" {
		return nil, kernel.BadAuthRequest("Google 未返回身份凭证，请重新登录")
	}
	keys := oidc.NewRemoteKeySet(ctx, googleJWKSURL)
	idToken, err := oidc.NewVerifier(googleIssuer, keys, &oidc.Config{ClientID: setting.ClientID, SupportedSigningAlgs: []string{"RS256"}}).Verify(ctx, rawIDToken)
	if err != nil || subtle.ConstantTimeCompare([]byte(idToken.Nonce), []byte(HashToken("google-nonce:"+verifier))) != 1 {
		return nil, kernel.BadAuthRequest("Google 身份凭证验证失败，请重新登录")
	}
	var profile googleProfile
	if err := idToken.Claims(&profile); err != nil || profile.Subject == "" || len(profile.Subject) > 160 || !profile.EmailVerified || ValidateEmail(profile.Email) != nil || len(profile.Email) > 160 {
		return nil, kernel.BadAuthRequest("Google 账号缺少已验证邮箱或有效身份信息")
	}
	if (profile.AuthorizedParty != "" && profile.AuthorizedParty != setting.ClientID) || (len(idToken.Audience) > 1 && profile.AuthorizedParty == "") {
		return nil, kernel.BadAuthRequest("Google 身份凭证的授权客户端不匹配")
	}
	return &profile, nil
}

func (s *Service) createGoogleUser(profile *googleProfile, acceptedTerms bool) (*model.User, error) {
	s.registrationMu.Lock()
	defer s.registrationMu.Unlock()
	enabled, err := s.RegistrationEnabled()
	if err != nil {
		return nil, err
	}
	if !enabled {
		return nil, kernel.Forbidden("管理员未开放新用户注册")
	}
	if !acceptedTerms {
		return nil, kernel.BadAuthRequest("请先到注册页面同意" + s.AgreementTitleForMessage())
	}
	policy, err := s.verificationPolicy()
	if err != nil {
		return nil, err
	}
	if policy.SMSRegistration || policy.SMSAndEmailRegistration {
		return nil, kernel.Forbidden("平台要求短信验证，请使用注册页面完成验证")
	}
	email := NormalizeEmail(profile.Email)
	if err := s.validateRegistrationEmailDomain(email); err != nil {
		return nil, err
	}
	if _, err := s.repo.UserByEmail(email); err == nil {
		return nil, kernel.BadAuthRequest("该邮箱已有账号，请使用原有登录方式；不会自动合并账号")
	} else if !errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, err
	}
	now := time.Now()
	username := "google_" + HashToken(profile.Subject)[:24]
	user := &model.User{ID: kernel.NewID(), Username: username, Email: email, EmailVerifiedAt: &now, DisplayName: NormalizeDisplayName(profile.Name, username), Role: model.UserRoleUser, Status: model.UserStatusActive}
	identity := &model.UserIdentity{ID: kernel.NewID(), UserID: user.ID, Provider: "google", Subject: profile.Subject, ProviderUsername: email, AvatarURL: profile.Picture}
	if err := s.repo.CreateOAuthUser(user, identity); err != nil {
		return nil, err
	}
	return user, nil
}
