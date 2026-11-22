package protocol

import (
	"bytes"
	"context"
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
)

func klingTurboAdapters(t *testing.T) map[string]Adapter {
	t.Helper()
	folder := filepath.Join("..", "..", "..", "plugin-packages", "kling-v3-turbo-video")
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
		t.Fatal("package/source mismatch")
	}
	result := map[string]Adapter{}
	for key, raw := range map[string][]byte{"source": source, "package": pkg.ManifestRaw} {
		adapters, err := LoadInstalledProviders(raw, nil)
		if err != nil || len(adapters) != 1 {
			t.Fatalf("load: %v", err)
		}
		result[key] = adapters[0]
	}
	return result
}

func klingTurboRequest() GenerationRequest {
	return GenerationRequest{Capability: CapabilityVideo, Model: "kling-3.0-turbo", Prompt: "原始Turbo镜头", Operation: "image_to_video", Resolution: "1080p", Duration: 6, AspectRatio: "adaptive", GenerateAudio: true,
		Images: []MediaReference{{DataURL: "data:image/png;base64,Zmlyc3Q=", Role: "first_frame"}}, ProviderOptions: map[string]map[string]any{"kling-v3-turbo-video": {"mode": "pro", "multiShot": false}}}
}

func TestKlingTurboExactEndpointAndNativeAudioContract(t *testing.T) {
	for origin, adapter := range klingTurboAdapters(t) {
		t.Run(origin, func(t *testing.T) {
			for duration := 3; duration <= 15; duration++ {
				r := klingTurboRequest()
				r.Output = OutputOptions{Duration: duration, Resolution: "1080p", GenerateAudio: true, Count: 1, Watermark: true}
				spec, err := adapter.BuildCreate(context.Background(), RequestContext{Request: r})
				if err != nil {
					t.Fatal(err)
				}
				body := manifestTestBody(t, spec)
				if spec.Path != "/image-to-video/kling-3.0-turbo" || !spec.OriginPath {
					t.Fatal("wrong Turbo origin path")
				}
				settings := body["settings"].(map[string]any)
				if len(settings) != 2 || settings["duration"] != float64(duration) || settings["resolution"] != "1080p" {
					t.Fatal("invented sound field or changed settings")
				}
				contents := body["contents"].([]any)
				if len(contents) != 2 || contents[0].(map[string]any)["text"] != r.Prompt || contents[1].(map[string]any)["type"] != "first_frame" || contents[1].(map[string]any)["url"] != "Zmlyc3Q=" {
					t.Fatal("source prompt or frame lost")
				}
				if body["model_name"] != nil || body["sound"] != nil || body["audio"] != nil || body["multi_shot"] != nil {
					t.Fatal("invented legacy field")
				}
			}
			r := klingTurboRequest()
			r.Resolution = "720p"
			r.ProviderOptions["kling-v3-turbo-video"]["mode"] = "std"
			if _, err := adapter.BuildCreate(context.Background(), RequestContext{Request: r}); err != nil {
				t.Fatal(err)
			}
		})
	}
}

func TestKlingTurboRejectsUnmappedControls(t *testing.T) {
	for origin, adapter := range klingTurboAdapters(t) {
		for name, mutate := range map[string]func(*GenerationRequest){
			"ordinaryVersion": func(r *GenerationRequest) { r.Model = "kling-v3" }, "sourceAlias": func(r *GenerationRequest) { r.Model = "kling-v3-turbo" },
			"soundOff": func(r *GenerationRequest) { r.GenerateAudio = false }, "short": func(r *GenerationRequest) { r.Duration = 2 }, "long": func(r *GenerationRequest) { r.Output.Duration = 16 },
			"tier": func(r *GenerationRequest) { r.Resolution = "720p" }, "fixedRatio": func(r *GenerationRequest) { r.AspectRatio = "16:9" },
			"tail": func(r *GenerationRequest) { r.Images[0].Role = "last_frame" }, "twoImages": func(r *GenerationRequest) { r.Images = append(r.Images, r.Images[0]) },
			"multiShot": func(r *GenerationRequest) { r.ProviderOptions["kling-v3-turbo-video"]["multiShot"] = true },
			"video":     func(r *GenerationRequest) { r.Videos = []MediaReference{{URL: "https://example.com/v.mp4"}} },
		} {
			t.Run(origin+"/"+name, func(t *testing.T) {
				r := klingTurboRequest()
				mutate(&r)
				if _, err := adapter.BuildCreate(context.Background(), RequestContext{Request: r}); err == nil {
					t.Fatal("unmapped control accepted")
				}
			})
		}
	}
}

func TestKlingTurboPollTaskBinding(t *testing.T) {
	for origin, adapter := range klingTurboAdapters(t) {
		t.Run(origin, func(t *testing.T) {
			created, err := adapter.ParseCreate(context.Background(), []byte(`{"code":0,"data":{"id":"mine","status":"submitted"}}`))
			if err != nil || created.TaskID != "mine" || created.Status != StatusPending {
				t.Fatalf("create: %#v %v", created, err)
			}
			for _, state := range []struct {
				wire     string
				expected Status
			}{{"submitted", StatusPending}, {"processing", StatusProcessing}, {"failed", StatusFailed}, {"succeeded", StatusSucceeded}} {
				raw, _ := json.Marshal(map[string]any{"code": 0, "data": []any{map[string]any{"id": "other", "status": "succeeded", "outputs": []any{map[string]any{"type": "video", "url": "https://example.com/other.mp4"}}}, map[string]any{"id": "mine", "status": state.wire, "outputs": []any{map[string]any{"type": "video", "url": "https://example.com/mine.mp4"}}}}})
				result, err := adapter.ParsePoll(context.Background(), PollContext{TaskID: "mine"}, raw)
				if err != nil || result.Status != state.expected {
					t.Fatalf("poll: %#v %v", result, err)
				}
				if state.expected == StatusSucceeded && (result.Result == nil || len(result.Result.Videos) != 1 || result.Result.Videos[0].URL != "https://example.com/mine.mp4") {
					t.Fatal("wrong task result")
				}
			}
			for _, raw := range []string{`{"code":0,"data":[]}`, `{"code":0,"data":[{"id":"mine","status":"succeeded","outputs":[]}]}`, `{"code":0,"data":[{"id":"other","status":"processing"}]}`, `{"code":5,"message":"invalid"}`} {
				r, err := adapter.ParsePoll(context.Background(), PollContext{TaskID: "mine"}, []byte(raw))
				if err == nil && r.Status != StatusFailed {
					t.Fatal("bad response accepted")
				}
			}
		})
	}
}
