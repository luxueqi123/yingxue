package app

import (
	"encoding/json"
	"reflect"
	"testing"

	"infinite-canvas/backend/internal/model"
	"infinite-canvas/backend/internal/payment"
)

func TestEpayProviderAdvertisesPaymentMethods(t *testing.T) {
	svc, db := newYingxuePaymentTestService(t)
	if err := db.Create(&model.PaymentProviderConfig{ID: "epay-config", ProviderID: PaymentProviderEpay, Version: 1, ConfigCipher: "configured", Enabled: true}).Error; err != nil {
		t.Fatal(err)
	}
	view, _, err := svc.paymentProviderView(payment.Descriptor{ID: PaymentProviderEpay, PluginID: PaymentPluginEpay})
	if err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(view.PaymentMethods, []string{"alipay", "wxpay"}) {
		t.Fatalf("methods=%v", view.PaymentMethods)
	}
}

func TestEpayConfiguredMethodsRejectUnknownSelection(t *testing.T) {
	_, err := resolvePaymentMethod([]PaymentMethodView{{ID: "alipay"}, {ID: "wxpay"}}, "unknown")
	if err == nil || err.Error() != "所选支付方式不可用，请刷新后重试" {
		t.Fatalf("error=%v", err)
	}
}

func TestEpayStoredConfigUsesDeclaredDefaultsWithoutOverwritingSavedSelections(t *testing.T) {
	svc, _ := newYingxuePaymentTestService(t)
	runtime, err := newPluginRuntime(svc.dataDir)
	if err != nil {
		t.Fatal(err)
	}
	svc.pluginRuntime = runtime
	manifest, ok := svc.paymentManifestForProvider(PaymentProviderEpay)
	if !ok {
		t.Fatal("official Epay package is missing")
	}
	for _, test := range []struct {
		name  string
		input string
		want  []string
	}{
		{"old config without new fields", `{"pid":"fixture","key":"fixture-key","cashierMode":"qr_code"}`, []string{"alipay", "wxpay"}},
		{"explicit selection", `{"payTypes":"wxpay","cashierMode":"qr_code"}`, []string{"wxpay"}},
		{"explicit plugin default", `{"payTypes":"","cashierMode":"qr_code"}`, nil},
	} {
		t.Run(test.name, func(t *testing.T) {
			config := &model.PaymentProviderConfig{ProviderID: PaymentProviderEpay, ConfigCipher: test.input}
			values, err := svc.decryptPaymentConfig(config)
			if err != nil {
				t.Fatal(err)
			}
			contribution, ok := paymentProviderContribution(manifest, PaymentProviderEpay)
			if !ok {
				t.Fatal("payment provider is missing")
			}
			methods, err := paymentProviderMethods(contribution, values)
			if err != nil {
				t.Fatal(err)
			}
			var got []string
			for _, method := range methods {
				got = append(got, method.ID)
				if method.Name == "" || method.Icon == "" {
					t.Fatalf("method has no catalog presentation: %#v", method)
				}
			}
			if !reflect.DeepEqual(got, test.want) || config.ConfigCipher != test.input || values["cashierMode"] != "qr_code" {
				t.Fatalf("methods=%v, expected=%v, stored config changed=%v", got, test.want, config.ConfigCipher != test.input)
			}
			var original payment.Config
			if err := json.Unmarshal([]byte(test.input), &original); err != nil {
				t.Fatal(err)
			}
			for field, value := range original {
				if values[field] != value {
					t.Fatalf("stored field %s was overwritten", field)
				}
			}
		})
	}
}
