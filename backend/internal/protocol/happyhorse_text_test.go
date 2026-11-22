package protocol

import (
	"context"
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func happyHorseTextAdapters(t *testing.T) map[string]Adapter {
	t.Helper()
	root := filepath.Join("..", "..", "..", "plugin-packages")
	id := "dashscope-happyhorse-text-video"
	source, err := os.ReadFile(filepath.Join(root, id, "manifest.json"))
	if err != nil {
		t.Fatal(err)
	}
	packed, err := os.ReadFile(filepath.Join(root, id+".yingce-plugin"))
	if err != nil {
		t.Fatal(err)
	}
	pkg, err := ParsePluginPackage(packed)
	if err != nil {
		t.Fatal(err)
	}
	out := map[string]Adapter{}
	for name, raw := range map[string][]byte{"source": source, "package": pkg.ManifestRaw} {
		loaded, err := LoadInstalledProviders(raw, nil)
		if err != nil || len(loaded) != 1 {
			t.Fatalf("load: %v", err)
		}
		out[name] = loaded[0]
	}
	return out
}

func happyHorseTextRequest() GenerationRequest {
	return GenerationRequest{Capability: CapabilityVideo, Model: "happyhorse-1.1-t2v", Operation: "text_to_video", Prompt: "原始黏土城市正文", Resolution: "720P", Duration: 6, AspectRatio: "16:9"}
}

func TestHappyHorseTextVersionAndInputs(t *testing.T) {
	for name, a := range happyHorseTextAdapters(t) {
		t.Run(name, func(t *testing.T) {
			r := happyHorseTextRequest()
			spec, err := a.BuildCreate(context.Background(), RequestContext{Request: r})
			if err != nil {
				t.Fatal(err)
			}
			raw, _ := json.Marshal(spec.Body)
			var body map[string]any
			_ = json.Unmarshal(raw, &body)
			in := body["input"].(map[string]any)
			params := body["parameters"].(map[string]any)
			if body["model"] != r.Model || in["prompt"] != r.Prompt || params["ratio"] != "16:9" || params["duration"] != float64(6) || params["resolution"] != "720P" {
				t.Fatalf("changed source: %s", raw)
			}
			if _, ok := in["media"]; ok {
				t.Fatal("text task acquired media")
			}
			for label, change := range map[string]func(*GenerationRequest){
				"old-model":  func(r *GenerationRequest) { r.Model = "happyhorse-1.0-t2v" },
				"image":      func(r *GenerationRequest) { r.Images = []MediaReference{{URL: "https://example.com/a.png"}} },
				"audio":      func(r *GenerationRequest) { r.Audios = []MediaReference{{URL: "https://example.com/a.mp3"}} },
				"sound":      func(r *GenerationRequest) { r.GenerateAudio = true },
				"duration":   func(r *GenerationRequest) { r.Duration = 2 },
				"ratio":      func(r *GenerationRequest) { r.AspectRatio = "auto" },
				"empty":      func(r *GenerationRequest) { r.Prompt = "" },
				"spaces":     func(r *GenerationRequest) { r.Prompt = "   " },
				"long-Han":   func(r *GenerationRequest) { r.Prompt = strings.Repeat("文", 2501) },
				"long-Latin": func(r *GenerationRequest) { r.Prompt = strings.Repeat("a", 5001) },
				"overrides": func(r *GenerationRequest) {
					r.ProviderOptions = map[string]map[string]any{"dashscope-happyhorse-text-video": {"prompt": "replacement"}}
				},
			} {
				t.Run(label, func(t *testing.T) {
					r := happyHorseTextRequest()
					change(&r)
					if _, err := a.BuildCreate(context.Background(), RequestContext{Request: r}); err == nil {
						t.Fatal("invalid request accepted")
					}
				})
			}
		})
	}
}

func TestHappyHorseTextStatesAndNoEarlyResult(t *testing.T) {
	for name, a := range happyHorseTextAdapters(t) {
		t.Run(name, func(t *testing.T) {
			ctx := context.Background()
			pc := PollContext{TaskID: "task-1", Request: happyHorseTextRequest()}
			for _, state := range []string{"PENDING", "RUNNING", "SUCCEEDED", "FAILED", "CANCELED", "UNKNOWN", "mystery"} {
				raw, _ := json.Marshal(map[string]any{"output": map[string]any{"task_id": "task-1", "task_status": state, "video_url": "https://example.com/result.mp4"}})
				got, err := a.ParsePoll(ctx, pc, raw)
				if err != nil {
					t.Fatal(err)
				}
				expected := map[string]Status{"PENDING": StatusPending, "RUNNING": StatusProcessing, "SUCCEEDED": StatusSucceeded, "FAILED": StatusFailed, "CANCELED": StatusCancelled, "UNKNOWN": StatusFailed, "mystery": StatusFailed}[state]
				if got.Status != expected {
					t.Fatalf("%s became %s", state, got.Status)
				}
				if state != "SUCCEEDED" && got.Result != nil && len(got.Result.Videos) > 0 {
					t.Fatal("early URL escaped")
				}
			}
			for _, raw := range []string{`{"output":{"task_id":"other","task_status":"SUCCEEDED","video_url":"https://example.com/result.mp4"}}`, `{"output":{"task_id":"task-1","task_status":"SUCCEEDED"}}`, `{"output":{"task_id":"task-1","task_status":"SUCCEEDED","video_url":"https://example.com/result.mp4"},"code":"Error"}`} {
				got, err := a.ParsePoll(ctx, pc, []byte(raw))
				if err == nil && got.Status != StatusFailed {
					t.Fatal("invalid success accepted")
				}
			}
		})
	}
}
