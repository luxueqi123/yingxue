package protocol

import (
	"context"
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
)

func hailuo02Adapters(t *testing.T) map[string]Adapter {
	t.Helper()
	root := filepath.Join("..", "..", "..", "plugin-packages")
	source, err := os.ReadFile(filepath.Join(root, "minimax-hailuo02-video", "manifest.json"))
	if err != nil {
		t.Fatal(err)
	}
	packed, err := os.ReadFile(filepath.Join(root, "minimax-hailuo02-video.yingce-plugin"))
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
		if loaded[0].Metadata().ID != "minimax-hailuo02-video" {
			t.Fatal("wrong identity")
		}
		out[name] = loaded[0]
	}
	return out
}

func hailuo02Request() GenerationRequest {
	r := miniMaxV1Request()
	r.Model = "MiniMax-Hailuo-02"
	r.Images = append([]MediaReference{{URL: "https://example.com/last.png", Role: "last_frame"}}, r.Images...)
	return r
}

func TestHailuo02RolesAndVersion(t *testing.T) {
	for origin, a := range hailuo02Adapters(t) {
		t.Run(origin, func(t *testing.T) {
			r := hailuo02Request()
			spec, err := a.BuildCreate(context.Background(), RequestContext{Request: r})
			if err != nil {
				t.Fatal(err)
			}
			raw, _ := json.Marshal(spec.Body)
			var body map[string]any
			_ = json.Unmarshal(raw, &body)
			if body["first_frame_image"] != r.Images[1].URL || body["last_frame_image"] != r.Images[0].URL || body["model"] != r.Model || body["prompt"] != r.Prompt || body["prompt_optimizer"] != false {
				t.Fatalf("role/model changed: %s", raw)
			}
			if spec.Path != "/v1/video_generation" {
				t.Fatal(spec.Path)
			}
			for name, change := range map[string]func(*GenerationRequest){
				"source-alias":         func(r *GenerationRequest) { r.Model = "MiniMax-Hailuo-o2" },
				"other-version":        func(r *GenerationRequest) { r.Model = "MiniMax-Hailuo-2.3" },
				"512-frames":           func(r *GenerationRequest) { r.Resolution = "512P" },
				"1080-ten":             func(r *GenerationRequest) { r.Duration = 10 },
				"unsupported-duration": func(r *GenerationRequest) { r.Duration = 7 },
				"duplicate-first":      func(r *GenerationRequest) { r.Images[0].Role = "first_frame" },
				"unlabelled":           func(r *GenerationRequest) { r.Images[0].Role = "reference_image" },
				"last-only":            func(r *GenerationRequest) { r.Images = r.Images[:1] },
				"no-images":            func(r *GenerationRequest) { r.Images = nil },
				"sound":                func(r *GenerationRequest) { r.GenerateAudio = true },
				"fixed-ratio":          func(r *GenerationRequest) { r.AspectRatio = "16:9" },
				"options": func(r *GenerationRequest) {
					r.ProviderOptions = map[string]map[string]any{"minimax-hailuo02-video": {"seed": 1}}
				},
			} {
				t.Run(name, func(t *testing.T) {
					r := hailuo02Request()
					change(&r)
					if _, err := a.BuildCreate(context.Background(), RequestContext{Request: r}); err == nil {
						t.Fatal("invalid request accepted")
					}
				})
			}
			r.Images = r.Images[1:]
			r.Resolution = "512P"
			r.Duration = 10
			spec, err = a.BuildCreate(context.Background(), RequestContext{Request: r})
			if err != nil {
				t.Fatal(err)
			}
			raw, _ = json.Marshal(spec.Body)
			body = map[string]any{}
			_ = json.Unmarshal(raw, &body)
			if _, ok := body["last_frame_image"]; ok {
				t.Fatal("single frame acquired last frame")
			}
		})
	}
}

func TestHailuo02FileResultBinding(t *testing.T) {
	for origin, a := range hailuo02Adapters(t) {
		t.Run(origin, func(t *testing.T) {
			ctx := context.Background()
			pc := PollContext{TaskID: "task-1", Model: "MiniMax-Hailuo-02", Request: hailuo02Request()}
			result, err := a.ParsePoll(ctx, pc, []byte(`{"task_id":"task-1","status":"Success","file_id":"file-2","base_resp":{"status_code":0}}`))
			if err != nil || result.Status != StatusSucceeded || result.Result == nil {
				t.Fatalf("poll: %#v %v", result, err)
			}
			pc.Metadata = result.Result.Metadata
			spec, err := a.(ResultAdapter).BuildResult(ctx, pc)
			if err != nil || spec.Query["file_id"][0] != "file-2" {
				t.Fatalf("file query: %#v %v", spec, err)
			}
			for _, raw := range []string{`{"file":{"file_id":"wrong","download_url":"https://example.com/v.mp4"}}`, `{"file":{"file_id":"file-2"}}`, `{"file":{"file_id":"file-2","download_url":"https://example.com/v.mp4"},"base_resp":{"status_code":1001}}`} {
				if _, err := a.(ResultResponseAdapter).ParseResult(ctx, pc, []byte(raw)); err == nil {
					t.Fatal("invalid file accepted")
				}
			}
			for _, raw := range []string{`{"task_id":"other","status":"Success","file_id":"file-2"}`, `{"task_id":"task-1","status":"Success"}`, `{"task_id":"task-1","status":"unknown"}`} {
				result, err := a.ParsePoll(ctx, pc, []byte(raw))
				if err == nil && result.Status != StatusFailed {
					t.Fatal("invalid poll accepted")
				}
			}
		})
	}
}
