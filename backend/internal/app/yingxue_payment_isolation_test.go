package app

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"infinite-canvas/backend/internal/model"
	"infinite-canvas/backend/internal/payment"
	"infinite-canvas/backend/internal/repository"
	paymentplugins "infinite-canvas/backend/payment-plugins"

	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

func newYingxuePaymentTestService(t *testing.T) (*Service, *gorm.DB) {
	t.Helper()
	dir := t.TempDir()
	db, err := gorm.Open(sqlite.Open(filepath.Join(dir, "payments.db")), &gorm.Config{})
	if err != nil {
		t.Fatal(err)
	}
	sqlDB, err := db.DB()
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = sqlDB.Close() })
	if err := db.AutoMigrate(&model.PaymentOrder{}, &model.EPayPaymentOrder{}, &model.PaymentProviderConfig{}, &model.PaymentNotification{}, &model.CreditAccount{}, &model.CreditLedgerEntry{}); err != nil {
		t.Fatal(err)
	}
	registry, err := payment.NewRegistry(paymentplugins.NewCloudCatEPayProvider(nil), paymentplugins.NewEpayProvider(nil))
	if err != nil {
		t.Fatal(err)
	}
	return &Service{repo: repository.New(db), dataDir: dir, paymentRegistry: registry}, db
}

func TestUserPaymentOrdersPagesAllHistoryWithoutCrossingAccounts(t *testing.T) {
	svc, db := newYingxuePaymentTestService(t)
	for i := 0; i < 66; i++ {
		userID := "owner"
		if i == 65 {
			userID = "other"
		}
		status := model.PaymentOrderPending
		if i == 0 {
			status = model.PaymentOrderClosed
		}
		if i == 1 {
			status = model.PaymentOrderCredited
		}
		id := fmt.Sprintf("order-%03d", i)
		order := model.PaymentOrder{ID: id, UserID: userID, IdempotencyKey: id, MerchantOrderNo: id, ProviderID: PaymentProviderCloudCatEPay, Status: status, CheckoutMode: "qr_code", CheckoutValue: "https://pay.example.test/" + id, ExpiresAt: time.Now().Add(time.Hour)}
		if err := db.Create(&order).Error; err != nil {
			t.Fatal(err)
		}
	}
	actor := &model.User{ID: "owner"}
	seen := map[string]bool{}
	for page := 1; page <= 4; page++ {
		result, err := svc.UserPaymentOrders(actor, "", page, 20)
		if err != nil {
			t.Fatal(err)
		}
		if result.Total != 65 || result.TotalPages != 4 || result.Page != page || result.PageSize != 20 {
			t.Fatalf("pagination=%#v", result)
		}
		for _, order := range result.Items {
			if order.UserID != actor.ID || seen[order.ID] {
				t.Fatalf("foreign or repeated order: %s", order.ID)
			}
			seen[order.ID] = true
			if order.Status == model.PaymentOrderClosed || order.Status == model.PaymentOrderCredited {
				if order.CanClose || order.Checkout.URL != "" || order.Checkout.Value != "" {
					t.Fatal("historical terminal order exposed a payment action")
				}
			}
		}
	}
	if len(seen) != 65 {
		t.Fatalf("visible orders=%d", len(seen))
	}
	closed, err := svc.UserPaymentOrders(actor, "closed", 1, 20)
	if err != nil || closed.Total != 1 || len(closed.Items) != 1 {
		t.Fatalf("status filter=%#v error=%v", closed, err)
	}
	if _, err := svc.UserPaymentOrders(nil, "", 1, 20); err == nil {
		t.Fatal("anonymous listing was accepted")
	}
	if _, err := svc.PaymentOrder(actor, "order-065"); err == nil {
		t.Fatal("foreign order was accessible")
	}
}

