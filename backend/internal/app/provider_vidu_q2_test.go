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

func TestViduQ2HostTokenFramesAndResult(t *testing.T) {
	t.Setenv("CANVAS_ALLOWED_PRIVATE_UPSTREAM_HOSTS", "127.0.0.1")
	raw, err := os.ReadFile(filepath.Join("..", "..", "..", "plugin-packages", "vidu-q2-pro-video.yingce-plugin"))
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
	for _, single := range []bool{true, false} {
		t.Run(map[bool]string{true: "single", false: "frames"}[single], func(t *testing.T) {
			creates, polls, downloads := 0, 0, 0
			var server *httptest.Server
			server = httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				w.Header().Set("Content-Type", "application/json")
				if r.URL.Path != "/result.mp4" && r.Header.Get("Authorization") != "Token fixture-key" {
					t.Errorf("wrong auth %q", r.Header.Get("Authorization"))
				}
				switch r.URL.Path {
				case "/ent/v2/img2video", "/ent/v2/start-end2video":
					creates++
					var body map[string]any
					if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
						t.Error(err)
						return
					}
					images := body["images"].([]any)
					if images[0] != "https://example.com/first.png" || body["model"] != "viduq2-pro" || body["duration"] != float64(8) || body["resolution"] != "1080p" || body["is_rec"] != false || body["bgm"] != false {
						t.Errorf("changed request: %#v", body)
					}
					if single {
						if len(images) != 1 || r.URL.Path != "/ent/v2/img2video" || body["audio"] != false {
							t.Error("single-frame mismatch")
						}
					} else {
						if len(images) != 2 || images[1] != "https://example.com/last.png" || r.URL.Path != "/ent/v2/start-end2video" {
							t.Error("pair mismatch")
						}
						if _, ok := body["audio"]; ok {
							t.Error("unsupported audio field")
						}
					}
					_, _ = w.Write([]byte(`{"task_id":"vidu-task","state":"created"}`))
				case "/ent/v2/tasks/vidu-task/creations":
					polls++
					state := "processing"
					if polls == 2 {
						state = "success"
					}
					_ = json.NewEncoder(w).Encode(map[string]any{"state": state, "err_code": "", "creations": []any{map[string]any{"url": server.URL + "/result.mp4"}}})
				case "/result.mp4":
					downloads++
					if polls != 2 {
						t.Error("early download")
					}
					w.Header().Set("Content-Type", "video/mp4")
					_, _ = w.Write([]byte("vidu result fixture"))
				default:
					http.NotFound(w, r)
				}
			}))
			defer server.Close()
			refs := []providerMedia{{ID: "first", URL: "https://example.com/first.png"}}
			meta := map[string]any{"videoEditOperation": "image_to_video", "videoStartFrameNodeId": "first"}
			if !single {
				refs = append([]providerMedia{{ID: "last", URL: "https://example.com/last.png"}}, refs...)
				meta["videoEndFrameNodeId"] = "last"
			}
			input := canvasGenerationInput{Mode: "video", Prompt: "保留原始镜头", ReferenceImages: refs, VideoCapability: &VideoCapabilityConfig{Resolutions: []string{"720p", "1080p"}}, Config: providerConfig{BaseURL: server.URL + "/api/v1", APIKey: "fixture-key", Model: "viduq2-pro", Size: "auto", VQuality: "1080", VideoSeconds: "8", Count: "1", VideoWatermark: "false", VideoGenerateAudio: "false"}, Metadata: meta}
			ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
			defer cancel()
			result, err := runProtocolAdapterTaskWithPolicy(ctx, input, loaded[0], videoPollPolicy{Interval: time.Millisecond})
			if err != nil || creates != 1 || polls != 2 || downloads != 1 {
				t.Fatalf("HTTP chain %d/%d/%d: %v", creates, polls, downloads, err)
			}
			if result["video"].(map[string]interface{})["dataUrl"] != inputImageDataURL("video/mp4", []byte("vidu result fixture")) {
				t.Fatal("result bytes changed")
			}
		})
	}
}
