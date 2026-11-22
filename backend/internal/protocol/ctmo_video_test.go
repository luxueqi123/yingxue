package protocol

import (
	"context"
	"strings"
	"testing"
)

func TestCTMOVideoContract(t *testing.T) {
	a := ctmoVideoAdapter()
	r := GenerationRequest{Model: "seedance2.0-svip-900-720p", Prompt: "湖面", Duration: 15, AspectRatio: "16:9", Images: []MediaReference{{URL: "https://example.com/image.png"}}}
	spec, err := a.BuildCreate(context.Background(), RequestContext{Request: r})
	if err != nil {
		t.Fatal(err)
	}
	b := spec.Body.(map[string]any)
	if spec.Path != "/v1/videos" || spec.ContentType != "application/json" || b["seconds"] != 15 || !strings.Contains(b["prompt"].(string), "15秒") || b["images"] == nil {
		t.Fatalf("invalid request: %#v", spec)
	}
	r.Duration = 12
	if _, err = a.BuildCreate(context.Background(), RequestContext{Request: r}); err == nil {
		t.Fatal("accepted unsupported duration")
	}
	r.Model = "seedance-2-pro-720p"
	r.Images = nil
	r.Audios = []MediaReference{{URL: "https://example.com/audio.mp3"}}
	if _, err = a.BuildCreate(context.Background(), RequestContext{Request: r}); err == nil {
		t.Fatal("accepted audio without image")
	}
	state, err := a.ParsePoll(context.Background(), PollContext{BaseURL: "https://video.ctmoai.com/v1", TaskID: "task_123"}, []byte(`{"status":"completed","url":"https://untrusted.example/file"}`))
	if err != nil || state.Result.Videos[0].URL != "https://video.ctmoai.com/v1/videos/task_123/content" {
		t.Fatalf("invalid result: %#v %v", state, err)
	}
	state, err = a.ParsePoll(context.Background(), PollContext{TaskID: "task_123"}, []byte(`{"status":"unknown"}`))
	if err != nil || state.Status != StatusProcessing {
		t.Fatalf("unknown must keep polling: %#v %v", state, err)
	}
}
