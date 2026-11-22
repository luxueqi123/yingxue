package app

import "testing"

func TestGeminiAutoAspectKeepsResolutionWithoutSearch(t *testing.T) {
	for _, size := range []string{"auto", "16:9"} {
		t.Run(size, func(t *testing.T) {
			input := canvasGenerationInput{Mode: "image", Prompt: "keep composition", Config: providerConfig{
				InterfaceType: "gemini-image", Model: "gemini-3-pro-image-preview", Size: size, Quality: "medium",
			}, ReferenceImages: []providerMedia{{DataURL: testGeminiReferenceImageDataURL}}}
			body := officialVideoCreateBody(t, input)
			generation, _ := body["generationConfig"].(map[string]any)
			image, _ := generation["imageConfig"].(map[string]any)
			if image["imageSize"] != "2K" {
				t.Fatalf("resolution changed: %#v", image)
			}
			if size == "auto" {
				if _, exists := image["aspectRatio"]; exists {
					t.Fatalf("automatic aspect must be omitted, got %#v", image["aspectRatio"])
				}
			} else if image["aspectRatio"] != size {
				t.Fatalf("explicit aspect lost: %#v", image)
			}
			if _, exists := body["tools"]; exists {
				t.Fatal("plain image generation must not enable search")
			}
			legacy := geminiImageConfigFor(input.Config)
			if legacy.ImageSize != "2K" || (size == "auto" && legacy.AspectRatio != "") || (size != "auto" && legacy.AspectRatio != size) {
				t.Fatalf("built-in and declarative paths disagree: %#v", legacy)
			}
			request := protocolRequestFromInput(input)
			if len(request.Images) != 1 || request.Prompt != input.Prompt || request.Model != input.Config.Model {
				t.Fatal("reference, prompt or selected model changed")
			}
		})
	}
}