func TestLegacyTerminalPaymentOrdersAreReadOnlyWithoutConfig(t *testing.T) {
	for _, status := range []model.PaymentOrderStatus{model.PaymentOrderClosed, model.PaymentOrderCredited} {
		t.Run(string(status), func(t *testing.T) {
			svc, db := newYingxuePaymentTestService(t)
			order := model.PaymentOrder{ID: "legacy", UserID: "owner", IdempotencyKey: "legacy", MerchantOrderNo: "legacy-merchant", ProviderID: PaymentProviderCloudCatEPay, Status: status, AmountFen: 1000, Currency: "CNY", CreditsMicrocredits: 100_000_000}
			if err := db.Create(&order).Error; err != nil {
				t.Fatal(err)
			}
			actor := &model.User{ID: "owner"}
			for _, operation := range []func(context.Context, *model.User, string) (*PaymentOrderView, error){svc.QueryPaymentOrder, svc.ClosePaymentOrder} {
				view, err := operation(context.Background(), actor, order.ID)
				if err != nil || view.Status != status {
					t.Fatalf("historical read failed: %#v %v", view, err)
				}
			}
			if _, err := svc.RefreshPaymentCheckout(context.Background(), actor, order.ID); err == nil {
				t.Fatal("historical checkout was refreshed")
			}
			if _, err := svc.PaymentCheckout(actor, order.ID); err == nil {
				t.Fatal("historical checkout was opened")
			}
			if _, _, _, err := svc.paymentRuntimeForOrder(&order); err == nil {
				t.Fatal("historical order acquired a provider runtime")
			}
			result := payment.Result{MerchantOrderNo: order.MerchantOrderNo, ProviderTradeNo: "forged-trade", Paid: true, AmountFen: order.AmountFen, Currency: "CNY"}
			if _, err := svc.applyPaymentResult(order.ProviderID, result); err == nil {
				t.Fatal("missing snapshot accepted paid evidence")
			}
			raw, err := json.Marshal(result)
			if err != nil {
				t.Fatal(err)
			}
			inbox := &model.PaymentNotification{PaymentOrderID: order.ID, ProviderID: order.ProviderID, MerchantOrderNo: order.MerchantOrderNo, NormalizedJSON: string(raw)}
			if err := svc.processPaymentNotification(inbox); err == nil {
				t.Fatal("historical inbox bypassed the snapshot guard")
			}
			var count int64
			if err := db.Model(&model.CreditLedgerEntry{}).Count(&count).Error; err != nil {
				t.Fatal(err)
			}
			if count != 0 {
				t.Fatal("read-only history created a credit ledger entry")
			}
			var persisted model.PaymentOrder
			if err := db.First(&persisted, "id = ?", order.ID).Error; err != nil {
				t.Fatal(err)
			}
			if persisted.Status != status {
				t.Fatal("historical status changed")
			}
		})
	}
}

