package app

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"

	"infinite-canvas/backend/internal/protocol"
)

func TestMiniMaxV1PackageConsumesHostRequestAndFileResult(t *testing.T) {
	t.Setenv("CANVAS_ALLOWED_PRIVATE_UPSTREAM_HOSTS", "127.0.0.1")
	var server *httptest.Server
	calls := map[string]int{}
	server = httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls[r.URL.Path]++
		w.Header().Set("Content-Type", "application/json")
		switch r.URL.Path {
		case "/v1/video_generation":
			var body map[string]any
			if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
				t.Error(err)
			}
			if body["model"] != "MiniMax-Hailuo-2.3" || body["prompt"] != "Original prompt" || body["first_frame_image"] != "https://example.com/original.png" || body["duration"] != float64(6) || body["resolution"] != "1080P" || body["prompt_optimizer"] != false {
				t.Errorf("host request changed: %#v", body)
			}
			fmt.Fprint(w, `{"task_id":"task-11","base_resp":{"status_code":0}}`)
		case "/v1/query/video_generation":
			if r.URL.Query().Get("task_id") != "task-11" {
				t.Error("taskID changed")
			}
			fmt.Fprint(w, `{"task_id":"task-11","status":"Success","file_id":"file-22","base_resp":{"status_code":0}}`)
		case "/v1/files/retrieve":
			if r.URL.Query().Get("file_id") != "file-22" {
				t.Error("taskID used as fileID")
			}
			_ = json.NewEncoder(w).Encode(map[string]any{"file": map[string]any{"file_id": "file-22", "download_url": server.URL + "/video.mp4"}, "base_resp": map[string]any{"status_code": 0}})
		case "/video.mp4":
			w.Header().Set("Content-Type", "video/mp4")
			fmt.Fprint(w, "contract-media-bytes")
		default:
			http.NotFound(w, r)
		}
	}))
	defer server.Close()
	data, err := os.ReadFile(filepath.Join("..", "..", "..", "plugin-packages", "minimax-hailuo-video-v1.yingce-plugin"))
	if err != nil {
		t.Fatal(err)
	}
	pkg, err := protocol.ParsePluginPackage(data)
	if err != nil {
		t.Fatal(err)
	}
	adapters, err := protocol.LoadInstalledProviders(pkg.ManifestRaw, nil)
	if err != nil {
		t.Fatal(err)
	}
	adapter := adapters[0]
	input := canvasGenerationInput{Mode: "video", Prompt: "Original prompt", Config: providerConfig{BaseURL: server.URL, APIKey: "contract-test-key", Model: "MiniMax-Hailuo-2.3", Size: "auto", Quality: "high", VQuality: "1080P", VideoSeconds: "6", VideoGenerateAudio: "false", VideoWatermark: "false", Count: "1"}, ReferenceImages: []providerMedia{{URL: "https://example.com/original.png"}}, Metadata: map[string]any{"videoEditOperation": "image_to_video"}}
	request := protocolRequestFromInput(input)
	ctx := context.Background()
	spec, err := adapter.BuildCreate(ctx, protocol.RequestContext{Request: request})
	if err != nil {
		t.Fatal(err)
	}
	body, err := executeProtocolRequest(ctx, input.Config, spec)
	if err != nil {
		t.Fatal(err)
	}
	created, err := adapter.ParseCreate(ctx, body)
	if err != nil || created.Status != protocol.StatusPending || created.TaskID != "task-11" {
		t.Fatalf("created: %#v %v", created, err)
	}
	c := protocol.PollContext{TaskID: created.TaskID, Model: request.Model, Request: request}
	spec, err = adapter.BuildPoll(ctx, c)
	if err != nil {
		t.Fatal(err)
	}
	body, err = executeProtocolRequest(ctx, input.Config, spec)
	if err != nil {
		t.Fatal(err)
	}
	state, err := adapter.ParsePoll(ctx, c, body)
	if err != nil || state.Status != protocol.StatusSucceeded {
		t.Fatalf("query: %#v %v", state, err)
	}
	output, err := finishProtocolAdapterResult(ctx, input, adapter, request, created.TaskID, state.Result, defaultVideoPollPolicy())
	if err != nil {
		t.Fatal(err)
	}
	video := output["video"].(map[string]interface{})
	if video["dataUrl"] != "data:video/mp4;base64,"+base64.StdEncoding.EncodeToString([]byte("contract-media-bytes")) {
		t.Fatalf("lookup JSON treated as video: %#v", output)
	}
	for _, path := range []string{"/v1/video_generation", "/v1/query/video_generation", "/v1/files/retrieve", "/video.mp4"} {
		if calls[path] != 1 {
			t.Fatalf("request %s repeated or skipped: %v", path, calls)
		}
	}
}
