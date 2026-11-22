package repository

import (
	"errors"
	"time"

	"infinite-canvas/backend/internal/model"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

var ErrIdentityAlreadyLinked = errors.New("identity already linked")

func (r *Repository) LinkUserIdentity(user *model.User, session *model.AuthSession, identity *model.UserIdentity) error {
	if identity.UserID != user.ID || identity.Provider != "github" || identity.Subject == "" {
		return ErrProfileAuthorization
	}
	return r.db.Transaction(func(tx *gorm.DB) error {
		if err := lockProfileUser(tx, user.ID); err != nil {
			return err
		}
		if err := profileAuthorization(tx, user, session, time.Now(), false); err != nil {
			return err
		}
		current, err := New(tx).UserIdentityForUser(user.ID, identity.Provider)
		if err == nil {
			if current.Subject == identity.Subject {
				return nil
			}
			return ErrIdentityAlreadyLinked
		}
		if !errors.Is(err, gorm.ErrRecordNotFound) {
			return err
		}
		created := tx.Clauses(clause.OnConflict{Columns: []clause.Column{{Name: "provider"}, {Name: "subject"}}, DoNothing: true}).Create(identity)
		if created.Error != nil {
			return created.Error
		}
		if created.RowsAffected != 1 {
			return ErrIdentityAlreadyLinked
		}
		return nil
	})
}

func (r *Repository) UserIdentity(provider string, subject string) (*model.UserIdentity, error) {
	var identity model.UserIdentity
	if err := r.db.First(&identity, "provider = ? AND subject = ?", provider, subject).Error; err != nil {
		return nil, err
	}
	return &identity, nil
}

func (r *Repository) UserIdentityForUser(userID string, provider string) (*model.UserIdentity, error) {
	var identity model.UserIdentity
	if err := r.db.First(&identity, "user_id = ? AND provider = ?", userID, provider).Error; err != nil {
		return nil, err
	}
	return &identity, nil
}

func (r *Repository) CreateOAuthState(state *model.OAuthState) error {
	return r.db.Create(state).Error
}

func (r *Repository) PendingOAuthState(provider, stateHash string) (*model.OAuthState, error) {
	var state model.OAuthState
	err := r.db.First(&state, "provider = ? AND state_hash = ? AND used_at IS NULL AND expires_at > ?", provider, stateHash, time.Now()).Error
	return &state, err
}

func (r *Repository) CreateUserIdentity(identity *model.UserIdentity) error {
	return r.db.Create(identity).Error
}

func (r *Repository) ConsumeOAuthState(provider string, stateHash string) (*model.OAuthState, error) {
	var state model.OAuthState
	err := r.db.Transaction(func(tx *gorm.DB) error {
		if err := tx.First(&state, "provider = ? AND state_hash = ? AND used_at IS NULL AND expires_at > ?", provider, stateHash, time.Now()).Error; err != nil {
			return err
		}
		now := time.Now()
		updates := map[string]any{"used_at": &now}
		if state.ProfileJSON != "" {
			updates["profile_json"] = ""
		}
		updated := tx.Model(&model.OAuthState{}).Where("id = ? AND used_at IS NULL", state.ID).Updates(updates)
		if updated.Error != nil {
			return updated.Error
		}
		if updated.RowsAffected != 1 {
			return gorm.ErrRecordNotFound
		}
		state.UsedAt = &now
		return nil
	})
	return &state, err
}

func (r *Repository) CreateOAuthUser(user *model.User, identity *model.UserIdentity) error {
	return r.db.Transaction(func(tx *gorm.DB) error {
		if err := lockRegistrationEmail(tx, user.Email); err != nil {
			return err
		}
		if err := New(tx).CheckEmailAvailable(user.Email, ""); err != nil {
			return err
		}
		if err := tx.Create(user).Error; err != nil {
			return err
		}
		if err := tx.Create(identity).Error; err != nil {
			return err
		}
		return tx.Create(&model.CreditAccount{UserID: user.ID}).Error
	})
}
