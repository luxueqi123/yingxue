package app

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"infinite-canvas/backend/internal/protocol"
)

func TestHappyHorseProviderValidatesEffectivePromptAfterHostConversion(t *testing.T) {
	data, err := os.ReadFile(filepath.Join("..", "..", "..", "plugin-packages", "dashscope-happyhorse-reference-video.yingce-plugin"))
	if err != nil {
		t.Fatal(err)
	}
	pkg, err := protocol.ParsePluginPackage(data)
	if err != nil {
		t.Fatal(err)
	}
	adapters, err := protocol.LoadInstalledProviders(pkg.ManifestRaw, nil)
	if err != nil || len(adapters) != 1 {
		t.Fatalf("load: %v", err)
	}
	for _, length := range []int{2500, 2501} {
		t.Run(fmt.Sprint(length), func(t *testing.T) {
			prompt := strings.Repeat("拍", length)
			input := canvasGenerationInput{Mode: "video", Prompt: "short", Config: providerConfig{
				Model: "happyhorse-1.1-r2v", Size: "4:3", VQuality: "720P", VideoSeconds: "7", Count: "1",
			}, ReferenceImages: []providerMedia{{URL: "https://example.com/a.png"}}, Metadata: map[string]any{
				"videoEditOperation": "reference_to_video", "providerOptions": map[string]any{"dashscope-happyhorse-reference-video": map[string]any{"prompt": prompt}},
			}}
			spec, err := adapters[0].BuildCreate(context.Background(), protocol.RequestContext{Request: protocolRequestFromInput(input)})
			if length > 2500 {
				if err == nil {
					t.Fatal("host conversion bypassed effective-prompt limit")
				}
				return
			}
			if err != nil {
				t.Fatal(err)
			}
			encoded, _ := json.Marshal(spec.Body)
			var body map[string]any
			if err := json.Unmarshal(encoded, &body); err != nil {
				t.Fatal(err)
			}
			if body["input"].(map[string]any)["prompt"] != prompt {
				t.Fatal("host changed boundary prompt")
			}
		})
	}
}

func TestHappyHorseProviderConsumesActualHostVideoRequest(t *testing.T) {
	input := canvasGenerationInput{Mode: "video", Prompt: "切到@图片2，再@图片1", Config: providerConfig{
		Model: "happyhorse-1.1-r2v", Size: "4:3", VQuality: "720P", VideoSeconds: "7", Count: "1", Quality: "high", VideoGenerateAudio: "false",
	}, ReferenceImages: []providerMedia{{URL: "https://example.com/a.png"}, {URL: "https://example.com/b.png"}}, Metadata: map[string]any{
		"videoEditOperation": "reference_to_video", "providerOptions": map[string]any{"dashscope-happyhorse-reference-video": map[string]any{"prompt": "切到[Image 2]，再[Image 1]", "seed": 2147483647}},
	}}
	request := protocolRequestFromInput(input)
	data, err := os.ReadFile(filepath.Join("..", "..", "..", "plugin-packages", "dashscope-happyhorse-reference-video.yingce-plugin"))
	if err != nil {
		t.Fatal(err)
	}
	pkg, err := protocol.ParsePluginPackage(data)
	if err != nil {
		t.Fatal(err)
	}
	adapters, err := protocol.LoadInstalledProviders(pkg.ManifestRaw, nil)
	if err != nil || len(adapters) != 1 {
		t.Fatalf("load: %v", err)
	}
	spec, err := adapters[0].BuildCreate(context.Background(), protocol.RequestContext{Request: request})
	if err != nil {
		t.Fatal(err)
	}
	bodyBytes, _ := json.Marshal(spec.Body)
	var body map[string]any
	if err := json.Unmarshal(bodyBytes, &body); err != nil {
		t.Fatal(err)
	}
	media := body["input"].(map[string]any)["media"].([]any)
	parameters := body["parameters"].(map[string]any)
	if body["input"].(map[string]any)["prompt"] != "切到[Image 2]，再[Image 1]" || len(media) != 2 || media[0].(map[string]any)["url"] != input.ReferenceImages[0].URL || parameters["duration"] != float64(7) || parameters["ratio"] != "4:3" || parameters["resolution"] != "720P" {
		t.Fatalf("host request changed: %s", bodyBytes)
	}
	if _, ok := parameters["quality"]; ok {
		t.Fatal("image UI quality leaked into video wire protocol")
	}
	if parameters["seed"] != float64(2147483647) {
		t.Fatalf("host changed the valid seed: %s", bodyBytes)
	}
}
