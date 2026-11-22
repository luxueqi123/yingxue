package protocol

import (
	"context"
	"encoding/json"
	"reflect"
	"testing"
)

const subtitleEraseProvider = "volcengine-mediakit-subtitle-erase"

func subtitleEraseRequest() GenerationRequest {
	return GenerationRequest{Capability: CapabilityVideo, Model: "erase-video-subtitle-pro", Videos: []MediaReference{{URL: "https://example.com/original.mp4", Role: "edit_source"}}, ProviderOptions: map[string]map[string]any{subtitleEraseProvider: {"mode": "Text"}}}
}

func TestSubtitleEraseRegionsPreserveCoordinatesAndRejectInvalidSelections(t *testing.T) {
	a := officialPackageAdapter(t, subtitleEraseProvider+".yingce-plugin", subtitleEraseProvider)
	box := map[string]any{"top_left_x": 0.165735, "top_left_y": 0.86736, "bottom_right_x": 0.784559, "bottom_right_y": 0.983955}
	for _, mode := range []string{"Subtitle", "Text"} {
		for _, count := range []int{1, 20} {
			r := subtitleEraseRequest()
			boxes := make([]any, count)
			for i := range boxes {
				boxes[i] = box
			}
			r.ProviderOptions[subtitleEraseProvider] = map[string]any{"mode": mode, "erase_ratio_location": boxes}
			spec, err := a.BuildCreate(context.Background(), RequestContext{Request: r})
			if err != nil {
				t.Fatal(err)
			}
			body := manifestTestBody(t, spec)
			if len(body) != 3 || body["mode"] != mode || body["video_url"] != r.Videos[0].URL || !reflect.DeepEqual(body["erase_ratio_location"], boxes) {
				t.Fatalf("original selection changed: %#v", body)
			}
		}
	}
	changed := func(key string, value any) map[string]any {
		next := map[string]any{}
		for k, v := range box {
			next[k] = v
		}
		next[key] = value
		return next
	}
	for name, value := range map[string]any{
		"empty": []any{}, "object": box, "string": "region", "null-box": []any{nil},
		"negative": []any{changed("top_left_x", -.1)}, "outside": []any{changed("bottom_right_y", 1.1)},
		"reversed": []any{changed("top_left_x", .9)}, "empty-height": []any{changed("top_left_y", .983955)},
		"string-coordinate": []any{changed("top_left_x", "0.1")}, "unknown-field": []any{changed("extra", 1)},
		"missing-coordinate": []any{map[string]any{"top_left_y": .1, "bottom_right_x": .9, "bottom_right_y": .9}},
		"too-many":           make([]any, 21),
	} {
		t.Run(name, func(t *testing.T) {
			r := subtitleEraseRequest()
			r.ProviderOptions[subtitleEraseProvider]["erase_ratio_location"] = value
			if _, err := a.BuildCreate(context.Background(), RequestContext{Request: r}); err == nil {
				t.Fatal("invalid region accepted")
			}
		})
	}
}

func TestSubtitleErasePreservesOriginalModeAndVideo(t *testing.T) {
	adapter := officialPackageAdapter(t, subtitleEraseProvider+".yingce-plugin", subtitleEraseProvider)
	for _, mode := range []string{"Subtitle", "Text"} {
		t.Run(mode, func(t *testing.T) {
			request := subtitleEraseRequest()
			request.ProviderOptions[subtitleEraseProvider]["mode"] = mode
			spec, err := adapter.BuildCreate(context.Background(), RequestContext{Request: request})
			if err != nil {
				t.Fatal(err)
			}
			body := manifestTestBody(t, spec)
			if spec.Method != "POST" || spec.Path != "/api/v1/tools/erase-video-subtitle-pro" || !spec.OriginPath || len(body) != 2 || body["mode"] != mode || body["video_url"] != request.Videos[0].URL {
				t.Fatalf("source changed: %#v", spec)
			}
			poll, err := adapter.BuildPoll(context.Background(), PollContext{TaskID: "mine"})
			if err != nil || poll.Path != "/api/v1/tasks/mine" || !poll.OriginPath {
				t.Fatal("wrong poll")
			}
		})
	}
}

