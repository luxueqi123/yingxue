package protocol

import (
	"bytes"
	"context"
	"os"
	"strings"
	"testing"
)

func elevenV3Adapters(t *testing.T) map[string]Adapter {
	t.Helper()
	source, err := os.ReadFile("../../../plugin-packages/elevenlabs-v3-audio/manifest.json")
	if err != nil {
		t.Fatal(err)
	}
	archive, err := os.ReadFile("../../../plugin-packages/elevenlabs-v3-audio.yingce-plugin")
	if err != nil {
		t.Fatal(err)
	}
	pkg, err := ParsePluginPackage(archive)
	if err != nil {
		t.Fatal(err)
	}
	if !bytes.Equal(source, pkg.ManifestRaw) {
		t.Fatal("source/package mismatch")
	}
	result := map[string]Adapter{}
	for name, raw := range map[string][]byte{"source": source, "package": pkg.ManifestRaw} {
		providers, err := LoadInstalledProviders(raw, nil)
		if err != nil || len(providers) != 1 {
			t.Fatalf("load: %v", err)
		}
		result[name] = providers[0]
	}
	return result
}
func elevenV3Request() GenerationRequest {
	return GenerationRequest{Capability: CapabilityAudio, Model: "eleven_v3", Prompt: "[excited] 原配音！", Extra: map[string]any{"audioVoice": "vZZLclMx4wouUtKBRfZn", "audioSpeed": "1", "audioFormat": "mp3", "count": "1"}, ProviderOptions: map[string]map[string]any{"elevenlabs-v3-audio": {"stability": 0.5}}}
}
func TestElevenV3ExactVoiceAndStability(t *testing.T) {
	for name, a := range elevenV3Adapters(t) {
		t.Run(name, func(t *testing.T) {
			for _, stability := range []float64{0, 0.5, 1} {
				r := elevenV3Request()
				r.ProviderOptions["elevenlabs-v3-audio"]["stability"] = stability
				spec, err := a.BuildCreate(context.Background(), RequestContext{Request: r})
				if err != nil {
					t.Fatal(err)
				}
				b := manifestTestBody(t, spec)
				if spec.Path != "/v1/text-to-speech/vZZLclMx4wouUtKBRfZn" || !spec.OriginPath || spec.Auth.Header != "xi-api-key" || b["model_id"] != "eleven_v3" || b["text"] != r.Prompt || b["voice_settings"].(map[string]any)["stability"] != stability || len(b) != 3 {
					t.Fatalf("changed voice: %#v %#v", spec, b)
				}
			}
		})
	}
}
func TestElevenV3RejectsLossyOrUnsafeFields(t *testing.T) {
	changes := map[string]func(*GenerationRequest){
		"version": func(r *GenerationRequest) { r.Model = "eleven_v4" }, "empty": func(r *GenerationRequest) { r.Prompt = " " }, "long": func(r *GenerationRequest) { r.Prompt = strings.Repeat("文", 5001) },
		"voice": func(r *GenerationRequest) { r.Extra["audioVoice"] = "" }, "voice-path": func(r *GenerationRequest) { r.Extra["audioVoice"] = "../../test?query=here" },
		"stability": func(r *GenerationRequest) { r.ProviderOptions["elevenlabs-v3-audio"]["stability"] = 0.25 }, "missing-stability": func(r *GenerationRequest) { delete(r.ProviderOptions, "elevenlabs-v3-audio") },
		"speed": func(r *GenerationRequest) { r.Extra["audioSpeed"] = "2" }, "format": func(r *GenerationRequest) { r.Extra["audioFormat"] = "wav" }, "count": func(r *GenerationRequest) { r.Extra["count"] = "2" },
		"audio": func(r *GenerationRequest) { r.Audios = []MediaReference{{URL: "https://example.com/ref.mp3"}} }, "instructions": func(r *GenerationRequest) { r.Extra["audioInstructions"] = "alter voice" },
	}
	for name, a := range elevenV3Adapters(t) {
		for change, mutate := range changes {
			t.Run(name+"/"+change, func(t *testing.T) {
				r := elevenV3Request()
				mutate(&r)
				if _, err := a.BuildCreate(context.Background(), RequestContext{Request: r}); err == nil {
					t.Fatal("invalid fields accepted")
				}
			})
		}
	}
}

func TestBinaryPayloadRejectsTextDisguisedAsMedia(t *testing.T) {
	for _, kind := range []string{"audio", "image", "video"} {
		for _, body := range []string{`{"detail":{"status":"voice_not_found"}}`, "<html><body>upstream error</body></html>", "Service unavailable", "[1,2,3]"} {
			if _, err := binaryPayloadCreateResult(kind, []byte(body)); err == nil {
				t.Fatalf("accepted text as %s: %s", kind, body)
			}
		}
	}
}
