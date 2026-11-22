package app

import (
	"context"
	"time"

	"infinite-canvas/backend/internal/auth"
	"infinite-canvas/backend/internal/model"
)

const SessionCookieName = auth.SessionCookieName
const LibTVMaxImportJSONBytes = auth.LibTVMaxImportJSONBytes

type (
	EmailCodeCooldownError      = auth.EmailCodeCooldownError
	RegisterRequest             = auth.RegisterRequest
	LoginRequest                = auth.LoginRequest
	PublicAuthSettings          = auth.PublicAuthSettings
	AuthSessionResult           = auth.AuthSessionResult
	AuthUser                    = auth.AuthUser
	RegistrationSettingRequest  = auth.RegistrationSettingRequest
	PublicRegistrationSetting   = auth.PublicRegistrationSetting
	TurnstileSettingRequest     = auth.TurnstileSettingRequest
	PublicTurnstileSetting      = auth.PublicTurnstileSetting
	PasswordResetRequest        = auth.PasswordResetRequest
	EmailSettingRequest         = auth.EmailSettingRequest
	PublicEmailSetting          = auth.PublicEmailSetting
	EmailLogQuery               = auth.EmailLogQuery
	EmailLogPage                = auth.EmailLogPage
	LinuxDOSettingRequest       = auth.LinuxDOSettingRequest
	PublicLinuxDOSetting        = auth.PublicLinuxDOSetting
	LinuxDOCallbackResult       = auth.OAuthCallbackResult
	GoogleSettingRequest        = auth.GoogleSettingRequest
	PublicGoogleSetting         = auth.PublicGoogleSetting
	GoogleLoginStart            = auth.GoogleLoginStart
	GoogleCallbackResult        = auth.GoogleCallbackResult
	GitHubSettingRequest        = auth.GitHubSettingRequest
	PublicGitHubSetting         = auth.PublicGitHubSetting
	GitHubLoginStart            = auth.GitHubLoginStart
	GitHubAccountLink           = auth.GitHubAccountLink
	GitHubCallbackResult        = auth.OAuthCallbackResult
	LibTVSettingRequest         = auth.LibTVSettingRequest
	PublicLibTVSetting          = auth.PublicLibTVSetting
	LibTVImportRequest          = auth.LibTVImportRequest
	LibTVImportResult           = auth.LibTVImportResult
	LibTVCanvasConnection       = auth.LibTVCanvasConnection
	LibTVCanvasNode             = auth.LibTVCanvasNode
	LibTVImportIssue            = auth.LibTVImportIssue
	LibTVImportMetadata         = auth.LibTVImportMetadata
	LibTVImportWarning          = auth.LibTVImportWarning
	TapNowImportRequest         = auth.TapNowImportRequest
	TapNowImportResult          = auth.TapNowImportResult
	TapNowCanvasConnection      = auth.TapNowCanvasConnection
	TapNowCanvasNode            = auth.TapNowCanvasNode
	TapNowImportIssue           = auth.TapNowImportIssue
	TapNowImportMetadata        = auth.TapNowImportMetadata
	TapNowImportWarning         = auth.TapNowImportWarning
	LoginContext                = auth.LoginContext
	LibTVConnectStartRequest    = auth.LibTVConnectStartRequest
	LibTVConnectStartResult     = auth.LibTVConnectStartResult
	LibTVConnectCompleteRequest = auth.LibTVConnectCompleteRequest
)

type authHost struct {
	svc *Service
}

func (h authHost) RequireAdmin(user *model.User) error {
	if h.svc == nil {
		return nil
	}
	return h.svc.RequireAdmin(user)
}

func (h authHost) EncryptSecret(value string) (string, error) {
	if h.svc == nil {
		return value, nil
	}
	return h.svc.encryptSettingSecret(value)
}

func (h authHost) DecryptSecret(value string) (string, error) {
	if h.svc == nil {
		return value, nil
	}
	return h.svc.decryptSettingSecret(value)
}

