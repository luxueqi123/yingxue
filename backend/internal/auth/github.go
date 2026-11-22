package auth

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"

	"golang.org/x/oauth2"
	"gorm.io/gorm"

	"infinite-canvas/backend/internal/kernel"
	"infinite-canvas/backend/internal/model"
)

const githubSettingKey = "github_oauth"

type GitHubSettingRequest struct {
	Enabled      bool   `json:"enabled"`
	ClientID     string `json:"clientId"`
	ClientSecret string `json:"clientSecret"`
	RedirectURL  string `json:"redirectUrl"`
}

type PublicGitHubSetting struct {
	Enabled         bool   `json:"enabled"`
	ClientID        string `json:"clientId"`
	HasClientSecret bool   `json:"hasClientSecret"`
	RedirectURL     string `json:"redirectUrl"`
}

type GitHubLoginStart struct {
	URL          string
	BrowserToken string
	State        string
}

func (s *Service) AdminGitHubSetting(actor *model.User) (*PublicGitHubSetting, error) {
	if err := s.host.RequireAdmin(actor); err != nil {
		return nil, err
	}
	value, err := s.readGitHubSetting()
	if err != nil {
		return nil, err
	}
	return publicGitHubSetting(value), nil
}

func (s *Service) UpdateGitHubSetting(actor *model.User, req GitHubSettingRequest) (*PublicGitHubSetting, error) {
	if err := s.host.RequireAdmin(actor); err != nil {
		return nil, err
	}
	current, err := s.readGitHubSetting()
	if err != nil {
		return nil, err
	}
	req.ClientID = strings.TrimSpace(req.ClientID)
	req.ClientSecret = strings.TrimSpace(req.ClientSecret)
	req.RedirectURL = strings.TrimSpace(req.RedirectURL)
	if req.ClientSecret == "" {
		req.ClientSecret = current.ClientSecret
	}
	if err := validateGitHubSetting(req); err != nil {
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
	if err := s.repo.SaveSystemSetting(&model.SystemSetting{Key: githubSettingKey, ValueJSON: string(encoded), UpdatedBy: actor.ID}); err != nil {
		return nil, err
	}
	return publicGitHubSetting(req), nil
}

func publicGitHubSetting(value GitHubSettingRequest) *PublicGitHubSetting {
	return &PublicGitHubSetting{Enabled: value.Enabled, ClientID: value.ClientID, HasClientSecret: value.ClientSecret != "", RedirectURL: value.RedirectURL}
}

func validateGitHubSetting(value GitHubSettingRequest) error {
	if !value.Enabled {
		return nil
	}
	if value.ClientID == "" || value.ClientSecret == "" {
		return kernel.BadAuthRequest("启用 GitHub 登录前请填写 Client ID 和 Client Secret")
	}
	u, err := url.Parse(value.RedirectURL)
	if err != nil || u.Host == "" || u.User != nil || u.RawQuery != "" || u.Fragment != "" || u.Path != "/api/auth/github/callback" ||
		(u.Scheme != "https" && !(u.Scheme == "http" && isLoopbackOAuthHost(u.Hostname()))) {
		return kernel.BadAuthRequest("GitHub 回调地址须为本站 HTTPS 地址加 /api/auth/github/callback，本地回环可使用 HTTP")
	}
	return nil
}

func (s *Service) readGitHubSetting() (GitHubSettingRequest, error) {
	var value GitHubSettingRequest
	setting, err := s.repo.SystemSetting(githubSettingKey)
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return value, nil
	}
	if err != nil {
		return value, err
	}
	if err := json.Unmarshal([]byte(setting.ValueJSON), &value); err != nil {
		return value, errors.New("GitHub 登录配置格式无效")
	}
	value.ClientSecret, err = s.host.DecryptSecret(value.ClientSecret)
	return value, err
}

func (s *Service) GitHubEnabled() bool {
	setting, err := s.readGitHubSetting()
	return err == nil && setting.Enabled && validateGitHubSetting(setting) == nil
}

func githubOAuthConfig(setting GitHubSettingRequest) oauth2.Config {
	return oauth2.Config{
		ClientID: setting.ClientID, ClientSecret: setting.ClientSecret, RedirectURL: setting.RedirectURL,
		Scopes:   []string{"user:email"},
		Endpoint: oauth2.Endpoint{AuthURL: "https://github.com/login/oauth/authorize", TokenURL: "https://github.com/login/oauth/access_token", AuthStyle: oauth2.AuthStyleInParams},
	}
}

