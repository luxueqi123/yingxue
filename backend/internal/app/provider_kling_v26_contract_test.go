package app

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"
	"time"

	"infinite-canvas/backend/internal/protocol"
)

func TestKling26HostPreservesAudioChoiceAndWaitsForResult(t *testing.T) {
	raw, err := os.ReadFile(filepath.Join("..", "..", "..", "plugin-packages", "kling-v26-video.yingce-plugin"))
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
	for _, audio := range []bool{false, true} {
		name := "off"
		if audio {
			name = "native"
		}
		t.Run(name, func(t *testing.T) {
			frame := inputImageBytes(t, "png", 300, 750)
			output := []byte("2.6 HTTP fixture; not a real generated video")
			creates, polls, downloads := 0, 0, 0
			var server *httptest.Server
			server = httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				w.Header().Set("Content-Type", "application/json")
				switch r.URL.Path {
				case "/image-to-video/kling-2.6":
					creates++
					if r.Method != "POST" || r.Header.Get("Authorization") != "Bearer fixture-key" {
						t.Error("auth/method lost")
					}
					var body map[string]any
					if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
						t.Error(err)
						return
					}
					settings := body["settings"].(map[string]any)
					if settings["audio"] != name || settings["resolution"] != "1080p" || settings["duration"] != float64(5) {
						t.Error("audio/settings changed")
					}
					contents := body["contents"].([]any)
					if len(contents) != 2 || contents[0].(map[string]any)["text"] != "原始2.6镜头" || contents[1].(map[string]any)["url"] != base64.StdEncoding.EncodeToString(frame) {
						t.Error("prompt or image bytes changed")
					}
					_, _ = w.Write([]byte(`{"code":0,"data":{"id":"v26-task","status":"submitted"}}`))
				case "/tasks":
					polls++
					if r.URL.Query().Get("task_ids") != "v26-task" {
						t.Error("wrong task")
					}
					state := "submitted"
					if polls >= 2 {
						state = "succeeded"
					}
					_ = json.NewEncoder(w).Encode(map[string]any{"code": 0, "data": []any{map[string]any{"id": "other", "status": "succeeded", "outputs": []any{map[string]any{"type": "video", "url": server.URL + "/wrong.mp4"}}}, map[string]any{"id": "v26-task", "status": state, "outputs": []any{map[string]any{"type": "video", "url": server.URL + "/result.mp4"}}}}})
				case "/result.mp4":
					downloads++
					if polls < 2 {
						t.Error("download before completion")
					}
					w.Header().Set("Content-Type", "video/mp4")
					_, _ = w.Write(output)
				default:
					t.Errorf("unexpected path %s", r.URL.Path)
					http.NotFound(w, r)
				}
			}))
			defer server.Close()
			sound := "false"
			if audio {
				sound = "true"
			}
			input := canvasGenerationInput{Mode: "video", Prompt: "原始2.6镜头", Config: providerConfig{BaseURL: server.URL, APIKey: "fixture-key", Model: "kling-2.6", Size: "adaptive", VQuality: "1080p", VideoSeconds: "5", VideoGenerateAudio: sound, Count: "1", Quality: "high"}, ReferenceImages: []providerMedia{{ID: "first", DataURL: inputImageDataURL("image/png", frame), Width: 1, Height: 1, Bytes: 1}}, Metadata: map[string]any{"videoEditOperation": "image_to_video", "videoStartFrameNodeId": "first", "providerOptions": map[string]any{"kling-v26-video": map[string]any{"mode": "pro", "multiShot": false}}}}
			ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
			defer cancel()
			result, err := runProtocolAdapterTaskWithPolicy(ctx, input, adapters[0], videoPollPolicy{Interval: time.Millisecond})
			if err != nil || creates != 1 || polls != 2 || downloads != 1 {
				t.Fatalf("chain %d/%d/%d: %v", creates, polls, downloads, err)
			}
			video, ok := result["video"].(map[string]interface{})
			if !ok || video["dataUrl"] != inputImageDataURL("video/mp4", output) {
				t.Fatal("output bytes changed")
			}
		})
	}
}
