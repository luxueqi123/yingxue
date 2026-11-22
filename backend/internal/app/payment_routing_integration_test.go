package app

import (
	"context"
	"errors"
	"testing"

	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
	"infinite-canvas/backend/internal/model"
	"infinite-canvas/backend/internal/payment"
	"infinite-canvas/backend/internal/repository"
)

func TestPaymentRoutingIdempotencyRejectsDifferentMethod(t *testing.T) {
	db, err := gorm.Open(sqlite.Open("file:"+newID()+"?mode=memory&cache=shared"), &gorm.Config{})
	if err != nil {
		t.Fatal(err)
	}
	if err := db.AutoMigrate(&model.PaymentOrder{}, &model.SystemSetting{}); err != nil {
		t.Fatal(err)
	}
	order := model.PaymentOrder{ID: "order", UserID: "user", IdempotencyKey: "key", MerchantOrderNo: "merchant", ProductID: "product", ProviderID: PaymentProviderCloudCatEPay, PaymentMethod: "wxpay", PaymentChannelID: "12"}
	if err := db.Create(&order).Error; err != nil {
		t.Fatal(err)
	}
	svc := &Service{repo: repository.New(db)}
	actor := &model.User{ID: "user"}
	request := CreatePaymentOrderRequest{ProductID: "product", ProviderID: PaymentProviderCloudCatEPay, IdempotencyKey: "key", PaymentMethod: "alipay"}
	if _, err := svc.CreatePaymentOrder(context.Background(), actor, request); err == nil {
		t.Fatal("different method reused idempotency key")
	}
	request.PaymentMethod = "wxpay"
	got, err := svc.CreatePaymentOrder(context.Background(), actor, request)
	if err != nil || got.ID != "order" || got.PaymentMethod != "wxpay" {
		t.Fatalf("same method retry: %#v %v", got, err)
	}
}

func TestPaymentRoutingRejectsPaidEvidenceForDifferentMethod(t *testing.T) {
	db, err := gorm.Open(sqlite.Open("file:"+newID()+"?mode=memory&cache=shared"), &gorm.Config{})
	if err != nil {
		t.Fatal(err)
	}
	if err := db.AutoMigrate(&model.PaymentOrder{}, &model.PaymentProviderConfig{}); err != nil {
		t.Fatal(err)
	}
	order := model.PaymentOrder{ID: "order", UserID: "user", IdempotencyKey: "key", MerchantOrderNo: "merchant", ProviderID: PaymentProviderCloudCatEPay, PaymentMethod: "wxpay", ProviderConfigID: "config", ProviderConfigVersion: 1, AmountFen: 1000, Currency: "CNY", Status: model.PaymentOrderPending}
	if err := db.Create(&order).Error; err != nil {
		t.Fatal(err)
	}
	svc := &Service{repo: repository.New(db)}
	if err := db.Create(&model.PaymentProviderConfig{ID: "config", ProviderID: PaymentProviderCloudCatEPay, Version: 1}).Error; err != nil {
		t.Fatal(err)
	}
	for _, method := range []string{"alipay", ""} {
		_, err := svc.applyPaymentResult(PaymentProviderCloudCatEPay, payment.Result{MerchantOrderNo: "merchant", PaymentMethod: method, AmountFen: 1000, Currency: "CNY", Paid: true})
		if !errors.Is(err, repository.ErrPaymentEvidenceMismatch) {
			t.Fatalf("method %q error = %v", method, err)
		}
	}
	var persisted model.PaymentOrder
	if err := db.First(&persisted, "id = ?", "order").Error; err != nil {
		t.Fatal(err)
	}
	if persisted.Status != model.PaymentOrderPending {
		t.Fatalf("order state changed: %s", persisted.Status)
	}
}
