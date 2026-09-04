package service

import (
	"testing"

	"infinite-canvas/backend/internal/model"
	"infinite-canvas/backend/internal/repository"

	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

func TestPublicAuthUserIncludesLinuxDOIdentity(t *testing.T) {
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	if err != nil {
		t.Fatal(err)
	}
	if err := db.AutoMigrate(&model.User{}, &model.UserIdentity{}); err != nil {
		t.Fatal(err)
	}
	user := model.User{ID: "user-1", Username: "canvas-user", DisplayName: "Canvas User", Role: model.UserRoleUser, Status: model.UserStatusActive}
	identity := model.UserIdentity{ID: "identity-1", UserID: user.ID, Provider: "linuxdo", Subject: "123456", ProviderUsername: "linux-user", AvatarURL: "https://example.com/avatar.png"}
	if err := db.Create(&user).Error; err != nil {
		t.Fatal(err)
	}
	if err := db.Create(&identity).Error; err != nil {
		t.Fatal(err)
	}

	result, err := (&Service{repo: repository.New(db)}).PublicAuthUser(&user)
	if err != nil {
		t.Fatal(err)
	}
	if result.AvatarURL != identity.AvatarURL || result.IdentityProvider != "linuxdo" || result.IdentityID != identity.Subject || result.IdentityUsername != identity.ProviderUsername {
		t.Fatalf("PublicAuthUser() = %#v", result)
	}
}

func TestPublicAuthUserKeepsLocalUserWithoutIdentity(t *testing.T) {
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	if err != nil {
		t.Fatal(err)
	}
	if err := db.AutoMigrate(&model.UserIdentity{}); err != nil {
		t.Fatal(err)
	}
	user := model.User{ID: "user-1", Username: "local-user", DisplayName: "Local User"}

	result, err := (&Service{repo: repository.New(db)}).PublicAuthUser(&user)
	if err != nil {
		t.Fatal(err)
	}
	if result.Username != user.Username || result.AvatarURL != "" || result.IdentityProvider != "" || result.IdentityID != "" {
		t.Fatalf("PublicAuthUser() = %#v", result)
	}
}

func TestRegisterAllowsEnabledUsernameOnlyRegistrationAfterFirstUser(t *testing.T) {
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	if err != nil {
		t.Fatal(err)
	}
	if err := db.AutoMigrate(
		&model.User{}, &model.UserIdentity{}, &model.AuthSession{}, &model.SystemSetting{},
		&model.CreditAccount{}, &model.CreditLedgerEntry{},
	); err != nil {
		t.Fatal(err)
	}
	svc := &Service{repo: repository.New(db), dataDir: t.TempDir()}
	if _, err := svc.Register(RegisterRequest{Username: "first-admin", DisplayName: "首个管理员", Password: "password-1"}); err != nil {
		t.Fatal(err)
	}
	if err := db.Create(&model.SystemSetting{Key: registrationSettingKey, ValueJSON: `{"enabled":true}`}).Error; err != nil {
		t.Fatal(err)
	}
	result, err := svc.Register(RegisterRequest{Username: "second-user", DisplayName: "普通用户", Password: "password-2"})
	if err != nil {
		t.Fatal(err)
	}
	if result.User.Email != "" || result.User.Username != "second-user" || result.User.DisplayName != "普通用户" {
		t.Fatalf("registered user = %#v", result.User)
	}
	settings, err := svc.PublicAuthSettings()
	if err != nil {
		t.Fatal(err)
	}
	if settings.EmailCodeRequired {
		t.Fatal("username-only registration unexpectedly requires an email code")
	}
}
