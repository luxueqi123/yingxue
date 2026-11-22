package protocol

import (
	"bytes"
	"context"
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
)

func volcanoEnhanceAdapters(t *testing.T) map[string]Adapter {
	t.Helper()
	folder := filepath.Join("..", "..", "..", "plugin-packages", "volcengine-mediakit-video-enhance")
	source, err := os.ReadFile(filepath.Join(folder, "manifest.json"))
	if err != nil {
		t.Fatal(err)
	}
	raw, err := os.ReadFile(folder + ".yingce-plugin")
	if err != nil {
		t.Fatal(err)
	}
	pkg, err := ParsePluginPackage(raw)
	if err != nil {
		t.Fatal(err)
	}
	if !bytes.Equal(source, pkg.ManifestRaw) {
		t.Fatal("source/package mismatch")
	}
	result := map[string]Adapter{}
	for name, raw := range map[string][]byte{"source": source, "package": pkg.ManifestRaw} {
		loaded, err := LoadInstalledProviders(raw, nil)
		if err != nil || len(loaded) != 1 {
			t.Fatalf("load: %v", err)
		}
		if !loaded[0].Metadata().RequiresPublicMediaURLs {
			t.Fatal("public video contract missing")
		}
		result[name] = loaded[0]
	}
	return result
}
func volcanoEnhanceRequest() GenerationRequest {
	return GenerationRequest{Capability: CapabilityVideo, Model: "enhance-video", Videos: []MediaReference{{URL: "https://example.com/original.mp4"}}, ProviderOptions: map[string]map[string]any{"volcengine-mediakit-video-enhance": {"resolution": "1080p", "fps": 24}}}
}
func TestVolcanoEnhanceExactFrameRateAndInput(t *testing.T) {
	for name, a := range volcanoEnhanceAdapters(t) {
		t.Run(name, func(t *testing.T) {
			r := volcanoEnhanceRequest()
			spec, err := a.BuildCreate(context.Background(), RequestContext{Request: r})
			if err != nil {
				t.Fatal(err)
			}
			body := manifestTestBody(t, spec)
			if !spec.OriginPath || spec.Path != "/api/v1/tools/enhance-video" || len(body) != 3 || body["video_url"] != "https://example.com/original.mp4" || body["resolution"] != "1080p" || body["fps"] != float64(24) {
				t.Fatalf("body changed: %#v", body)
			}
			poll, err := a.BuildPoll(context.Background(), PollContext{TaskID: "original-task"})
			if err != nil || poll.Path != "/api/v1/tasks/original-task" || !poll.OriginPath {
				t.Fatal("wrong poll endpoint")
			}
		})
	}
}
func TestVolcanoEnhanceRejectsGenerationAndLostParameters(t *testing.T) {
	for name, a := range volcanoEnhanceAdapters(t) {
		for label, change := range map[string]func(*GenerationRequest){
			"model": func(r *GenerationRequest) { r.Model = "kling-v3" }, "prompt": func(r *GenerationRequest) { r.Prompt = "change actor" }, "missing": func(r *GenerationRequest) { r.Videos = nil },
			"extra": func(r *GenerationRequest) { r.Images = []MediaReference{{URL: "https://example.com/i.png"}} },
			"fps":   func(r *GenerationRequest) { r.ProviderOptions["volcengine-mediakit-video-enhance"]["fps"] = 24.5 },
			"resolution": func(r *GenerationRequest) {
				r.ProviderOptions["volcengine-mediakit-video-enhance"]["resolution"] = "8k"
			},
			"version": func(r *GenerationRequest) {
				r.ProviderOptions["volcengine-mediakit-video-enhance"]["tool_version"] = "professional"
			},
			"localFile": func(r *GenerationRequest) { r.Videos[0].URL = "file:///original.mp4" },
		} {
			t.Run(name+"/"+label, func(t *testing.T) {
				r := volcanoEnhanceRequest()
				change(&r)
				if _, err := a.BuildCreate(context.Background(), RequestContext{Request: r}); err == nil {
					t.Fatal("unsupported request accepted")
				}
			})
		}
	}
}
func TestVolcanoEnhanceStatusIsNotAPISuccess(t *testing.T) {
	for name, a := range volcanoEnhanceAdapters(t) {
		t.Run(name, func(t *testing.T) {
			created, err := a.ParseCreate(context.Background(), []byte(`{"success":true,"task_id":"mine"}`))
			if err != nil || created.Status != StatusPending || created.TaskID != "mine" {
				t.Fatalf("create: %#v %v", created, err)
			}
			for state, want := range map[string]Status{"running": StatusProcessing, "completed": StatusSucceeded, "failed": StatusFailed} {
				raw, _ := json.Marshal(map[string]any{"success": true, "task_id": "mine", "status": state, "result": map[string]any{"video_url": "https://example.com/result.mp4"}})
				result, err := a.ParsePoll(context.Background(), PollContext{TaskID: "mine"}, raw)
				if err != nil || result.Status != want {
					t.Fatalf("%s: %#v %v", state, result, err)
				}
				if want == StatusSucceeded {
					if result.Result == nil || len(result.Result.Videos) != 1 || !result.Result.Videos[0].Ephemeral {
						t.Fatal("result missing")
					}
				} else if result.Result != nil && len(result.Result.Videos) > 0 {
					t.Fatal("unfinished result exposed")
				}
			}
			for _, raw := range []string{`{"success":false,"task_id":"mine","status":"completed","result":{"video_url":"https://example.com/r.mp4"}}`, `{"success":true,"task_id":"other","status":"completed","result":{"video_url":"https://example.com/r.mp4"}}`, `{"success":true,"task_id":"mine","status":"completed"}`, `{"success":true,"task_id":"mine"}`, `{"success":true,"task_id":"mine","status":"unknown"}`} {
				result, err := a.ParsePoll(context.Background(), PollContext{TaskID: "mine"}, []byte(raw))
				if err == nil && result.Status != StatusFailed {
					t.Fatal("invalid response accepted")
				}
			}
		})
	}
}
