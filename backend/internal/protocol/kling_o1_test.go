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

func klingO1Adapters(t *testing.T) map[string]Adapter {
	t.Helper()
	folder := filepath.Join("..", "..", "..", "plugin-packages", "kling-o1-video")
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
		if policy == nil || policy.MaxBytes != 50000000 || policy.MinShortSide != 300 || policy.MinAspectRatio != .4 || policy.MaxAspectRatio != 2.5 {
			t.Fatal("O1 image contract lost")
		}
		adapters[name] = loaded[0]
	}
	return adapters
}

func klingO1Request() GenerationRequest {
	return GenerationRequest{Capability: CapabilityVideo, Model: "kling-video-o1", Prompt: "保留原始镜头", Operation: "image_to_video", Duration: 5, Resolution: "1080p", AspectRatio: "adaptive",
		Images:          []MediaReference{{DataURL: "data:image/png;base64,Zmlyc3Q=", Role: "first_frame", Order: 2}},
		ProviderOptions: map[string]map[string]any{"kling-o1-video": {"mode": "pro", "multiShot": false}}}
}

func TestKlingO1SameVersionWireContract(t *testing.T) {
	for origin, adapter := range klingO1Adapters(t) {
		t.Run(origin, func(t *testing.T) {
			r := klingO1Request()
			r.Images = append([]MediaReference{{DataURL: "data:image/png;base64,bGFzdA==", Role: "last_frame", Order: 1}}, r.Images...)
			r.Output = OutputOptions{Duration: 10, Resolution: "1080p", AspectRatio: "adaptive", Watermark: true, Count: 1}
			r.ProviderOptions["kling-omni-video"] = map[string]any{"mode": "4k", "body": map[string]any{"model_name": "kling-v3-omni"}}
			spec, err := adapter.BuildCreate(context.Background(), RequestContext{Request: r})
			if err != nil {
				t.Fatal(err)
			}
			body := manifestTestBody(t, spec)
			settings, ok := body["settings"].(map[string]any)
			if !ok || settings["resolution"] != "1080p" || settings["duration"] != float64(10) || settings["audio"] != "off" {
				t.Fatalf("wrong O1 settings: %#v", body)
			}
			if spec.Path != "/omni-video/kling-o1" || spec.Method != "POST" || body["parameters"] != nil || body["model_name"] != nil || body["image_list"] != nil || settings["aspect_ratio"] != nil {
				t.Fatalf("wrong O1 endpoint or leaked legacy fields: %#v", spec)
			}
			contents := body["contents"].([]any)
			if len(contents) != 3 || contents[0].(map[string]any)["text"] != r.Prompt || contents[1].(map[string]any)["type"] != "last_frame" || contents[1].(map[string]any)["url"] != "bGFzdA==" || contents[2].(map[string]any)["type"] != "first_frame" {
				t.Fatal("prompt, bytes or explicit roles lost")
			}
			poll, err := adapter.BuildPoll(context.Background(), PollContext{TaskID: "original-task"})
			if err != nil || poll.Path != "/tasks" || len(poll.Query["task_ids"]) != 1 || poll.Query["task_ids"][0] != "original-task" || poll.Method != "GET" {
				t.Fatalf("wrong poll: %#v %v", poll, err)
			}
			for _, operation := range []string{"text_to_video", "reference_to_video"} {
				r = klingO1Request()
				r.Operation = operation
				r.AspectRatio = "16:9"
				r.Images = nil
				if operation == "reference_to_video" {
					r.Images = []MediaReference{{URL: "https://example.com/ref.png", Role: "reference_image", Order: 1}}
				}
				if _, err = adapter.BuildCreate(context.Background(), RequestContext{Request: r}); err != nil {
					t.Fatal(err)
				}
			}
		})
	}
}

