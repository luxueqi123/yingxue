package auth

import (
	"context"
	"errors"
	"testing"
	"time"

	"gorm.io/gorm"
	"infinite-canvas/backend/internal/model"
)

type phoneTestDelivery struct {
	code, purpose string
	sent          int
	fail          bool
}

func (*phoneTestDelivery) Available(string) (bool, error) { return true, nil }
func (d *phoneTestDelivery) SendCode(_ context.Context, purpose, _, code string) error {
	d.sent++
	d.code, d.purpose = code, purpose
	if d.fail {
		return errors.New("test provider unavailable")
	}
	return nil
}
func newPhoneRegistrationTest(t *testing.T) (*Service, *gorm.DB, *phoneTestDelivery, *signupBonusSpyHost) {
	t.Helper()
	svc, db := newRegistrationTestService(t)
	seedOpenRegistration(t, db)
	if err := db.Create(&model.SystemSetting{Key: authPolicyKey, ValueJSON: `{"smsLogin":true,"smsRegistration":true}`}).Error; err != nil {
		t.Fatal(err)
	}
	if err := db.Exec("CREATE UNIQUE INDEX idx_phone_test ON users(phone) WHERE phone <> ''").Error; err != nil {
		t.Fatal(err)
	}
	host := &signupBonusSpyHost{Host: registrationVerificationHost{}}
	svc.host = host
	delivery := &phoneTestDelivery{}
	svc.SetSMSDelivery(delivery)
	return svc, db, delivery, host
}
func accountPhoneRequest() VerificationRequest {
	return VerificationRequest{Purpose: "register", Method: "sms", Phone: "13800138000"}
}
func verifiedAccountRequest(t *testing.T, svc *Service, delivery *phoneTestDelivery) RegisterRequest {
	t.Helper()
	ticket, err := svc.StartVerification(context.Background(), nil, accountPhoneRequest())
	if err != nil {
		t.Fatal(err)
	}
	return RegisterRequest{Username: "film-maker", Password: "test-password-42", Phone: "13800138000", SMSCode: delivery.code, Ticket: ticket.Ticket, AcceptedTerms: true}
}

func TestPhoneRegistrationWithAccountAndPassword(t *testing.T) {
	svc, _, delivery, host := newPhoneRegistrationTest(t)
	req := verifiedAccountRequest(t, svc, delivery)
	result, err := svc.Register(req)
	if err != nil {
		t.Fatal(err)
	}
	if delivery.sent != 1 || delivery.purpose != "register" || result.Session == "" || result.User.Username != req.Username || result.User.Phone != "+8613800138000" || result.User.PhoneVerifiedAt == nil || result.User.Role != model.UserRoleUser {
		t.Fatal("registration did not save the account, password and verified phone")
	}
	saved, err := svc.repo.User(result.User.ID)
	if err != nil || !verifyPassword(req.Password, saved.PasswordHash) || saved.PasswordHash == req.Password {
		t.Fatal("password was not securely saved")
	}
	subject := ""
	for _, account := range []string{"film-maker", "FILM-MAKER", "13800138000", "+8613800138000", " +8613800138000 "} {
		login, err := svc.Login(LoginRequest{Username: account, Password: req.Password})
		if err != nil || login.User.ID != result.User.ID || login.Session == "" {
			t.Fatalf("password login failed for alias %q: %v", account, err)
		}
		current, err := svc.LoginRateLimitSubject(account)
		if err != nil {
			t.Fatal(err)
		}
		if subject != "" && subject != current {
			t.Fatal("phone and account bypass shared login throttling")
		}
		subject = current
	}
	if len(host.userIDs) != 1 {
		t.Fatal("login repeated the signup bonus")
	}
	if _, err := svc.Register(req); err == nil {
		t.Fatal("registration reused a consumed ticket")
	}
}

func TestPhoneRegistrationRejectsIncompleteOrMismatchedInputs(t *testing.T) {
	for _, name := range []string{"account", "password", "phone", "different phone", "wrong code", "terms", "ticket", "expired"} {
		t.Run(name, func(t *testing.T) {
			svc, db, delivery, host := newPhoneRegistrationTest(t)
			req := verifiedAccountRequest(t, svc, delivery)
			switch name {
			case "account":
				req.Username = ""
			case "password":
				req.Password = ""
			case "phone":
				req.Phone = ""
			case "different phone":
				req.Phone = "13900139000"
			case "wrong code":
				req.SMSCode = "invalid"
			case "terms":
				req.AcceptedTerms = false
			case "ticket":
				req.Ticket = ""
			case "expired":
				db.Model(&model.AuthVerification{}).Where("purpose = ?", "register").Update("expires_at", time.Now().Add(-time.Minute))
			}
			if _, err := svc.Register(req); err == nil {
				t.Fatal("incomplete registration succeeded")
			}
			count, err := svc.repo.UserCount()
			if err != nil || count != 1 || len(host.userIDs) != 0 {
				t.Fatal("rejected registration changed accounts or bonus")
			}
		})
	}
}

