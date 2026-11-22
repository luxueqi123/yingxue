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

func TestKling25HostPreservesModelFramesAndResultBytes(t *testing.T) {
	archive, err := os.ReadFile(filepath.Join("..", "..", "..", "plugin-packages", "kling-v25-video.yingce-plugin"))
	if err != nil {
		t.Fatal(err)
	}
	pkg, err := protocol.ParsePluginPackage(archive)
	if err != nil {
		t.Fatal(err)
	}
	adapters, err := protocol.LoadInstalledProviders(pkg.ManifestRaw, nil)
	if err != nil || len(adapters) != 1 {
		t.Fatalf("load %v", err)
	}
	t.Setenv("CANVAS_ALLOWED_PRIVATE_UPSTREAM_HOSTS", "127.0.0.1")
	for _, withTail := range []bool{false, true} {
		name := "first"
		if withTail {
			name = "first-and-last"
		}
		t.Run(name, func(t *testing.T) {
			first, last := inputImageBytes(t, "png", 300, 750), inputImageBytes(t, "jpeg", 400, 300)
			creates, polls, downloads := 0, 0, 0
			output := []byte("2.5 result HTTP fixture, not an actual generated video")
			var server *httptest.Server
			server = httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				w.Header().Set("Content-Type", "application/json")
				switch r.URL.Path {
				case "/v1/videos/image2video":
					creates++
					if r.Header.Get("Authorization") != "Bearer fixture-key" {
						t.Error("auth header lost")
					}
					var body map[string]any
					if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
						t.Error(err)
						http.Error(w, "invalid", 400)
						return
					}
					if body["model_name"] != "kling-v2-5-turbo" || body["mode"] != "pro" || body["duration"] != "5" || body["prompt"] != "原始镜头正文" || body["image"] != base64.StdEncoding.EncodeToString(first) {
						t.Error("model/prompt/frame bytes changed")
					}
					if withTail {
						if body["image_tail"] != base64.StdEncoding.EncodeToString(last) {
							t.Error("tail bytes changed")
						}
					} else if _, ok := body["image_tail"]; ok {
						t.Error("invented tail")
					}
					for _, key := range []string{"aspect_ratio", "sound", "quality", "multi_shot"} {
						if _, ok := body[key]; ok {
							t.Errorf("unsupported %s", key)
						}
					}
					_, _ = w.Write([]byte(`{"code":0,"data":{"task_id":"v25-task","task_status":"submitted"}}`))
				case "/v1/videos/image2video/v25-task":
					polls++
					state := "submitted"
					if polls >= 2 {
						state = "succeed"
					}
					_ = json.NewEncoder(w).Encode(map[string]any{"code": 0, "data": map[string]any{"task_id": "v25-task", "task_status": state, "task_result": map[string]any{"videos": []any{map[string]any{"url": server.URL + "/result.mp4"}}}}})
				case "/result.mp4":
					downloads++
					if polls < 2 {
						t.Error("downloaded unfinished task")
					}
					w.Header().Set("Content-Type", "video/mp4")
					_, _ = w.Write(output)
				default:
					http.NotFound(w, r)
				}
			}))
			defer server.Close()
			refs := []providerMedia{{ID: "first", DataURL: inputImageDataURL("image/png", first), Width: 1, Height: 1, Bytes: 1}}
			metadata := map[string]any{"videoEditOperation": "image_to_video", "videoStartFrameNodeId": "first", "providerOptions": map[string]any{"kling-v25-video": map[string]any{"mode": "pro", "multiShot": false}}}
			if withTail {
				refs = append([]providerMedia{{ID: "last", DataURL: inputImageDataURL("image/jpeg", last)}}, refs...)
				metadata["videoEndFrameNodeId"] = "last"
			}
			input := canvasGenerationInput{Mode: "video", Prompt: "原始镜头正文", Config: providerConfig{BaseURL: server.URL, APIKey: "fixture-key", Model: "kling-v2-5-turbo", Size: "adaptive", VQuality: "1080p", VideoSeconds: "5", Count: "1", Quality: "high", VideoGenerateAudio: "false"}, ReferenceImages: refs, Metadata: metadata}
			ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
			defer cancel()
			result, err := runProtocolAdapterTaskWithPolicy(ctx, input, adapters[0], videoPollPolicy{Interval: time.Millisecond})
			if err != nil || creates != 1 || polls != 2 || downloads != 1 {
				t.Fatalf("chain %d/%d/%d: %v", creates, polls, downloads, err)
			}
			video, ok := result["video"].(map[string]interface{})
			if !ok || video["dataUrl"] != inputImageDataURL("video/mp4", output) {
				t.Fatal("result bytes changed")
			}
		})
	}
}
