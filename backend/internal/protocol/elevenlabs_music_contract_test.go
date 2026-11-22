package protocol

import (
	"context"
	"encoding/json"
	"testing"
)

func TestElevenLabsMusicContract(t *testing.T) {
	adapter := officialPackageAdapter(t, "elevenlabs-music.yingce-plugin", "elevenlabs-music")
	request := GenerationRequest{Capability: CapabilityAudio, Model: "music_v2_5", Prompt: "Rainy night, sparse piano and strings", ProviderOptions: map[string]map[string]any{"elevenlabs-music": {"music_length_ms": 60000, "force_instrumental": true}}}
	spec, err := adapter.BuildCreate(context.Background(), RequestContext{Request: request})
	if err != nil {
		t.Fatal(err)
	}
	if spec.Path != "/v1/music" || spec.Auth.Header != "xi-api-key" || spec.Method != "POST" {
		t.Fatalf("wrong request contract: %#v", spec)
	}
	raw, _ := json.Marshal(spec.Body)
	var body map[string]any
	if err := json.Unmarshal(raw, &body); err != nil {
		t.Fatal(err)
	}
	if body["music_length_ms"] != float64(60000) || body["force_instrumental"] != true || body["model_id"] != request.Model || body["prompt"] != request.Prompt {
		t.Fatalf("music parameters lost: %s", raw)
	}
	if _, exists := body["voice"]; exists {
		t.Fatal("music replaced by TTS")
	}
	for _, duration := range []any{2999, 600001, 6000.5} {
		request.ProviderOptions["elevenlabs-music"]["music_length_ms"] = duration
		if _, err := adapter.BuildCreate(context.Background(), RequestContext{Request: request}); err == nil {
			t.Fatalf("invalid duration accepted: %v", duration)
		}
	}
	delete(request.ProviderOptions["elevenlabs-music"], "music_length_ms")
	if _, err := adapter.BuildCreate(context.Background(), RequestContext{Request: request}); err != nil {
		t.Fatalf("automatic duration: %v", err)
	}
	request.Audios = []MediaReference{{URL: "https://example.test/reference.mp3"}}
	if _, err := adapter.BuildCreate(context.Background(), RequestContext{Request: request}); err == nil {
		t.Fatal("reference silently ignored")
	}
	request.Audios = nil
	request.Model = "vocal-music"
	if _, err := adapter.BuildCreate(context.Background(), RequestContext{Request: request}); err == nil {
		t.Fatal("source alias silently accepted as provider model")
	}
	result, err := adapter.ParseCreate(context.Background(), append([]byte("ID3"), make([]byte, 100)...))
	if err != nil || result.Result == nil || len(result.Result.Audios) != 1 || result.Status != StatusSucceeded {
		t.Fatalf("binary audio result: %#v %v", result, err)
	}
	if _, err := adapter.ParseCreate(context.Background(), nil); err == nil {
		t.Fatal("empty audio accepted")
	}
}
