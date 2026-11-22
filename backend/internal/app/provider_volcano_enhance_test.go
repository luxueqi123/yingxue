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

func TestVolcanoEnhanceHostPreservesOriginalURLAndFPS(t *testing.T) {
	raw, err := os.ReadFile(filepath.Join("..", "..", "..", "plugin-packages", "volcengine-mediakit-video-enhance.yingce-plugin"))
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
	creates, polls, downloads := 0, 0, 0
	output := []byte("MediaKit transport fixture; no model or audiovisual claim")
	var server *httptest.Server
	server = httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		switch r.URL.Path {
		case "/api/v1/tools/enhance-video":
			creates++
			if r.Method != "POST" || r.Header.Get("Authorization") != "Bearer fixture-key" {
				t.Error("wrong auth/method")
			}
			var body map[string]any
			if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
				t.Error(err)
				return
			}
			if len(body) != 3 || body["video_url"] != "https://example.com/original.mp4" || body["resolution"] != "1080p" || body["fps"] != float64(24) {
				t.Errorf("changed request %#v", body)
			}
			_, _ = w.Write([]byte(`{"success":true,"task_id":"enhance-task"}`))
		case "/api/v1/tasks/enhance-task":
			polls++
			status := "running"
			if polls >= 2 {
				status = "completed"
			}
			_ = json.NewEncoder(w).Encode(map[string]any{"success": true, "task_id": "enhance-task", "status": status, "result": map[string]any{"video_url": server.URL + "/result.mp4"}})
		case "/result.mp4":
			downloads++
			if polls < 2 {
				t.Error("downloaded unfinished output")
			}
			w.Header().Set("Content-Type", "video/mp4")
			_, _ = w.Write(output)
		default:
			t.Errorf("unexpected %s", r.URL.Path)
			http.NotFound(w, r)
		}
	}))
	defer server.Close()
	input := canvasGenerationInput{Mode: "video", Config: providerConfig{BaseURL: server.URL, APIKey: "fixture-key", Model: "enhance-video", Count: "1"}, ReferenceVideos: []providerMedia{{ID: "original", URL: "https://example.com/original.mp4"}}, Metadata: map[string]any{"providerOptions": map[string]any{"volcengine-mediakit-video-enhance": map[string]any{"resolution": "1080p", "fps": 24}}}}
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	result, err := runProtocolAdapterTaskWithPolicy(ctx, input, adapters[0], videoPollPolicy{Interval: time.Millisecond})
	if err != nil || creates != 1 || polls != 2 || downloads != 1 {
		t.Fatalf("chain %d/%d/%d: %v", creates, polls, downloads, err)
	}
	video, ok := result["video"].(map[string]interface{})
	if !ok || video["dataUrl"] != inputImageDataURL("video/mp4", output) {
		t.Fatal("result bytes lost")
	}
}
