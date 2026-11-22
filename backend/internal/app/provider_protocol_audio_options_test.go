package app

import "testing"

func TestProtocolRequestRetainsKlingOptions(t *testing.T) {
	request := protocolRequestFromInput(canvasGenerationInput{Mode: "video", Prompt: "完整分镜描述", Config: providerConfig{Model: "kling-v3-omni", VideoGenerateAudio: "false"}, Metadata: map[string]interface{}{"providerOptions": map[string]interface{}{"kling-omni-video": map[string]interface{}{"mode": "pro", "multiShot": false}}}})
	options := request.ProviderOptions["kling-omni-video"]
	if options["mode"] != "pro" || options["multiShot"] != false || request.GenerateAudio || request.Prompt != "完整分镜描述" {
		t.Fatalf("Kling parameters lost: %#v", request)
	}
}

func TestProtocolRequestRetainsVideoSearch(t *testing.T) {
	for _, enabled := range []bool{true, false} {
		request := protocolRequestFromInput(canvasGenerationInput{Mode: "video", Prompt: "story", Config: providerConfig{Model: "doubao-seedance-2-5-260628"}, Metadata: map[string]interface{}{"providerOptions": map[string]interface{}{"volcengine-ark-video": map[string]interface{}{"webSearch": enabled}}}})
		if value, ok := request.ProviderOptions["volcengine-ark-video"]["webSearch"]; !ok || value != enabled {
			t.Fatalf("search option lost: %#v", request.ProviderOptions)
		}
	}
}

func TestProtocolRequestRetainsAudioOptions(t *testing.T) {
	request := protocolRequestFromInput(canvasGenerationInput{Mode: "audio", Prompt: "旁白", Config: providerConfig{Model: "speech-model", AudioVoice: "voice-a", AudioFormat: "wav", AudioSpeed: "1.25", AudioInstructions: "克制平静"}})
	for key, want := range map[string]string{"audioVoice": "voice-a", "audioFormat": "wav", "audioSpeed": "1.25", "audioInstructions": "克制平静"} {
		if got := request.Extra[key]; got != want {
			t.Fatalf("%s = %v, want %s", key, got, want)
		}
	}
}

func TestProtocolRequestRetainsMusicOptions(t *testing.T) {
	request := protocolRequestFromInput(canvasGenerationInput{Mode: "audio", Prompt: "克制的弦乐与钢琴", Config: providerConfig{Model: "music_v2_5"}, Metadata: map[string]interface{}{"providerOptions": map[string]interface{}{"elevenlabs-music": map[string]interface{}{"music_length_ms": 60000, "force_instrumental": false}}}})
	options := request.ProviderOptions["elevenlabs-music"]
	if options["music_length_ms"] != 60000 || options["force_instrumental"] != false || request.Prompt != "克制的弦乐与钢琴" {
		t.Fatalf("music task parameters lost: %#v", options)
	}
}
