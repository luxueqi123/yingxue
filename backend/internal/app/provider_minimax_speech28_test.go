package app

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"testing"

	"infinite-canvas/backend/internal/protocol"
)

func TestSpeech28HostPreservesVoiceAndRejectsFalseSuccess(t *testing.T) {
	raw, err := os.ReadFile("../../../plugin-packages/minimax-speech28-audio.yingce-plugin")
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
	for _, code := range []int{0, 1000} {
		t.Run(map[int]string{0: "completed", 1000: "failed-with-url"}[code], func(t *testing.T) {
			creates, downloads := 0, 0
			output := []byte("Speech transport fixture, not generated or listening acceptance")
			var server *httptest.Server
			server = httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				switch r.URL.Path {
				case "/v1/t2a_v2":
					creates++
					if r.Method != "POST" || r.Header.Get("Authorization") != "Bearer fixture-key" {
						t.Error("wrong method/auth")
					}
					var body map[string]any
					if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
						t.Error(err)
						return
					}
					voice := body["voice_setting"].(map[string]any)
					modify := body["voice_modify"].(map[string]any)
					if body["model"] != "speech-2.8-hd" || body["text"] != "保留原配音" || body["output_format"] != "url" || voice["voice_id"] != "female-shaonv" || voice["speed"] != float64(1) || modify["timbre"] != float64(-10) {
						t.Errorf("voice changed: %#v", body)
					}
					w.Header().Set("Content-Type", "application/json")
					_ = json.NewEncoder(w).Encode(map[string]any{"base_resp": map[string]any{"status_code": code, "status_msg": "fixture"}, "data": map[string]any{"status": 2, "audio": server.URL + "/result.mp3"}})
				case "/result.mp3":
					downloads++
					w.Header().Set("Content-Type", "audio/mpeg")
					_, _ = w.Write(output)
				default:
					t.Errorf("unexpected path: %s", r.URL.Path)
					http.NotFound(w, r)
				}
			}))
			defer server.Close()
			input := canvasGenerationInput{Mode: "audio", Prompt: "保留原配音", Config: providerConfig{BaseURL: server.URL, APIKey: "fixture-key", Model: "speech-2.8-hd", Count: "1", AudioVoice: "female-shaonv", AudioSpeed: "1", AudioFormat: "mp3"}, Metadata: map[string]any{"providerOptions": map[string]any{"minimax-speech28-audio": map[string]any{"volume": 1, "pitch": 0, "modifyPitch": 0, "intensity": 0, "timbre": -10, "soundEffects": ""}}}}
			result, err := runProtocolAdapterTaskWithPolicy(context.Background(), input, adapters[0], videoPollPolicy{})
			if creates != 1 {
                t.Fatalf("create count: %d; error: %v", creates, err)
			}
			if code != 0 {
				if err == nil || downloads != 0 {
					t.Fatalf("false success: %v downloads=%d", err, downloads)
				}
				return
			}
			if err != nil || downloads != 1 {
				t.Fatalf("chain: %v downloads=%d", err, downloads)
			}
			audio, ok := result["audio"].(map[string]interface{})
			if !ok || audio["dataUrl"] != inputImageDataURL("audio/mpeg", output) {
				t.Fatal("audio bytes lost")
			}
		})
	}
}
