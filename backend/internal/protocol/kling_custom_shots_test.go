package protocol

import (
	"context"
	"testing"
)

func TestKlingCustomShotsPreservePayloadAndRejectInvalidContracts(t *testing.T) {
	for _, id := range []string{"kling-v3-video", "kling-omni-video"} {
		t.Run(id, func(t *testing.T) {
			adapter := officialPackageAdapter(t, id+".yingce-plugin", id)
			model := "kling-v3"
			if id == "kling-omni-video" {
				model = "kling-v3-omni"
			}
			shots := []any{map[string]any{"index": 1, "prompt": "push in", "duration": "2"}, map[string]any{"index": 2, "prompt": "pull back", "duration": "3"}}
			for _, switchValue := range []any{nil, false, true, "true"} {
				options := map[string]any{"mode": "pro"}
				if switchValue != nil {
					options["multiShot"] = switchValue
				}
				_, err := adapter.BuildCreate(context.Background(), RequestContext{Request: GenerationRequest{
					Capability: CapabilityVideo, Model: model, Prompt: "story", Duration: 5, Resolution: "1080p", AspectRatio: "16:9",
					ProviderOptions: map[string]map[string]any{id: options},
				}})
				if (err != nil) != (switchValue == "true") {
					t.Fatalf("multiShot %v validation: %v", switchValue, err)
				}
			}
			build := func(value any, enabled bool) (RequestSpec, error) {
				return adapter.BuildCreate(context.Background(), RequestContext{Request: GenerationRequest{
					Capability: CapabilityVideo, Model: model, Prompt: "story", Duration: 5, Resolution: "1080p", AspectRatio: "16:9",
					ProviderOptions: map[string]map[string]any{id: {"mode": "pro", "multiShot": enabled, "multiPrompt": value}},
				}})
			}
			spec, err := build(shots, true)
			if err != nil {
				t.Fatal(err)
			}
			body := manifestTestBody(t, spec)
			if body["shot_type"] != "customize" || body["multi_shot"] != true {
				t.Fatalf("custom mode lost: %#v", body)
			}
			got := body["multi_prompt"].([]any)
			if len(got) != 2 || got[0].(map[string]any)["prompt"] != "push in" || got[1].(map[string]any)["duration"] != "3" {
				t.Fatalf("custom shots lost: %#v", got)
			}
			for _, value := range []any{
				"not-an-array", map[string]any{},
				[]any{map[string]any{"index": 2, "prompt": "wrong order", "duration": "5"}},
				[]any{map[string]any{"index": 1, "prompt": " ", "duration": "5"}},
				[]any{map[string]any{"index": 1, "prompt": "short total", "duration": "4"}},
				[]any{map[string]any{"index": 1, "prompt": "decimal", "duration": "5.5"}},
				[]any{map[string]any{"index": 1, "prompt": "unknown field", "duration": "5", "discardMe": true}},
				[]any{map[string]any{"index": 1, "prompt": 123, "duration": "5"}},
			} {
				if _, err := build(value, true); err == nil {
					t.Fatalf("invalid custom shots accepted: %#v", value)
				}
			}
			if _, err := build(shots, false); err == nil {
				t.Fatal("custom shots silently ignored with disabled multiShot")
			}
			spec, err = build([]any{}, true)
			if err != nil {
				t.Fatal(err)
			}
			body = manifestTestBody(t, spec)
			if body["shot_type"] != "intelligence" {
				t.Fatal("intelligent storyboard regressed")
			}
			if _, exists := body["multi_prompt"]; exists {
				t.Fatal("empty custom shots emitted")
			}
		})
	}
}
