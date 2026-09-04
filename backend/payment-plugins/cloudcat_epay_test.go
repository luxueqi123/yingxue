package paymentplugins

import (
	"context"
	"io"
	"net/http"
	"net/url"
	"strings"
	"testing"
	"time"
)

type cloudCatRoundTripFunc func(*http.Request) (*http.Response, error)

func (fn cloudCatRoundTripFunc) RoundTrip(request *http.Request) (*http.Response, error) {
	return fn(request)
}

func TestCloudCatEPayCreateOrderUsesPinnedGatewayAndSignedServerRequest(t *testing.T) {
	fixedExpiry := time.Now().Add(30 * time.Minute).Round(time.Second)
	client := &http.Client{Transport: cloudCatRoundTripFunc(func(request *http.Request) (*http.Response, error) {
		if request.Method != http.MethodPost || request.URL.String() != defaultCloudCatEPayGateway {
			t.Fatalf("request = %s %s", request.Method, request.URL.String())
		}
		body, err := io.ReadAll(request.Body)
		if err != nil {
			t.Fatal(err)
		}
		values, err := url.ParseQuery(string(body))
		if err != nil {
			t.Fatal(err)
		}
		if values.Get("pid") != "1001" || values.Get("type") != "wxpay" || values.Get("out_trade_no") != "merchant-order-1" || values.Get("money") != "1.00" {
			t.Fatalf("form = %v", values)
		}
		if values.Get("clientip") != "203.0.113.10" || values.Get("device") != "pc" || values.Get("param") != "merchant-order-1" {
			t.Fatalf("client fields = %v", values)
		}
		if values.Get("sign_type") != "MD5" || values.Get("sign") != cloudCatEPaySign(values, "merchant-secret") {
			t.Fatalf("signature = %q", values.Get("sign"))
		}
		if strings.Contains(string(body), "merchant-secret") {
			t.Fatal("merchant key leaked into request body")
		}
		return &http.Response{
			StatusCode: http.StatusOK,
			Header:     make(http.Header),
			Body:       io.NopCloser(strings.NewReader(`{"code":1,"msg":"ok","trade_no":"cloudcat-trade-1","payurl":"https://m.ooeao.com/xpay/cashier/cloudcat-trade-1"}`)),
			Request:    request,
		}, nil
	})}
	provider := NewCloudCatEPayProvider(client)
	checkout, err := provider.CreateOrder(context.Background(), testCloudCatConfig(), CreateRequest{
		MerchantOrderNo: "merchant-order-1",
		Description:     "映雪 100 积分",
		AmountFen:       100,
		Currency:        "CNY",
		ExpiresAt:       fixedExpiry,
		NotifyURL:       "https://tianyayingxue.cn/api/payments/notify/cloudcat-epay/config-1",
		ReturnURL:       "https://tianyayingxue.cn/api/payments/return/cloudcat-epay?orderId=order-1",
		ClientIP:        "203.0.113.10",
	})
	if err != nil {
		t.Fatal(err)
	}
	if checkout.Mode != "redirect" || checkout.Value != "https://m.ooeao.com/xpay/cashier/cloudcat-trade-1" || !checkout.ExpiresAt.Equal(fixedExpiry) {
		t.Fatalf("checkout = %#v", checkout)
	}
}

func TestCloudCatEPayNotificationRequiresValidMerchantSignatureAndSuccessState(t *testing.T) {
	provider := NewCloudCatEPayProvider(http.DefaultClient)
	config := testCloudCatConfig()
	values := url.Values{
		"pid": {"1001"}, "type": {"wxpay"}, "out_trade_no": {"merchant-order-1"},
		"trade_no": {"cloudcat-trade-1"}, "trade_status": {"TRADE_SUCCESS"}, "money": {"1.00"},
		"name": {"映雪 100 积分"}, "param": {"merchant-order-1"}, "sign_type": {"MD5"},
	}
	values.Set("sign", cloudCatEPaySign(values, config["merchantKey"]))
	notification, err := provider.VerifyNotification(context.Background(), config, nil, []byte(values.Encode()))
	if err != nil {
		t.Fatal(err)
	}
	if notification.EventID != "cloudcat:cloudcat-trade-1:TRADE_SUCCESS" || notification.MerchantOrderNo != "merchant-order-1" || notification.ProviderTradeNo != "cloudcat-trade-1" || notification.AmountFen != 100 || notification.Currency != "CNY" || !notification.Paid {
		t.Fatalf("notification = %#v", notification)
	}

	for name, mutate := range map[string]func(url.Values){
		"signature": func(candidate url.Values) { candidate.Set("sign", "invalid") },
		"merchant":  func(candidate url.Values) { candidate.Set("pid", "1002") },
		"pay type":  func(candidate url.Values) { candidate.Set("type", "alipay") },
		"status":    func(candidate url.Values) { candidate.Set("trade_status", "WAIT_BUYER_PAY") },
		"order":     func(candidate url.Values) { candidate.Set("out_trade_no", "") },
		"trade":     func(candidate url.Values) { candidate.Set("trade_no", "") },
		"amount":    func(candidate url.Values) { candidate.Set("money", "1.001") },
	} {
		t.Run(name, func(t *testing.T) {
			candidate := cloneURLValues(values)
			mutate(candidate)
			if name != "signature" {
				candidate.Set("sign", cloudCatEPaySign(candidate, config["merchantKey"]))
			}
			if _, err := provider.VerifyNotification(context.Background(), config, nil, []byte(candidate.Encode())); err == nil {
				t.Fatal("expected notification rejection")
			}
		})
	}
}

