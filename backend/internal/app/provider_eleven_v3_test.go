package app

import (
	"context"
	"encoding/json"
	"infinite-canvas/backend/internal/protocol"
	"net/http"
	"net/http/httptest"
	"os"
	"testing"
)

func TestElevenV3HostVoicePathAndBinaryErrors(t *testing.T) {
	raw, err := os.ReadFile("../../../plugin-packages/elevenlabs-v3-audio.yingce-plugin")
	if err != nil {
		t.Fatal(err)
	}
	pkg, err := protocol.ParsePluginPackage(raw)
	if err != nil {
		t.Fatal(err)
	}
	adapters, err := protocol.LoadInstalledProviders(pkg.ManifestRaw, nil)
	if err != nil || len(adapters) != 1 {
		t.Fatalf("load: %v", err)
	}
	t.Setenv("CANVAS_ALLOWED_PRIVATE_UPSTREAM_HOSTS", "127.0.0.1")
	for _, kind := range []string{"audio", "json", "http-error"} {
		t.Run(kind, func(t *testing.T) {
			calls := 0
			output := append([]byte("ID3\x04\x00\x00\x00\x00\x00\x00"), make([]byte, 128)...)
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				calls++
				if r.Method != "POST" || r.URL.Path != "/v1/text-to-speech/vZZLclMx4wouUtKBRfZn" || r.Header.Get("xi-api-key") != "fixture-key" {
					t.Errorf("wrong route/auth: %s", r.URL.Path)
				}
				var body map[string]any
				if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
					t.Error(err)
					return
				}
				if body["model_id"] != "eleven_v3" || body["text"] != "[excited] 原文本" || body["voice_settings"].(map[string]any)["stability"] != float64(0) {
					t.Errorf("changed body: %#v", body)
				}
				if kind == "audio" {
					w.Header().Set("Content-Type", "audio/mpeg")
					_, _ = w.Write(output)
					return
				}
				w.Header().Set("Content-Type", "application/json")
				if kind == "http-error" {
					w.WriteHeader(422)
				}
				_, _ = w.Write([]byte(`{"detail":{"status":"voice_not_found","message":"fixture"}}`))
			}))
			defer server.Close()
			input := canvasGenerationInput{Mode: "audio", Prompt: "[excited] 原文本", Config: providerConfig{BaseURL: server.URL, APIKey: "fixture-key", Model: "eleven_v3", Count: "1", AudioVoice: "vZZLclMx4wouUtKBRfZn", AudioSpeed: "1", AudioFormat: "mp3"}, Metadata: map[string]any{"providerOptions": map[string]any{"elevenlabs-v3-audio": map[string]any{"stability": 0}}}}
			result, err := runProtocolAdapterTaskWithPolicy(context.Background(), input, adapters[0], videoPollPolicy{})
			if calls != 1 {
				t.Fatalf("expected one call: %d %v", calls, err)
			}
			if kind != "audio" {
				if err == nil {
					t.Fatalf("fake audio accepted: %#v", result)
				}
				return
			}
			if err != nil {
				t.Fatal(err)
			}
			audio, ok := result["audio"].(map[string]interface{})
			if !ok || audio["dataUrl"] != inputImageDataURL("audio/mpeg", output) {
				t.Fatalf("audio bytes lost: %#v", result)
			}
		})
	}
}
