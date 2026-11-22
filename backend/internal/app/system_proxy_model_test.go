package app

import (
	"bytes"
	"encoding/json"
	"testing"

	"infinite-canvas/backend/internal/model"
)

func TestResolveSystemProxyTextBodyUsesAuthorizedProviderModel(t *testing.T) {
	for _, protocol := range []model.ChannelInterfaceType{model.ChannelInterfaceOpenAIResponse, model.ChannelInterfaceChatCompletion, model.ChannelInterfaceClaudeAPI} {
		t.Run(string(protocol), func(t *testing.T) {
			body := []byte(`{"model":"public-text","seed":9007199254740993,"input":[{"role":"user","content":"hello"}],"stream_options":{"include_usage":true}}`)
			original := append([]byte(nil), body...)
			item := &model.ChannelModel{ModelKey: "public-text", ProviderModelKey: "provider-text", Capability: "text", Protocol: protocol}
			for _, withTier := range []bool{false, true} {
				want := "provider-text"
				if withTier {
					item.PriceTiers = []model.ChannelModelPriceTier{{ProviderModelKey: "gpt-6-astra", Enabled: true, PriceConfigured: true}}
					want = "gpt-6-astra"
				}
				got, err := ResolveSystemProxyTextBody(item, "application/json", body)
				if err != nil {
					t.Fatal(err)
				}
				var actual, expected map[string]json.RawMessage
				if err := json.Unmarshal(got, &actual); err != nil {
					t.Fatal(err)
				}
				if err := json.Unmarshal(body, &expected); err != nil {
					t.Fatal(err)
				}
				var key string
				if err := json.Unmarshal(actual["model"], &key); err != nil || key != want {
					t.Fatalf("upstream model=%q err=%v", key, err)
				}
				for _, field := range []string{"seed", "input", "stream_options"} {
					if !bytes.Equal(actual[field], expected[field]) {
						t.Fatalf("field %s changed: %s", field, actual[field])
					}
				}
				if !bytes.Equal(body, original) {
					t.Fatal("authorization and billing body was mutated")
				}
			}
		})
	}
}

func TestResolveSystemProxyTextBodyRejectsInvalidObjectAndPreservesOtherProtocols(t *testing.T) {
	item := &model.ChannelModel{ModelKey: "public", Capability: "text", Protocol: model.ChannelInterfaceOpenAIResponse}
	for _, body := range []string{"null", "[]", "false", "{", "{} {}"} {
		if _, err := ResolveSystemProxyTextBody(item, "application/json", []byte(body)); err == nil {
			t.Fatalf("invalid object accepted: %s", body)
		}
	}
	for _, unhandled := range []*model.ChannelModel{nil, {Capability: "video"}, {Capability: "text", Protocol: model.ChannelInterfaceOpenAIImage}} {
		body := []byte("opaque payload")
		got, err := ResolveSystemProxyTextBody(unhandled, "application/octet-stream", body)
		if err != nil || !bytes.Equal(got, body) {
			t.Fatalf("unhandled protocol changed: %s %v", got, err)
		}
	}
}
