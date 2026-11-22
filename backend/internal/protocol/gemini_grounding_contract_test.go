package protocol

import (
	"context"
	"testing"
)

func TestGeminiImageGroundingContract(t *testing.T) {
	adapter := officialPackageAdapter(t, "google-gemini-image.yingce-plugin", "gemini-image")
	request := GenerationRequest{Capability: CapabilityImage, Model: "gemini-3-pro-image-preview", Prompt: "current weather", AspectRatio: "16:9", Quality: "medium"}
	build := func() map[string]any {
		spec, err := adapter.BuildCreate(context.Background(), RequestContext{Request: request})
		if err != nil {
			t.Fatal(err)
		}
		return manifestTestBody(t, spec)
	}
	if _, found := build()["tools"]; found {
		t.Fatal("search must be opt in")
	}
	request.ProviderOptions = map[string]map[string]any{"gemini-image": {"googleSearch": true}}
	body := build()
	tools, ok := body["tools"].([]any)
	if !ok || len(tools) != 1 {
		t.Fatalf("search tool missing: %#v", body)
	}
	if _, ok := tools[0].(map[string]any)["googleSearch"]; !ok {
		t.Fatal("wrong search tool")
	}
	image := body["generationConfig"].(map[string]any)["imageConfig"].(map[string]any)
	if image["aspectRatio"] != "16:9" || image["imageSize"] != "2K" {
		t.Fatalf("image options changed: %#v", image)
	}
	result, err := adapter.ParseCreate(context.Background(), []byte(`{"candidates":[{"content":{"parts":[{"inlineData":{"mimeType":"image/png","data":"AA=="}}]},"groundingMetadata":{"searchEntryPoint":{"renderedContent":"<p>Google</p>"},"groundingChunks":[{"web":{"uri":"https://example.test/weather","title":"Weather"}}]}}]}`))
	if err != nil {
		t.Fatal(err)
	}
	if result.Result == nil || len(result.Result.Images) != 1 || result.Result.GroundingMetadata["searchEntryPoint"] == nil {
		t.Fatalf("image or attribution lost: %#v", result)
	}
}
