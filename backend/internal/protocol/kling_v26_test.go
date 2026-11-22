package protocol

import (
	"bytes"
	"context"
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
)

func kling26Adapters(t *testing.T) map[string]Adapter {
	t.Helper()
	folder := filepath.Join("..", "..", "..", "plugin-packages", "kling-v26-video")
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
		t.Fatal("source/package mismatch")
	}
	result := map[string]Adapter{}
	for name, raw := range map[string][]byte{"source": source, "package": pkg.ManifestRaw} {
		adapters, err := LoadInstalledProviders(raw, nil)
		if err != nil || len(adapters) != 1 {
			t.Fatalf("load: %v", err)
		}
		result[name] = adapters[0]
	}
	return result
}

func kling26Request() GenerationRequest {
	return GenerationRequest{Capability: CapabilityVideo, Model: "kling-2.6", Prompt: "原始2.6镜头", Operation: "image_to_video", Resolution: "1080p", Duration: 5, AspectRatio: "adaptive", GenerateAudio: true,
		Images: []MediaReference{{DataURL: "data:image/png;base64,Zmlyc3Q=", Role: "first_frame"}}, ProviderOptions: map[string]map[string]any{"kling-v26-video": {"mode": "pro", "multiShot": false}}}
}

func TestKling26AudioResolutionAndEndpoint(t *testing.T) {
	for name, adapter := range kling26Adapters(t) {
		t.Run(name, func(t *testing.T) {
			for _, audio := range []bool{false, true} {
				for _, resolution := range []string{"720p", "1080p"} {
					for _, duration := range []int{5, 10} {
						r := kling26Request()
						r.GenerateAudio = audio
						r.Resolution = resolution
						r.Duration = duration
						if resolution == "720p" {
							r.ProviderOptions["kling-v26-video"]["mode"] = "std"
						}
						spec, err := adapter.BuildCreate(context.Background(), RequestContext{Request: r})
						if audio && resolution == "720p" {
							if err == nil {
								t.Fatal("720p audio silently upgraded")
							}
							continue
						}
						if err != nil {
							t.Fatal(err)
						}
						if spec.Path != "/image-to-video/kling-2.6" || !spec.OriginPath {
							t.Fatal("wrong origin endpoint")
						}
						body := manifestTestBody(t, spec)
						settings := body["settings"].(map[string]any)
						wantAudio := "off"
						if audio {
							wantAudio = "native"
						}
						if len(settings) != 3 || settings["audio"] != wantAudio || settings["resolution"] != resolution || settings["duration"] != float64(duration) {
							t.Fatal("source audio or tier changed")
						}
						contents := body["contents"].([]any)
						if len(contents) != 2 || contents[0].(map[string]any)["text"] != r.Prompt || contents[1].(map[string]any)["type"] != "first_frame" || contents[1].(map[string]any)["url"] != "Zmlyc3Q=" {
							t.Fatal("input bytes lost")
						}
					}
				}
			}
		})
	}
}

func TestKling26RejectsUnmappedControls(t *testing.T) {
	for name, adapter := range kling26Adapters(t) {
		for label, change := range map[string]func(*GenerationRequest){
			"model": func(r *GenerationRequest) { r.Model = "kling-v3" }, "duration": func(r *GenerationRequest) { r.Duration = 6 },
			"ratio": func(r *GenerationRequest) { r.AspectRatio = "16:9" }, "tail": func(r *GenerationRequest) { r.Images[0].Role = "last_frame" },
			"extra": func(r *GenerationRequest) { r.Images = append(r.Images, r.Images[0]) }, "count": func(r *GenerationRequest) { r.Output.Count = 2 },
			"multiShot": func(r *GenerationRequest) { r.ProviderOptions["kling-v26-video"]["multiShot"] = true },
			"voices":    func(r *GenerationRequest) { r.ProviderOptions["kling-v26-video"]["voices"] = []any{"voice"} },
		} {
			t.Run(name+"/"+label, func(t *testing.T) {
				r := kling26Request()
				change(&r)
				if _, err := adapter.BuildCreate(context.Background(), RequestContext{Request: r}); err == nil {
					t.Fatal("unsupported input accepted")
				}
			})
		}
	}
}

func TestKling26PollBindsTaskAndHidesUnfinishedMedia(t *testing.T) {
	for name, adapter := range kling26Adapters(t) {
		t.Run(name, func(t *testing.T) {
			for wire, want := range map[string]Status{"submitted": StatusPending, "processing": StatusProcessing, "failed": StatusFailed, "succeeded": StatusSucceeded} {
				raw, _ := json.Marshal(map[string]any{"code": 0, "data": []any{map[string]any{"id": "other", "status": "succeeded", "outputs": []any{map[string]any{"type": "video", "url": "https://example.com/wrong.mp4"}}}, map[string]any{"id": "mine", "status": wire, "outputs": []any{map[string]any{"type": "video", "url": "https://example.com/mine.mp4"}}}}})
				r, err := adapter.ParsePoll(context.Background(), PollContext{TaskID: "mine"}, raw)
				if err != nil || r.Status != want {
					t.Fatalf("%s: %#v %v", wire, r, err)
				}
				if want == StatusSucceeded {
					if r.Result == nil || len(r.Result.Videos) != 1 || r.Result.Videos[0].URL != "https://example.com/mine.mp4" {
						t.Fatal("wrong task result")
					}
				} else if r.Result != nil && len(r.Result.Videos) > 0 {
					t.Fatal("unfinished media exposed")
				}
			}
			for _, raw := range []string{`{"code":0,"data":[]}`, `{"code":0,"data":[{"id":"mine","status":"succeeded","outputs":[]}]}`, `{"code":0,"data":[{"id":"mine","status":"processing"},{"id":"mine","status":"succeeded"}]}`, `{"code":5,"message":"bad"}`} {
				r, err := adapter.ParsePoll(context.Background(), PollContext{TaskID: "mine"}, []byte(raw))
				if err == nil && r.Status != StatusFailed {
					t.Fatal("bad result accepted")
				}
			}
		})
	}
}
