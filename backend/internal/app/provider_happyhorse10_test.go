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

func TestHappyHorse10HostPreservesVersionsAndReferenceOrder(t *testing.T) {
	t.Setenv("CANVAS_ALLOWED_PRIVATE_UPSTREAM_HOSTS", "127.0.0.1")
	for _, mode := range []string{"i2v", "r2v"} {
		for _, version := range []string{"1.0", "1.1"} {
			t.Run(mode+"/"+version, func(t *testing.T) {
				model := "happyhorse-" + version + "-" + mode
				provider, operation, ratio, prompt := "dashscope-happyhorse-first-frame-video", "image_to_video", "adaptive", "保留@图片1"
				first := inputImageDataURL("image/png", inputImageBytes(t, "png", 400, 500))
				second := inputImageDataURL("image/png", inputImageBytes(t, "png", 500, 400))
				images := []providerMedia{{ID: "first", DataURL: first}}
				role := "first_frame"
				if mode == "r2v" {
					provider, operation, ratio, prompt, role = "dashscope-happyhorse-reference-video", "reference_to_video", "16:9", "[Image 2]走向[Image 1]", "reference_image"
					images = append(images, providerMedia{ID: "second", DataURL: second})
				}
				raw, err := os.ReadFile(filepath.Join("..", "..", "..", "plugin-packages", provider+".yingce-plugin"))
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
				creates, polls, downloads := 0, 0, 0
				resultBytes := []byte("transport fixture, not a model-generated video")
				var server *httptest.Server
				server = httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
					w.Header().Set("Content-Type", "application/json")
					switch r.URL.Path {
					case "/api/v1/services/aigc/video-generation/video-synthesis":
						creates++
						if r.Method != "POST" || r.Header.Get("Authorization") != "Bearer fixture" || r.Header.Get("X-DashScope-Async") != "enable" {
							t.Error("wrong HTTP contract")
						}
						var body map[string]any
						if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
							t.Error(err)
							return
						}
						input := body["input"].(map[string]any)
						media := input["media"].([]any)
						params := body["parameters"].(map[string]any)
						if body["model"] != model || input["prompt"] != prompt || len(media) != len(images) {
							t.Error("source model, prompt or references changed")
						}
						for i, item := range media {
							m := item.(map[string]any)
							if m["type"] != role || m["url"] != images[i].DataURL {
								t.Error("role/order/bytes changed")
							}
						}
						if params["duration"] != float64(6) || params["resolution"] != "720P" {
							t.Error("output options changed")
						}
						if mode == "r2v" {
							if params["ratio"] != ratio {
								t.Error("ratio lost")
							}
						} else if _, ok := params["ratio"]; ok {
							t.Error("invented first-frame ratio")
						}
						_ = json.NewEncoder(w).Encode(map[string]any{"output": map[string]any{"task_id": "horse-task", "task_status": "PENDING"}})
					case "/api/v1/tasks/horse-task":
						polls++
						status := "RUNNING"
						if polls > 1 {
							status = "SUCCEEDED"
						}
						if polls == 2 && downloads != 0 {
							t.Error("downloaded a running task result")
						}
						_ = json.NewEncoder(w).Encode(map[string]any{"output": map[string]any{"task_id": "horse-task", "task_status": status, "video_url": server.URL + "/result.mp4"}})
					case "/result.mp4":
						downloads++
						w.Header().Set("Content-Type", "video/mp4")
						_, _ = w.Write(resultBytes)
					default:
						http.NotFound(w, r)
					}
				}))
				defer server.Close()
				metadata := map[string]any{"videoEditOperation": operation, "providerOptions": map[string]any{provider: map[string]any{"prompt": prompt}}}
				if mode == "i2v" {
					metadata["videoStartFrameNodeId"] = "first"
				}
				input := canvasGenerationInput{Mode: "video", Prompt: "top-level", Config: providerConfig{BaseURL: server.URL, APIKey: "fixture", Model: model, Size: ratio, VQuality: "720P", VideoSeconds: "6", Count: "1", VideoGenerateAudio: "false"}, ReferenceImages: images, Metadata: metadata}
				ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
				defer cancel()
				result, err := runProtocolAdapterTaskWithPolicy(ctx, input, adapters[0], videoPollPolicy{Interval: time.Millisecond})
				if err != nil || creates != 1 || polls != 2 || downloads != 1 {
					t.Fatalf("HTTP chain %d/%d/%d: %v", creates, polls, downloads, err)
				}
				video, ok := result["video"].(map[string]interface{})
				if !ok || video["dataUrl"] != inputImageDataURL("video/mp4", resultBytes) {
					t.Fatal("result bytes changed")
				}
			})
		}
	}
}