func TestMigratedEPayCallbackCannotCreditSourceShadow(t *testing.T) {
	svc, db := newYingxuePaymentTestService(t)
	id := strings.Repeat("a", 32)
	key := "test-merchant-key"
	legacy := model.EPayPaymentOrder{ID: id, UserID: "owner", IdempotencyKey: "old-key", Status: model.EPayPaymentOrderPending, MerchantID: "1001", MerchantKeyCipher: key, AmountCents: 1000, PayType: "wxpay", CreditsMicrocredits: 100_000_000}
	order := model.PaymentOrder{ID: id, UserID: "owner", IdempotencyKey: "new-key", MerchantOrderNo: id, ProviderID: PaymentProviderEpay, PluginID: PaymentPluginEpay, PluginVersion: "1.0.0", ProviderConfigID: "config", ProviderConfigVersion: 1, PaymentMethod: "wxpay", AmountFen: 1000, Currency: "CNY", ChargeAmountFen: 1000, ChargeCurrency: "CNY", CreditsMicrocredits: 100_000_000, Status: model.PaymentOrderPending}
	config := model.PaymentProviderConfig{ID: "config", ProviderID: order.ProviderID, PluginID: order.PluginID, PluginVersion: order.PluginVersion, Version: 1, ConfigCipher: `{"publicBaseUrl":"https://canvas.example.test","pid":"1001","key":"test-merchant-key","gateway":"https://checkout.example.test","version":"0","payTypes":"wxpay"}`}
	for _, row := range []any{&legacy, &order, &config} {
		if err := db.Create(row).Error; err != nil {
			t.Fatal(err)
		}
	}
	values := url.Values{"pid": {"1001"}, "type": {"wxpay"}, "out_trade_no": {id}, "trade_no": {"verified-trade"}, "trade_status": {"TRADE_SUCCESS"}, "money": {"10.00"}, "sign_type": {"MD5"}}
	values.Set("sign", paymentSign(values, key))
	if _, err := validateEPayNotification(values, &legacy, key); err != nil {
		t.Fatalf("fixture was not a valid legacy callback: %v", err)
	}
	if granted, err := svc.CompleteEPayPayment(values); err == nil || granted {
		t.Fatal("legacy callback credited a migrated source row")
	}
	if _, granted, err := svc.repo.CompleteEPayPaymentOrder(id, "verified-trade"); err == nil || granted {
		t.Fatal("repository bypass credited a migrated source row")
	}
	listed, err := svc.EPayPaymentOrders(&model.User{ID: "owner"}, 100)
	if err != nil || len(listed) != 0 {
		t.Fatalf("source shadows leaked into old order list: %#v %v", listed, err)
	}
	var count int64
	if err := db.Model(&model.CreditLedgerEntry{}).Count(&count).Error; err != nil {
		t.Fatal(err)
	}
	if count != 0 {
		t.Fatal("rejected legacy callback mutated the ledger")
	}
	for i := 0; i < 2; i++ {
		if err := svc.AcceptPaymentNotification(context.Background(), order.ProviderID, config.ID, http.Header{}, []byte(values.Encode())); err != nil {
			t.Fatal(err)
		}
	}
	var account model.CreditAccount
	if err := db.First(&account, "user_id = ?", "owner").Error; err != nil {
		t.Fatal(err)
	}
	if err := db.Model(&model.CreditLedgerEntry{}).Count(&count).Error; err != nil {
		t.Fatal(err)
	}
	if account.AvailableMicrocredits != order.CreditsMicrocredits || count != 1 {
		t.Fatal("new callback did not grant exactly once")
	}
	var source model.EPayPaymentOrder
	if err := db.First(&source, "id = ?", id).Error; err != nil {
		t.Fatal(err)
	}
	if source.Status != model.EPayPaymentOrderPending || source.MerchantKeyCipher != key {
		t.Fatal("source evidence was changed")
	}
}

func TestLegacyPaymentSettingsRespectDatabaseAndStayDisabledByDefault(t *testing.T) {
	svc, db := newYingxuePaymentTestService(t)
	if err := db.AutoMigrate(&model.SystemSetting{}); err != nil {
		t.Fatal(err)
	}
	stored, value, err := svc.readPaymentSetting()
	if err != nil || stored != nil || value.Enabled || value.BaseURL != defaultEPayBaseURL || paymentSettingReady(value) {
		t.Fatalf("missing payment configuration was enabled: %#v %v", value, err)
	}
	cipher, err := svc.encryptSettingSecret("saved-merchant-key")
	if err != nil {
		t.Fatal(err)
	}
	configured := paymentSettingValue{Enabled: false, BaseURL: "https://configured.example.test", MerchantID: "1001", MerchantKey: cipher, SiteURL: "https://canvas.example.test", PayTypes: []string{"wxpay"}}
	raw, err := json.Marshal(configured)
	if err != nil {
		t.Fatal(err)
	}
	if err := db.Create(&model.SystemSetting{Key: paymentSettingKey, ValueJSON: string(raw)}).Error; err != nil {
		t.Fatal(err)
	}
	stored, value, err = svc.readPaymentSetting()
	if err != nil || stored == nil || value.Enabled || value.BaseURL != configured.BaseURL || value.MerchantKey != "saved-merchant-key" || len(value.PayTypes) != 1 || value.PayTypes[0] != "wxpay" {
		t.Fatal("saved payment configuration or encrypted credentials were replaced")
	}
	value.Enabled = true
	value.BaseURL = "direct"
	if paymentSettingReady(value) {
		t.Fatal("unsigned direct checkout is still available")
	}
	if err := validatePaymentSetting(value); err == nil {
		t.Fatal("unsigned direct checkout configuration was accepted")
	}
}
