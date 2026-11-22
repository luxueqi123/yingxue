package protocol

import (
	"context"
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
)

func miniMaxV1Adapters(t *testing.T) map[string]Adapter {
	t.Helper()
	root := filepath.Join("..", "..", "..", "plugin-packages")
	source, err := os.ReadFile(filepath.Join(root, "minimax-hailuo-video-v1", "manifest.json"))
	if err != nil {
		t.Fatal(err)
	}
	data, err := os.ReadFile(filepath.Join(root, "minimax-hailuo-video-v1.yingce-plugin"))
	if err != nil {
		t.Fatal(err)
	}
	pkg, err := ParsePluginPackage(data)
	if err != nil {
		t.Fatal(err)
	}
	adapters := map[string]Adapter{}
	for name, raw := range map[string][]byte{"source": source, "package": pkg.ManifestRaw} {
		loaded, err := LoadInstalledProviders(raw, nil)
		if err != nil || len(loaded) != 1 {
			t.Fatalf("load %s: %v", name, err)
		}
		if loaded[0].Metadata().ID != "minimax-video-v1" {
			t.Fatal("wrong provider identity")
		}
		adapters[name] = loaded[0]
	}
	return adapters
}

func miniMaxV1Request() GenerationRequest {
	return GenerationRequest{Capability: CapabilityVideo, Model: "MiniMax-Hailuo-2.3", Prompt: "Original prompt [Zoom in]", Images: []MediaReference{{URL: "https://example.com/original.png", Role: "first_frame"}}, Duration: 6, Resolution: "1080P", AspectRatio: "auto", Operation: "image_to_video", Quality: "high"}
}

func TestMiniMaxV1PackagePreservesRequestAndRejectsSubstitution(t *testing.T) {
	for origin, adapter := range miniMaxV1Adapters(t) {
		t.Run(origin, func(t *testing.T) {
			request := miniMaxV1Request()
			spec, err := adapter.BuildCreate(context.Background(), RequestContext{Request: request})
			if err != nil {
				t.Fatal(err)
			}
			data, _ := json.Marshal(spec.Body)
			var body map[string]any
			_ = json.Unmarshal(data, &body)
			if spec.Path != "/v1/video_generation" || body["model"] != request.Model || body["prompt"] != request.Prompt || body["first_frame_image"] != request.Images[0].URL || body["duration"] != float64(6) || body["resolution"] != "1080P" || body["prompt_optimizer"] != false {
				t.Fatalf("request changed: %s", data)
			}
			for _, key := range []string{"content", "quality", "ratio", "generate_audio"} {
				if _, ok := body[key]; ok {
					t.Fatalf("unsupported V2/shared field %s", key)
				}
			}
			for _, change := range []func(*GenerationRequest){
				func(r *GenerationRequest) { r.Model = "MiniMax-H3" }, func(r *GenerationRequest) { r.Model = "MiniMax-Hailuo-o2" },
				func(r *GenerationRequest) { r.Duration = 10 }, func(r *GenerationRequest) { r.Duration = 5 }, func(r *GenerationRequest) { r.Resolution = "2K" },
				func(r *GenerationRequest) { r.AspectRatio = "16:9" }, func(r *GenerationRequest) { r.GenerateAudio = true }, func(r *GenerationRequest) { r.Watermark = true },
				func(r *GenerationRequest) { r.Images = append(r.Images, r.Images[0]) }, func(r *GenerationRequest) { r.Images[0].Role = "last_frame" },
			} {
				invalid := miniMaxV1Request()
				change(&invalid)
				if _, err := adapter.BuildCreate(context.Background(), RequestContext{Request: invalid}); err == nil {
					t.Fatalf("unsupported request accepted: %#v", invalid)
				}
			}
			request.Model = "MiniMax-Hailuo-2.3-Fast"
			request.Duration = 10
			request.Resolution = "768P"
			if _, err := adapter.BuildCreate(context.Background(), RequestContext{Request: request}); err != nil {
				t.Fatal(err)
			}
		})
	}
}

func TestMiniMaxV1PackageBindsQueryFileAndLookupResponse(t *testing.T) {
	for origin, adapter := range miniMaxV1Adapters(t) {
		t.Run(origin, func(t *testing.T) {
			ctx := context.Background()
			c := PollContext{TaskID: "task-11", Model: "MiniMax-Hailuo-2.3", Request: miniMaxV1Request()}
			created, err := adapter.ParseCreate(ctx, []byte(`{"task_id":"task-11","base_resp":{"status_code":0}}`))
			if err != nil || created.TaskID != "task-11" || created.Status != StatusPending {
				t.Fatalf("create: %#v %v", created, err)
			}
			spec, err := adapter.BuildPoll(ctx, c)
			if err != nil || spec.Query["task_id"][0] != "task-11" {
				t.Fatalf("poll spec: %#v %v", spec, err)
			}
			for _, body := range []string{`{"task_id":"task-11","status":"Success"}`, `{"task_id":"other-task","status":"Success","file_id":"file-22"}`, `{"task_id":"task-11","status":"Mystery"}`} {
				state, err := adapter.ParsePoll(ctx, c, []byte(body))
				if err != nil || state.Status != StatusFailed {
					t.Fatalf("invalid poll accepted: %#v %v", state, err)
				}
			}
			state, err := adapter.ParsePoll(ctx, c, []byte(`{"task_id":"task-11","status":"Success","file_id":"file-22","base_resp":{"status_code":0}}`))
			if err != nil || state.Status != StatusSucceeded || state.Result == nil {
				t.Fatalf("query: %#v %v", state, err)
			}
			c.Metadata = state.Result.Metadata
			spec, err = adapter.(ResultAdapter).BuildResult(ctx, c)
			if err != nil || spec.Query["file_id"][0] != "file-22" || spec.Path != "/v1/files/retrieve" {
				t.Fatalf("file spec: %#v %v", spec, err)
			}
			parser := adapter.(ResultResponseAdapter)
			result, err := parser.ParseResult(ctx, c, []byte(`{"file":{"file_id":"file-22","download_url":"https://example.com/video.mp4"},"base_resp":{"status_code":0}}`))
			if err != nil || result == nil || len(result.Videos) != 1 || result.Videos[0].URL != "https://example.com/video.mp4" || !result.Videos[0].Ephemeral {
				t.Fatalf("bound file result: %#v %v", result, err)
			}
			for _, body := range []string{`{"file":{"file_id":"other-file","download_url":"https://example.com/video.mp4"}}`, `{"file":{"file_id":"file-22"}}`, `{"file":{"file_id":"file-22","download_url":"https://example.com/video.mp4"},"base_resp":{"status_code":1001}}`} {
				if _, err := parser.ParseResult(ctx, c, []byte(body)); err == nil {
					t.Fatal("wrong/failed/empty file became video")
				}
			}
		})
	}
}