func TestSubtitleEraseRejectsChangedModesAndUnconsumedInputs(t *testing.T) {
	adapter := officialPackageAdapter(t, subtitleEraseProvider+".yingce-plugin", subtitleEraseProvider)
	for label, change := range map[string]func(*GenerationRequest){
		"standard":        func(r *GenerationRequest) { r.Model = "erase-video-subtitle" },
		"missing-mode":    func(r *GenerationRequest) { delete(r.ProviderOptions[subtitleEraseProvider], "mode") },
		"unknown-mode":    func(r *GenerationRequest) { r.ProviderOptions[subtitleEraseProvider]["mode"] = "All" },
		"other-namespace": func(r *GenerationRequest) { r.ProviderOptions = map[string]map[string]any{"other": {"mode": "Text"}} },
		"missing-video":   func(r *GenerationRequest) { r.Videos = nil },
		"extra-video":     func(r *GenerationRequest) { r.Videos = append(r.Videos, r.Videos[0]) },
		"image":           func(r *GenerationRequest) { r.Images = []MediaReference{{URL: "https://example.com/a.png"}} },
		"audio":           func(r *GenerationRequest) { r.Audios = []MediaReference{{URL: "https://example.com/a.wav"}} },
		"prompt":          func(r *GenerationRequest) { r.Prompt = "replace actor" },
		"count":           func(r *GenerationRequest) { r.Output.Count = 2 },
		"local":           func(r *GenerationRequest) { r.Videos[0].URL = "file:///video.mp4" },
		"version":         func(r *GenerationRequest) { r.ProviderOptions[subtitleEraseProvider]["model_version"] = "v5" },
		"regions":         func(r *GenerationRequest) { r.ProviderOptions[subtitleEraseProvider]["erase_ratio_location"] = []any{} },
		"duration":        func(r *GenerationRequest) { r.ProviderOptions[subtitleEraseProvider]["duration"] = 6 },
	} {
		t.Run(label, func(t *testing.T) {
			r := subtitleEraseRequest()
			change(&r)
			if _, err := adapter.BuildCreate(context.Background(), RequestContext{Request: r}); err == nil {
				t.Fatal("unsupported input accepted")
			}
		})
	}
}

func TestSubtitleEraseResponseRequiresActualCompletion(t *testing.T) {
	a := officialPackageAdapter(t, subtitleEraseProvider+".yingce-plugin", subtitleEraseProvider)
	created, err := a.ParseCreate(context.Background(), []byte(`{"success":true,"task_id":"mine"}`))
	if err != nil || created.Status != StatusPending || created.TaskID != "mine" {
		t.Fatal("create failed")
	}
	for state, want := range map[string]Status{"running": StatusProcessing, "completed": StatusSucceeded, "failed": StatusFailed} {
		raw, _ := json.Marshal(map[string]any{"success": true, "task_id": "mine", "status": state, "result": map[string]any{"video_url": "https://example.com/result.mp4"}})
		r, err := a.ParsePoll(context.Background(), PollContext{TaskID: "mine"}, raw)
		if err != nil || r.Status != want {
			t.Fatalf("%s: %v", state, err)
		}
		if want == StatusSucceeded {
			if r.Result == nil || len(r.Result.Videos) != 1 || !r.Result.Videos[0].Ephemeral {
				t.Fatal("missing short-lived output")
			}
		} else if r.Result != nil && len(r.Result.Videos) > 0 {
			t.Fatal("unfinished result exposed")
		}
	}
	for _, raw := range []string{`not JSON`, `{"success":false,"task_id":"mine","status":"completed","result":{"video_url":"https://example.com/r.mp4"}}`, `{"success":true,"task_id":"other","status":"completed"}`, `{"success":true,"task_id":"mine","status":"completed"}`, `{"success":true,"task_id":"mine","status":"unknown"}`, `{"success":true,"task_id":"mine"}`} {
		r, err := a.ParsePoll(context.Background(), PollContext{TaskID: "mine"}, []byte(raw))
		if err == nil && r.Status != StatusFailed {
			t.Fatalf("invalid response accepted: %s", raw)
		}
	}
}
