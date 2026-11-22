package sms

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"strings"
	"testing"

	sender "github.com/casdoor/go-sms-sender"
	"infinite-canvas/backend/internal/model"
)

type pnsRoundTripFunc func(*http.Request) (*http.Response, error)

func (f pnsRoundTripFunc) RoundTrip(req *http.Request) (*http.Response, error) { return f(req) }

func pnsTemplate() Template {
	return Template{Purpose: "register", TemplateID: "100001", Parameters: []Parameter{{Name: "code", Value: "code"}, {Name: "min", Value: "minutes"}}}
}

func TestAliyunPNSCustomCodeRequest(t *testing.T) {
	calls := 0
	transport := pnsRoundTripFunc(func(req *http.Request) (*http.Response, error) {
		calls++
		if req.Method != "POST" || req.URL.Scheme != "https" || req.URL.Host != aliyunPNSHost {
			t.Fatalf("unexpected destination: %s %s", req.Method, req.URL.Host)
		}
		if err := req.ParseForm(); err != nil {
			t.Fatal(err)
		}
		for k, v := range map[string]string{"PhoneNumber": "13800000000", "CountryCode": "86", "SignName": "恒创联众", "TemplateCode": "100001", "ValidTime": "600", "Interval": "60", "CodeLength": "6", "ReturnVerifyCode": "false", "AutoRetry": "0"} {
			if req.PostForm.Get(k) != v || req.URL.Query().Has(k) {
				t.Errorf("%s must be sent only in POST body", k)
			}
		}
		if req.URL.Query().Get("Action") != "SendSmsVerifyCode" || req.URL.Query().Get("Version") != "2017-05-25" || req.URL.Query().Get("Signature") == "" {
			t.Fatal("missing SDK action, version or signature")
		}
		var params map[string]string
		if json.Unmarshal([]byte(req.PostForm.Get("TemplateParam")), &params) != nil || params["code"] != "004219" || params["min"] != "10" {
			t.Fatal("custom code or lifetime was changed")
		}
		if strings.Contains(req.URL.String(), "test-access-secret") {
			t.Fatal("secret leaked into URL")
		}
		return &http.Response{StatusCode: 200, Header: make(http.Header), Body: io.NopCloser(strings.NewReader(`{"Code":"OK","Success":true,"RequestId":"req-1","Model":{"BizId":"biz-1^4"}}`))}, nil
	})
	result, err := sendAliyunPNS(context.Background(), transport, model.SMSChannel{SignName: "恒创联众"}, pnsTemplate(), "test-access-id", "test-access-secret", "+8613800000000", "004219")
	if err != nil || result.State != "accepted" || result.MessageID != "biz-1^4" || result.RequestID != "req-1" || calls != 1 {
		t.Fatalf("result=%+v err=%v calls=%d", result, err, calls)
	}
}

func TestAliyunPNSAcceptanceFailures(t *testing.T) {
	for _, tc := range []struct {
		name, body, state, code string
		status                  int
		transportError          bool
	}{
		{name: "explicit-rejection", status: 200, body: `{"Code":"FREQUENCY_FAIL","Success":false,"RequestId":"req-2"}`, state: "rejected", code: "FREQUENCY_FAIL"},
		{name: "http-rejection", status: 400, body: `{"Code":"InvalidAccessKeyId.NotFound","RequestId":"req-2"}`, state: "rejected", code: "InvalidAccessKeyId.NotFound"},
		{name: "false-success", status: 200, body: `{"Code":"OK","Success":false,"RequestId":"req-2","Model":{"BizId":"biz-2"}}`, state: "unknown", code: "acceptance_unknown"},
		{name: "missing-business-id", status: 200, body: `{"Code":"OK","Success":true,"RequestId":"req-2"}`, state: "unknown", code: "acceptance_unknown"},
		{name: "missing-request-id", status: 200, body: `{"Code":"OK","Success":true,"Model":{"BizId":"biz-2"}}`, state: "unknown", code: "acceptance_unknown"},
		{name: "bad-json", status: 200, body: `broken`, state: "unknown", code: "acceptance_unknown"},
		{name: "server-error", status: 503, body: `{"Code":"ServiceUnavailable","RequestId":"req-2"}`, state: "unknown", code: "acceptance_unknown"},
		{name: "network-error", transportError: true, state: "unknown", code: "acceptance_unknown"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			calls := 0
			transport := pnsRoundTripFunc(func(req *http.Request) (*http.Response, error) {
				calls++
				if tc.transportError {
					return nil, errors.New("private upstream error: test-access-secret 13800000000")
				}
				return &http.Response{StatusCode: tc.status, Header: make(http.Header), Body: io.NopCloser(strings.NewReader(tc.body))}, nil
			})
			result, err := sendAliyunPNS(context.Background(), transport, model.SMSChannel{SignName: "恒创联众"}, pnsTemplate(), "test-access-id", "test-access-secret", "13800000000", "004219")
			if err == nil || result.State != tc.state || result.Code != tc.code || calls != 1 {
				t.Fatalf("result=%+v err=%v calls=%d", result, err, calls)
			}
			if strings.Contains(err.Error(), "test-access-secret") || strings.Contains(err.Error(), "13800000000") {
				t.Fatal("private upstream error escaped")
			}
		})
	}
}

