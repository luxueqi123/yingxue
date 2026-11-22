package app

import (
	"infinite-canvas/backend/internal/model"
	"testing"
	"time"
)

func TestRetiredCheckoutUsesAuthenticatedEndpointWithoutExposingLegacyURL(t *testing.T) {
	order := model.PaymentOrder{ID: "order", ProviderID: PaymentProviderCloudCatEPay, Status: model.PaymentOrderPending, CheckoutMode: "redirect", CheckoutValue: "https://m.ooeao.com/api/pay/example", ExpiresAt: time.Now().Add(time.Minute)}
	view := paymentOrderView(order)
	if view.Checkout.Mode != "redirect" || view.Checkout.Value != "" || view.Checkout.URL != "/api/payments/topup-orders/order/checkout" {
		t.Fatalf("legacy checkout must stay behind the authenticated endpoint, got %#v", view.Checkout)
	}
	order.ExpiresAt = time.Now().Add(-time.Minute)
	view = paymentOrderView(order)
	if view.Checkout.Value != "" || view.Checkout.URL != "" {
		t.Fatal("expired checkout leaked")
	}
	order.ExpiresAt = time.Now().Add(time.Minute)
	order.ProviderID = "alipay-page-pay"
	view = paymentOrderView(order)
	if view.Checkout.Mode != "redirect" || view.Checkout.URL != "/api/payments/topup-orders/order/checkout" || view.Checkout.Value != "" {
		t.Fatalf("other provider changed: %#v", view.Checkout)
	}
}
