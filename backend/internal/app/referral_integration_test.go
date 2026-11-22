package app

import (
	"encoding/json"
	"errors"
	"testing"
	"time"

	"infinite-canvas/backend/internal/model"
	"infinite-canvas/backend/internal/payment"

	"gorm.io/gorm"
)

func TestReferralDefaultDisabledDoesNotBindOrChangeBalances(t *testing.T) {
	s, db := newReferralTestService(t)
	inviter := model.User{ID: "inviter", Username: "inviter", Role: model.UserRoleAdmin, Status: model.UserStatusActive, IsPromoter: true}
	if err := db.Create(&inviter).Error; err != nil {
		t.Fatal(err)
	}
	if err := db.Create(&model.ReferralProfile{UserID: inviter.ID, Code: "ABCDEFGH"}).Error; err != nil {
		t.Fatal(err)
	}
	// 关闭前已有的归属不能让历史订单在重复通知时产生返佣。
	if err := db.Create(&model.ReferralBinding{InviteeUserID: "previous", InviterUserID: inviter.ID, Code: "ABCDEFGH"}).Error; err != nil {
		t.Fatal(err)
	}
	account := model.CreditAccount{UserID: inviter.ID, AvailableMicrocredits: 12345, ReservedMicrocredits: 678, Version: 9}
	if err := db.Create(&account).Error; err != nil {
		t.Fatal(err)
	}
	setting, err := s.AdminReferralSetting(&inviter)
	if err != nil || setting.Enabled || setting.Mode != ReferralModeAll || setting.CommissionRateBasisPoints != 1000 {
		t.Fatalf("default = %#v, %v", setting, err)
	}
	available, err := s.ReferralAvailable(&inviter)
	if err != nil || available {
		t.Fatalf("available = %v, %v", available, err)
	}
	if _, err := s.ReferralOverview(&inviter); err == nil {
		t.Fatal("closed overview accepted")
	}
	if err := s.tryBindReferral("new-user", "ABCDEFGH"); err != nil {
		t.Fatal(err)
	}
	if err := s.tryGrantReferralCommission(&model.PaymentOrder{ID: "old-order", UserID: "previous", Status: model.PaymentOrderCredited, CreditsMicrocredits: 100 * CreditScale}); err != nil {
		t.Fatal(err)
	}
	var stored model.CreditAccount
	if err := db.First(&stored, "user_id = ?", inviter.ID).Error; err != nil {
		t.Fatal(err)
	}
	if account.UserID != stored.UserID || account.AvailableMicrocredits != stored.AvailableMicrocredits || account.ReservedMicrocredits != stored.ReservedMicrocredits || account.Version != stored.Version || !account.CreatedAt.Equal(stored.CreatedAt) || !account.UpdatedAt.Equal(stored.UpdatedAt) {
		t.Fatalf("account changed: %#v -> %#v", account, stored)
	}
	for _, entity := range []any{&model.SystemSetting{}, &model.ReferralCommission{}, &model.CreditLedgerEntry{}} {
		var count int64
		if err := db.Model(entity).Count(&count).Error; err != nil || count != 0 {
			t.Fatalf("closed feature wrote %T: %d, %v", entity, count, err)
		}
	}
	if _, err := s.repo.ReferralBindingByInvitee("new-user"); !errors.Is(err, gorm.ErrRecordNotFound) {
		t.Fatalf("disabled registration bound: %v", err)
	}
}

func TestReferralOwnershipCannotBeOverwrittenOrReadAcrossAccounts(t *testing.T) {
	s, db := newReferralTestService(t)
	saveReferralTestSetting(t, db, ReferralSetting{Enabled: true, Mode: ReferralModeAll, CommissionRateBasisPoints: 1000})
	a := model.User{ID: "a", Username: "a", Status: model.UserStatusActive}
	b := model.User{ID: "b", Username: "b", Status: model.UserStatusActive}
	invitee := model.User{ID: "invitee", Username: "invitee", DisplayName: "private-name", Status: model.UserStatusActive}
	if err := db.Create([]model.User{a, b, invitee}).Error; err != nil {
		t.Fatal(err)
	}
	first, err := s.ReferralOverview(&a)
	if err != nil {
		t.Fatal(err)
	}
	second, err := s.ReferralOverview(&b)
	if err != nil {
		t.Fatal(err)
	}
	s.bindReferral(invitee.ID, first.Code)
	s.bindReferral(invitee.ID, second.Code)
	binding, err := s.repo.ReferralBindingByInvitee(invitee.ID)
	if err != nil || binding.InviterUserID != a.ID {
		t.Fatalf("binding overwritten: %#v, %v", binding, err)
	}
	s.grantReferralCommission(&model.PaymentOrder{ID: "owner-order", UserID: invitee.ID, Status: model.PaymentOrderCredited, CreditsMicrocredits: 100 * CreditScale})
	for _, user := range []*model.User{&a, &b} {
		page, err := s.ReferralCommissions(user, 1, 20)
		if err != nil {
			t.Fatal(err)
		}
		invites, err := s.ReferralInvitees(user, 1, 20)
		if err != nil {
			t.Fatal(err)
		}
		if user.ID == b.ID && (page.Total != 0 || invites.Total != 0) {
			t.Fatal("unrelated promoter saw another user's data")
		}
		if user.ID == a.ID {
			if page.Total != 1 || invites.Total != 1 || page.Commissions[0].InviteeName != "p**" || page.Commissions[0].InviterUserID != "" {
				t.Fatalf("owner view not masked: %#v", page)
			}
		}
	}
	if _, err := s.AdminReferralCommissions(&b, 1, 20); err == nil {
		t.Fatal("non-admin read global commissions")
	}
}