func TestAliyunPNSNestedRequestIDAcceptance(t *testing.T) {
	for _, tc := range []struct {
		name, body, requestID string
	}{
		{name: "observed-provider-shape", body: `{"Message":"OK","Model":{"RequestId":"nested-request-1","BizId":"biz-1^4"},"Code":"OK","Success":true}`, requestID: "nested-request-1"},
		{name: "top-level-id-preferred", body: `{"RequestId":"root-request-1","Model":{"RequestId":"nested-request-1","BizId":"biz-1^4"},"Code":"OK","Success":true}`, requestID: "root-request-1"},
		{name: "invalid-top-level-id", body: `{"RequestId":"unsafe request id","Model":{"RequestId":"nested-request-1","BizId":"biz-1^4"},"Code":"OK","Success":true}`, requestID: "nested-request-1"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			calls := 0
			transport := pnsRoundTripFunc(func(*http.Request) (*http.Response, error) {
				calls++
				return &http.Response{StatusCode: 200, Header: make(http.Header), Body: io.NopCloser(strings.NewReader(tc.body))}, nil
			})
			result, err := sendAliyunPNS(context.Background(), transport, model.SMSChannel{SignName: "恒创联众"}, pnsTemplate(), "test-access-id", "test-access-secret", "13800000000", "004219")
			if err != nil || result.State != "accepted" || result.RequestID != tc.requestID || result.MessageID != "biz-1^4" || calls != 1 {
				t.Fatalf("result=%+v err=%v calls=%d", result, err, calls)
			}
		})
	}
}

func TestAliyunPNSTransportGuards(t *testing.T) {
	calls := 0
	base := pnsRoundTripFunc(func(req *http.Request) (*http.Response, error) { calls++; return nil, sender.ErrSendUnknown })
	transport := &pnsTransport{ctx: context.Background(), base: base}
	for _, url := range []string{"http://dypnsapi.aliyuncs.com/", "https://other.example/", "https://dypnsapi.aliyuncs.com/", "https://dypnsapi.aliyuncs.com/"} {
		req, _ := http.NewRequest("POST", url, nil)
		_, _ = transport.RoundTrip(req)
	}
	if calls != 1 {
		t.Fatalf("expected exactly one outbound attempt, got %d", calls)
	}
	if PluginID(AliyunPNS) != PluginAliyun {
		t.Fatal("PNS must use the existing system Aliyun plugin gate")
	}
	if err := validateTemplates(AliyunPNS, []Template{pnsTemplate()}); err != nil {
		t.Fatal(err)
	}
}

func TestAliyunPNSRejectsInvalidInputWithoutSending(t *testing.T) {
	for _, tc := range []struct{ phone, code, id, key string }{
		{"+12025550123", "004219", "id", "key"},
		{"13800000000", "12345", "id", "key"},
		{"13800000000", "##code##", "id", "key"},
		{"13800000000", "004219", "", "key"},
		{"13800000000", "004219", "id", ""},
	} {
		calls := 0
		transport := pnsRoundTripFunc(func(*http.Request) (*http.Response, error) { calls++; return nil, sender.ErrSendUnknown })
		result, err := sendAliyunPNS(context.Background(), transport, model.SMSChannel{SignName: "恒创联众"}, pnsTemplate(), tc.id, tc.key, tc.phone, tc.code)
		if !errors.Is(err, sender.ErrSendRejected) || result.State != "rejected" || calls != 0 {
			t.Fatalf("invalid input reached upstream: state=%s calls=%d", result.State, calls)
		}
	}
}

func TestAliyunPNSTemplateMustCarryHostCodeAndLifetime(t *testing.T) {
	for _, parameters := range [][]Parameter{
		{{Name: "code", Value: "code"}},
		{{Name: "code", Value: "minutes"}, {Name: "min", Value: "code"}},
		{{Name: "other", Value: "code"}, {Name: "min", Value: "minutes"}},
	} {
		item := pnsTemplate()
		item.Parameters = parameters
		if validateTemplates(AliyunPNS, []Template{item}) == nil {
			t.Fatal("invalid code or lifetime mapping accepted")
		}
	}
}
