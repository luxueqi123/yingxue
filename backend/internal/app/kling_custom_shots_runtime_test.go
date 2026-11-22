package app

import (
	"context"
	"encoding/json"
	"testing"

	"infinite-canvas/backend/internal/protocol"
)

func TestKlingBundledRuntimeLoadsCustomShots(t *testing.T) {
	center, err := newPluginRuntime(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	for _, id := range []string{"kling-omni-video", "kling-v3-video"} {
		plugin, exists := runtimePluginByID(center.list(), id)
		if !exists || plugin.Manifest.Version != "2.1.0" || plugin.Status != "enabled" {
			t.Fatalf("unexpected bundled runtime %s: version=%s status=%s", id, plugin.Manifest.Version, plugin.Status)
		}
		adapter, exists := center.registrySnapshot().Resolve(id)
		if !exists {
			t.Fatalf("%s provider missing", id)
		}
		model := "kling-v3"
		if id == "kling-omni-video" {
			model = "kling-v3-omni"
		}
		spec, err := adapter.BuildCreate(context.Background(), protocol.RequestContext{Request: protocol.GenerationRequest{
			Capability: protocol.CapabilityVideo, Model: model, Prompt: "保持角色一致", Duration: 5, Resolution: "1080p", AspectRatio: "16:9",
			ProviderOptions: map[string]map[string]any{id: {"mode": "pro", "multiShot": true, "multiPrompt": []any{map[string]any{"index": 1, "prompt": "推近", "duration": "5"}}}},
		}})
		if err != nil {
			t.Fatal(err)
		}
		data, err := json.Marshal(spec.Body)
		if err != nil {
			t.Fatal(err)
		}
		var body map[string]any
		if err := json.Unmarshal(data, &body); err != nil {
			t.Fatal(err)
		}
		if body["shot_type"] != "customize" || len(body["multi_prompt"].([]any)) != 1 {
			t.Fatalf("%s runtime dropped custom shots", id)
		}
	}
}