func (h authHost) SettingsEncryptionKey() ([]byte, error) {
	if h.svc == nil {
		return nil, nil
	}
	return h.svc.settingsEncryptionKey()
}

func (h authHost) BrandName() string {
	if h.svc == nil {
		return auth.DefaultBrandName
	}
	return h.svc.appearanceBrandName()
}

func (h authHost) EnsureSignupBonus(userID string) error {
	if h.svc == nil {
		return nil
	}
	return h.svc.ensureSignupBonus(userID)
}

func (h authHost) BindReferral(inviteeID string, code string) {
	if h.svc == nil {
		return
	}
	h.svc.bindReferral(inviteeID, code)
}
func (h authHost) RecordActivity(userID string, event string, count int) {
	if h.svc == nil {
		return
	}
	h.svc.recordActivity(userID, event, count)
}

func (h authHost) AllowRequest(ctx context.Context, key string, limit int, window time.Duration) (bool, error) {
	if h.svc == nil {
		return true, nil
	}
	return h.svc.AllowRequest(ctx, key, limit, window)
}

func (h authHost) RequestRetryAfter(ctx context.Context, key string, window time.Duration) time.Duration {
	if h.svc == nil {
		return 0
	}
	return h.svc.RequestRetryAfter(ctx, key, window)
}

func (s *Service) authDomain() *auth.Service {
	if s == nil {
		return auth.New(nil, nil, nil)
	}
	if s.auth != nil {
		return s.auth
	}
	domain := auth.New(s.repo, authHost{svc: s}, nil)
	domain.SetSMSDelivery(s.smsDomain())
	return domain
}

func (s *Service) PublicAuthSettings() (*PublicAuthSettings, error) {
	return s.authDomain().PublicAuthSettings()
}

func (s *Service) Register(req RegisterRequest) (*AuthSessionResult, error) {
	return s.authDomain().Register(req)
}

func (s *Service) Login(req LoginRequest) (*AuthSessionResult, error) {
	return s.authDomain().Login(req)
}

func (s *Service) LoginRateLimitSubject(account string) (string, error) {
	return s.authDomain().LoginRateLimitSubject(account)
}

func (s *Service) Logout(cookieValue string, contexts ...LoginContext) error {
	return s.authDomain().Logout(cookieValue, contexts...)
}

func (s *Service) LogoutForExpectedUser(cookieValue, expectedUserID string, contexts ...LoginContext) error {
	return s.authDomain().LogoutForExpectedUser(cookieValue, expectedUserID, contexts...)
}

func (s *Service) CurrentUser(cookieValue string) (*model.User, error) {
	return s.authDomain().CurrentUser(cookieValue)
}

func (s *Service) PublicAuthUser(user *model.User) (AuthUser, error) {
	return s.authDomain().PublicAuthUser(user)
}

func (s *Service) AdminRegistrationSetting(actor *model.User) (*PublicRegistrationSetting, error) {
	return s.authDomain().AdminRegistrationSetting(actor)
}

func (s *Service) UpdateRegistrationSetting(actor *model.User, req RegistrationSettingRequest) (*PublicRegistrationSetting, error) {
	return s.authDomain().UpdateRegistrationSetting(actor, req)
}

func (s *Service) AdminTurnstileSetting(actor *model.User) (*PublicTurnstileSetting, error) {
	return s.authDomain().AdminTurnstileSetting(actor)
}

func (s *Service) UpdateTurnstileSetting(actor *model.User, req TurnstileSettingRequest) (*PublicTurnstileSetting, error) {
	return s.authDomain().UpdateTurnstileSetting(actor, req)
}

func (s *Service) RegistrationEnabled() (bool, error) {
	return s.authDomain().RegistrationEnabled()
}

func (s *Service) SendPasswordResetEmailCode(rawEmail string) error {
	return s.authDomain().SendPasswordResetEmailCode(rawEmail)
}

