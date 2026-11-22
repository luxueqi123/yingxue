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

func kling25Adapters(t *testing.T) map[string]Adapter {
	t.Helper()
	folder := filepath.Join("..", "..", "..", "plugin-packages", "kling-v25-video")
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
		t.Fatal("package differs from source")
	}
	adapters := map[string]Adapter{}
	for name, raw := range map[string][]byte{"source": source, "package": pkg.ManifestRaw} {
		loaded, err := LoadInstalledProviders(raw, nil)
		if err != nil || len(loaded) != 1 {
			t.Fatalf("load: %v", err)
		}
		policy := loaded[0].Metadata().InputImages
		if policy == nil || policy.MaxBytes != 10000000 || policy.MinShortSide != 300 || policy.MinAspectRatio != 0.4 || policy.MaxAspectRatio != 2.5 {
			t.Fatal("legacy image constraints missing")
		}
		adapters[name] = loaded[0]
	}
	return adapters
}

func kling25Request() GenerationRequest {
	return GenerationRequest{Capability: CapabilityVideo, Model: "kling-v2-5-turbo", Prompt: "原始镜头", Operation: "image_to_video", Duration: 5, Resolution: "1080p", AspectRatio: "adaptive",
		Images:          []MediaReference{{DataURL: "data:image/png;base64,Zmlyc3Q=", Role: "first_frame", Order: 2}},
		ProviderOptions: map[string]map[string]any{"kling-v25-video": {"mode": "pro", "multiShot": false}}}
}

func TestKling25SameVersionWireContract(t *testing.T) {
	for origin, adapter := range kling25Adapters(t) {
		t.Run(origin, func(t *testing.T) {
			r := kling25Request()
			r.Quality = "low"
			r.Images = append([]MediaReference{{DataURL: "data:image/png;base64,bGFzdA==", Role: "last_frame", Order: 1}}, r.Images...)
			r.Output = OutputOptions{Duration: 10, Resolution: "1080p", AspectRatio: "adaptive", Count: 1, Watermark: true}
			r.ProviderOptions["kling-v3-video"] = map[string]any{"mode": "4k", "body": map[string]any{"model_name": "kling-v3"}}
			spec, err := adapter.BuildCreate(context.Background(), RequestContext{Request: r})
			if err != nil {
				t.Fatal(err)
			}
			data, _ := json.Marshal(spec.Body)
			var body map[string]any
			_ = json.Unmarshal(data, &body)
			if spec.Method != "POST" || spec.Path != "/v1/videos/image2video" || body["model_name"] != "kling-v2-5-turbo" || body["mode"] != "pro" || body["duration"] != "10" || body["image"] != "Zmlyc3Q=" || body["image_tail"] != "bGFzdA==" || body["prompt"] != r.Prompt {
				t.Fatalf("wrong body: %s", data)
			}
			if body["watermark_info"].(map[string]any)["enabled"] != true {
				t.Fatal("watermark choice lost")
			}
			for _, key := range []string{"sound", "multi_shot", "aspect_ratio", "resolution", "quality", "elements"} {
				if _, ok := body[key]; ok {
					t.Fatalf("unexpected %s", key)
				}
			}
			poll, err := adapter.BuildPoll(context.Background(), PollContext{TaskID: "original-task", Request: r})
			if err != nil || poll.Method != "GET" || poll.Path != "/v1/videos/image2video/original-task" {
				t.Fatalf("poll: %#v %v", poll, err)
			}
		})
	}
}

