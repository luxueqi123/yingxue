package app

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"infinite-canvas/backend/internal/model"
	"infinite-canvas/backend/internal/platform"
)

func TestProcessTaskKeepsOrdinaryTextContract(t *testing.T) {
	for _, operation := range []string{"storyboard", "rewrite"} {
		t.Run(operation, func(t *testing.T) {
			svc, _ := newTimelineTaskTestService(t)
			svc.coordinator = platform.NewCoordinatorWithRedis(nil, "ordinary-text-test")
			svc.runtimeCapabilities = RuntimeCapabilitiesForDeployment("127.0.0.1:8080", "true")
			calls := 0
			upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				calls++
				w.Header().Set("Content-Type", "application/json")
				_ = json.NewEncoder(w).Encode(map[string]any{"status": "completed", "output": []any{
					map[string]any{"type": "message", "content": []any{map[string]any{"type": "output_text", "text": "ordinary result"}}},
				}})
			}))
			defer upstream.Close()
			input := map[string]any{
				"mode": "text", "prompt": "ordinary prompt", "textOptions": map[string]any{"stream": false},
				"config":             providerConfig{BaseURL: upstream.URL, APIKey: "fixture", Model: "fixture", InterfaceType: "openai-response", AllowLocalChannel: true},
				"importedStoryboard": operation != "storyboard",
			}
			data, err := json.Marshal(input)
			if err != nil {
				t.Fatal(err)
			}
			result, ops, err := svc.processTask(context.Background(), model.Task{
				ID: "ordinary-task", UserID: "user", Type: "canvas_text", Operation: operation, InputJSON: string(data),
			})
			if err != nil {
				t.Fatal(err)
			}
			if calls != 1 || result["text"] != "ordinary result" || result["rows"] != nil || len(ops) != 0 {
				t.Fatalf("ordinary text was rerouted: calls=%d result=%#v ops=%#v", calls, result, ops)
			}
		})
	}
}

func TestProcessTaskRejectsLocalChannelWithoutRuntimeCapability(t *testing.T) {
	svc, _ := newTimelineTaskTestService(t)
	svc.coordinator = platform.NewCoordinatorWithRedis(nil, "closed-local-text-test")
	calls := 0
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls++
		w.WriteHeader(http.StatusNoContent)
	}))
	defer upstream.Close()
	input, err := json.Marshal(map[string]any{
		"mode": "text", "prompt": "ordinary prompt",
		"config": providerConfig{BaseURL: upstream.URL, APIKey: "fixture", Model: "fixture", InterfaceType: "openai-response", AllowLocalChannel: true},
	})
	if err != nil {
		t.Fatal(err)
	}
	_, _, err = svc.processTask(context.Background(), model.Task{
		ID: "closed-local-task", UserID: "user", Type: "canvas_text", InputJSON: string(input),
	})
	if err == nil || calls != 0 {
		t.Fatalf("unapproved local channel must fail before transport: calls=%d err=%v", calls, err)
	}
}

func TestCanRunProviderTaskRequiresVideoConfig(t *testing.T) {
	tests := []struct {
		name string
		task model.Task
		want bool
	}{
		{
			name: "channel config",
			task: model.Task{Type: "video_generate", InputJSON: `{"mode":"video","config":{"model":"veo","channelId":"channel-1"}}`},
			want: true,
		},
		{
			name: "direct config",
			task: model.Task{Type: "video_generate", InputJSON: `{"mode":"video","config":{"model":"veo","baseUrl":"https://example.test","apiKey":"secret"}}`},
			want: true,
		},
		{
			name: "missing model",
			task: model.Task{Type: "video_generate", InputJSON: `{"mode":"video","config":{"channelId":"channel-1"}}`},
			want: false,
		},
		{
			name: "missing direct credentials",
			task: model.Task{Type: "video_generate", InputJSON: `{"mode":"video","config":{"model":"veo","baseUrl":"https://example.test"}}`},
			want: false,
		},
		{
			name: "non video task",
			task: model.Task{Type: "text_generation", InputJSON: `{"mode":"video","config":{"model":"veo","channelId":"channel-1"}}`},
			want: false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := canRunProviderTask(tt.task); got != tt.want {
				t.Fatalf("canRunProviderTask() = %v, want %v", got, tt.want)
			}
		})
	}
}

func TestProcessTaskRejectsVideoTaskWithoutProviderConfig(t *testing.T) {
	svc := &Service{}
	_, _, err := svc.processTask(context.Background(), model.Task{
		Type:      "video_generate",
		InputJSON: `{"mode":"video","config":{"model":""}}`,
	})
	if err == nil {
		t.Fatal("processTask() error = nil, want missing provider configuration error")
	}
	if err.Error() != "视频任务缺少可执行的模型配置" {
		t.Fatalf("processTask() error = %q, want explicit provider configuration error", err)
	}
}

func TestValidateTaskType(t *testing.T) {
	tests := []struct {
		name     string
		taskType string
		wantErr  bool
	}{
		{name: "missing", taskType: "", wantErr: true},
		{name: "canvas image", taskType: "canvas_image"},
		{name: "video operation", taskType: "video_image_to_video"},
		{name: "unknown canvas type", taskType: "canvas_unknown", wantErr: true},
		{name: "unknown type", taskType: "workflow_router", wantErr: true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if err := validateTaskType(tt.taskType); (err != nil) != tt.wantErr {
				t.Fatalf("validateTaskType(%q) error = %v, wantErr %v", tt.taskType, err, tt.wantErr)
			}
		})
	}
}

func TestProcessTaskRejectsUnknownType(t *testing.T) {
	_, _, err := (&Service{}).processTask(context.Background(), model.Task{
		Type:      "workflow_router",
		InputJSON: `{}`,
	})
	if err == nil {
		t.Fatal("processTask() error = nil, want unsupported task type error")
	}
	if err.Error() != "不支持的任务类型：workflow_router" {
		t.Fatalf("processTask() error = %q, want unsupported task type error", err)
	}
}