func TestPhoneRegistrationCannotBeCompletedThroughLogin(t *testing.T) {
	svc, _, delivery, _ := newPhoneRegistrationTest(t)
	req := verifiedAccountRequest(t, svc, delivery)
	if _, err := svc.LoginVerification(VerificationConfirm{Ticket: req.Ticket, SMSCode: req.SMSCode}); err == nil {
		t.Fatal("login accepted a registration ticket")
	}
	if _, err := svc.Register(req); err != nil {
		t.Fatal("login rejection consumed the registration ticket", err)
	}
}

func TestPhoneRegistrationPolicyCannotBeBypassedByOptionalVerification(t *testing.T) {
	svc, db, _, _ := newPhoneRegistrationTest(t)
	db.Model(&model.SystemSetting{}).Where("key = ?", registrationSettingKey).Update("value_json", `{"enabled":true,"emailVerificationRequired":false}`)
	for _, phone := range []string{"", "13800138000"} {
		if _, err := svc.Register(RegisterRequest{Username: "new-member", Password: "test-password-42", Phone: phone, AcceptedTerms: true}); err == nil {
			t.Fatal("SMS registration policy bypassed without ticket")
		}
	}
}

func TestPhoneRegistrationClosedAndProviderFailure(t *testing.T) {
	for _, name := range []string{"closed", "provider failure"} {
		t.Run(name, func(t *testing.T) {
			svc, db, delivery, host := newPhoneRegistrationTest(t)
			if name == "closed" {
				db.Model(&model.SystemSetting{}).Where("key = ?", registrationSettingKey).Update("value_json", `{"enabled":false}`)
			} else {
				delivery.fail = true
			}
			if _, err := svc.StartVerification(context.Background(), nil, accountPhoneRequest()); err == nil {
				t.Fatal("registration verification unexpectedly succeeded")
			}
			count, _ := svc.repo.UserCount()
			if count != 1 || len(host.userIDs) != 0 {
				t.Fatal("failed verification created an account")
			}
		})
	}
}

func TestPhoneLoginNeverCreatesAccount(t *testing.T) {
	svc, _, delivery, host := newPhoneRegistrationTest(t)
	ticket, err := svc.StartVerification(context.Background(), nil, VerificationRequest{Purpose: "login", Method: "sms", Phone: "13800138000"})
	if err != nil {
		t.Fatal(err)
	}
	if delivery.sent != 0 {
		t.Fatal("unknown number received a login code")
	}
	if _, err := svc.LoginVerification(VerificationConfirm{Ticket: ticket.Ticket, SMSCode: "123456"}); err == nil {
		t.Fatal("unknown phone logged in")
	}
	if _, err := svc.Login(LoginRequest{Username: "13800138000", Password: "test-password-42"}); err == nil {
		t.Fatal("unknown account logged in")
	}
	count, _ := svc.repo.UserCount()
	if count != 1 || len(host.userIDs) != 0 {
		t.Fatal("login created an account")
	}
}

func TestPhonePasswordLoginRejectsUnverifiedDisabledAndWrongPassword(t *testing.T) {
	for _, name := range []string{"unverified", "disabled", "wrong password"} {
		t.Run(name, func(t *testing.T) {
			svc, db, delivery, _ := newPhoneRegistrationTest(t)
			req := verifiedAccountRequest(t, svc, delivery)
			result, err := svc.Register(req)
			if err != nil {
				t.Fatal(err)
			}
			if name == "unverified" {
				db.Model(&model.User{}).Where("id = ?", result.User.ID).Update("phone_verified_at", nil)
			}
			if name == "disabled" {
				db.Model(&model.User{}).Where("id = ?", result.User.ID).Update("status", model.UserStatusDisabled)
			}
			if name == "wrong password" {
				req.Password = "incorrect-password"
			}
			if _, err := svc.Login(LoginRequest{Username: "13800138000", Password: req.Password}); err == nil {
				t.Fatal("invalid phone login succeeded")
			}
		})
	}
}

func TestPhoneLoginRetainsExistingPasswordlessAccounts(t *testing.T) {
	svc, db, delivery, host := newPhoneRegistrationTest(t)
	now := time.Now()
	existing := model.User{ID: "existing-phone", Username: "phone_existing", Phone: "+8613800138000", PhoneVerifiedAt: &now, Status: model.UserStatusActive, Role: model.UserRoleUser}
	if err := db.Create(&existing).Error; err != nil {
		t.Fatal(err)
	}
	db.Model(&model.SystemSetting{}).Where("key = ?", registrationSettingKey).Update("value_json", `{"enabled":false}`)
	ticket, err := svc.StartVerification(context.Background(), nil, VerificationRequest{Purpose: "login", Method: "sms", Phone: existing.Phone})
	if err != nil {
		t.Fatal(err)
	}
	result, err := svc.LoginVerification(VerificationConfirm{Ticket: ticket.Ticket, SMSCode: delivery.code})
	if err != nil || result.User.ID != existing.ID || len(host.userIDs) != 0 {
		t.Fatal("existing phone-only account lost SMS login", err)
	}
}
