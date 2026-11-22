package paymentplugins

import (
	"context"
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestEpayRequestedMethodAndWechatQR(t *testing.T) {
	for _, tc := range []struct {
		name, configured, requested, expected, field, payload, mode string
		wantError                                                   bool
	}{
		{"alipay selection", "wxpay", "alipay", "alipay", "qrcode", "https://qr.alipay.com/test", "qr_code", false},
		{"wechat selection", "alipay", "wxpay", "wxpay", "qrcode", "wxp://test-wechat-code", "qr_code", false},
		{"configured default", "wxpay", "", "wxpay", "qrcode", "wxp://test-wechat-code", "qr_code", false},
		{"wechat payload cannot navigate", "wxpay", "wxpay", "wxpay", "payurl", "wxp://test-wechat-code", "qr_code", true},
		{"wechat payload cannot use alipay", "alipay", "alipay", "alipay", "qrcode", "wxp://test-wechat-code", "qr_code", true},
		{"credentials rejected", "wxpay", "wxpay", "wxpay", "qrcode", "wxp://user:pass@code", "qr_code", true},
		{"arbitrary scheme rejected", "wxpay", "wxpay", "wxpay", "qrcode", "file://host/path", "qr_code", true},
	} {
		t.Run(tc.name, func(t *testing.T) {
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				values := mustEpayForm(t, r)
				if values["type"] != tc.expected || values["sign"] != epayMD5Sign(values, "test-key") {
					t.Fatalf("incorrect payment type or signature: type=%q", values["type"])
				}
				fmt.Fprintf(w, `{"code":1,%q:%q}`, tc.field, tc.payload)
			}))
			defer server.Close()
			config := Config{"pid": "1001", "key": "test-key", "gateway": server.URL, "payType": tc.configured, "payTypes": tc.configured + "," + tc.requested, "checkoutMode": tc.mode}
			checkout, err := NewEpayProvider(server.Client()).CreateOrder(context.Background(), config, CreateRequest{PaymentMethod: tc.requested, MerchantOrderNo: "test-order", AmountFen: 1000, Currency: "CNY", NotifyURL: "https://merchant.example/notify"})
			if (err != nil) != tc.wantError {
				t.Fatalf("checkout=%#v error=%v", checkout, err)
			}
			if !tc.wantError && (checkout.Mode != "qr_code" || checkout.Value != tc.payload) {
				t.Fatalf("checkout=%#v", checkout)
			}
			if config["payType"] != tc.configured {
				t.Fatal("request mutated merchant configuration")
			}
		})
	}
}

func TestEpayRejectsUnknownRequestedMethodBeforeNetwork(t *testing.T) {
	provider := NewEpayProvider(nil)
	_, err := provider.CreateOrder(context.Background(), Config{"pid": "1001", "key": "test-key", "gateway": "https://unused.invalid"}, CreateRequest{PaymentMethod: "unknown", MerchantOrderNo: "test", AmountFen: 1000, Currency: "CNY", NotifyURL: "https://merchant.example/notify"})
	if err == nil || err.Error() != "易支付未启用所选支付方式" {
		t.Fatalf("error=%v", err)
	}
}

func TestEpayRejectsConflictingRequestMethodsBeforeNetwork(t *testing.T) {
	_, err := NewEpayProvider(nil).CreateOrder(context.Background(), Config{"pid": "1001", "key": "test-key", "gateway": "https://unused.invalid"}, CreateRequest{Method: "alipay", PaymentMethod: "wxpay", MerchantOrderNo: "test", AmountFen: 1000, Currency: "CNY", NotifyURL: "https://merchant.example/notify"})
	if err == nil || err.Error() != "易支付请求中的支付方式不一致" {
		t.Fatalf("error=%v", err)
	}
}
