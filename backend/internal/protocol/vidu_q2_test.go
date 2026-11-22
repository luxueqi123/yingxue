package protocol

import (
	"context"
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
)

func viduQ2Adapters(t *testing.T) map[string]Adapter {
	t.Helper()
	root := filepath.Join("..", "..", "..", "plugin-packages")
	id := "vidu-q2-pro-video"
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

func viduQ2Request() GenerationRequest {
	r := hailuo02Request()
	r.Model = "viduq2-pro"
	r.Resolution = "1080p"
	r.Duration = 8
	return r
}

func TestViduQ2RolesRoutesAndBody(t *testing.T) {
	for name, a := range viduQ2Adapters(t) {
		t.Run(name, func(t *testing.T) {
			for _, single := range []bool{false, true} {
				r := viduQ2Request()
				path := "/ent/v2/start-end2video"
				if single {
					r.Images = r.Images[1:]
					r.Duration = 10
					path = "/ent/v2/img2video"
				}
				spec, err := a.BuildCreate(context.Background(), RequestContext{Request: r})
				if err != nil {
					t.Fatal(err)
				}
				raw, _ := json.Marshal(spec.Body)
				var body map[string]any
				_ = json.Unmarshal(raw, &body)
				images := body["images"].([]any)
				if spec.Path != path || body["model"] != "viduq2-pro" || images[0] != "https://example.com/original.png" || len(images) != len(r.Images) || body["is_rec"] != false || body["bgm"] != false || body["prompt"] != r.Prompt {
					t.Fatalf("changed source: %s %s", spec.Path, raw)
				}
				if single {
					if body["audio"] != false {
						t.Fatal("single-frame silent policy lost")
					}
				} else {
					if images[1] != "https://example.com/last.png" {
						t.Fatal("reversed frames")
					}
					if _, ok := body["audio"]; ok {
						t.Fatal("Q3-only frame audio field leaked")
					}
				}
			}
			for name, change := range map[string]func(*GenerationRequest){
				"model": func(r *GenerationRequest) { r.Model = "viduq3-pro" }, "nine-second-frames": func(r *GenerationRequest) { r.Duration = 9 },
				"duplicate-role": func(r *GenerationRequest) { r.Images[0].Role = "first_frame" }, "sound": func(r *GenerationRequest) { r.GenerateAudio = true },
				"fixed-ratio": func(r *GenerationRequest) { r.AspectRatio = "16:9" }, "extra-options": func(r *GenerationRequest) {
					r.ProviderOptions = map[string]map[string]any{"vidu-q2-pro-video": {"style": "general"}}
				},
			} {
				t.Run(name, func(t *testing.T) {
					r := viduQ2Request()
					change(&r)
					if _, err := a.BuildCreate(context.Background(), RequestContext{Request: r}); err == nil {
						t.Fatal("invalid request accepted")
					}
				})
			}
		})
	}
}

func TestViduQ2CreationAndResultStates(t *testing.T) {
	for name, a := range viduQ2Adapters(t) {
		t.Run(name, func(t *testing.T) {
			ctx := context.Background()
			pc := PollContext{TaskID: "task-1", Request: viduQ2Request()}
			got, err := a.ParseCreate(ctx, []byte(`{"task_id":"task-1","state":"created"}`))
			if err != nil || got.TaskID != "task-1" || got.Status != StatusPending {
				t.Fatalf("create: %#v %v", got, err)
			}
			for _, state := range []string{"created", "queueing", "processing", "success", "failed", "mystery"} {
				raw, _ := json.Marshal(map[string]any{"state": state, "creations": []any{map[string]any{"url": "https://example.com/video.mp4"}}})
				got, err := a.ParsePoll(ctx, pc, raw)
				if err != nil {
					t.Fatal(err)
				}
				want := map[string]Status{"created": StatusPending, "queueing": StatusPending, "processing": StatusProcessing, "success": StatusSucceeded, "failed": StatusFailed, "mystery": StatusFailed}[state]
				if got.Status != want {
					t.Fatalf("%s became %s", state, got.Status)
				}
				if state != "success" && got.Result != nil && len(got.Result.Videos) > 0 {
					t.Fatal("early result exposed")
				}
			}
			for _, raw := range []string{`{"state":"success","creations":[]}`, `{"state":"success","creations":[{"cover_url":"https://example.com/cover.png"}]}`, `{"state":"success","err_code":"failed","creations":[{"url":"https://example.com/v.mp4"}]}`, `{"task_id":"other","state":"success","creations":[{"url":"https://example.com/v.mp4"}]}`} {
				got, err := a.ParsePoll(ctx, pc, []byte(raw))
				if err == nil && got.Status != StatusFailed {
					t.Fatal("invalid success accepted")
				}
			}
		})
	}
}
