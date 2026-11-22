package app

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"testing"

	"infinite-canvas/backend/internal/model"
	"infinite-canvas/backend/internal/payment"
)

func TestPaymentOrderViewAdvertisesCloseCapability(t *testing.T) {
	for _, provider := range []string{PaymentProviderCloudCatEPay, "alipay-page-pay"} {
		t.Run(provider, func(t *testing.T) {
			data, err := json.Marshal(paymentOrderView(model.PaymentOrder{ProviderID: provider, ProviderConfigID: "config", Status: model.PaymentOrderPending}))
			if err != nil {
				t.Fatal(err)
			}
			var fields map[string]any
			if err := json.Unmarshal(data, &fields); err != nil {
				t.Fatal(err)
			}
			if got, ok := fields["canClose"].(bool); !ok || got != (provider != PaymentProviderCloudCatEPay) {
				t.Fatalf("canClose missing or incorrect for %s: %s", provider, data)
			}
		})
	}
}

func TestCloudCatCheckoutErrorClassification(t *testing.T) {
	for _, tc := range []struct {
		name   string
		err    error
		status int
	}{
		{"rejected", &payment.ProviderError{Code: "cloudcat_create_rejected", Message: "upstream-secret-must-not-leak"}, http.StatusUnprocessableEntity},
		{"wrapped rejection", fmt.Errorf("context: %w", &payment.ProviderError{Code: "cloudcat_create_rejected", Message: "upstream-secret-must-not-leak"}), http.StatusUnprocessableEntity},
		{"network", &payment.ProviderError{Code: "cloudcat_transport_error", Message: "upstream-secret-must-not-leak", Temporary: true}, http.StatusBadGateway},
		{"other provider rejection", &payment.ProviderError{Code: "other_create_rejected", Message: "upstream-secret-must-not-leak"}, http.StatusBadGateway},
		{"untyped", errors.New("upstream-secret-must-not-leak"), http.StatusBadGateway},
	} {
		t.Run(tc.name, func(t *testing.T) {
			err := paymentCheckoutError(tc.err, "支付请求暂时失败")
			assertCloudCatSafeStatus(t, err, tc.status)
			if tc.status == http.StatusUnprocessableEntity && errors.Unwrap(err) != nil {
				t.Fatal("business rejection retained raw upstream message")
			}
			if tc.status == http.StatusBadGateway && err.Error() != "支付请求暂时失败" {
				t.Fatalf("network fallback changed: %v", err)
			}
		})
	}
}

func TestCloudCatCloseRejectsBeforeRuntimeAccess(t *testing.T) {
	defer func() {
		if value := recover(); value != nil {
			t.Fatalf("close accessed unconfigured runtime instead of refusing unsupported operation: %v", value)
		}
	}()
	order := &model.PaymentOrder{ProviderID: PaymentProviderCloudCatEPay, Status: model.PaymentOrderPending}
	err := (&Service{}).closePaymentOrder(context.Background(), order)
	if err == nil || err.Error() != "支付订单缺少可验证的配置快照，仅支持查看状态" {
		t.Fatalf("order without a configuration snapshot must reject before runtime access: %v", err)
	}
	if order.Status != model.PaymentOrderPending || order.ClosedAt != nil {
		t.Fatal("unsupported close mutated order")
	}
}
