package app

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"testing"
	"time"

	"infinite-canvas/backend/internal/protocol"
)

func TestMurekaHostPollsWithoutDownloadingPendingResult(t *testing.T) {
	raw, err := os.ReadFile("../../../plugin-packages/mureka-instrumental.yingce-plugin")
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
	for _, terminal := range []string{"succeeded", "failed", "timeouted"} {
		t.Run(terminal, func(t *testing.T) {
			creates, polls, downloads := 0, 0, 0
			output := []byte("Mureka transport fixture; not generated music or listening evidence")
			var server *httptest.Server
			server = httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				w.Header().Set("Content-Type", "application/json")
				switch r.URL.Path {
				case "/v1/instrumental/generate":
					creates++
					if r.Method != "POST" || r.Header.Get("Authorization") != "Bearer fixture-key" {
						t.Error("wrong create method/auth")
					}
					var body map[string]any
					if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
						t.Error(err)
						return
					}
					if body["model"] != "mureka-8" || body["n"] != float64(1) || body["prompt"] != "原纯音乐描述" || body["stream"] != false {
						t.Errorf("changed payload: %#v", body)
					}
					_ = json.NewEncoder(w).Encode(map[string]any{"id": "task-42", "status": "queued", "choices": []any{map[string]any{"url": server.URL + "/result.mp3"}}})
				case "/v1/instrumental/query/task-42":
					polls++
					if r.Method != "GET" || r.Header.Get("Authorization") != "Bearer fixture-key" || downloads != 0 {
						t.Error("wrong poll or premature download")
					}
					status := terminal
					if polls == 1 {
						status = "streaming"
					}
					_ = json.NewEncoder(w).Encode(map[string]any{"id": "task-42", "status": status, "choices": []any{map[string]any{"url": server.URL + "/result.mp3"}}})
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
			input := canvasGenerationInput{Mode: "audio", Prompt: "原纯音乐描述", Config: providerConfig{BaseURL: server.URL, APIKey: "fixture-key", Model: "mureka-8", Count: "1", AudioFormat: "mp3"}, Metadata: map[string]any{"providerOptions": map[string]any{"mureka-instrumental": map[string]any{"forceInstrumental": true}}}}
			result, err := runProtocolAdapterTaskWithPolicy(context.Background(), input, adapters[0], videoPollPolicy{Interval: time.Millisecond})
			if creates != 1 || polls != 2 {
				t.Fatalf("unexpected lifecycle: creates=%d polls=%d err=%v", creates, polls, err)
			}
			if terminal != "succeeded" {
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
				t.Fatal("lost original bytes")
			}
		})
	}
}
