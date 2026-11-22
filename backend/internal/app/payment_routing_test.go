package app

import (
	"encoding/json"
	"infinite-canvas/backend/internal/model"
	"infinite-canvas/backend/internal/payment"
	"strings"
	"testing"
)

func TestPaymentRoutingViewPreservesLegacyAndHidesChannel(t *testing.T) {
	for _, method := range []string{"", "wxpay", "alipay"} {
		order := model.PaymentOrder{ID: "order", PaymentMethod: method, PaymentChannelID: "12"}
		view := paymentOrderView(order)
		if view.PaymentMethod != method {
			t.Fatalf("method = %q", view.PaymentMethod)
		}
		for _, item := range []any{order, view} {
			encoded, err := json.Marshal(item)
			if err != nil {
				t.Fatal(err)
			}
			if strings.Contains(string(encoded), "paymentChannel") {
				t.Fatalf("channel leaked: %s", encoded)
			}
		}
	}
}

func TestPaymentNotificationMethodNormalizesLegacyConfiguration(t *testing.T) {
	for _, tc := range []struct{ snapshot, configured, want string }{
		{"", " WXPAY ", "wxpay"},
		{"", " Alipay\t", "alipay"},
		{"", "QQPAY", "qqpay"},
		{"wxpay", " ALIPAY ", "wxpay"},
	} {
		got := paymentNotificationMethod(&model.PaymentOrder{PaymentMethod: tc.snapshot}, payment.Config{"paymentType": tc.configured})
		if got != tc.want {
			t.Errorf("snapshot %q config %q: got %q want %q", tc.snapshot, tc.configured, got, tc.want)
		}
	}
}

func TestPaymentRoutingAmountBoundaries(t *testing.T) {
	values := payment.Config{"alipayChannelId": "11", "wechatRewardChannelId": "12", "wechatPersonalChannelId": "13"}
	for _, tc := range []struct {
		method string
		amount int64
		want   string
	}{
		{"wxpay", 99, ""}, {"wxpay", 100, "12"}, {"wxpay", 20000, "12"}, {"wxpay", 20001, ""}, {"wxpay", 49999, ""}, {"wxpay", 50000, "13"}, {"wxpay", 100000, "13"}, {"wxpay", 100001, ""},
		{"alipay", 1, "11"}, {"alipay", 20001, "11"}, {"alipay", 100001, "11"}, {"alipay", 0, ""}, {"", 1000, ""}, {"qqpay", 1000, ""},
	} {
		got, err := paymentRoutingChannel(values, tc.method, tc.amount)
		if got != tc.want || (err != nil) != (tc.want == "") {
			t.Errorf("%s %d: got %q, %v; want %q", tc.method, tc.amount, got, err, tc.want)
		}
	}
	for _, value := range []string{"", "0", "012", "-1", "+1", "1.5", "1e2", " 12", "18446744073709551616"} {
		values["alipayChannelId"] = value
		if err := validatePaymentRoutingConfig(values); err == nil {
			t.Errorf("accepted invalid channel %q", value)
		}
	}
}

func TestPaymentRoutingConfigurationFields(t *testing.T) {
	fields := cloudCatEPayConfiguration().Fields
	for _, name := range []string{"alipayChannelId", "wechatRewardChannelId", "wechatPersonalChannelId"} {
		found := false
		for _, field := range fields {
			if field.Name == name {
				found = !field.Secret && field.Required
			}
		}
		if !found {
			t.Errorf("missing required non-secret routing field %s", name)
		}
	}
}
