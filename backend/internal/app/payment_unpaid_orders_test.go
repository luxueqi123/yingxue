package app

import (
	"context"
	"fmt"
	"testing"
	"time"

	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
	"infinite-canvas/backend/internal/model"
	"infinite-canvas/backend/internal/payment"
	"infinite-canvas/backend/internal/repository"
	paymentplugins "infinite-canvas/backend/payment-plugins"
)

type unpaidOrderTestProvider struct {
	payment.Provider
	creates    int
	descriptor payment.Descriptor
}

func (p *unpaidOrderTestProvider) Descriptor() payment.Descriptor {
	return p.descriptor
}

func (p *unpaidOrderTestProvider) CreateOrder(_ context.Context, _ payment.Config, request payment.CreateRequest) (payment.Checkout, error) {
	p.creates++
	return payment.Checkout{Mode: "qr_code", Value: "https://checkout.example.test/" + request.MerchantOrderNo, ExpiresAt: request.ExpiresAt}, nil
}

func TestCreatePaymentOrderAllowsMoreThanFiveUnpaidOrders(t *testing.T) {
	db, err := gorm.Open(sqlite.Open("file:"+newID()+"?mode=memory&cache=shared"), &gorm.Config{})
	if err != nil {
		t.Fatal(err)
	}
	sqlDB, err := db.DB()
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = sqlDB.Close() })
	if err := db.AutoMigrate(&model.PaymentOrder{}, &model.TopupProduct{}, &model.PaymentProviderConfig{}, &model.PluginPlatformState{}, &model.SystemSetting{}); err != nil {
		t.Fatal(err)
	}
	runtimeDir := t.TempDir()
	runtime, err := newPluginRuntime(runtimeDir)
	if err != nil {
		t.Fatal(err)
	}
	svc := &Service{repo: repository.New(db), pluginRuntime: runtime, dataDir: runtimeDir}
	manifest, ok := svc.paymentManifestForProvider(PaymentProviderEpay)
	if !ok {
		t.Fatal("official Epay package is missing")
	}
	baseProvider := paymentplugins.NewEpayProvider(nil)
	descriptor := baseProvider.Descriptor()
	descriptor.PluginID = manifest.Metadata.ID
	descriptor.PluginVersion = manifest.Metadata.Version
	provider := &unpaidOrderTestProvider{Provider: baseProvider, descriptor: descriptor}
	registry, err := payment.NewRegistry(provider)
	if err != nil {
		t.Fatal(err)
	}
	svc.paymentRegistry = registry
	product := model.TopupProduct{ID: "product", Name: "Test credits", AmountFen: 1000, CreditsMicrocredits: 10 * CreditScale, Enabled: true}
	config := model.PaymentProviderConfig{ID: "config", ProviderID: PaymentProviderEpay, PluginID: descriptor.PluginID, PluginVersion: provider.Descriptor().PluginVersion, Version: 1, Enabled: true, CloseAfterMinutes: 30, ConfigCipher: `{"publicBaseUrl":"https://canvas.example.test","pid":"1001","key":"fixture-key","gateway":"https://checkout.example.test","version":"0","payTypes":"alipay,wxpay","cashierMode":"qr_code"}`}
	platform := model.PluginPlatformState{PluginID: descriptor.PluginID, Available: true}
	for _, row := range []any{&product, &config, &platform} {
		if err := db.Create(row).Error; err != nil {
			t.Fatal(err)
		}
	}
	actor := &model.User{ID: "user"}
	for i := 0; i < 5; i++ {
		order := model.PaymentOrder{ID: fmt.Sprintf("existing-%d", i), UserID: actor.ID, IdempotencyKey: fmt.Sprintf("existing-%d", i), MerchantOrderNo: fmt.Sprintf("merchant-%d", i), Status: model.PaymentOrderPending, ExpiresAt: time.Now().Add(time.Hour)}
		if err := db.Create(&order).Error; err != nil {
			t.Fatal(err)
		}
	}
	for _, method := range []string{"alipay", "wxpay"} {
		request := CreatePaymentOrderRequest{ProductID: product.ID, ProviderID: PaymentProviderEpay, PaymentMethod: method, IdempotencyKey: "new-" + method}
		got, err := svc.CreatePaymentOrder(context.Background(), actor, request)
		if err != nil {
			t.Fatalf("create %s with at least five unpaid orders: %v", method, err)
		}
		if got.ID == "" || got.AmountFen != product.AmountFen || got.Status != model.PaymentOrderPending || got.Checkout.Mode != "qr_code" || got.Checkout.Value != "https://checkout.example.test/"+got.MerchantOrderNo || got.Checkout.URL != "" {
			t.Fatalf("unexpected checkout: %#v", got)
		}
		retry, err := svc.CreatePaymentOrder(context.Background(), actor, request)
		if err != nil || retry.ID != got.ID {
			t.Fatalf("idempotent retry: %#v, %v", retry, err)
		}
	}
	count, err := svc.repo.ActivePaymentOrderCount(actor.ID)
	if err != nil || count != 7 || provider.creates != 2 {
		t.Fatalf("persisted active orders=%d, provider calls=%d, error=%v", count, provider.creates, err)
	}
}
