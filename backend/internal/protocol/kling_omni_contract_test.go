package protocol

import (
	"context"
	"encoding/json"
	"testing"
)

func TestKlingV3KeepsDistinctTextAndFrameEndpoints(t *testing.T) {
	a := officialPackageAdapter(t, "kling-v3-video.yingce-plugin", "kling-v3-video")
	r := GenerationRequest{Capability: CapabilityVideo, Model: "kling-v3", Prompt: "story", Duration: 5, Resolution: "1080p", AspectRatio: "16:9", GenerateAudio: true, ProviderOptions: map[string]map[string]any{"kling-v3-video": {"mode": "pro", "multiShot": false}}}
	s, e := a.BuildCreate(context.Background(), RequestContext{Request: r})
	if e != nil || s.Path != "/v1/videos/text2video" {
		t.Fatalf("text endpoint: %#v %v", s, e)
	}
	r.Images = []MediaReference{{URL: "https://example.test/start.png", Role: "first_frame"}, {URL: "https://example.test/end.png", Role: "last_frame", Order: 1}}
	s, e = a.BuildCreate(context.Background(), RequestContext{Request: r})
	if e != nil || s.Path != "/v1/videos/image2video" {
		t.Fatalf("frame endpoint: %#v %v", s, e)
	}
	raw, _ := json.Marshal(s.Body)
	var body map[string]any
	json.Unmarshal(raw, &body)
	if body["image"] != "https://example.test/start.png" || body["image_tail"] != "https://example.test/end.png" || body["sound"] != "on" {
		t.Fatalf("frame payload: %s", raw)
	}
	if _, ok := body["image_list"]; ok {
		t.Fatal("Omni payload leaked into ordinary model")
	}
	poll, e := a.BuildPoll(context.Background(), PollContext{Request: r, TaskID: "task"})
	if e != nil || poll.Path != "/v1/videos/image2video/task" {
		t.Fatalf("poll endpoint: %#v %v", poll, e)
	}
	r.Images[1].Role = "reference_image"
	if _, e := a.BuildCreate(context.Background(), RequestContext{Request: r}); e == nil {
		t.Fatal("ordinary reference silently used as frame")
	}
	r.Images = nil
	r.Model = "kling-v3-omni"
	if _, e := a.BuildCreate(context.Background(), RequestContext{Request: r}); e == nil {
		t.Fatal("Omni substituted")
	}
}

func TestKlingOmniContract(t *testing.T) {
	a := officialPackageAdapter(t, "kling-omni-video.yingce-plugin", "kling-omni-video")
	r := GenerationRequest{Capability: CapabilityVideo, Model: "kling-v3-omni", Prompt: "story", Duration: 5, Resolution: "1080p", AspectRatio: "16:9", ProviderOptions: map[string]map[string]any{"kling-omni-video": {"mode": "pro", "multiShot": true}}, Images: []MediaReference{{URL: "https://example.test/start.png", Role: "first_frame", Order: 0}, {URL: "https://example.test/end.png", Role: "last_frame", Order: 1}, {URL: "https://example.test/ref.png", Role: "reference_image", Order: 2}}}
	build := func(r GenerationRequest) (map[string]any, error) {
		s, e := a.BuildCreate(context.Background(), RequestContext{Request: r})
		if e != nil {
			return nil, e
		}
		if s.Path != "/v1/videos/omni-video" {
			t.Fatalf("wrong path: %s", s.Path)
		}
		b, _ := json.Marshal(s.Body)
		var m map[string]any
		e = json.Unmarshal(b, &m)
		return m, e
	}
	b, e := build(r)
	if e != nil {
		t.Fatal(e)
	}
	if b["mode"] != "pro" || b["model_name"] != "kling-v3-omni" || b["sound"] != "off" || b["duration"] != "5" || b["shot_type"] != "intelligence" {
		t.Fatalf("parameters lost: %#v", b)
	}
	images := b["image_list"].([]any)
	if images[0].(map[string]any)["type"] != "first_frame" || images[1].(map[string]any)["type"] != "end_frame" {
		t.Fatal("frame roles lost")
	}
	if _, ok := images[2].(map[string]any)["type"]; ok {
		t.Fatal("ordinary image promoted to frame")
	}
	r.Images = nil
	r.Videos = []MediaReference{{URL: "https://example.test/ref.mp4"}}
	if _, e := build(r); e == nil {
		t.Fatal("missing video semantics accepted")
	}
	opts := r.ProviderOptions["kling-omni-video"]
	opts["videoReferenceType"] = "base"
	opts["keepOriginalSound"] = "yes"
	opts["multiShot"] = false
	b, e = build(r)
	if e != nil {
		t.Fatal(e)
	}
	if _, ok := b["duration"]; ok {
		t.Fatal("editing duration overridden")
	}
	if _, ok := b["shot_type"]; ok {
		t.Fatal("disabled storyboard emitted shot_type")
	}
	if b["video_list"].([]any)[0].(map[string]any)["keep_original_sound"] != "yes" {
		t.Fatal("original audio lost")
	}
	r.GenerateAudio = true
	if _, e := build(r); e == nil {
		t.Fatal("unsupported generated sound with video accepted")
	}
	r.GenerateAudio = false
	opts["multiPrompt"] = []any{map[string]any{"prompt": "not mapped"}}
	if _, e := build(r); e == nil {
		t.Fatal("storyboard silently discarded")
	}
	delete(opts, "multiPrompt")
	r.Model = "kling-video-o3"
	if _, e := build(r); e == nil {
		t.Fatal("different model silently substituted")
	}
	created, e := a.ParseCreate(context.Background(), []byte(`{"code":0,"data":{"task_id":"local","task_status":"submitted"}}`))
	if e != nil || created.TaskID != "local" {
		t.Fatalf("create %#v %v", created, e)
	}
	polled, e := a.ParsePoll(context.Background(), PollContext{TaskID: "local"}, []byte(`{"code":0,"data":{"task_id":"local","task_status":"succeed","task_result":{"videos":[{"url":"https://example.test/result.mp4"}]}}}`))
	if e != nil || polled.Status != StatusSucceeded || polled.Result == nil || len(polled.Result.Videos) != 1 {
		t.Fatalf("poll %#v %v", polled, e)
	}
	if state, e := a.ParseCreate(context.Background(), []byte(`{"code":1001,"message":"invalid request"}`)); e == nil && state.Status != StatusFailed {
		t.Fatal("business error accepted")
	}
}
