package paymentplugins

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
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
	if checkout.Mode != "qr_code" || checkout.Value != "https://m.ooeao.com/xpay/cashier/cloudcat-trade-1" || !checkout.ExpiresAt.Equal(fixedExpiry) {
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
		"pay type":  func(candidate url.Values) { candidate.Set("type", "unsupported") },
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

func TestCloudCatEPayOfficialCheckoutLinksRemainUnmodifiedQRValues(t *testing.T) {
	expiry := time.Now().Add(30 * time.Minute)
	value := "https://m.ooeao.com/api/pay/order-1?token=example%2Btoken"
	for _, payload := range []cloudCatCreatePayload{{PayURL: value}, {Redirect: value}, {ImageURL: value}} {
		checkout, err := cloudCatCheckout(payload, expiry)
		if err != nil || checkout.Mode != "qr_code" || checkout.Value != value || !checkout.ExpiresAt.Equal(expiry) {
			t.Fatalf("checkout = %#v, error = %v", checkout, err)
		}
	}
	if NewCloudCatEPayProvider(nil).Descriptor().CheckoutMode != "qr_code" {
		t.Fatal("provider must advertise QR checkout")
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
	if _, err := provider.CloseOrder(context.Background(), config, CloseRequest{MerchantOrderNo: "merchant-order-1"}); err == nil {
		t.Fatal("close should be explicitly unsupported")
	}
	if _, err := provider.DownloadTradeBill(context.Background(), config, time.Now()); err == nil {
		t.Fatal("bill download should be explicitly unsupported")
	}
}

func TestCloudCatEPayQueryUsesSecretBodyAndStrictPaymentStatus(t *testing.T) {
	for _, status := range []int{0, 1} {
		t.Run(fmt.Sprint(status), func(t *testing.T) {
			called := false
			client := &http.Client{Transport: cloudCatRoundTripFunc(func(req *http.Request) (*http.Response, error) {
				called = true
				if req.Method != http.MethodPost || req.URL.String() != "https://m.ooeao.com/xpay/epay/api.php" || req.Header.Get("Content-Type") != "application/x-www-form-urlencoded" {
					t.Fatal("query must use fixed official POST endpoint and form body")
				}
				if err := req.ParseForm(); err != nil {
					t.Fatal(err)
				}
				if req.PostForm.Get("act") != "order" || req.PostForm.Get("pid") != "1001" || req.PostForm.Get("key") != "merchant-secret" || req.PostForm.Get("out_trade_no") != "order-1" || len(req.PostForm) != 4 {
					t.Fatal("query form mismatch")
				}
				body := fmt.Sprintf(`{"code":1,"pid":1001,"out_trade_no":"order-1","trade_no":"trade-1","type":"alipay","money":"10.01","status":%d}`, status)
				return &http.Response{StatusCode: 200, Header: make(http.Header), Body: io.NopCloser(strings.NewReader(body))}, nil
			})}
			result, err := NewCloudCatEPayProvider(client).QueryOrder(context.Background(), testCloudCatConfig(), QueryRequest{MerchantOrderNo: "order-1"})
			if err != nil {
				t.Fatal(err)
			}
			if !called || result.Paid != (status == 1) || result.Closed || result.AmountFen != 1001 || result.Currency != "CNY" || result.MerchantOrderNo != "order-1" || result.ProviderTradeNo != "trade-1" || result.PaymentMethod != "alipay" || result.ProviderStatus != fmt.Sprint(status) {
				t.Fatalf("unexpected query result: %+v", result)
			}
		})
	}
}

func TestCloudCatEPayQueryRecognizesOnlyVerifiedMissingOrder(t *testing.T) {
	for _, tc := range []struct {
		body    string
		missing bool
	}{
		{`{"code":0,"msg":"没有找到订单信息"}`, true},
		{`{"code":0,"msg":"商户密钥错误"}`, false},
		{`{"code":-1,"msg":"没有找到订单信息"}`, false},
		{`{"msg":"没有找到订单信息"}`, false},
		{`{"code":0,"msg":"没有找到订单信息，请重试"}`, false},
		{`{"code":0,"msg":" 没有找到订单信息"}`, false},
	} {
		t.Run(tc.body, func(t *testing.T) {
			client := &http.Client{Transport: cloudCatRoundTripFunc(func(*http.Request) (*http.Response, error) {
				return &http.Response{StatusCode: 200, Header: make(http.Header), Body: io.NopCloser(strings.NewReader(tc.body))}, nil
			})}
			result, err := NewCloudCatEPayProvider(client).QueryOrder(context.Background(), testCloudCatConfig(), QueryRequest{MerchantOrderNo: "order-1"})
			if err == nil || errors.Is(err, ErrOrderNotFound) != tc.missing || result.Paid {
				t.Fatalf("missing=%v error=%v result=%+v", tc.missing, err, result)
			}
		})
	}
}

func TestCloudCatEPayQueryRejectsUntrustedResponses(t *testing.T) {
	for _, tc := range []struct {
		field string
		value any
	}{
		{"code", 0}, {"code", nil}, {"status", 2}, {"status", -1}, {"status", nil}, {"status", "1"},
		{"pid", 1002}, {"pid", nil}, {"pid", 1001.5}, {"out_trade_no", "other"}, {"out_trade_no", nil},
		{"trade_no", ""}, {"trade_no", strings.Repeat("a", 129)}, {"trade_no", "trade\n1"},
		{"type", "qqpay"}, {"type", "ALIPAY"}, {"type", nil},
		{"money", "0"}, {"money", "-1"}, {"money", "1.001"}, {"money", "+1"}, {"money", "1."}, {"money", "1.-1"}, {"money", "92233720368547758.08"}, {"money", nil},
	} {
		t.Run(fmt.Sprintf("%s/%v", tc.field, tc.value), func(t *testing.T) {
			payload := map[string]any{"code": 1, "pid": 1001, "out_trade_no": "order-1", "trade_no": "trade-1", "type": "alipay", "money": "10.00", "status": 1}
			if tc.value == nil {
				delete(payload, tc.field)
			} else {
				payload[tc.field] = tc.value
			}
			body, err := json.Marshal(payload)
			if err != nil {
				t.Fatal(err)
			}
			client := &http.Client{Transport: cloudCatRoundTripFunc(func(*http.Request) (*http.Response, error) {
				return &http.Response{StatusCode: 200, Header: make(http.Header), Body: io.NopCloser(strings.NewReader(string(body)))}, nil
			})}
			result, err := NewCloudCatEPayProvider(client).QueryOrder(context.Background(), testCloudCatConfig(), QueryRequest{MerchantOrderNo: "order-1"})
			if err == nil || result.Paid {
				t.Fatalf("untrusted response accepted: %+v, %v", result, err)
			}
		})
	}
}

func TestCloudCatEPayQueryRejectsTransportFailuresWithoutLeakingSecrets(t *testing.T) {
	for _, tc := range []struct {
		name, body     string
		status         int
		transportError bool
	}{
		{"empty", "", 200, false}, {"invalid-json", "merchant-secret", 200, false},
		{"oversize", strings.Repeat(" ", maxCloudCatEPayResponseBytes) + `{"code":1,"pid":1001,"out_trade_no":"order-1","trade_no":"trade-1","type":"alipay","money":"10.00","status":1}`, 200, false},
		{"http-error", `{"code":1,"pid":1001,"out_trade_no":"order-1","trade_no":"trade-1","type":"alipay","money":"10.00","status":1}`, 502, false},
		{"network", "", 0, true},
	} {
		t.Run(tc.name, func(t *testing.T) {
			client := &http.Client{Transport: cloudCatRoundTripFunc(func(*http.Request) (*http.Response, error) {
				if tc.transportError {
					return nil, errors.New("merchant-secret")
				}
				return &http.Response{StatusCode: tc.status, Header: make(http.Header), Body: io.NopCloser(strings.NewReader(tc.body))}, nil
			})}
			result, err := NewCloudCatEPayProvider(client).QueryOrder(context.Background(), testCloudCatConfig(), QueryRequest{MerchantOrderNo: "order-1"})
			if err == nil || result.Paid || strings.Contains(err.Error(), "merchant-secret") {
				t.Fatalf("unsafe failure: %+v %v", result, err)
			}
		})
	}
}

func TestCloudCatEPayQueryNeverFollowsRedirects(t *testing.T) {
	for _, status := range []int{301, 302, 303, 307, 308} {
		t.Run(fmt.Sprint(status), func(t *testing.T) {
			calls := 0
			client := &http.Client{Transport: cloudCatRoundTripFunc(func(*http.Request) (*http.Response, error) {
				calls++
				return &http.Response{StatusCode: status, Header: http.Header{"Location": {"https://attacker.example/collect"}}, Body: io.NopCloser(strings.NewReader(""))}, nil
			})}
			_, err := NewCloudCatEPayProvider(client).QueryOrder(context.Background(), testCloudCatConfig(), QueryRequest{MerchantOrderNo: "order-1"})
			if err == nil || calls != 1 || client.CheckRedirect != nil {
				t.Fatalf("redirect not isolated: calls=%d error=%v", calls, err)
			}
		})
	}
}

func TestCloudCatEPayQueryRejectsInvalidOrderBeforeHTTP(t *testing.T) {
	for _, order := range []string{"", " order-1", "../order", strings.Repeat("a", 65)} {
		client := &http.Client{Transport: cloudCatRoundTripFunc(func(*http.Request) (*http.Response, error) {
			t.Fatal("invalid order reached HTTP")
			return nil, errors.New("unexpected")
		})}
		if _, err := NewCloudCatEPayProvider(client).QueryOrder(context.Background(), testCloudCatConfig(), QueryRequest{MerchantOrderNo: order}); err == nil {
			t.Fatal("invalid order accepted")
		}
	}
}

func TestCloudCatEPayExplicitRoutingSignsMethodAndChannel(t *testing.T) {
	for _, route := range []struct{ method, channel string }{{"alipay", "163"}, {"wxpay", "164"}, {"wxpay", "165"}} {
		t.Run(route.method+route.channel, func(t *testing.T) {
			client := &http.Client{Transport: cloudCatRoundTripFunc(func(req *http.Request) (*http.Response, error) {
				if err := req.ParseForm(); err != nil {
					t.Fatal(err)
				}
				if req.Form.Get("type") != route.method || req.Form.Get("channel_id") != route.channel {
					t.Fatalf("wrong route: %v", req.Form)
				}
				if req.Form.Get("sign") != cloudCatEPaySign(req.Form, "merchant-secret") {
					t.Fatal("invalid signed route")
				}
				originalSign := req.Form.Get("sign")
				req.Form.Set("channel_id", "999")
				if originalSign == cloudCatEPaySign(req.Form, "merchant-secret") {
					t.Fatal("channel excluded from signature")
				}
				return &http.Response{StatusCode: 200, Body: io.NopCloser(strings.NewReader(`{"code":1,"trade_no":"trade-1","payurl":"https://m.ooeao.com/pay"}`)), Header: make(http.Header)}, nil
			})}
			req := testCloudCatRoutingRequest()
			req.PaymentMethod, req.ChannelID = route.method, route.channel
			if _, err := NewCloudCatEPayProvider(client).CreateOrder(context.Background(), testCloudCatConfig(), req); err != nil {
				t.Fatal(err)
			}
		})
	}
}

func TestCloudCatEPayExplicitRoutingRejectsInvalidRouteBeforeHTTP(t *testing.T) {
	for _, route := range []struct{ method, channel string }{{"qqpay", "163"}, {"ALIPAY", "163"}, {"alipay", ""}, {"alipay", "0"}, {"wxpay", "-1"}, {"wxpay", "1.1"}, {"wxpay", "+1"}, {"wxpay", " 164"}, {"", "163"}} {
		t.Run(route.method+"/"+route.channel, func(t *testing.T) {
			called := false
			client := &http.Client{Transport: cloudCatRoundTripFunc(func(req *http.Request) (*http.Response, error) {
				called = true
				return &http.Response{StatusCode: 200, Body: io.NopCloser(strings.NewReader(`{"code":1,"trade_no":"trade-1","payurl":"https://m.ooeao.com/pay"}`)), Header: make(http.Header)}, nil
			})}
			req := testCloudCatRoutingRequest()
			req.PaymentMethod, req.ChannelID = route.method, route.channel
			if _, err := NewCloudCatEPayProvider(client).CreateOrder(context.Background(), testCloudCatConfig(), req); err == nil || called {
				t.Fatalf("invalid route reached HTTP: called=%v error=%v", called, err)
			}
		})
	}
}

func TestCloudCatEPayNotificationAcceptsExplicitMethodsWithLegacyConfig(t *testing.T) {
	for _, method := range []string{"alipay", "wxpay"} {
		values := url.Values{"pid": {"1001"}, "type": {method}, "out_trade_no": {"order-1"}, "trade_no": {"trade-1"}, "trade_status": {"TRADE_SUCCESS"}, "money": {"10.00"}, "sign_type": {"MD5"}}
		values.Set("sign", cloudCatEPaySign(values, "merchant-secret"))
		notification, err := NewCloudCatEPayProvider(nil).VerifyNotification(context.Background(), testCloudCatConfig(), nil, []byte(values.Encode()))
		if err != nil {
			t.Fatalf("%s: %v", method, err)
		}
		if notification.PaymentMethod != method {
			t.Fatalf("notification method = %q, want %q", notification.PaymentMethod, method)
		}
	}
}

func testCloudCatRoutingRequest() CreateRequest {
	return CreateRequest{MerchantOrderNo: "order-1", Description: "credits", AmountFen: 1000, Currency: "CNY", ExpiresAt: time.Now().Add(30 * time.Minute), NotifyURL: "https://tianyayingxue.cn/api/payments/notify/cloudcat-epay/config-1", ReturnURL: "https://tianyayingxue.cn/api/payments/return/cloudcat-epay?orderId=order-1", ClientIP: "203.0.113.10"}
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
