package auth

import (
	"errors"

	"infinite-canvas/backend/internal/model"
	"infinite-canvas/backend/internal/sms"

	"gorm.io/gorm"
)

// Password login and account throttling must resolve aliases to the same user.
// Only a phone verified during registration or binding can act as an alias.
func (s *Service) passwordLoginUser(account string) (*model.User, error) {
	user, err := s.repo.UserByAccount(account)
	if !errors.Is(err, gorm.ErrRecordNotFound) {
		return user, err
	}
	phone, normalizeErr := sms.NormalizePhone(account)
	if normalizeErr != nil {
		return nil, err
	}
	user, err = s.repo.UserByPhone(phone)
	if err != nil {
		return nil, err
	}
	if user.PhoneVerifiedAt == nil {
		return nil, gorm.ErrRecordNotFound
	}
	return user, nil
}
