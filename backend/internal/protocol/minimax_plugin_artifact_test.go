package protocol

import (
	"context"
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
)

func miniMaxV2PackageAdapters(t *testing.T) map[string]Adapter {
	t.Helper()
	root := filepath.Join("..", "..", "..", "plugin-packages")
	source, err := os.ReadFile(filepath.Join(root, "minimax-hailuo-video-v2", "manifest.json"))
	if err != nil {
		t.Fatal(err)
	}
	archive, err := os.ReadFile(filepath.Join(root, "minimax-hailuo-video-v2.yingce-plugin"))
	if err != nil {
		t.Fatal(err)
	}
	pkg, err := ParsePluginPackage(archive)
	if err != nil {
		t.Fatal(err)
	}
	adapters := make(map[string]Adapter)
	for name, data := range map[string][]byte{"source": source, "package": pkg.ManifestRaw} {
		loaded, err := LoadInstalledProviders(data, nil)
		if err != nil {
			t.Fatal(err)
		}
		for _, adapter := range loaded {
			if adapter.Metadata().ID == "minimax-video" {
				adapters[name] = adapter
			}
		}
	}
	if len(adapters) != 2 {
		t.Fatalf("native V2 provider missing: %d", len(adapters))
	}
	return adapters
}

func TestMiniMaxV2PluginRejectsUnsupportedModelOptions(t *testing.T) {
	for origin, adapter := range miniMaxV2PackageAdapters(t) {
		for _, tc := range []struct {
			name, model, resolution string
			duration                int
		}{
			{"durationTooShort", "MiniMax-H3", "768P", 3},
			{"durationTooLong", "MiniMax-H3", "2K", 31},
		} {
			t.Run(origin+"/"+tc.name, func(t *testing.T) {
				_, err := adapter.BuildCreate(context.Background(), RequestContext{Request: GenerationRequest{
					Capability: CapabilityVideo, Model: tc.model, Prompt: "preserve original request",
					Resolution: tc.resolution, Duration: tc.duration, AspectRatio: "16:9",
				}})
				if err == nil {
					t.Fatal("unsupported native V2 request was admitted")
				}
			})
		}
	}
}

func TestMiniMaxV2PluginRejectsExcessReferences(t *testing.T) {
	for origin, adapter := range miniMaxV2PackageAdapters(t) {
		for _, kind := range []string{"image", "video", "audio"} {
			t.Run(origin+"/"+kind, func(t *testing.T) {
				request := GenerationRequest{Capability: CapabilityVideo, Model: "MiniMax-H3", Prompt: "scene", Duration: 6, Resolution: "768P"}
				refs := make([]MediaReference, 4)
				for index := range refs {
					refs[index] = MediaReference{URL: "https://cdn.example/reference", Kind: kind}
				}
				switch kind {
				case "image":
					request.Images = append(refs, refs...)
					request.Images = append(request.Images, refs...)
				case "video":
					request.Videos = refs
				case "audio":
					request.Audios = refs
				}
				if _, err := adapter.BuildCreate(context.Background(), RequestContext{Request: request}); err == nil {
					t.Fatal("provider accepted references beyond its declared limits")
				}
			})
		}
	}
}

func TestMiniMaxV2PluginPreservesSupportedModelOptions(t *testing.T) {
	for origin, adapter := range miniMaxV2PackageAdapters(t) {
		for _, tc := range []struct {
			model, resolution string
			duration          int
		}{
			{"MiniMax-H3", "768P", 4}, {"MiniMax-H3", "2K", 15},
			{"MiniMax-H3-Max", "480P", 5}, {"MiniMax-H3-Max", "768P", 15},
		} {
			t.Run(origin+"/"+tc.model+"/"+tc.resolution, func(t *testing.T) {
				spec, err := adapter.BuildCreate(context.Background(), RequestContext{Request: GenerationRequest{
					Capability: CapabilityVideo, Model: tc.model, Prompt: "preserve original request",
					Resolution: tc.resolution, Duration: tc.duration, AspectRatio: "16:9",
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
				if spec.Path != "/v2/video_generation" || body["model"] != tc.model || body["resolution"] != tc.resolution || body["duration"] != float64(tc.duration) {
					t.Fatalf("model options changed: %#v", body)
				}
			})
		}
	}
}
