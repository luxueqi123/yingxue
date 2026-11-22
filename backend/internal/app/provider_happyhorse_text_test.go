package app

import (
	"context"
	"encoding/json"
	"infinite-canvas/backend/internal/protocol"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"
	"time"
)

func TestHappyHorseTextHostRequestPollingAndDownload(t *testing.T) {
	t.Setenv("CANVAS_ALLOWED_PRIVATE_UPSTREAM_HOSTS", "127.0.0.1")
	creates, polls, downloads := 0, 0, 0
	var server *httptest.Server
	server = httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		switch r.URL.Path {
		case "/api/v1/services/aigc/video-generation/video-synthesis":
			creates++
			if r.Header.Get("Authorization") != "Bearer fixture-key" || r.Header.Get("X-DashScope-Async") != "enable" {
				t.Error("auth/async header missing")
			}
			var body map[string]any
			if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
				t.Fatal(err)
			}
			input := body["input"].(map[string]any)
			params := body["parameters"].(map[string]any)
			if body["model"] != "happyhorse-1.1-t2v" || input["prompt"] != "黏土小熊走过纸板城市" || params["duration"] != float64(6) || params["resolution"] != "720P" || params["ratio"] != "16:9" || params["watermark"] != false {
				t.Errorf("source changed: %#v", body)
			}
			if _, ok := input["media"]; ok {
				t.Error("invented media")
			}
			_, _ = w.Write([]byte(`{"output":{"task_id":"text-task","task_status":"PENDING"}}`))
		case "/api/v1/tasks/text-task":
			polls++
			state := "RUNNING"
			if polls == 2 {
				state = "SUCCEEDED"
			}
			_ = json.NewEncoder(w).Encode(map[string]any{"output": map[string]any{"task_id": "text-task", "task_status": state, "video_url": server.URL + "/result.mp4"}})
		case "/result.mp4":
			downloads++
			if polls != 2 {
				t.Error("download before success")
			}
			w.Header().Set("Content-Type", "video/mp4")
			_, _ = w.Write([]byte("fixture video bytes; not a real model output"))
		default:
			http.NotFound(w, r)
		}
	}))
	defer server.Close()
	raw, err := os.ReadFile(filepath.Join("..", "..", "..", "plugin-packages", "dashscope-happyhorse-text-video.yingce-plugin"))
	if err != nil {
		t.Fatal(err)
	}
	pkg, err := protocol.ParsePluginPackage(raw)
	if err != nil {
		t.Fatal(err)
	}
	loaded, err := protocol.LoadInstalledProviders(pkg.ManifestRaw, nil)
	if err != nil || len(loaded) != 1 {
		t.Fatalf("load: %v", err)
	}
	input := canvasGenerationInput{Mode: "video", Prompt: "黏土小熊走过纸板城市", VideoCapability: &VideoCapabilityConfig{Resolutions: []string{"480P", "720P", "1080P"}}, Config: providerConfig{BaseURL: server.URL + "/api/v1", APIKey: "fixture-key", Model: "happyhorse-1.1-t2v", Size: "16:9", VQuality: "720", VideoSeconds: "6", Count: "1", VideoWatermark: "false", VideoGenerateAudio: "false"}, Metadata: map[string]any{"videoEditOperation": "text_to_video"}}
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	result, err := runProtocolAdapterTaskWithPolicy(ctx, input, loaded[0], videoPollPolicy{Interval: time.Millisecond})
	if err != nil || creates != 1 || polls != 2 || downloads != 1 {
		t.Fatalf("HTTP chain %d/%d/%d %v", creates, polls, downloads, err)
	}
	video, ok := result["video"].(map[string]interface{})
	if !ok || video["dataUrl"] != inputImageDataURL("video/mp4", []byte("fixture video bytes; not a real model output")) {
		t.Fatal("result bytes changed")
	}
}
