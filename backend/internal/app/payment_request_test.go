package app

import (
	"testing"
	"time"

	"infinite-canvas/backend/internal/model"
	"infinite-canvas/backend/internal/payment"
)

func TestPaymentCreateRequestPreservesOrderSnapshotCallbacksAndClientIP(t *testing.T) {
	expiresAt := time.Date(2026, 9, 4, 12, 0, 0, 0, time.UTC)
	order := &model.PaymentOrder{
		ID:               "order-id",
		MerchantOrderNo:  "merchant-order",
		ProductName:      "映雪 100 积分",
		ProviderID:       "cloudcat-epay",
		PaymentMethod:    "wxpay",
		PaymentChannelID: "12",
		AmountFen:        100,
		ChargeAmountFen:  100,
		ChargeCurrency:   "CNY",
		Currency:         "CNY",
		ExpiresAt:        expiresAt,
	}

	request := paymentCreateRequest(order, order.ProductName, payment.Config{"publicBaseUrl": "https://tianyayingxue.cn"}, "config-id", "203.0.113.10")
	if request.PaymentMethod != "wxpay" || request.ChannelID != "12" {
		t.Fatalf("routing snapshot lost: %#v", request)
	}
	if request.MerchantOrderNo != order.MerchantOrderNo || request.Description != order.ProductName || request.AmountFen != order.AmountFen || request.Currency != order.Currency || !request.ExpiresAt.Equal(expiresAt) {
		t.Fatalf("order snapshot was not preserved: %#v", request)
	}
	if request.ClientIP != "203.0.113.10" {
		t.Fatalf("client IP = %q", request.ClientIP)
	}
	if request.NotifyURL != "https://tianyayingxue.cn/api/payments/notify/cloudcat-epay/config-id" {
		t.Fatalf("notify URL = %q", request.NotifyURL)
	}
	if request.ReturnURL != "https://tianyayingxue.cn/api/payments/return/cloudcat-epay?orderId=order-id" {
		t.Fatalf("return URL = %q", request.ReturnURL)
	}
}
