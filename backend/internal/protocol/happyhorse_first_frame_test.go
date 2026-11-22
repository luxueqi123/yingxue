package protocol

import (
	"bytes"
	"context"
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func happyHorseFirstFrameAdapters(t *testing.T) map[string]Adapter {
	t.Helper()
	folder := filepath.Join("..", "..", "..", "plugin-packages", "dashscope-happyhorse-first-frame-video")
	source, err := os.ReadFile(filepath.Join(folder, "manifest.json"))
	if err != nil {
		t.Fatal(err)
	}
	archive, err := os.ReadFile(folder + ".yingce-plugin")
	if err != nil {
		t.Fatal(err)
	}
	pkg, err := ParsePluginPackage(archive)
	if err != nil {
		t.Fatal(err)
	}
	if !bytes.Equal(source, pkg.ManifestRaw) {
		t.Fatal("first-frame package differs from source")
	}
	result := map[string]Adapter{}
	for name, raw := range map[string][]byte{"source": source, "package": pkg.ManifestRaw} {
		loaded, err := LoadInstalledProviders(raw, nil)
		if err != nil || len(loaded) != 1 {
			t.Fatalf("load: %v", err)
		}
		policy := loaded[0].Metadata().InputImages
		if policy == nil || policy.MinShortSide != 300 || policy.MinAspectRatio != 0.4 || policy.MaxAspectRatio != 2.5 || policy.MaxBytes != 20000000 {
			t.Fatal("actual image policy lost")
		}
		result[name] = loaded[0]
	}
	return result
}

func happyHorseFirstFrameRequest() GenerationRequest {
	return GenerationRequest{Capability: CapabilityVideo, Model: "happyhorse-1.1-i2v", Prompt: "原始@图片1正文。", Operation: "image_to_video", Duration: 6, AspectRatio: "adaptive", Resolution: "720P",
		Images: []MediaReference{{URL: "https://example.com/original.png", Role: "first_frame", Order: 3}}}
}

func TestHappyHorseFirstFramePreservesItsWireContract(t *testing.T) {
	for origin, adapter := range happyHorseFirstFrameAdapters(t) {
		t.Run(origin, func(t *testing.T) {
			r := happyHorseFirstFrameRequest()
			r.Output = OutputOptions{Duration: 15, Resolution: "1080P", AspectRatio: "adaptive", Count: 1, Watermark: true}
			r.ProviderOptions = map[string]map[string]any{"dashscope-happyhorse-first-frame-video": {"prompt": "命名空间原文", "seed": 0}, "dashscope-happyhorse-reference-video": {"prompt": "unrelated"}}
			spec, err := adapter.BuildCreate(context.Background(), RequestContext{Request: r})
			if err != nil {
				t.Fatal(err)
			}
			if spec.Method != "POST" || spec.Path != "/api/v1/services/aigc/video-generation/video-synthesis" || spec.Headers["X-DashScope-Async"] != "enable" {
				t.Fatal("wrong endpoint or async header")
			}
			data, _ := json.Marshal(spec.Body)
			var body map[string]any
			if err := json.Unmarshal(data, &body); err != nil {
				t.Fatal(err)
			}
			input, parameters := body["input"].(map[string]any), body["parameters"].(map[string]any)
			media := input["media"].([]any)
			if body["model"] != r.Model || input["prompt"] != "命名空间原文" || len(media) != 1 || media[0].(map[string]any)["type"] != "first_frame" || media[0].(map[string]any)["url"] != r.Images[0].URL {
				t.Fatalf("input changed: %s", data)
			}
			if parameters["duration"] != float64(15) || parameters["resolution"] != "1080P" || parameters["seed"] != float64(0) || parameters["watermark"] != true {
				t.Fatalf("output changed: %s", data)
			}
			for _, key := range []string{"ratio", "aspect_ratio", "quality", "generate_audio"} {
				if _, exists := parameters[key]; exists {
					t.Fatalf("unsupported field %s emitted", key)
				}
			}
			r.Prompt, r.ProviderOptions = "", nil
			if _, err := adapter.BuildCreate(context.Background(), RequestContext{Request: r}); err != nil {
				t.Fatalf("optional prompt rejected: %v", err)
			}
		})
	}
}

func TestHappyHorseFirstFrameRejectsSubstitutionAndUnsupportedRequests(t *testing.T) {
	for origin, adapter := range happyHorseFirstFrameAdapters(t) {
		for name, mutate := range map[string]func(*GenerationRequest){
			"reference-model": func(r *GenerationRequest) { r.Model = "happyhorse-1.1-r2v" },
			"unknown-version": func(r *GenerationRequest) { r.Model = "happyhorse-2.0-i2v" },
			"wrong-operation": func(r *GenerationRequest) { r.Operation = "reference_to_video" },
			"no-frame":        func(r *GenerationRequest) { r.Images = nil },
			"two-frames":      func(r *GenerationRequest) { r.Images = append(r.Images, r.Images[0]) },
			"unassigned-role": func(r *GenerationRequest) { r.Images[0].Role = "" },
			"reference-role":  func(r *GenerationRequest) { r.Images[0].Role = "reference_image" },
			"last-frame-role": func(r *GenerationRequest) { r.Images[0].Role = "last_frame" },
			"video-input":     func(r *GenerationRequest) { r.Videos = []MediaReference{{URL: "https://example.com/input.mp4"}} },
			"audio-input":     func(r *GenerationRequest) { r.Audios = []MediaReference{{URL: "https://example.com/input.mp3"}} },
			"fixed-ratio":     func(r *GenerationRequest) { r.AspectRatio = "16:9" },
			"short-duration":  func(r *GenerationRequest) { r.Duration = 2 },
			"long-duration":   func(r *GenerationRequest) { r.Duration = 16 },
			"bad-tier":        func(r *GenerationRequest) { r.Resolution = "4K" },
			"audio-switch":    func(r *GenerationRequest) { r.GenerateAudio = true },
			"count":           func(r *GenerationRequest) { r.Output.Count = 2 },
			"prompt-overflow": func(r *GenerationRequest) { r.Prompt = strings.Repeat("𠀀", 2501) },
			"namespace-overflow": func(r *GenerationRequest) {
				r.ProviderOptions = map[string]map[string]any{"dashscope-happyhorse-first-frame-video": {"prompt": strings.Repeat("a", 5001)}}
			},
			"non-text": func(r *GenerationRequest) {
				r.ProviderOptions = map[string]map[string]any{"dashscope-happyhorse-first-frame-video": {"prompt": map[string]any{"text": "invalid"}}}
			},
			"invalid-seed": func(r *GenerationRequest) {
				r.ProviderOptions = map[string]map[string]any{"dashscope-happyhorse-first-frame-video": {"seed": 2147483648}}
			},
		} {
			t.Run(origin+"/"+name, func(t *testing.T) {
				r := happyHorseFirstFrameRequest()
				mutate(&r)
				if _, err := adapter.BuildCreate(context.Background(), RequestContext{Request: r}); err == nil {
					t.Fatal("unsupported request reached upstream")
				}
			})
		}
	}
}

func TestHappyHorseFirstFramePollingAndFailureStates(t *testing.T) {
	for origin, adapter := range happyHorseFirstFrameAdapters(t) {
		t.Run(origin, func(t *testing.T) {
			poll, err := adapter.BuildPoll(context.Background(), PollContext{TaskID: "original-task"})
			if err != nil || poll.Path != "/api/v1/tasks/original-task" || poll.Method != "GET" {
				t.Fatalf("poll: %#v %v", poll, err)
			}
			for _, item := range []struct {
				state  string
				status Status
			}{{"PENDING", StatusPending}, {"RUNNING", StatusProcessing}, {"SUCCEEDED", StatusSucceeded}, {"FAILED", StatusFailed}, {"UNKNOWN", StatusFailed}, {"CANCELED", StatusCancelled}} {
				payload := map[string]any{"output": map[string]any{"task_status": item.state}}
				if item.status == StatusSucceeded {
					payload["output"].(map[string]any)["video_url"] = "https://example.com/result.mp4"
				}
				data, _ := json.Marshal(payload)
				result, err := adapter.ParsePoll(context.Background(), PollContext{TaskID: "original-task"}, data)
				if err != nil || result.TaskID != "original-task" || result.Status != item.status {
					t.Fatalf("state %s: %#v %v", item.state, result, err)
				}
				if item.status == StatusSucceeded && (result.Result == nil || len(result.Result.Videos) != 1 || !result.Result.Videos[0].Ephemeral) {
					t.Fatal("ephemeral video lost")
				}
			}
			result, err := adapter.ParsePoll(context.Background(), PollContext{TaskID: "original-task"}, []byte(`{"output":{"task_status":"SUCCEEDED"}}`))
			if err != nil || result.Status != StatusFailed || result.Result != nil {
				t.Fatal("success without a video was accepted")
			}
			created, err := adapter.ParseCreate(context.Background(), []byte(`{"output":{"task_status":"PENDING"}}`))
			if err != nil || created.Status != StatusFailed {
				t.Fatal("missing task ID accepted")
			}
			if _, err := adapter.ParseCreate(context.Background(), []byte("not json")); err == nil {
				t.Fatal("non-JSON accepted")
			}
		})
	}
}
