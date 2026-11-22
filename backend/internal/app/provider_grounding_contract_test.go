package app

import (
	"context"
	"infinite-canvas/backend/internal/protocol"
	"testing"
)

func TestImageGroundingInputAndResult(t *testing.T) {
	input := canvasGenerationInput{Mode: "image", Prompt: "weather", Config: providerConfig{Model: "gemini-3-pro-image-preview"}, Metadata: map[string]interface{}{"providerOptions": map[string]interface{}{"gemini-image": map[string]interface{}{"googleSearch": true}}}}
	request := protocolRequestFromInput(input)
	if request.ProviderOptions["gemini-image"]["googleSearch"] != true {
		t.Fatal("search option lost between task and protocol")
	}
	result, err := finishProtocolResult(context.Background(), input.Config, "image", "task-grounding", &protocol.Result{Images: []protocol.MediaReference{{DataURL: "data:image/png;base64,AA=="}}, GroundingMetadata: map[string]any{"searchEntryPoint": map[string]any{"renderedContent": "<p>Google</p>"}}}, videoPollPolicy{})
	if err != nil {
		t.Fatal(err)
	}
	if result["groundingMetadata"] == nil || result["images"] == nil {
		t.Fatal("attribution lost before task persistence")
	}
}
