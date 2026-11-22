package protocol

import (
	"context"
	"testing"
)

func TestWan968VideoContract(t *testing.T) {
	a := wan968VideoAdapter()
	r := GenerationRequest{Model: "wan3.0-video", Prompt: "湖面", Duration: 15, Resolution: "720p", AspectRatio: "16:9", Images: []MediaReference{{URL: "https://example.com/a.png"}, {URL: "https://example.com/b.png"}}, Videos: []MediaReference{{URL: "https://example.com/v.mp4"}}, GenerateAudio: true}
	spec, err := a.BuildCreate(context.Background(), RequestContext{Request: r})
	if err != nil {
		t.Fatal(err)
	}
	body := spec.Body.(map[string]any)
	if spec.Path != "/v1/videos/generations" || body["duration"] != 15 || body["images"] == nil || body["video_refs"] == nil || body["videoGenerateAudio"] != true {
		t.Fatalf("wrong request: %#v", spec)
	}
	created, err := a.ParseCreate(context.Background(), []byte(`{"request_id":"test-task"}`))
	if err != nil || created.TaskID != "test-task" {
		t.Fatalf("wrong create: %#v %v", created, err)
	}
	state, err := a.ParsePoll(context.Background(), PollContext{TaskID: "test-task"}, []byte(`{"status":"done","video":{"url":"https://example.com/result.mp4"}}`))
	if err != nil || state.Status != StatusSucceeded || state.Result.Videos[0].URL != "https://example.com/result.mp4" {
		t.Fatalf("wrong success: %#v %v", state, err)
	}
	if _, err := a.ParsePoll(context.Background(), PollContext{}, []byte(`{"status":"done"}`)); err == nil {
		t.Fatal("accepted empty success")
	}
	state, err = a.ParsePoll(context.Background(), PollContext{}, []byte(`{"status":"expired","error":{"message":"expired"}}`))
	if err != nil || state.Status != StatusFailed {
		t.Fatal("expired task must fail")
	}
}
