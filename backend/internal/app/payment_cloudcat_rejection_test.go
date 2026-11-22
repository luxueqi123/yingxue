package app

import (
	"context"
	"errors"
	"net/http"
	"strings"
	"testing"

	"infinite-canvas/backend/internal/model"
	"infinite-canvas/backend/internal/payment"
)

type rejectedCloudCatTestProvider struct {
	payment.Provider
	createErr        error
	creates, queries int
}

func (p *rejectedCloudCatTestProvider) Descriptor() payment.Descriptor {
	return payment.Descriptor{ID: PaymentProviderCloudCatEPay, PluginID: PaymentPluginCloudCatEPay, CheckoutMode: "qr_code"}
}

func (p *rejectedCloudCatTestProvider) CreateOrder(context.Context, payment.Config, payment.CreateRequest) (payment.Checkout, error) {
	p.creates++
	return payment.Checkout{}, p.createErr
}

func (p *rejectedCloudCatTestProvider) QueryOrder(context.Context, payment.Config, payment.QueryRequest) (payment.Result, error) {
	p.queries++
	return payment.Result{}, payment.ErrOrderNotFound
}

func TestRetiredCloudCatCannotCreateAnOrder(t *testing.T) {
	svc, db := newYingxuePaymentTestService(t)
	if err := db.AutoMigrate(&model.TopupProduct{}, &model.SystemSetting{}, &model.PluginPlatformState{}); err != nil {
		t.Fatal(err)
	}
	actor := &model.User{ID: "owner"}
	product := model.TopupProduct{ID: "retired-product", Name: "Test credits", AmountFen: 1000, CreditsMicrocredits: CreditScale, Enabled: true}
	if err := db.Create(&product).Error; err != nil {
		t.Fatal(err)
	}
	_, err := svc.CreatePaymentOrder(context.Background(), actor, CreatePaymentOrderRequest{ProductID: product.ID, ProviderID: PaymentProviderCloudCatEPay, PaymentMethod: "alipay", IdempotencyKey: "retired"})
	if err == nil || !strings.Contains(err.Error(), "支付渠道") {
		t.Fatalf("retired provider was not rejected at the provider gate: %v", err)
	}
	var count int64
	if err := db.Model(&model.PaymentOrder{}).Count(&count).Error; err != nil || count != 0 {
		t.Fatalf("retired provider changed orders: %d %v", count, err)
	}
}

func assertCloudCatSafeStatus(t *testing.T, err error, status int) {
	t.Helper()
	var appErr *AppError
	if !errors.As(err, &appErr) || appErr.Status != status {
		t.Fatalf("want HTTP %d, got %v", status, err)
	}
	if status == http.StatusUnprocessableEntity && appErr.Message != "收款通道暂时无法受理该金额，请联系管理员检查通道余额或额度" {
		t.Fatalf("unsafe rejection: %s", appErr.Message)
	}
	if appErr.Message == "upstream-secret-must-not-leak" {
		t.Fatal("upstream secret leaked")
	}
}
