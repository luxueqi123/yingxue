package app

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"sync/atomic"
	"testing"
	"time"

	"infinite-canvas/backend/internal/model"
	"infinite-canvas/backend/internal/payment"
	paymentplugins "infinite-canvas/backend/payment-plugins"
)

func TestPaymentPluginUpgradePreservesPinnedConfig(t *testing.T) {
	svc, db := newYingxuePaymentTestService(t)
	var calls atomic.Int32
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls.Add(1)
		if err := r.ParseForm(); err != nil {
			t.Error(err)
		}
		if r.Form.Get("out_trade_no") != "upgrade-order" {
			t.Errorf("unexpected merchant order: %s", r.URL.Path)
		}
		w.Header().Set("Content-Type", "application/json")
		if r.URL.Path == "/mapi.php" {
			_, _ = w.Write([]byte(`{"code":1,"qrcode":"https://qr.example.com/upgrade-order"}`))
			return
		}
		_, _ = w.Write([]byte(`{"code":1,"pid":"1001","out_trade_no":"upgrade-order","money":"10.00","status":0}`))
	}))
	defer upstream.Close()
	provider := paymentplugins.NewEpayProvider(upstream.Client())
	registry, err := payment.NewRegistry(provider)
	if err != nil {
		t.Fatal(err)
	}
	svc.paymentRegistry = registry
	values := `{"pid":"1001","key":"fixture-key","gateway":"` + upstream.URL + `","version":"0","checkoutMode":"qr_code"}`
	cipher, err := svc.encryptSettingSecret(values)
	if err != nil {
		t.Fatal(err)
	}
	config := model.PaymentProviderConfig{ID: "pinned-config", ProviderID: PaymentProviderEpay, PluginID: PaymentPluginEpay, PluginVersion: "1.0.9", Version: 2, ConfigCipher: cipher}
	order := model.PaymentOrder{ID: "order", UserID: "owner", IdempotencyKey: "upgrade-key", MerchantOrderNo: "upgrade-order", ProviderID: PaymentProviderEpay, PluginID: PaymentPluginEpay, PluginVersion: provider.Descriptor().PluginVersion, ProviderConfigID: config.ID, ProviderConfigVersion: config.Version, AmountFen: 1000, Currency: "CNY", ChargeAmountFen: 1000, ChargeCurrency: "CNY", PaymentMethod: "alipay", CheckoutMode: "qr_code", Status: model.PaymentOrderPending, ExpiresAt: time.Now().Add(time.Hour)}
	if order.PluginVersion == config.PluginVersion {
		t.Fatal("regression requires an upgraded plugin with an existing merchant config")
	}
	for _, row := range []any{&config, &order} {
		if err := db.Create(row).Error; err != nil {
			t.Fatal(err)
		}
	}
	actor := &model.User{ID: "owner"}
	result, err := svc.QueryPaymentOrder(context.Background(), actor, order.ID)
	if err != nil || result.Status != model.PaymentOrderPending {
		t.Fatalf("query after plugin upgrade: result=%#v error=%v", result, err)
	}
	refreshed, err := svc.RefreshPaymentCheckout(context.Background(), actor, order.ID)
	if err != nil || refreshed.Checkout.Value != "https://qr.example.com/upgrade-order" {
		t.Fatalf("refresh after plugin upgrade: result=%#v error=%v", refreshed, err)
	}
	closed, err := svc.ClosePaymentOrder(context.Background(), actor, order.ID)
	if err != nil || closed.Status != model.PaymentOrderClosed {
		t.Fatalf("close after plugin upgrade: result=%#v error=%v", closed, err)
	}
	for _, mutate := range []func(*model.PaymentOrder){
		func(o *model.PaymentOrder) { o.ProviderConfigVersion++ },
		func(o *model.PaymentOrder) { o.ProviderID = "other-provider" },
		func(o *model.PaymentOrder) { o.PluginID = "other-plugin" },
		func(o *model.PaymentOrder) { o.ProviderConfigID = "missing-config" },
	} {
		invalid := order
		mutate(&invalid)
		if _, err := svc.paymentConfigForOrder(&invalid); err == nil {
			t.Fatal("mismatched snapshot accepted")
		}
		before := calls.Load()
		if _, _, _, err := svc.paymentRuntimeForOrder(&invalid); err == nil {
			t.Fatal("runtime accepted mismatched snapshot")
		} else if invalid.ProviderConfigID != "missing-config" {
			var appErr *AppError
			if !errors.As(err, &appErr) || appErr.Status != http.StatusConflict {
				t.Fatalf("snapshot mismatch must return conflict: %v", err)
			}
		}
		if calls.Load() != before {
			t.Fatal("invalid snapshot reached payment provider")
		}
	}
	saved, err := svc.repo.PaymentProviderConfig(config.ID)
	if err != nil || saved.PluginVersion != config.PluginVersion || saved.Version != config.Version || saved.ConfigCipher != config.ConfigCipher {
		t.Fatalf("merchant config was rewritten: %#v, %v", saved, err)
	}
	var entries int64
	if err := db.Model(&model.CreditLedgerEntry{}).Count(&entries).Error; err != nil || entries != 0 {
		t.Fatalf("unpaid query changed ledger: count=%d error=%v", entries, err)
	}
}
