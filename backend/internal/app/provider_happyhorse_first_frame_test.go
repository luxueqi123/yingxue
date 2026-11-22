package app

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"
	"time"

	"infinite-canvas/backend/internal/protocol"
)

func firstFramePackageAdapter(t *testing.T) protocol.Adapter {
	t.Helper()
	data, err := os.ReadFile(filepath.Join("..", "..", "..", "plugin-packages", "dashscope-happyhorse-first-frame-video.yingce-plugin"))
	if err != nil {
		t.Fatal(err)
	}
	pkg, err := protocol.ParsePluginPackage(data)
	if err != nil {
		t.Fatal(err)
	}
	loaded, err := protocol.LoadInstalledProviders(pkg.ManifestRaw, nil)
	if err != nil || len(loaded) != 1 {
		t.Fatalf("load: %v", err)
	}
	return loaded[0]
}

func TestHappyHorseFirstFrameHostCreatesPollsAndDownloadsExactBytes(t *testing.T) {
	t.Setenv("CANVAS_ALLOWED_PRIVATE_UPSTREAM_HOSTS", "127.0.0.1")
	for _, dimensions := range []struct {
		name          string
		width, height int
		allowed       bool
	}{
		{"valid-boundary", 300, 750, true}, {"invalid-ratio", 300, 751, false},
	} {
		t.Run(dimensions.name, func(t *testing.T) {
			frame := inputImageDataURL("image/png", inputImageBytes(t, "png", dimensions.width, dimensions.height))
			creates, polls, downloads := 0, 0, 0
			resultBytes := []byte("first-frame result fixture; not a real model video")
			var server *httptest.Server
			server = httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				w.Header().Set("Content-Type", "application/json")
				switch r.URL.Path {
				case "/api/v1/services/aigc/video-generation/video-synthesis":
					creates++
					if r.Header.Get("Authorization") != "Bearer fixture-key" || r.Header.Get("X-DashScope-Async") != "enable" {
						t.Error("credential or async header lost")
					}
					var body map[string]any
					if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
						t.Error(err)
						http.Error(w, "bad JSON", 400)
						return
					}
					input, parameters := body["input"].(map[string]any), body["parameters"].(map[string]any)
					media := input["media"].([]any)
					if body["model"] != "happyhorse-1.1-i2v" || input["prompt"] != "原始@图片1正文。" || len(media) != 1 || media[0].(map[string]any)["type"] != "first_frame" || media[0].(map[string]any)["url"] != frame {
						t.Error("model, prompt, role or original frame bytes changed")
					}
					if parameters["resolution"] != "720P" || parameters["duration"] != float64(6) {
						t.Error("native output requirements changed")
					}
					for _, key := range []string{"ratio", "aspect_ratio", "quality"} {
						if _, ok := parameters[key]; ok {
							t.Errorf("unsupported field %s leaked", key)
						}
					}
					_, _ = w.Write([]byte(`{"output":{"task_id":"first-frame-task","task_status":"PENDING"}}`))
				case "/api/v1/tasks/first-frame-task":
					polls++
					_ = json.NewEncoder(w).Encode(map[string]any{"output": map[string]any{"task_id": "first-frame-task", "task_status": "SUCCEEDED", "video_url": server.URL + "/result.mp4"}})
				case "/result.mp4":
					downloads++
					w.Header().Set("Content-Type", "video/mp4")
					_, _ = w.Write(resultBytes)
				default:
					http.NotFound(w, r)
				}
			}))
			defer server.Close()
			input := canvasGenerationInput{Mode: "video", Prompt: "original top-level", Config: providerConfig{BaseURL: server.URL, APIKey: "fixture-key", Model: "happyhorse-1.1-i2v", Size: "adaptive", VQuality: "720P", VideoSeconds: "6", Count: "1", Quality: "high", VideoGenerateAudio: "false"},
				ReferenceImages: []providerMedia{{ID: "frame", DataURL: frame, Width: 500, Height: 500, Bytes: 1}},
				Metadata:        map[string]any{"videoEditOperation": "image_to_video", "videoStartFrameNodeId": "frame", "providerOptions": map[string]any{"dashscope-happyhorse-first-frame-video": map[string]any{"prompt": "原始@图片1正文。"}}}}
			ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
			defer cancel()
			result, err := runProtocolAdapterTaskWithPolicy(ctx, input, firstFramePackageAdapter(t), videoPollPolicy{Interval: time.Millisecond})
			if !dimensions.allowed {
				if err == nil || creates != 0 || polls != 0 || downloads != 0 {
					t.Fatalf("invalid ratio crossed upstream boundary: %d/%d/%d %v", creates, polls, downloads, err)
				}
				return
			}
			if err != nil || creates != 1 || polls != 1 || downloads != 1 {
				t.Fatalf("HTTP chain: %d/%d/%d %v", creates, polls, downloads, err)
			}
			video, ok := result["video"].(map[string]interface{})
			if !ok || video["dataUrl"] != inputImageDataURL("video/mp4", resultBytes) {
				t.Fatal("downloaded result bytes changed")
			}
		})
	}
}
