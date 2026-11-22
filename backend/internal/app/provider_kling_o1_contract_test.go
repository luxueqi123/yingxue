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

func TestKlingO1HostPreservesRolesAndTaskResult(t *testing.T) {
	archive, err := os.ReadFile(filepath.Join("..", "..", "..", "plugin-packages", "kling-o1-video.yingce-plugin"))
	if err != nil {
		t.Fatal(err)
	}
	pkg, err := protocol.ParsePluginPackage(archive)
	if err != nil {
		t.Fatal(err)
	}
	adapters, err := protocol.LoadInstalledProviders(pkg.ManifestRaw, nil)
	if err != nil || len(adapters) != 1 {
		t.Fatalf("load: %v", err)
	}
	t.Setenv("CANVAS_ALLOWED_PRIVATE_UPSTREAM_HOSTS", "127.0.0.1")
	for _, operation := range []string{"text_to_video", "image_to_video", "reference_to_video"} {
		t.Run(operation, func(t *testing.T) {
			first, last := inputImageBytes(t, "png", 300, 750), inputImageBytes(t, "jpeg", 400, 300)
			creates, polls, downloads := 0, 0, 0
			output := []byte("O1 HTTP fixture, not an actual generated video")
			var server *httptest.Server
			server = httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				w.Header().Set("Content-Type", "application/json")
				switch r.URL.Path {
				case "/omni-video/kling-o1":
					creates++
					if r.Method != "POST" || r.Header.Get("Authorization") != "Bearer fixture-key" {
						t.Error("method or auth lost")
					}
					var body map[string]any
					if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
						t.Error(err)
						http.Error(w, "invalid", 400)
						return
					}
					settings, ok := body["settings"].(map[string]any)
					if !ok || settings["resolution"] != "1080p" || settings["duration"] != float64(5) || settings["audio"] != "off" {
						t.Error("O1 settings changed")
					}
					contents := body["contents"].([]any)
					if contents[0].(map[string]any)["text"] != "原始O1镜头" {
						t.Error("prompt lost")
					}
					roles := map[string]string{}
					for _, item := range contents[1:] {
						v := item.(map[string]any)
						roles[v["type"].(string)] = v["url"].(string)
					}
					if operation == "image_to_video" && (len(roles) != 2 || roles["first_frame"] != base64.StdEncoding.EncodeToString(first) || roles["last_frame"] != base64.StdEncoding.EncodeToString(last)) {
						t.Error("frame roles or bytes changed")
					}
					if operation == "reference_to_video" && (len(roles) != 1 || roles["refer_image"] != base64.StdEncoding.EncodeToString(first)) {
						t.Error("reference role or bytes changed")
					}
					if operation == "text_to_video" && len(contents) != 1 {
						t.Error("invented text-to-video image")
					}
					if body["model_name"] != nil || body["image_list"] != nil || body["parameters"] != nil {
						t.Error("legacy fields leaked")
					}
					_, _ = w.Write([]byte(`{"code":0,"data":{"id":"o1-task","status":"submitted"}}`))
				case "/tasks":
					polls++
					if r.Method != "GET" || r.URL.Query().Get("task_ids") != "o1-task" {
						t.Error("poll identity lost")
					}
					_ = json.NewEncoder(w).Encode(map[string]any{"code": 0, "data": []any{
						map[string]any{"id": "other-task", "status": "succeeded", "outputs": []any{map[string]any{"type": "video", "url": server.URL + "/wrong.mp4"}}},
						map[string]any{"id": "o1-task", "status": "succeeded", "outputs": []any{map[string]any{"type": "video", "url": server.URL + "/result.mp4"}}},
					}})
				case "/result.mp4":
					downloads++
					w.Header().Set("Content-Type", "video/mp4")
					_, _ = w.Write(output)
				default:
					t.Errorf("unexpected path %s", r.URL.Path)
					http.NotFound(w, r)
				}
			}))
			defer server.Close()
			metadata := map[string]any{"videoEditOperation": operation, "providerOptions": map[string]any{"kling-o1-video": map[string]any{"mode": "pro", "multiShot": false}}}
			var refs []providerMedia
			if operation != "text_to_video" {
				refs = []providerMedia{{ID: "first", DataURL: inputImageDataURL("image/png", first), Width: 1, Height: 1, Bytes: 1}}
			}
			if operation == "image_to_video" {
				refs = append([]providerMedia{{ID: "last", DataURL: inputImageDataURL("image/jpeg", last)}}, refs...)
				metadata["videoStartFrameNodeId"] = "first"
				metadata["videoEndFrameNodeId"] = "last"
			}
			input := canvasGenerationInput{Mode: "video", Prompt: "原始O1镜头", Config: providerConfig{BaseURL: server.URL, APIKey: "fixture-key", Model: "kling-video-o1", Size: "16:9", VQuality: "1080p", VideoSeconds: "5", Count: "1", Quality: "high", VideoGenerateAudio: "false"}, ReferenceImages: refs, Metadata: metadata}
			ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
			defer cancel()
			result, err := runProtocolAdapterTaskWithPolicy(ctx, input, adapters[0], videoPollPolicy{Interval: time.Millisecond})
			if err != nil || creates != 1 || polls != 1 || downloads != 1 {
				t.Fatalf("chain %d/%d/%d: %v", creates, polls, downloads, err)
			}
			video, ok := result["video"].(map[string]interface{})
			if !ok || video["dataUrl"] != inputImageDataURL("video/mp4", output) {
				t.Fatal("result bytes changed")
			}
		})
	}
}
