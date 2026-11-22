package app

import (
	"context"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"

	"infinite-canvas/backend/internal/model"
	"infinite-canvas/backend/internal/platform"
	"infinite-canvas/backend/internal/protocol"
)

func TestDeclarativeCancellationServiceWaitsForConfirmation(t *testing.T) {
	t.Setenv("CANVAS_ALLOWED_PRIVATE_UPSTREAM_HOSTS", "127.0.0.1")
	raw, err := os.ReadFile(filepath.Join("..", "..", "..", "plugin-packages", "topaz-image-enhance.yingce-plugin"))
	if err != nil {
		t.Fatal(err)
	}
	pkg, err := protocol.ParsePluginPackage(raw)
	if err != nil {
		t.Fatal(err)
	}
	adapters, err := protocol.LoadInstalledProviders(pkg.ManifestRaw, nil)
	if err != nil {
		t.Fatal(err)
	}
	registry, err := protocol.NewRegistry(adapters...)
	if err != nil {
		t.Fatal(err)
	}
	for _, terminal := range []string{"Cancelled", "Completed", "Failed"} {
		t.Run(terminal, func(t *testing.T) {
			svc, db := newTimelineTaskTestService(t)
			svc.runtimeCapabilities = RuntimeCapabilities{desktopLocalChannels: true}
			svc.coordinator = platform.NewCoordinatorWithRedis(nil, "cancel-test")
			svc.pluginRuntime = &pluginRuntime{registry: registry}
			billing := &taskBillingRepositoryStub{}
			svc.taskBillingCoordinator = newTaskBillingCoordinator(billing)
			upstreamStatus, cancelCalls := "Processing", 0
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				if r.Header.Get("X-API-Key") != "test-key" {
					http.Error(w, "auth", 401)
					return
				}
				if r.Method == http.MethodDelete && r.URL.Path == "/image/v1/cancel/job-1" {
					cancelCalls++
					w.WriteHeader(204)
					return
				}
				if r.Method == http.MethodGet && r.URL.Path == "/image/v1/status/job-1" {
					w.Header().Set("Content-Type", "application/json")
					_, _ = w.Write([]byte(`{"status":"` + upstreamStatus + `"}`))
					return
				}
				http.NotFound(w, r)
			}))
			defer server.Close()
			input := canvasGenerationInput{Mode: "image", Config: providerConfig{BaseURL: server.URL + "/image/v1", APIKey: "test-key", Model: "CGI", InterfaceType: "topaz-image-enhance", AllowLocalChannel: true}}
			task := &model.Task{ID: newID(), UserID: "user-1", Type: "image", Status: model.TaskStatusCancelled, ProviderRequestID: "job-1", InputJSON: mustJSON(input), BillingOrderID: "order-1"}
			if err := db.Create(task).Error; err != nil {
				t.Fatal(err)
			}
			load := func() *model.Task {
				var value model.Task
				if err := db.First(&value, "id = ?", task.ID).Error; err != nil {
					t.Fatal(err)
				}
				return &value
			}
			if err := svc.requestProviderCancellation(context.Background(), task); err != nil {
				t.Fatal(err)
			}
			if cancelCalls != 1 || load().ProviderCancelStatus != model.ProviderCancelStatusRequested {
				t.Fatalf("cancel not requested: calls=%d status=%s error=%s", cancelCalls, load().ProviderCancelStatus, load().ProviderCancelError)
			}
			if len(billing.refundCalls) != 0 || len(billing.settleCalls) != 0 {
				t.Fatal("HTTP 204 settled billing before status confirmation")
			}
			if err := svc.requestProviderCancellation(context.Background(), load()); err != nil {
				t.Fatal(err)
			}
			if cancelCalls != 1 {
				t.Fatal("duplicate cancellation request")
			}
			if err := svc.reconcileProviderCancellation(context.Background(), load()); err != nil {
				t.Fatal(err)
			}
			if load().ProviderCancelStatus != model.ProviderCancelStatusRequested || load().ProviderCancelNextCheckAt == nil {
				t.Fatal("processing did not remain scheduled")
			}
			if len(billing.refundCalls) != 0 {
				t.Fatal("processing refunded billing")
			}
			upstreamStatus = terminal
			if err := svc.reconcileProviderCancellation(context.Background(), load()); err != nil {
				t.Fatal(err)
			}
			if terminal == "Completed" {
				if len(billing.refundCalls) != 0 || len(billing.settleCalls) != 1 {
					t.Fatal("completed job not settled correctly")
				}
			} else if len(billing.refundCalls) != 1 || len(billing.settleCalls) != 0 {
				t.Fatal("cancelled/failed job not refunded correctly")
			}
			expected := model.ProviderCancelStatusUncertain
			if terminal == "Cancelled" {
				expected = model.ProviderCancelStatusConfirmed
			}
			if load().ProviderCancelStatus != expected {
				t.Fatalf("terminal state=%s", load().ProviderCancelStatus)
			}
		})
	}
}
