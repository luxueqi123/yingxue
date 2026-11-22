package protocol

import (
	"context"
	"encoding/json"
	"os"
	"strings"
	"testing"
)

func speech28Adapters(t *testing.T) map[string]Adapter {
	t.Helper()
	source, err := os.ReadFile("../../../plugin-packages/minimax-speech28-audio/manifest.json")
	if err != nil {
		t.Fatal(err)
	}
	archive, err := os.ReadFile("../../../plugin-packages/minimax-speech28-audio.yingce-plugin")
	if err != nil {
		t.Fatal(err)
	}
	pkg, err := ParsePluginPackage(archive)
	if err != nil {
		t.Fatal(err)
	}
	adapters := map[string]Adapter{}
	for name, raw := range map[string][]byte{"source": source, "package": pkg.ManifestRaw} {
		loaded, err := LoadInstalledProviders(raw, nil)
		if err != nil || len(loaded) != 1 {
			t.Fatalf("load %s: %v", name, err)
		}
		adapters[name] = loaded[0]
	}
	return adapters
}
func speech28Request() GenerationRequest {
	return GenerationRequest{Capability: CapabilityAudio, Model: "speech-2.8-hd", Prompt: "你好，保留原文。", Extra: map[string]any{"audioVoice": "female-shaonv", "audioSpeed": "1", "audioFormat": "mp3"}, ProviderOptions: map[string]map[string]any{"minimax-speech28-audio": {"volume": 2.0, "pitch": -3, "modifyPitch": 0, "intensity": 0, "timbre": -10, "soundEffects": "robotic"}}}
}
func TestSpeech28ExactControls(t *testing.T) {
	for name, a := range speech28Adapters(t) {
		t.Run(name, func(t *testing.T) {
			req := speech28Request()
			spec, err := a.BuildCreate(context.Background(), RequestContext{Request: req})
			if err != nil {
				t.Fatal(err)
			}
			body := manifestTestBody(t, spec)
			if spec.Path != "/v1/t2a_v2" || !spec.OriginPath || body["text"] != req.Prompt || body["model"] != "speech-2.8-hd" || body["stream"] != false || body["output_format"] != "url" {
				t.Fatalf("wrong body: %#v", body)
			}
			voice := body["voice_setting"].(map[string]any)
			modify := body["voice_modify"].(map[string]any)
			if voice["voice_id"] != "female-shaonv" || voice["speed"] != float64(1) || voice["vol"] != float64(2) || voice["pitch"] != float64(-3) || modify["timbre"] != float64(-10) || modify["sound_effects"] != "robotic" || modify["pitch"] != float64(0) {
				t.Fatalf("voice controls changed: %#v", body)
			}
			req.ProviderOptions["minimax-speech28-audio"]["soundEffects"] = ""
			spec, err = a.BuildCreate(context.Background(), RequestContext{Request: req})
			if err != nil {
				t.Fatal(err)
			}
			neutral := manifestTestBody(t, spec)["voice_modify"].(map[string]any)
			if _, exists := neutral["sound_effects"]; exists {
				t.Fatal("empty effect must be omitted")
			}
		})
	}
}
func TestSpeech28RejectsLossyOrUnsupportedRequests(t *testing.T) {
	changes := map[string]func(*GenerationRequest){
		"different-model": func(r *GenerationRequest) { r.Model = "tts-1" },
		"empty":           func(r *GenerationRequest) { r.Prompt = "  " },
		"too-long":        func(r *GenerationRequest) { r.Prompt = strings.Repeat("文", 10000) },
		"references":      func(r *GenerationRequest) { r.Images = []MediaReference{{URL: "https://example.com/reference.png"}} },
		"format":          func(r *GenerationRequest) { r.Extra["audioFormat"] = "wav" },
		"speed":           func(r *GenerationRequest) { r.Extra["audioSpeed"] = "3" },
		"voice":           func(r *GenerationRequest) { r.Extra["audioVoice"] = "" },
		"pitch":           func(r *GenerationRequest) { r.ProviderOptions["minimax-speech28-audio"]["pitch"] = 0.5 },
		"volume":          func(r *GenerationRequest) { r.ProviderOptions["minimax-speech28-audio"]["volume"] = 0 },
		"effect":          func(r *GenerationRequest) { r.ProviderOptions["minimax-speech28-audio"]["soundEffects"] = "unknown" },
	}
	for name, a := range speech28Adapters(t) {
		for change, mutate := range changes {
			t.Run(name+"/"+change, func(t *testing.T) {
				r := speech28Request()
				mutate(&r)
				if _, err := a.BuildCreate(context.Background(), RequestContext{Request: r}); err == nil {
					t.Fatal("invalid request accepted")
				}
			})
		}
	}
}
func TestSpeech28OnlyCompletedAudioURL(t *testing.T) {
	for name, a := range speech28Adapters(t) {
		t.Run(name, func(t *testing.T) {
			for _, row := range []struct {
				code    any
				status  any
				audio   any
				success bool
			}{{0, 2, "https://example.com/original.mp3", true}, {1000, 2, "https://example.com/original.mp3", false}, {0, 1, "https://example.com/original.mp3", false}, {nil, 2, "https://example.com/original.mp3", false}, {0, nil, "https://example.com/original.mp3", false}, {0, 2, "deadbeef", false}, {0, 2, "", false}} {
				raw, _ := json.Marshal(map[string]any{"base_resp": map[string]any{"status_code": row.code}, "data": map[string]any{"status": row.status, "audio": row.audio}})
				result, err := a.ParseCreate(context.Background(), raw)
				if row.success {
					if err != nil || result.Status != StatusSucceeded || result.Result == nil || len(result.Result.Audios) != 1 || !result.Result.Audios[0].Ephemeral {
						t.Fatalf("lost success: %#v %v", result, err)
					}
				} else if err == nil && (result.Status != StatusFailed || (result.Result != nil && len(result.Result.Audios) > 0)) {
					t.Fatalf("false success: %#v", result)
				}
			}
		})
	}
}