func TestKling25RejectsSubstitutionAndUnsupportedControls(t *testing.T) {
	for origin, adapter := range kling25Adapters(t) {
		for name, mutate := range map[string]func(*GenerationRequest){
			"wrong-version":   func(r *GenerationRequest) { r.Model = "kling-v3" },
			"source-alias":    func(r *GenerationRequest) { r.Model = "kling-v2-5-turbo-pro" },
			"wrong-operation": func(r *GenerationRequest) { r.Operation = "reference_to_video" },
			"missing-first":   func(r *GenerationRequest) { r.Images = nil },
			"reference-role":  func(r *GenerationRequest) { r.Images[0].Role = "reference" },
			"duplicate-first": func(r *GenerationRequest) { r.Images = append(r.Images, r.Images[0]) },
			"video":           func(r *GenerationRequest) { r.Videos = []MediaReference{{URL: "https://example.com/base.mp4"}} },
			"audio":           func(r *GenerationRequest) { r.Audios = []MediaReference{{URL: "https://example.com/base.mp3"}} },
			"audio-switch":    func(r *GenerationRequest) { r.GenerateAudio = true },
			"duration":        func(r *GenerationRequest) { r.Duration = 6 },
			"output-duration": func(r *GenerationRequest) { r.Output.Duration = 6 },
			"fixed-ratio":     func(r *GenerationRequest) { r.AspectRatio = "16:9" },
			"wrong-tier":      func(r *GenerationRequest) { r.Resolution = "720p" },
			"4k":              func(r *GenerationRequest) { r.ProviderOptions["kling-v25-video"]["mode"] = "4k" },
			"tail-std": func(r *GenerationRequest) {
				r.Resolution = "720p"
				r.ProviderOptions["kling-v25-video"]["mode"] = "std"
				r.Images = append(r.Images, MediaReference{URL: "https://example.com/last.png", Role: "last_frame"})
			},
			"multi-shot": func(r *GenerationRequest) { r.ProviderOptions["kling-v25-video"]["multiShot"] = true },
			"custom-shots": func(r *GenerationRequest) {
				r.ProviderOptions["kling-v25-video"]["multiPrompt"] = []any{map[string]any{"prompt": "x"}}
			},
			"subjects":     func(r *GenerationRequest) { r.ProviderOptions["kling-v25-video"]["elements"] = []any{"private-id"} },
			"empty-prompt": func(r *GenerationRequest) { r.Prompt = "" },
			"long-prompt":  func(r *GenerationRequest) { r.Prompt = strings.Repeat("𠀀", 2501) },
			"count":        func(r *GenerationRequest) { r.Output.Count = 2 },
		} {
			t.Run(origin+"/"+name, func(t *testing.T) {
				r := kling25Request()
				mutate(&r)
				if _, err := adapter.BuildCreate(context.Background(), RequestContext{Request: r}); err == nil {
					t.Fatal("unsupported request accepted")
				}
			})
		}
	}
}

func TestKling25ResultAndFailureStates(t *testing.T) {
	for origin, adapter := range kling25Adapters(t) {
		t.Run(origin, func(t *testing.T) {
			for _, item := range []struct {
				state  string
				status Status
			}{{"submitted", StatusPending}, {"processing", StatusProcessing}, {"succeed", StatusSucceeded}, {"failed", StatusFailed}} {
				payload := map[string]any{"code": 0, "data": map[string]any{"task_id": "original-task", "task_status": item.state}}
				payload["data"].(map[string]any)["task_result"] = map[string]any{"videos": []any{map[string]any{"url": "https://example.com/result.mp4"}}}
				raw, _ := json.Marshal(payload)
				result, err := adapter.ParsePoll(context.Background(), PollContext{TaskID: "original-task"}, raw)
				if err != nil || result.Status != item.status || result.TaskID != "original-task" {
					t.Fatalf("state %s: %#v %v", item.state, result, err)
				}
				if item.status == StatusSucceeded && (result.Result == nil || len(result.Result.Videos) != 1 || !result.Result.Videos[0].Ephemeral) {
					t.Fatal("result missing")
				}
				if item.status != StatusSucceeded && result.Result != nil && len(result.Result.Videos) != 0 {
					t.Fatalf("unfinished/failed task exposes result: %s", item.state)
				}
			}
			result, err := adapter.ParsePoll(context.Background(), PollContext{TaskID: "original-task"}, []byte(`{"code":0,"data":{"task_status":"succeed","task_result":{"videos":[]}}}`))
			if err != nil || result.Status != StatusFailed || result.Result != nil {
				t.Fatal("empty success accepted")
			}
			created, err := adapter.ParseCreate(context.Background(), []byte(`{"code":0,"data":{"task_status":"submitted"}}`))
			if err != nil || created.Status != StatusFailed {
				t.Fatal("missing task ID accepted")
			}
			created, err = adapter.ParseCreate(context.Background(), []byte(`{"code":1001,"message":"invalid request"}`))
			if err == nil && created.Status != StatusFailed {
				t.Fatal("upstream error accepted")
			}
		})
	}
}