func TestReferralSettingsPermissionsAndRateBounds(t *testing.T) {
	s, db := newReferralTestService(t)
	if err := db.AutoMigrate(&model.AdminAuditEvent{}); err != nil {
		t.Fatal(err)
	}
	admin := &model.User{ID: "admin", Role: model.UserRoleAdmin, Status: model.UserStatusActive}
	normal := &model.User{ID: "normal", Role: model.UserRoleUser, Status: model.UserStatusActive}
	setting := ReferralSetting{Enabled: true, Mode: ReferralModeAssigned, CommissionRateBasisPoints: 2500}
	if _, err := s.UpdateReferralSetting(normal, setting); err == nil {
		t.Fatal("non-admin wrote referral settings")
	}
	if _, err := s.AdminReferralSetting(normal); err == nil {
		t.Fatal("non-admin read referral settings")
	}
	for _, invalid := range []ReferralSetting{{Mode: "bad"}, {Mode: ReferralModeAll, CommissionRateBasisPoints: -1}, {Mode: ReferralModeAll, CommissionRateBasisPoints: 5001}} {
		if _, err := s.UpdateReferralSetting(admin, invalid); err == nil {
			t.Fatalf("accepted invalid setting %#v", invalid)
		}
	}
	stored, err := s.UpdateReferralSetting(admin, setting)
	if err != nil || stored != setting {
		t.Fatalf("admin save = %#v, %v", stored, err)
	}
	var audit model.AdminAuditEvent
	if err := db.First(&audit).Error; err != nil || audit.Action != "referral.setting.update" {
		t.Fatalf("missing audit: %#v, %v", audit, err)
	}
	for _, user := range []*model.User{nil, {ID: "disabled", Status: model.UserStatusDisabled, IsPromoter: true}, normal} {
		if available, err := s.ReferralAvailable(user); err != nil || available {
			t.Fatalf("unauthorized availability = %v, %v", available, err)
		}
	}
}

func TestReferralPaymentResultKeepsTopupIdempotentWhenDisabledOrEnabled(t *testing.T) {
	for _, enabled := range []bool{false, true} {
		t.Run(map[bool]string{false: "default-disabled", true: "enabled-isolated"}[enabled], func(t *testing.T) {
			s, db := newReferralTestService(t)
			if err := db.AutoMigrate(&model.PaymentOrder{}, &model.TopupProduct{}, &model.PaymentProviderConfig{}); err != nil {
				t.Fatal(err)
			}
			if err := db.Create(&model.PaymentProviderConfig{ID: "test-config", ProviderID: "test-provider", Version: 1}).Error; err != nil {
				t.Fatal(err)
			}
			if err := db.Create(&model.User{ID: "inviter", Username: "inviter", Status: model.UserStatusActive}).Error; err != nil {
				t.Fatal(err)
			}
			if err := db.Create(&model.ReferralBinding{InviteeUserID: "payer", InviterUserID: "inviter"}).Error; err != nil {
				t.Fatal(err)
			}
			if enabled {
				saveReferralTestSetting(t, db, ReferralSetting{Enabled: true, Mode: ReferralModeAll, CommissionRateBasisPoints: 1000})
			}
			order := model.PaymentOrder{ID: "payment", UserID: "payer", MerchantOrderNo: "merchant", ProviderID: "test-provider", ProviderConfigID: "test-config", ProviderConfigVersion: 1, AmountFen: 100, Currency: "CNY", ChargeAmountFen: 100, ChargeCurrency: "CNY", CreditsMicrocredits: 100 * CreditScale, Status: model.PaymentOrderPending, ExpiresAt: time.Now().Add(time.Hour)}
			if err := db.Create(&order).Error; err != nil {
				t.Fatal(err)
			}
			result := payment.Result{MerchantOrderNo: "merchant", ProviderTradeNo: "test-trade", AmountFen: 100, Currency: "CNY", Paid: true, PaidAt: time.Now()}
			for range 2 {
				completed, err := s.applyPaymentResult(order.ProviderID, result)
				if err != nil || completed.Status != model.PaymentOrderCredited {
					t.Fatalf("payment result = %#v, %v", completed, err)
				}
			}
			var payer model.CreditAccount
			if err := db.First(&payer, "user_id = ?", "payer").Error; err != nil || payer.AvailableMicrocredits != 100*CreditScale {
				t.Fatalf("payer = %#v, %v", payer, err)
			}
			var commissions, ledger int64
			if err := db.Model(&model.ReferralCommission{}).Count(&commissions).Error; err != nil {
				t.Fatal(err)
			}
			if err := db.Model(&model.CreditLedgerEntry{}).Count(&ledger).Error; err != nil {
				t.Fatal(err)
			}
			wantCommission, wantLedger := int64(0), int64(1)
			if enabled {
				wantCommission, wantLedger = 1, 2
			}
			if commissions != wantCommission || ledger != wantLedger {
				t.Fatalf("commissions=%d ledger=%d", commissions, ledger)
			}
			if enabled {
				var inviter model.CreditAccount
				if err := db.First(&inviter, "user_id = ?", "inviter").Error; err != nil || inviter.AvailableMicrocredits != 10*CreditScale {
					t.Fatalf("inviter = %#v, %v", inviter, err)
				}
			}
			var settings []model.SystemSetting
			if err := db.Find(&settings).Error; err != nil {
				t.Fatal(err)
			}
			if !enabled && len(settings) != 0 {
				encoded, _ := json.Marshal(settings)
				t.Fatalf("default settings written: %s", encoded)
			}
		})
	}
}
