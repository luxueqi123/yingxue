package protocol

import (
	"context"
	"encoding/json"
	"fmt"
	"testing"
)

func TestArtdanceServerContracts(t *testing.T) {
	builtin, ok := Builtins().Get("newapi-channel-2")
	if !ok {
		t.Fatal("builtin missing")
	}
	packaged := officialPackageAdapter(t, "newapi-video-generations-v1.yingce-plugin", "newapi-channel-2")
	for name, adapter := range map[string]Adapter{"builtin": builtin, "official": packaged} {
		t.Run(name, func(t *testing.T) {
			state, err := adapter.ParsePoll(context.Background(), PollContext{TaskID: "contract-only"}, []byte(`{"status":"error","error":"vendor error"}`))
			if err == nil && state.Status != StatusFailed {
				t.Fatalf("ERROR did not terminate: %#v", state)
			}
			request := GenerationRequest{Capability: CapabilityVideo, Model: "Artdance 2.5-720p", Prompt: "test", Duration: 5, Resolution: "720p", Images: []MediaReference{
				{URL: "https://example.test/b.png", Role: "reference_image", Order: 2},
				{URL: "https://example.test/end.png", Role: "last_frame", Order: 3},
				{URL: "https://example.test/a.png", Role: "reference_image", Order: 1},
				{URL: "https://example.test/start.png", Role: "first_frame", Order: 0},
			}}
			build := func(r GenerationRequest) (map[string]any, error) {
				spec, err := adapter.BuildCreate(context.Background(), RequestContext{Request: r})
				if err != nil {
					return nil, err
				}
				bytes, err := json.Marshal(spec.Body)
				if err != nil {
					return nil, err
				}
				var body map[string]any
				err = json.Unmarshal(bytes, &body)
				return body, err
			}
			body, err := build(request)
			if err != nil {
				t.Fatal(err)
			}
			if body["start_image_url"] != "https://example.test/start.png" || body["end_image_url"] != "https://example.test/end.png" {
				t.Fatalf("frame roles: %#v", body)
			}
			images, ok := body["image_urls"].([]any)
			if !ok || len(images) != 2 || images[0] != "https://example.test/a.png" || images[1] != "https://example.test/b.png" {
				t.Fatalf("reference order: %#v", body)
			}
			if _, exists := body["resolution"]; exists {
				t.Fatal("fixed resolution sent")
			}
			if body["generate_audio"] != false {
				t.Fatalf("explicit audio off lost: %#v", body)
			}
			wrong := request
			wrong.Resolution = "1080p"
			if _, err := build(wrong); err == nil {
				t.Fatal("mismatched tier accepted")
			}
			duplicate := request
			duplicate.Images = append(append([]MediaReference{}, request.Images...), MediaReference{URL: "https://example.test/other.png", Role: "first_frame"})
			if _, err := build(duplicate); err == nil {
				t.Fatal("duplicate frame accepted")
			}
			many := request
			many.Images = nil
			for i := 0; i < 30; i++ {
				many.Images = append(many.Images, MediaReference{URL: fmt.Sprintf("https://example.test/%d.png", i), Role: "reference_image", Order: i})
			}
			if _, err := build(many); err != nil {
				t.Fatal(err)
			}
			many.Images = append(many.Images, MediaReference{URL: "https://example.test/31.png"})
			if _, err := build(many); err == nil {
				t.Fatal("31 images accepted")
			}
			generic := request
			generic.Model = "generic-video"
			body, err = build(generic)
			if err != nil {
				t.Fatal(err)
			}
			if body["resolution"] != "720p" || body["start_image_url"] != nil || len(body["image_urls"].([]any)) != 4 {
				t.Fatalf("generic protocol changed: %#v", body)
			}
		})
	}
}
