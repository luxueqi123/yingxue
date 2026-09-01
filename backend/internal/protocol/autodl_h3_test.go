package protocol

import (
	"context"
	"strings"
	"testing"
)

func TestAutoDLH3AdapterMapsEveryWorkflow(t *testing.T) {
	adapter, ok := Builtins().Get("autodl-h3-video")
	if !ok {
		t.Fatal("AutoDL H3 adapter is missing")
	}
	image := func(name string) MediaReference { return MediaReference{URL: "https://cdn.example/" + name + ".png"} }
	audio := func(name string) MediaReference { return MediaReference{URL: "https://cdn.example/" + name + ".mp3"} }
	cases := []struct {
		workflow string
		request  GenerationRequest
		want     []string
		absent   []string
	}{
		{"minimax_h3_lightx2v_no_pic", GenerationRequest{Model: "minimax_h3_lightx2v_no_pic", Prompt: "a cinematic journey", Duration: 5, Resolution: "768p", AspectRatio: "9:16"}, []string{"prompt", "duration", "resolution"}, []string{"ref_image_0", "ref_audio_0"}},
		{"minimax_h3_lightx2v", GenerationRequest{Model: "minimax_h3_lightx2v", Prompt: "a smooth transition", Duration: 5, Images: []MediaReference{image("first"), image("last")}}, []string{"first_frame", "last_frame", "duration"}, []string{"ref_image_0", "ref_audio_0"}},
		{"minimax_h3_lightx2v_v5", GenerationRequest{Model: "minimax_h3_lightx2v_v5", Prompt: "two characters meet", Duration: 5, Images: []MediaReference{image("a"), image("b")}, Extra: map[string]any{"seed": 7}}, []string{"ref_image_0", "ref_image_1", "seed"}, []string{"ref_audio_0"}},
		{"minimax_h3_lightx2v_v5_15s", GenerationRequest{Model: "minimax_h3_lightx2v_v5_15s", Prompt: "long scene", Duration: 15, Images: []MediaReference{image("a")}}, []string{"ref_image_0", "duration"}, []string{"ref_audio_0"}},
		{"minimax_h3_image_audio_to_video", GenerationRequest{Model: "minimax_h3_image_audio_to_video", Duration: 5, Images: []MediaReference{image("speaker")}, Audios: []MediaReference{audio("line")}}, []string{"ref_image_0", "ref_audio_0", "audio_duration"}, []string{"prompt", "duration"}},
		{"minimax_h3_image_audio_to_video_v2", GenerationRequest{Model: "minimax_h3_image_audio_to_video_v2", Prompt: "multi-modal scene", Duration: 10, Images: []MediaReference{image("a"), image("b")}, Audios: []MediaReference{audio("one"), audio("two")}, Extra: map[string]any{"seed": 11}}, []string{"ref_image_0", "ref_image_1", "ref_audio_0", "ref_audio_1", "seed"}, []string{"first_frame", "last_frame"}},
		{"minimax_h3_image_audio_to_video_v2_15s", GenerationRequest{Model: "minimax_h3_image_audio_to_video_v2_15s", Prompt: "long multi-modal scene", Duration: 15, Images: []MediaReference{image("a")}, Audios: []MediaReference{audio("one")}}, []string{"ref_image_0", "ref_audio_0", "duration"}, []string{"first_frame", "last_frame"}},
	}
	for _, tc := range cases {
		t.Run(tc.workflow, func(t *testing.T) {
			spec, err := adapter.BuildCreate(context.Background(), RequestContext{Request: tc.request})
			if err != nil {
				t.Fatal(err)
			}
			body, ok := spec.Body.(map[string]any)
			if !ok {
				t.Fatalf("body type = %T", spec.Body)
			}
			for _, key := range tc.want {
				if _, exists := body[key]; !exists {
					t.Fatalf("body missing %q: %#v", key, body)
				}
			}
			for _, key := range tc.absent {
				if _, exists := body[key]; exists {
					t.Fatalf("body unexpectedly contains %q: %#v", key, body)
				}
			}
		})
	}
}

func TestAutoDLH3AdapterRejectsInvalidWorkflowInputs(t *testing.T) {
	adapter, _ := Builtins().Get("autodl-h3-video")
	cases := []GenerationRequest{
		{Model: "minimax_h3_lightx2v", Prompt: "transition", Duration: 5, Images: []MediaReference{{URL: "https://cdn.example/first.png"}}},
		{Model: "minimax_h3_lightx2v_v5", Prompt: "scene", Duration: 11, Images: []MediaReference{{URL: "https://cdn.example/a.png"}}},
		{Model: "minimax_h3_image_audio_to_video", Duration: 5, Images: []MediaReference{{URL: "https://cdn.example/a.png"}}},
		{Model: "minimax_h3_lightx2v_v5", Prompt: "scene", Duration: 5, Images: []MediaReference{{URL: "file:///not-public.png"}}},
	}
	for _, request := range cases {
		t.Run(request.Model, func(t *testing.T) {
			_, err := adapter.BuildCreate(context.Background(), RequestContext{Request: request})
			if err == nil {
				t.Fatal("invalid request was accepted")
			}
			if strings.TrimSpace(err.Error()) == "" {
				t.Fatal("invalid request error is empty")
			}
		})
	}
}