func (s *Service) ResetPassword(req PasswordResetRequest) error {
	return s.authDomain().ResetPassword(req)
}

func (s *Service) AdminEmailSetting(actor *model.User) (*PublicEmailSetting, error) {
	return s.authDomain().AdminEmailSetting(actor)
}

func (s *Service) UpdateEmailSetting(actor *model.User, req EmailSettingRequest) (*PublicEmailSetting, error) {
	return s.authDomain().UpdateEmailSetting(actor, req)
}

func (s *Service) EmailEnabled() (bool, error) {
	return s.authDomain().EmailEnabled()
}

func (s *Service) SendRegistrationEmailCode(rawEmail string) error {
	return s.authDomain().SendRegistrationEmailCode(rawEmail)
}

func (s *Service) VerifyRegistrationEmailCode(email string, rawCode string) (*model.EmailVerificationCode, error) {
	return s.authDomain().VerifyRegistrationEmailCode(email, rawCode)
}

func (s *Service) AdminLinuxDOSetting(actor *model.User) (*PublicLinuxDOSetting, error) {
	return s.authDomain().AdminLinuxDOSetting(actor)
}

func (s *Service) UpdateLinuxDOSetting(actor *model.User, req LinuxDOSettingRequest) (*PublicLinuxDOSetting, error) {
	return s.authDomain().UpdateLinuxDOSetting(actor, req)
}

func (s *Service) LinuxDOEnabled() bool {
	return s.authDomain().LinuxDOEnabled()
}

func (s *Service) BeginLinuxDOLogin(nextPath string, acceptedTerms bool) (string, error) {
	return s.authDomain().BeginLinuxDOLogin(nextPath, acceptedTerms)
}

func (s *Service) CompleteLinuxDOLogin(stateValue string, code string, cookieValue string, contexts ...LoginContext) (*LinuxDOCallbackResult, error) {
	return s.authDomain().CompleteLinuxDOLogin(stateValue, code, cookieValue, contexts...)
}

func (s *Service) BeginOIDCLogin(ctx context.Context, next string, acceptedTerms bool) (string, string, error) {
	return s.authDomain().BeginOIDCLogin(ctx, next, acceptedTerms)
}

func (s *Service) CompleteOIDCLogin(ctx context.Context, state, code string, login LoginContext) (*auth.OAuthCallbackResult, error) {
	return s.authDomain().CompleteOIDCLogin(ctx, state, code, login)
}

func (s *Service) AdminLibTVSetting(actor *model.User) (*PublicLibTVSetting, error) {
	return s.authDomain().AdminLibTVSetting(actor)
}

func (s *Service) AdminGoogleSetting(actor *model.User) (*PublicGoogleSetting, error) {
	return s.authDomain().AdminGoogleSetting(actor)
}

func (s *Service) UpdateGoogleSetting(actor *model.User, req GoogleSettingRequest) (*PublicGoogleSetting, error) {
	return s.authDomain().UpdateGoogleSetting(actor, req)
}

func (s *Service) BeginGoogleLogin(nextPath string, acceptedTerms bool) (*GoogleLoginStart, error) {
	return s.authDomain().BeginGoogleLogin(nextPath, acceptedTerms)
}

func (s *Service) CompleteGoogleLogin(ctx context.Context, state, browserToken, code string, contexts ...LoginContext) (*GoogleCallbackResult, error) {
	return s.authDomain().CompleteGoogleLogin(ctx, state, browserToken, code, contexts...)
}

func (s *Service) AdminGitHubSetting(actor *model.User) (*PublicGitHubSetting, error) {
	return s.authDomain().AdminGitHubSetting(actor)
}

func (s *Service) UpdateGitHubSetting(actor *model.User, req GitHubSettingRequest) (*PublicGitHubSetting, error) {
	return s.authDomain().UpdateGitHubSetting(actor, req)
}