func (s *Service) BeginGitHubLogin(nextPath string, acceptedTerms bool) (*GitHubLoginStart, error) {
	count, err := s.repo.UserCount()
	if err != nil {
		return nil, err
	}
	if count == 0 {
		return nil, kernel.Forbidden("请先创建本地管理员账号，再开放 GitHub 登录")
	}
	setting, err := s.readGitHubSetting()
	if err != nil {
		return nil, err
	}
	if !setting.Enabled {
		return nil, kernel.Forbidden("GitHub 登录尚未启用")
	}
	if err := validateGitHubSetting(setting); err != nil {
		return nil, err
	}
	return s.beginGitHubAuthorization(setting, &model.OAuthState{Provider: "github", NextPath: safeOAuthNext(nextPath), AcceptedTerms: acceptedTerms})
}

func (s *Service) beginGitHubAuthorization(setting GitHubSettingRequest, record *model.OAuthState) (*GitHubLoginStart, error) {
	state, browserToken, verifier := RandomToken(), RandomToken(), oauth2.GenerateVerifier()
	if record.Provider == "github-link" {
		state = "link." + state
	}
	record.ID, record.StateHash, record.CodeVerifier, record.ExpiresAt = kernel.NewID(), HashToken(state+"."+browserToken), verifier, time.Now().Add(10*time.Minute)
	if err := s.repo.CreateOAuthState(record); err != nil {
		return nil, err
	}
	config := githubOAuthConfig(setting)
	return &GitHubLoginStart{
		URL:          config.AuthCodeURL(state, oauth2.S256ChallengeOption(verifier), oauth2.SetAuthURLParam("prompt", "select_account")),
		BrowserToken: browserToken, State: state,
	}, nil
}

func (s *Service) CompleteGitHubLogin(ctx context.Context, stateValue, browserToken, code string, contexts ...LoginContext) (result *OAuthCallbackResult, err error) {
	var requestContext LoginContext
	if len(contexts) > 0 {
		requestContext = contexts[0]
	}
	event := NewLoginLog("github", "login", requestContext)
	defer func() {
		if err != nil {
			err = s.recordLoginFailure(event, err)
		}
	}()
	if stateValue == "" || browserToken == "" || code == "" || len(stateValue) > 128 || len(browserToken) > 128 || len(code) > 4096 {
		return nil, kernel.BadAuthRequest("GitHub 登录状态无效，请重新发起登录")
	}
	state, err := s.repo.ConsumeOAuthState("github", HashToken(stateValue+"."+browserToken))
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, kernel.BadAuthRequest("GitHub 登录状态无效或已过期，请重新发起登录")
	}
	if err != nil {
		return nil, err
	}
	setting, err := s.readGitHubSetting()
	if err != nil {
		return nil, err
	}
	if !setting.Enabled {
		return nil, kernel.Forbidden("GitHub 登录尚未启用")
	}
	if err := validateGitHubSetting(setting); err != nil {
		return nil, err
	}
	profile, err := s.exchangeGitHubProfile(ctx, setting, code, state.CodeVerifier)
	if err != nil {
		return nil, err
	}
	identity, err := s.repo.UserIdentity("github", strconv.FormatInt(profile.ID, 10))
	var user *model.User
	if err == nil {
		user, err = s.repo.User(identity.UserID)
	} else if errors.Is(err, gorm.ErrRecordNotFound) {
		event.Source = "registration"
		user, err = s.createGitHubUser(profile, state.AcceptedTerms)
	}
	if err != nil {
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
	return &OAuthCallbackResult{Session: session, Next: safeOAuthNext(state.NextPath)}, nil
}

type githubProfile struct {
	ID        int64  `json:"id"`
	Login     string `json:"login"`
	Name      string `json:"name"`
	AvatarURL string `json:"avatar_url"`
	Email     string `json:"-"`
}

type githubEmail struct {
	Email    string `json:"email"`
	Primary  bool   `json:"primary"`
	Verified bool   `json:"verified"`
}