func TestKlingO1RejectsUnsupportedInputs(t *testing.T) {
	for origin, adapter := range klingO1Adapters(t) {
		for name, mutate := range map[string]func(*GenerationRequest){
			"version":        func(r *GenerationRequest) { r.Model = "kling-v3-omni" },
			"duration":       func(r *GenerationRequest) { r.Output.Duration = 6 },
			"resolution":     func(r *GenerationRequest) { r.Output.Resolution = "4k" },
			"tier":           func(r *GenerationRequest) { r.ProviderOptions["kling-o1-video"]["mode"] = "std" },
			"sound":          func(r *GenerationRequest) { r.GenerateAudio = true },
			"video":          func(r *GenerationRequest) { r.Videos = []MediaReference{{URL: "https://example.com/v.mp4"}} },
			"role":           func(r *GenerationRequest) { r.Images[0].Role = "reference_image" },
			"tailOnly":       func(r *GenerationRequest) { r.Images[0].Role = "last_frame" },
			"duplicateFrame": func(r *GenerationRequest) { r.Images = append(r.Images, r.Images[0]) },
			"empty":          func(r *GenerationRequest) { r.Images = nil },
			"count":          func(r *GenerationRequest) { r.Output.Count = 2 },
			"shots":          func(r *GenerationRequest) { r.ProviderOptions["kling-o1-video"]["multiShot"] = true },
			"prompt":         func(r *GenerationRequest) { r.Prompt = strings.Repeat("𠀀", 2501) },
		} {
			t.Run(origin+"/"+name, func(t *testing.T) {
				r := klingO1Request()
				mutate(&r)
				if _, err := adapter.BuildCreate(context.Background(), RequestContext{Request: r}); err == nil {
					t.Fatal("unsupported request accepted")
				}
			})
		}
	}
}

func TestKlingO1BindsPollResultsToTask(t *testing.T) {
	for origin, adapter := range klingO1Adapters(t) {
		t.Run(origin, func(t *testing.T) {
			created, err := adapter.ParseCreate(context.Background(), []byte(`{"code":0,"data":{"id":"mine","status":"submitted"}}`))
			if err != nil || created.TaskID != "mine" || created.Status != StatusPending {
				t.Fatalf("create: %#v %v", created, err)
			}
			for _, state := range []struct {
				wire     string
				expected Status
			}{{"submitted", StatusPending}, {"processing", StatusProcessing}, {"succeeded", StatusSucceeded}, {"failed", StatusFailed}} {
				row := map[string]any{"id": "mine", "status": state.wire, "outputs": []any{map[string]any{"type": "image", "url": "https://example.com/wrong.png"}, map[string]any{"type": "video", "url": "https://example.com/right.mp4"}}}
				raw, _ := json.Marshal(map[string]any{"code": 0, "data": []any{map[string]any{"id": "other", "status": "succeeded", "outputs": []any{map[string]any{"type": "video", "url": "https://example.com/other.mp4"}}}, row}})
				result, err := adapter.ParsePoll(context.Background(), PollContext{TaskID: "mine"}, raw)
				if err != nil || result.TaskID != "mine" || result.Status != state.expected {
					t.Fatalf("poll: %#v %v", result, err)
				}
				if state.expected == StatusSucceeded && (result.Result == nil || len(result.Result.Videos) != 1 || result.Result.Videos[0].URL != "https://example.com/right.mp4" || !result.Result.Videos[0].Ephemeral) {
					t.Fatal("wrong task result")
				}
			}
			for _, raw := range []string{
				`{"code":0,"data":[]}`, `{"code":0,"data":[{"id":"other","status":"succeeded"}]}`,
				`{"code":0,"data":[{"id":"mine","status":"processing"},{"id":"mine","status":"processing"}]}`,
				`{"code":0,"data":[{"id":"mine","status":"unknown"}]}`,
				`{"code":0,"data":[{"id":"mine","status":"succeeded","outputs":[{"type":"video","url":" "}]}]}`,
				`{"code":1001,"message":"invalid"}`,
			} {
				result, err := adapter.ParsePoll(context.Background(), PollContext{TaskID: "mine"}, []byte(raw))
				if err == nil && result.Status != StatusFailed {
					t.Fatalf("invalid poll accepted: %s", raw)
				}
			}
		})
	}
}
