package handler

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestReadPaymentNotificationPayloadSupportsGetAndPostWithoutReencoding(t *testing.T) {
	for _, method := range []string{http.MethodGet, http.MethodPost} {
		t.Run(method, func(t *testing.T) {
			const encoded = "money=1.00&name=%E6%98%A0%E9%9B%AA&sign=abc"
			request := httptest.NewRequest(method, "/api/payments/notify/cloudcat-epay/config-1", nil)
			if method == http.MethodGet {
				request.URL.RawQuery = encoded
			} else {
				request.Body = http.NoBody
				request.Body = ioNopCloserForPaymentTest{Reader: strings.NewReader(encoded)}
			}
			payload, err := readPaymentNotificationPayload(httptest.NewRecorder(), request)
			if err != nil {
				t.Fatal(err)
			}
			if string(payload) != encoded {
				t.Fatalf("payload = %q", payload)
			}
		})
	}
}

func TestReadPaymentNotificationPayloadRejectsOversizedGetQuery(t *testing.T) {
	request := httptest.NewRequest(http.MethodGet, "/api/payments/notify/cloudcat-epay/config-1", nil)
	request.URL.RawQuery = strings.Repeat("x", paymentNotificationMaxBytes+1)
	if _, err := readPaymentNotificationPayload(httptest.NewRecorder(), request); err == nil {
		t.Fatal("expected oversized query to be rejected")
	}
}

type ioNopCloserForPaymentTest struct {
	*strings.Reader
}

func (ioNopCloserForPaymentTest) Close() error { return nil }
