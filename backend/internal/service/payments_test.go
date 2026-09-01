package service

import (
	"net/url"
	"testing"

	"infinite-canvas/backend/internal/model"
)

func TestPaymentSignMatchesEPayProtocol(t *testing.T) {
	values := url.Values{
		"pid":          {"1001"},
		"type":         {"alipay"},
		"out_trade_no": {"abc"},
		"name":         {"映雪 105 积分"},
		"money":        {"10.00"},
		"empty":        {""},
		"sign":         {"ignored"},
		"sign_type":    {"MD5"},
	}
	if got, want := paymentSign(values, "secret"), "a303429410383a8786a905766d0a47c7"; got != want {
		t.Fatalf("paymentSign() = %s, want %s", got, want)
	}
}

func TestNormalizePaymentSettingKeepsOnlySupportedUniqueTypes(t *testing.T) {
	setting := normalizePaymentSetting(paymentSettingValue{PayTypes: []string{" WXPAY ", "wxpay", "unknown", "alipay"}})
	if setting.BaseURL != defaultEPayBaseURL {
		t.Fatalf("BaseURL = %q", setting.BaseURL)
	}
	if len(setting.PayTypes) != 2 || setting.PayTypes[0] != "wxpay" || setting.PayTypes[1] != "alipay" {
		t.Fatalf("PayTypes = %#v", setting.PayTypes)
	}
}

func TestFormatPaymentMoneyUsesIntegerCents(t *testing.T) {
	for cents, want := range map[int64]string{1: "0.01", 1000: "10.00", 100050: "1000.50"} {
		if got := formatPaymentMoney(cents); got != want {
			t.Fatalf("formatPaymentMoney(%d) = %q, want %q", cents, got, want)
		}
	}
}

func TestParsePaymentMoneyUsesExactCents(t *testing.T) {
	for raw, want := range map[string]int64{"10": 1000, "10.0": 1000, "10.00": 1000, "0.01": 1, "1000.50": 100050} {
		got, err := parsePaymentMoney(raw)
		if err != nil || got != want {
			t.Fatalf("parsePaymentMoney(%q) = %d, %v; want %d", raw, got, err, want)
		}
	}
	for _, raw := range []string{"", "-1.00", "1.001", ".50", "abc"} {
		if _, err := parsePaymentMoney(raw); err == nil {
			t.Fatalf("parsePaymentMoney(%q) should fail", raw)
		}
	}
}

func TestValidatePaymentCheckoutRejectsUnknownScheme(t *testing.T) {
	if err := validatePaymentCheckout("", "javascript:alert(1)", ""); err == nil {
		t.Fatal("expected unknown checkout scheme to be rejected")
	}
	if err := validatePaymentCheckout("", "weixin://wxpay/bizpayurl?pr=test", ""); err != nil {
		t.Fatalf("expected documented weixin scheme to pass: %v", err)
	}
}

func TestValidateEPayNotification(t *testing.T) {
	order := &model.PaymentOrder{ID: "order-1", MerchantID: "1001", AmountCents: 1000, PayType: "alipay"}
	base := url.Values{
		"pid": {"1001"}, "type": {"alipay"}, "out_trade_no": {order.ID},
		"trade_no": {"provider-1"}, "trade_status": {"TRADE_SUCCESS"}, "money": {"10.0"},
	}
	signed := cloneURLValues(base)
	signed.Set("sign_type", "MD5")
	signed.Set("sign", paymentSign(signed, "secret"))
	if got, err := validateEPayNotification(signed, order, "secret"); err != nil || got != "provider-1" {
		t.Fatalf("validateEPayNotification() = %q, %v", got, err)
	}

	for name, mutate := range map[string]func(url.Values){
		"signature": func(values url.Values) { values.Set("sign", "invalid") },
		"merchant":  func(values url.Values) { values.Set("pid", "other") },
		"status":    func(values url.Values) { values.Set("trade_status", "WAIT_BUYER_PAY") },
		"money":     func(values url.Values) { values.Set("money", "9.99") },
		"type":      func(values url.Values) { values.Set("type", "wxpay") },
		"trade_no":  func(values url.Values) { values.Set("trade_no", "") },
	} {
		t.Run(name, func(t *testing.T) {
			values := cloneURLValues(base)
			mutate(values)
			if name != "signature" {
				values.Set("sign", paymentSign(values, "secret"))
			}
			if _, err := validateEPayNotification(values, order, "secret"); err == nil {
				t.Fatal("expected invalid notification to be rejected")
			}
		})
	}
}

func cloneURLValues(values url.Values) url.Values {
	clone := make(url.Values, len(values))
	for key, items := range values {
		clone[key] = append([]string(nil), items...)
	}
	return clone
}
