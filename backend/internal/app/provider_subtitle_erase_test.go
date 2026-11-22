package app

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"reflect"
	"testing"
	"time"

	"infinite-canvas/backend/internal/protocol"
)

func TestSubtitleEraseHostPreservesOriginalVideoAndTextMode(t *testing.T) {
	testSubtitleEraseHost(t, nil)
}

func TestSubtitleEraseHostPreservesOriginalRegions(t *testing.T) {
	testSubtitleEraseHost(t, []any{map[string]any{"top_left_x": 0.165735, "top_left_y": 0.86736, "bottom_right_x": 0.784559, "bottom_right_y": 0.983955}})
}

func testSubtitleEraseHost(t *testing.T, regions []any) {
	t.Helper()
	raw, err := os.ReadFile(filepath.Join("..", "..", "..", "plugin-packages", "volcengine-mediakit-subtitle-erase.yingce-plugin"))
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
		case "/api/v1/tools/erase-video-subtitle-pro":
			creates++
			if r.Method != "POST" || r.Header.Get("Authorization") != "Bearer fixture-key" {
				t.Error("wrong auth/method")
			}
			var body map[string]any
			if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
				t.Error(err)
				return
			}
			fields := 2
			if regions != nil {
				fields++
				if !reflect.DeepEqual(body["erase_ratio_location"], regions) {
					t.Errorf("original region changed: %#v", body)
				}
			}
			if len(body) != fields || body["video_url"] != "https://example.com/original.mp4" || body["mode"] != "Text" {
				t.Errorf("changed request %#v", body)
			}
			_, _ = w.Write([]byte(`{"success":true,"task_id":"erase-task"}`))
		case "/api/v1/tasks/erase-task":
			polls++
			status := "running"
			if polls >= 2 {
				status = "completed"
			}
			_ = json.NewEncoder(w).Encode(map[string]any{"success": true, "task_id": "erase-task", "status": status, "result": map[string]any{"video_url": server.URL + "/result.mp4"}})
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
	input := canvasGenerationInput{Mode: "video", Config: providerConfig{BaseURL: server.URL, APIKey: "fixture-key", Model: "erase-video-subtitle-pro", Count: "1"}, ReferenceVideos: []providerMedia{{ID: "original", URL: "https://example.com/original.mp4"}}, Metadata: map[string]any{"providerOptions": map[string]any{"volcengine-mediakit-subtitle-erase": map[string]any{"mode": "Text"}}}}
	if regions != nil {
		input.Metadata["providerOptions"].(map[string]any)["volcengine-mediakit-subtitle-erase"].(map[string]any)["erase_ratio_location"] = regions
	}
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