func TestCloudCatEPayRejectsUntrustedGatewayAndOversizedResponse(t *testing.T) {
	config := testCloudCatConfig()
	for _, gateway := range []string{
		"http://m.ooeao.com/xpay/epay/mapi.php",
		"https://127.0.0.1/xpay/epay/mapi.php",
		"https://m.ooeao.com@evil.example/xpay/epay/mapi.php",
		"https://m.ooeao.com/xpay/epay/../admin",
	} {
		candidate := cloneConfig(config)
		candidate["gateway"] = gateway
		if err := NewCloudCatEPayProvider(http.DefaultClient).ValidateConfig(candidate); err == nil {
			t.Fatalf("gateway %q should be rejected", gateway)
		}
	}

	client := &http.Client{Transport: cloudCatRoundTripFunc(func(request *http.Request) (*http.Response, error) {
		return &http.Response{StatusCode: http.StatusOK, Header: make(http.Header), Body: io.NopCloser(strings.NewReader(strings.Repeat("x", maxCloudCatEPayResponseBytes+1))), Request: request}, nil
	})}
	_, err := NewCloudCatEPayProvider(client).CreateOrder(context.Background(), config, CreateRequest{
		MerchantOrderNo: "merchant-order-1", Description: "积分", AmountFen: 100, Currency: "CNY",
		ExpiresAt: time.Now().Add(30 * time.Minute), NotifyURL: "https://tianyayingxue.cn/api/payments/notify/cloudcat-epay/config-1",
		ReturnURL: "https://tianyayingxue.cn/api/payments/return/cloudcat-epay?orderId=order-1", ClientIP: "203.0.113.10",
	})
	if err == nil {
		t.Fatal("expected oversized upstream response rejection")
	}
}

func TestCloudCatEPayRejectsOffOriginRedirectCheckout(t *testing.T) {
	_, err := cloudCatCheckout(cloudCatCreatePayload{
		TradeNo: "cloudcat-trade-1",
		PayURL:  "https://checkout.example.com/pay/cloudcat-trade-1",
	}, time.Now().Add(30*time.Minute))
	if err == nil {
		t.Fatal("off-origin redirect checkout should be rejected")
	}
}

func TestCloudCatEPayUnsupportedOperationsFailExplicitly(t *testing.T) {
	provider := NewCloudCatEPayProvider(http.DefaultClient)
	config := testCloudCatConfig()
	if _, err := provider.QueryOrder(context.Background(), config, QueryRequest{MerchantOrderNo: "merchant-order-1"}); err == nil {
		t.Fatal("query should be explicitly unsupported until CloudCat contract is verified")
	}
	if _, err := provider.CloseOrder(context.Background(), config, CloseRequest{MerchantOrderNo: "merchant-order-1"}); err == nil {
		t.Fatal("close should be explicitly unsupported")
	}
	if _, err := provider.DownloadTradeBill(context.Background(), config, time.Now()); err == nil {
		t.Fatal("bill download should be explicitly unsupported")
	}
}

func testCloudCatConfig() Config {
	return Config{
		"publicBaseUrl": "https://tianyayingxue.cn",
		"gateway":       defaultCloudCatEPayGateway,
		"merchantId":    "1001",
		"merchantKey":   "merchant-secret",
		"paymentType":   "wxpay",
	}
}

func cloneConfig(input Config) Config {
	result := make(Config, len(input))
	for key, value := range input {
		result[key] = value
	}
	return result
}
