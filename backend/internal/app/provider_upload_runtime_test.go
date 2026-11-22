package app

import (
	"context"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"testing"

	"infinite-canvas/backend/internal/model"
	"infinite-canvas/backend/internal/platform"
	"infinite-canvas/backend/internal/protocol"
)

type uploadRuntimeAdapter struct {
	protocol.Adapter
	target   string
	accepted int
}

func (a uploadRuntimeAdapter) Metadata() protocol.Metadata {
	return protocol.Metadata{ID: "upload-fixture"}
}

func (a uploadRuntimeAdapter) BuildCreate(context.Context, protocol.RequestContext) (protocol.RequestSpec, error) {
	return protocol.RequestSpec{Method: "POST", Path: "/create", OriginPath: true, ContentType: "application/json", Body: map[string]any{}}, nil
}
func (a uploadRuntimeAdapter) ParseCreate(context.Context, []byte) (protocol.CreateResult, error) {
	return protocol.CreateResult{TaskID: "job-upload", Status: protocol.StatusPending}, nil
}
func (a uploadRuntimeAdapter) BuildUploads(context.Context, protocol.RequestContext, []byte) ([]protocol.VideoUpload, error) {
	return []protocol.VideoUpload{{URL: a.target, VideoIndex: 0}}, nil
}
func (a uploadRuntimeAdapter) ParseUploadedVideos(context.Context, protocol.PollContext, []byte) (int, error) {
	return a.accepted, nil
}
func (a uploadRuntimeAdapter) BuildPoll(context.Context, protocol.PollContext) (protocol.RequestSpec, error) {
	return protocol.RequestSpec{Method: "GET", Path: "/poll", OriginPath: true}, nil
}
func (a uploadRuntimeAdapter) ParsePoll(context.Context, protocol.PollContext, []byte) (protocol.PollResult, error) {
	return protocol.PollResult{TaskID: "job-upload", Status: protocol.StatusSucceeded, Result: &protocol.Result{Videos: []protocol.MediaReference{{DataURL: "data:video/mp4;base64,eA=="}}}}, nil
}

func TestProtocolUploadRuntimeResumesWithoutRecreating(t *testing.T) {
	for _, accepted := range []int{0, 1, -1} {
		t.Run(fmt.Sprint(accepted), func(t *testing.T) { testUploadRuntimeRecovery(t, accepted) })
	}
}

func testUploadRuntimeRecovery(t *testing.T, accepted int) {
	t.Helper()
	t.Setenv("CANVAS_ALLOWED_PRIVATE_UPSTREAM_HOSTS", "127.0.0.1")
	svc, db := newTimelineTaskTestService(t)
	svc.dataDir = t.TempDir()
	svc.runtimeCapabilities = RuntimeCapabilities{desktopLocalChannels: true}
	svc.coordinator = platform.NewCoordinatorWithRedis(nil, "upload-runtime")
	createCalls, uploadCalls, pollCalls := 0, 0, 0
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/create":
			createCalls++
			_, _ = w.Write([]byte(`{"id":"job-upload"}`))
		case "/upload":
			uploadCalls++
			data, _ := io.ReadAll(r.Body)
			if string(data) != "x" || r.Method != "PUT" {
				t.Error("original upload changed")
			}
			if uploadCalls == 1 {
				w.WriteHeader(503)
				return
			}
			w.WriteHeader(204)
		case "/poll":
			pollCalls++
			_, _ = w.Write([]byte(`{}`))
		default:
			http.NotFound(w, r)
		}
	}))
	defer server.Close()
	input := canvasGenerationInput{Mode: "video", Config: providerConfig{BaseURL: server.URL, InterfaceType: "upload-fixture", AllowLocalChannel: true}, ReferenceVideos: []providerMedia{{DataURL: "data:video/mp4;base64,eA=="}}}
	task := &model.Task{ID: newID(), UserID: "user-1", Status: model.TaskStatusRunning, Type: "video", InputJSON: mustJSON(input)}
	if err := db.Create(task).Error; err != nil {
		t.Fatal(err)
	}
	adapter := uploadRuntimeAdapter{target: server.URL + "/upload?signature=secret", accepted: accepted}
	run := func(service *Service) error {
		current, err := svc.repo.Task(task.ID)
		if err != nil {
			t.Fatal(err)
		}
		ctx := withProviderOutboundPolicy(withProviderAnalytics(context.Background(), service, *current), input.Config)
		result, err := runProtocolAdapterTaskWithPolicy(ctx, input, adapter, fastVideoPollPolicy())
		if err == nil && len(result) == 0 {
			t.Fatal("missing result")
		}
		return err
	}
	if err := run(svc); err == nil || pollCalls != 0 {
		t.Fatal("failed upload allowed polling")
	}
	restarted := &Service{repo: svc.repo, dataDir: svc.dataDir, runtimeCapabilities: svc.runtimeCapabilities, coordinator: svc.coordinator}
	if accepted < 0 {
		if err := run(restarted); err == nil {
			t.Fatal("unknown recovery state accepted")
		}
		if createCalls != 1 || uploadCalls != 1 || pollCalls != 1 {
			t.Fatal("unknown state caused replay or terminal polling")
		}
		return
	}
	if err := run(restarted); err != nil {
		t.Fatal(err)
	}
	if createCalls != 1 || uploadCalls != 2-accepted || pollCalls != 2 {
		t.Fatalf("bad resume counts %d/%d/%d", createCalls, uploadCalls, pollCalls)
	}
	if err := run(restarted); err != nil {
		t.Fatal(err)
	}
	if createCalls != 1 || uploadCalls != 2-accepted || pollCalls != 3 {
		t.Fatal("finished upload replayed")
	}
	if err := db.Model(&model.Task{}).Where("id = ?", task.ID).Update("provider_upload_state", "").Error; err != nil {
		t.Fatal(err)
	}
	if err := run(restarted); err == nil {
		t.Fatal("missing checkpoint permitted resume")
	}
	if createCalls != 1 || uploadCalls != 2-accepted || pollCalls != 3 {
		t.Fatal("missing checkpoint caused network work")
	}
}