func (s *Service) exchangeGitHubProfile(ctx context.Context, setting GitHubSettingRequest, code, verifier string) (*githubProfile, error) {
	ctx, cancel := context.WithTimeout(ctx, 25*time.Second)
	defer cancel()
	client := s.githubHTTP
	if client == nil {
		client = &http.Client{Timeout: 20 * time.Second, CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }}
	}
	ctx = context.WithValue(ctx, oauth2.HTTPClient, client)
	config := githubOAuthConfig(setting)
	token, err := config.Exchange(ctx, code, oauth2.VerifierOption(verifier))
	if err != nil || token == nil || token.AccessToken == "" || !strings.EqualFold(token.Type(), "Bearer") {
		// 不把可能包含密钥、授权码或 Token 的上游错误正文交给日志与浏览器。
		return nil, kernel.BadAuthRequest("GitHub 授权兑换失败，请重新登录")
	}
	var profile githubProfile
	if err := readGitHubJSON(ctx, client, token.AccessToken, "https://api.github.com/user", &profile); err != nil {
		return nil, kernel.BadAuthRequest("读取 GitHub 账号失败，请重新登录")
	}
	if profile.ID <= 0 || profile.Login == "" || len(profile.Login) > 100 {
		return nil, kernel.BadAuthRequest("GitHub 账号缺少有效身份信息")
	}
	// 公开资料中的 email 不包含验证状态，只接受邮箱接口返回的已验证主邮箱。
	for page := 1; page <= 10; page++ {
		var emails []githubEmail
		endpoint := fmt.Sprintf("https://api.github.com/user/emails?per_page=100&page=%d", page)
		if err := readGitHubJSON(ctx, client, token.AccessToken, endpoint, &emails); err != nil {
			return nil, kernel.BadAuthRequest("读取 GitHub 已验证邮箱失败，请重新登录并允许读取邮箱")
		}
		for _, email := range emails {
			if email.Primary && email.Verified && len(email.Email) <= 160 && ValidateEmail(email.Email) == nil {
				profile.Email = NormalizeEmail(email.Email)
				return &profile, nil
			}
		}
		if len(emails) < 100 {
			break
		}
	}
	return nil, kernel.BadAuthRequest("请先在 GitHub 验证主邮箱，再重新登录")
}

func readGitHubJSON(ctx context.Context, client *http.Client, token, endpoint string, target any) error {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
	if err != nil {
		return err
	}
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Accept", "application/vnd.github+json")
	req.Header.Set("X-GitHub-Api-Version", "2026-03-10")
	req.Header.Set("User-Agent", "Yingxue-OAuth")
	response, err := client.Do(req)
	if err != nil {
		return err
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		return errors.New("GitHub request failed")
	}
	data, err := io.ReadAll(io.LimitReader(response.Body, (1<<20)+1))
	if err != nil || len(data) > 1<<20 {
		return errors.New("GitHub response exceeds limit")
	}
	return json.Unmarshal(data, target)
}

func (s *Service) createGitHubUser(profile *githubProfile, acceptedTerms bool) (*model.User, error) {
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
		return nil, kernel.BadAuthRequest("请先到登录页面同意" + s.AgreementTitleForMessage())
	}
	policy, err := s.verificationPolicy()
	if err != nil {
		return nil, err
	}
	if policy.SMSRegistration || policy.SMSAndEmailRegistration {
		return nil, kernel.Forbidden("平台要求短信验证，请使用注册页面完成验证")
	}
	if err := s.validateRegistrationEmailDomain(profile.Email); err != nil {
		return nil, err
	}
	if _, err := s.repo.UserByEmail(profile.Email); err == nil {
		return nil, kernel.BadAuthRequest("该邮箱已有账号，请先用原有方式登录，再到个人信息绑定 GitHub")
	} else if !errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, err
	}
	now := time.Now()
	subject := strconv.FormatInt(profile.ID, 10)
	username := "github_" + subject
	user := &model.User{ID: kernel.NewID(), Username: username, Email: profile.Email, EmailVerifiedAt: &now, DisplayName: NormalizeDisplayName(profile.Name, profile.Login), Role: model.UserRoleUser, Status: model.UserStatusActive}
	identity := &model.UserIdentity{ID: kernel.NewID(), UserID: user.ID, Provider: "github", Subject: subject, ProviderUsername: profile.Login, AvatarURL: profile.AvatarURL}
	if err := s.repo.CreateOAuthUser(user, identity); err != nil {
		return nil, err
	}
	return user, nil
}
