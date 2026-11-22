package app

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"
	"time"

	"infinite-canvas/backend/internal/model"
	"infinite-canvas/backend/internal/platform"
	"infinite-canvas/backend/internal/protocol"
)

func TestTopazVideoExpressRuntimeAndMissingCheckpointRecovery(t *testing.T) {
	raw, err := os.ReadFile(filepath.Join("..", "..", "..", "plugin-packages", "topaz-video-enhance.yingce-plugin"))
	if err != nil {
		t.Fatal(err)
	}
	pkg, err := protocol.ParsePluginPackage(raw)
	if err != nil {
		t.Fatal(err)
	}
	adapters, err := protocol.LoadInstalledProviders(pkg.ManifestRaw, nil)
	if err != nil || len(adapters) != 1 {
		t.Fatalf("independent package not loadable: %v", err)
	}
	adapter := adapters[0]
	t.Setenv("CANVAS_ALLOWED_PRIVATE_UPSTREAM_HOSTS", "127.0.0.1")
	for _, initial := range []string{"new", "accepted", "processing", "expired", "receipt-only", "old-receipt"} {
		t.Run(initial, func(t *testing.T) {
			svc, db := newTimelineTaskTestService(t)
			svc.dataDir = t.TempDir()
			svc.runtimeCapabilities = RuntimeCapabilities{desktopLocalChannels: true}
			svc.coordinator = platform.NewCoordinatorWithRedis(nil, "topaz-video-test")
			creates, uploads, downloads := 0, 0, 0
			status := initial
			if initial == "receipt-only" {
				status = "accepted"
			}
			var server *httptest.Server
			server = httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				if r.URL.Path == "/upload" || r.URL.Path == "/out" {
					if r.Header.Get("X-API-Key") != "" {
						t.Error("credential forwarded to media")
					}
				} else if r.Header.Get("X-API-Key") != "fixture-key" {
					t.Error("missing provider auth")
				}
				switch r.URL.Path {
				case "/video/express":
					creates++
					var body map[string]any
					if json.NewDecoder(r.Body).Decode(&body) != nil {
						t.Error("invalid payload")
					}
					output, _ := body["output"].(map[string]any)
					if output["audioTransfer"] != "Copy" || output["dynamicCompressionLevel"] != "Low" {
						t.Error("audio or quality changed")
					}
					status = "accepted"
					_ = json.NewEncoder(w).Encode(map[string]any{"requestId": "video-job", "uploadUrls": []string{server.URL + "/upload?signature=fixture"}})
				case "/upload":
					uploads++
					if initial == "expired" && r.URL.Query().Get("signature") != "recovered" {
						w.WriteHeader(403)
						return
					}
					body, _ := io.ReadAll(r.Body)
					if string(body) != "x" || r.Method != "PUT" {
						t.Error("source bytes changed")
					}
					status = "complete"
					w.WriteHeader(204)
				case "/video/video-job/status":
					if status == "accepted" {
						_ = json.NewEncoder(w).Encode(map[string]any{"status": status, "urls": []string{server.URL + "/upload?signature=recovered"}})
						return
					}
					_ = json.NewEncoder(w).Encode(map[string]any{"status": "complete", "download": map[string]any{"url": server.URL + "/out?signature=result"}})
				case "/out":
					downloads++
					w.Header().Set("Content-Type", "video/mp4")
					_, _ = w.Write([]byte("enhanced-video"))
				default:
					http.NotFound(w, r)
				}
			}))
			defer server.Close()
			options := map[string]any{"source": map[string]any{"container": "mp4"}, "filters": []any{map[string]any{"model": "prob-4"}}, "output": map[string]any{"resolution": map[string]any{"width": 3840, "height": 1648}, "audioTransfer": "Copy", "audioCodec": "AAC", "videoEncoder": "H264", "dynamicCompressionLevel": "Low"}}
			input := canvasGenerationInput{Mode: "video", Config: providerConfig{BaseURL: server.URL, Model: "prob-4", InterfaceType: "topaz-video-enhance", APIKey: "fixture-key", AllowLocalChannel: true}, ReferenceVideos: []providerMedia{{DataURL: "data:video/mp4;base64,eA=="}}, Metadata: map[string]any{"providerOptions": map[string]any{"topazVideo": options}}}
			task := &model.Task{ID: newID(), UserID: "user-1", Status: model.TaskStatusRunning, Type: "video", InputJSON: mustJSON(input)}
			if initial != "new" && initial != "expired" && initial != "receipt-only" && initial != "old-receipt" {
				task.ProviderRequestID = "video-job"
			}
			if err := db.Create(task).Error; err != nil {
				t.Fatal(err)
			}
			if initial == "receipt-only" {
				if err := db.Create(&model.ApiCallLog{ID: newID(), TaskID: task.ID, UserID: task.UserID, RequestKind: "create", ProviderRequestID: "video-job"}).Error; err != nil {
					t.Fatal(err)
				}
			}
			if initial == "old-receipt" {
				if err := db.Create(&model.ApiCallLog{ID: newID(), TaskID: task.ID, UserID: task.UserID, RequestKind: "create", ProviderRequestID: "old-job", CreatedAt: time.Now().Add(-time.Hour)}).Error; err != nil {
					t.Fatal(err)
				}
			}
			ctx := withProviderOutboundPolicy(withProviderAnalytics(context.Background(), svc, *task), input.Config)
			result, err := runProtocolAdapterTaskWithPolicy(ctx, input, adapter, fastVideoPollPolicy())
			if initial == "expired" {
				if err == nil || downloads != 0 {
					t.Fatal("expired signature did not stop upload")
				}
				saved, loadErr := svc.repo.Task(task.ID)
				if loadErr != nil {
					t.Fatal(loadErr)
				}
				ctx = withProviderOutboundPolicy(withProviderAnalytics(context.Background(), svc, *saved), input.Config)
				result, err = runProtocolAdapterTaskWithPolicy(ctx, input, adapter, fastVideoPollPolicy())
			}
			if err != nil || len(result) == 0 {
				t.Fatalf("execution failed: %v", err)
			}
			wantCreates, wantUploads := 0, 1
			if initial == "new" || initial == "old-receipt" {
				wantCreates = 1
			}
			if initial == "expired" {
				wantCreates, wantUploads = 1, 2
			}
			if initial == "processing" {
				wantUploads = 0
			}
			if creates != wantCreates || uploads != wantUploads || downloads != 1 {
				t.Fatalf("unexpected create/upload/download: %d/%d/%d", creates, uploads, downloads)
			}
			if creates > 0 {
				var creationLog model.ApiCallLog
				if err := db.Where("task_id = ? AND request_kind = ?", task.ID, "create").Order("created_at desc").First(&creationLog).Error; err != nil {
					t.Fatal(err)
				}
				if creationLog.ProviderRequestID != "video-job" {
					t.Fatal("create receipt lost durable provider ID")
				}
			}
			saved, err := svc.repo.Task(task.ID)
			if err != nil {
				t.Fatal(err)
			}
			if saved.ProviderUploadState == "" {
				t.Fatal("checkpoint missing")
			}
			plain, err := svc.decryptSettingSecret(saved.ProviderUploadState)
			var checkpoint providerUploadCheckpoint
			if err != nil || json.Unmarshal([]byte(plain), &checkpoint) != nil || checkpoint.Next != 1 || checkpoint.Targets[0].URL != "" {
				t.Fatal("upload completion not persisted")
			}
		})
	}
}
