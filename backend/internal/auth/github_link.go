package auth

import (
	"context"
	"errors"
	"strconv"

	"gorm.io/gorm"
	"infinite-canvas/backend/internal/kernel"
	"infinite-canvas/backend/internal/model"
	"infinite-canvas/backend/internal/repository"
)

type GitHubAccountLink struct {
	Enabled  bool   `json:"enabled"`
	Linked   bool   `json:"linked"`
	Username string `json:"username,omitempty"`
}

func (s *Service) GitHubAccount(actor *model.User, cookie string) (*GitHubAccountLink, error) {
	user, _, err := s.profileSession(actor, cookie)
	if err != nil {
		return nil, err
	}
	setting, err := s.readGitHubSetting()
	if err != nil {
		return nil, err
	}
	result := &GitHubAccountLink{Enabled: setting.Enabled && validateGitHubSetting(setting) == nil}
	identity, err := s.repo.UserIdentityForUser(user.ID, "github")
	if err == nil {
		result.Linked, result.Username = true, identity.ProviderUsername
	} else if !errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, err
	}
	return result, nil
}

func (s *Service) BeginGitHubBinding(actor *model.User, cookie string) (*GitHubLoginStart, error) {
	user, session, err := s.profileSession(actor, cookie)
	if err != nil {
		return nil, err
	}
	if _, err := s.repo.UserIdentityForUser(user.ID, "github"); err == nil {
		return nil, kernel.BadAuthRequest("该账号已绑定 GitHub")
	} else if !errors.Is(err, gorm.ErrRecordNotFound) {
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
	// Reuse the existing account/session binding fields; login states cannot be used to link accounts.
	return s.beginGitHubAuthorization(setting, &model.OAuthState{Provider: "github-link", ReauthUserID: user.ID, ReauthSessionID: session.ID})
}

func (s *Service) CompleteGitHubBinding(ctx context.Context, stateValue, browserToken, code, cookie string) error {
	if stateValue == "" || browserToken == "" || code == "" || len(stateValue) > 128 || len(browserToken) > 128 || len(code) > 4096 {
		return kernel.BadAuthRequest("GitHub 绑定状态无效，请重新发起绑定")
	}
	state, err := s.repo.ConsumeOAuthState("github-link", HashToken(stateValue+"."+browserToken))
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return kernel.BadAuthRequest("GitHub 绑定状态无效或已过期，请重新发起绑定")
	}
	if err != nil {
		return err
	}
	if state.ReauthUserID == "" || state.ReauthSessionID == "" {
		return kernel.Unauthorized("绑定需要原有登录会话")
	}
	user, session, err := s.profileSession(&model.User{ID: state.ReauthUserID}, cookie)
	if err != nil {
		return err
	}
	if session.ID != state.ReauthSessionID {
		return kernel.Unauthorized("绑定与当前登录会话不匹配，请重新发起绑定")
	}
	setting, err := s.readGitHubSetting()
	if err != nil {
		return err
	}
	if !setting.Enabled {
		return kernel.Forbidden("GitHub 登录尚未启用")
	}
	if err := validateGitHubSetting(setting); err != nil {
		return err
	}
	profile, err := s.exchangeGitHubProfile(ctx, setting, code, state.CodeVerifier)
	if err != nil {
		return err
	}
	identity := &model.UserIdentity{ID: kernel.NewID(), UserID: user.ID, Provider: "github", Subject: strconv.FormatInt(profile.ID, 10), ProviderUsername: profile.Login, AvatarURL: profile.AvatarURL}
	err = s.repo.LinkUserIdentity(user, session, identity)
	if errors.Is(err, repository.ErrIdentityAlreadyLinked) {
		return kernel.BadAuthRequest("GitHub 身份或当前账号已存在其它绑定，不能覆盖")
	}
	return profileWriteError(err)
}