func (s *Service) BeginGitHubLogin(nextPath string, acceptedTerms bool) (*GitHubLoginStart, error) {
	return s.authDomain().BeginGitHubLogin(nextPath, acceptedTerms)
}

func (s *Service) GitHubAccount(actor *model.User, cookie string) (*GitHubAccountLink, error) {
	return s.authDomain().GitHubAccount(actor, cookie)
}

func (s *Service) BeginGitHubBinding(actor *model.User, cookie string) (*GitHubLoginStart, error) {
	return s.authDomain().BeginGitHubBinding(actor, cookie)
}

func (s *Service) CompleteGitHubBinding(ctx context.Context, state, browserToken, code, cookie string) error {
	return s.authDomain().CompleteGitHubBinding(ctx, state, browserToken, code, cookie)
}

func (s *Service) CompleteGitHubLogin(ctx context.Context, state, browserToken, code string, contexts ...LoginContext) (*GitHubCallbackResult, error) {
	return s.authDomain().CompleteGitHubLogin(ctx, state, browserToken, code, contexts...)
}

func (s *Service) UpdateLibTVSetting(actor *model.User, req LibTVSettingRequest) (*PublicLibTVSetting, error) {
	return s.authDomain().UpdateLibTVSetting(actor, req)
}

func (s *Service) TestLibTV(actor *model.User, projectUUID string) error {
	return s.authDomain().TestLibTV(actor, projectUUID)
}

func (s *Service) ImportLibTV(userID, canvasProjectID, projectUUID string) (*LibTVImportResult, error) {
	return s.authDomain().ImportLibTV(userID, canvasProjectID, projectUUID)
}

func (s *Service) ImportLibTVJSON(userID, canvasProjectID string, raw []byte) (*LibTVImportResult, error) {
	return s.authDomain().ImportLibTVJSON(userID, canvasProjectID, raw)
}

func (s *Service) StartLibTVOAuth(actor *model.User, req LibTVConnectStartRequest) (*LibTVConnectStartResult, error) {
	return s.authDomain().StartLibTVOAuth(actor, req)
}

func (s *Service) CompleteLibTVOAuth(actor *model.User, req LibTVConnectCompleteRequest) (*PublicLibTVSetting, error) {
	return s.authDomain().CompleteLibTVOAuth(actor, req)
}

func (s *Service) CompleteLibTVOAuthCallback(code, state, errorCode, errorDescription string) (string, int, error) {
	return s.authDomain().CompleteLibTVOAuthCallback(code, state, errorCode, errorDescription)
}

func (s *Service) DisconnectLibTV(actor *model.User) (*PublicLibTVSetting, error) {
	return s.authDomain().DisconnectLibTV(actor)
}

func (s *Service) ImportTapNow(userID, canvasProjectID, shareID string) (*TapNowImportResult, error) {
	return s.authDomain().ImportTapNow(userID, canvasProjectID, shareID)
}

func hashPassword(password string) (string, error) {
	return auth.HashPassword(password)
}

func normalizeUsername(value string) string {
	return auth.NormalizeUsername(value)
}

func normalizeEmail(value string) string {
	return auth.NormalizeEmail(value)
}

func normalizeDisplayName(value string, fallback string) string {
	return auth.NormalizeDisplayName(value, fallback)
}

func validateUsername(value string) error {
	return auth.ValidateUsername(value)
}

func validatePassword(value string) error {
	return auth.ValidatePassword(value)
}

func validateEmail(value string) error {
	return auth.ValidateEmail(value)
}

func hashToken(token string) string {
	return auth.HashToken(token)
}

func randomToken() string {
	return auth.RandomToken()
}

func (s *Service) AdminEmailLogs(actor *model.User, query EmailLogQuery, page, pageSize int) (*EmailLogPage, error) {
	return s.authDomain().AdminEmailLogs(actor, query, page, pageSize)
}

func (s *Service) SendTestEmail(actor *model.User, recipient string) error {
	return s.authDomain().SendTestEmail(actor, recipient)
}
