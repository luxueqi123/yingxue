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

func TestKlingTurboHostUsesNativeEndpointAndPreservesBytes(t *testing.T) {
	raw, err := os.ReadFile(filepath.Join("..", "..", "..", "plugin-packages", "kling-v3-turbo-video.yingce-plugin"))
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
	frame := inputImageBytes(t, "png", 300, 750)
	output := []byte("Turbo HTTP fixture; does not prove real video or audio generation")
	creates, polls, downloads := 0, 0, 0
	var server *httptest.Server
	server = httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		switch r.URL.Path {
		case "/image-to-video/kling-3.0-turbo":
			creates++
			if r.Method != "POST" || r.Header.Get("Authorization") != "Bearer fixture-key" {
				t.Error("auth/method lost")
			}
			var body map[string]any
			if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
				t.Error(err)
				http.Error(w, "invalid", 400)
				return
			}
			settings, ok := body["settings"].(map[string]any)
			if !ok || len(settings) != 2 || settings["resolution"] != "1080p" || settings["duration"] != float64(6) {
				t.Error("settings changed or unsupported audio control invented")
			}
			contents := body["contents"].([]any)
			if len(contents) != 2 || contents[0].(map[string]any)["text"] != "原始Turbo镜头" || contents[1].(map[string]any)["type"] != "first_frame" || contents[1].(map[string]any)["url"] != base64.StdEncoding.EncodeToString(frame) {
				t.Error("source prompt or frame bytes changed")
			}
			_, _ = w.Write([]byte(`{"code":0,"data":{"id":"turbo-task","status":"submitted"}}`))
		case "/tasks":
			polls++
			if r.Method != "GET" || r.URL.Query().Get("task_ids") != "turbo-task" {
				t.Error("wrong task identity")
			}
			_ = json.NewEncoder(w).Encode(map[string]any{"code": 0, "data": []any{map[string]any{"id": "other", "status": "succeeded", "outputs": []any{map[string]any{"type": "video", "url": server.URL + "/wrong.mp4"}}}, map[string]any{"id": "turbo-task", "status": "succeeded", "outputs": []any{map[string]any{"type": "video", "url": server.URL + "/result.mp4"}}}}})
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
	input := canvasGenerationInput{Mode: "video", Prompt: "原始Turbo镜头", Config: providerConfig{BaseURL: server.URL, APIKey: "fixture-key", Model: "kling-3.0-turbo", Size: "adaptive", VQuality: "1080p", VideoSeconds: "6", VideoGenerateAudio: "true", Count: "1", Quality: "high"}, ReferenceImages: []providerMedia{{ID: "first", DataURL: inputImageDataURL("image/png", frame), Width: 1, Height: 1, Bytes: 1}}, Metadata: map[string]any{"videoEditOperation": "image_to_video", "videoStartFrameNodeId": "first", "providerOptions": map[string]any{"kling-v3-turbo-video": map[string]any{"mode": "pro", "multiShot": false}}}}
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
}
