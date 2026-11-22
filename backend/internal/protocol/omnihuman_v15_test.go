package protocol

import (
	"bytes"
	"context"
	"encoding/json"
	"net/url"
	"os"
	"path/filepath"
	"testing"
)

const omniV15ID = "volcengine-omnihuman-v15"

func omniV15Adapter(t *testing.T) Adapter {
	t.Helper()
	folder := filepath.Join("..", "..", "..", "plugin-packages", omniV15ID)
	raw, err := os.ReadFile(folder + ".yingce-plugin")
	if err != nil {
		t.Fatal(err)
	}
	pkg, err := ParsePluginPackage(raw)
	if err != nil {
		t.Fatal(err)
	}
	source, err := os.ReadFile(filepath.Join(folder, "manifest.json"))
	if err != nil {
		t.Fatal(err)
	}
	if !bytes.Equal(source, pkg.ManifestRaw) {
		t.Fatal("package differs from source")
	}
	adapters, err := LoadInstalledProviders(source, nil)
	if err != nil || len(adapters) != 1 {
		t.Fatalf("load: %v", err)
	}
	if !adapters[0].Metadata().RequiresPublicMediaURLs {
		t.Fatal("public media required")
	}
	return adapters[0]
}

func omniV15Request() GenerationRequest {
	return GenerationRequest{Capability: CapabilityVideo, Model: "omnihuman-1.5", Prompt: "唱歌，梦核", Images: []MediaReference{{URL: "https://example.com/person.png", Role: "first_frame"}}, Audios: []MediaReference{{URL: "https://example.com/song.mp3", Role: "reference_audio", Metadata: map[string]any{"durationMs": 6374}}}, ProviderOptions: map[string]map[string]any{omniV15ID: {"fastMode": false}}}
}

func TestOmniV15NativeFields(t *testing.T) {
	a := omniV15Adapter(t)
	spec, err := a.BuildCreate(context.Background(), RequestContext{Request: omniV15Request()})
	if err != nil {
		t.Fatal(err)
	}
	b := manifestTestBody(t, spec)
	if spec.Path != "/" || !spec.OriginPath || url.Values(spec.Query).Get("Action") != "CVSubmitTask" || url.Values(spec.Query).Get("Version") != "2022-08-31" {
		t.Fatalf("wrong endpoint: %#v", spec)
	}
	if len(b) != 5 || b["req_key"] != "jimeng_realman_avatar_picture_omni_v15" || b["image_url"] != "https://example.com/person.png" || b["audio_url"] != "https://example.com/song.mp3" || b["pe_fast_mode"] != false || b["prompt"] != "唱歌，梦核" {
		t.Fatalf("wrong body: %#v", b)
	}
	poll, err := a.BuildPoll(context.Background(), PollContext{TaskID: "mine"})
	if err != nil {
		t.Fatal(err)
	}
	pb := manifestTestBody(t, poll)
	if url.Values(poll.Query).Get("Action") != "CVGetResult" || len(pb) != 2 || pb["task_id"] != "mine" || pb["req_key"] != b["req_key"] {
		t.Fatalf("wrong poll: %#v", poll)
	}
}

func TestOmniV15RejectsLostInputs(t *testing.T) {
	a := omniV15Adapter(t)
	for name, change := range map[string]func(*GenerationRequest){
		"wrong-model":     func(r *GenerationRequest) { r.Model = "omnihuman-1.0" },
		"missing-image":   func(r *GenerationRequest) { r.Images = nil },
		"missing-audio":   func(r *GenerationRequest) { r.Audios = nil },
		"extra-image":     func(r *GenerationRequest) { r.Images = append(r.Images, r.Images[0]) },
		"video":           func(r *GenerationRequest) { r.Videos = []MediaReference{{URL: "https://example.com/video.mp4"}} },
		"last-frame":      func(r *GenerationRequest) { r.Images[0].Role = "last_frame" },
		"local-image":     func(r *GenerationRequest) { r.Images[0].URL = "file:///person.png" },
		"bad-fast-mode":   func(r *GenerationRequest) { r.ProviderOptions[omniV15ID]["fastMode"] = "false" },
		"forced-duration": func(r *GenerationRequest) { r.Duration = 10 },
		"bad-resolution":  func(r *GenerationRequest) { r.Resolution = "4k" },
	} {
		t.Run(name, func(t *testing.T) {
			r := omniV15Request()
			change(&r)
			if _, err := a.BuildCreate(context.Background(), RequestContext{Request: r}); err == nil {
				t.Fatal("unsupported input accepted")
			}
		})
	}
}

func TestOmniV15DoneRequiresBusinessSuccessAndMedia(t *testing.T) {
	a := omniV15Adapter(t)
	created, err := a.ParseCreate(context.Background(), []byte(`{"code":10000,"data":{"task_id":"mine"}}`))
	if err != nil || created.TaskID != "mine" || created.Status != StatusPending {
		t.Fatalf("create: %#v %v", created, err)
	}
	for _, state := range []string{"processing", "in_queue", "generating", "done", "not_found", "expired", "unknown"} {
		t.Run(state, func(t *testing.T) {
			raw, _ := json.Marshal(map[string]any{"code": 10000, "data": map[string]any{"status": state, "video_url": "https://example.com/result.mp4"}})
			result, err := a.ParsePoll(context.Background(), PollContext{TaskID: "mine"}, raw)
			if err != nil {
				t.Fatal(err)
			}
			if state == "done" {
				if result.Status != StatusSucceeded || result.Result == nil || len(result.Result.Videos) != 1 || !result.Result.Videos[0].Ephemeral {
					t.Fatalf("missing result: %#v", result)
				}
			} else {
				if result.Status == StatusSucceeded || result.Result != nil && len(result.Result.Videos) > 0 {
					t.Fatal("unfinished/invalid media exposed")
				}
				if state == "unknown" || state == "expired" || state == "not_found" {
					if result.Status != StatusFailed {
						t.Fatal("invalid state pending")
					}
				}
			}
		})
	}
	for _, raw := range []string{`{"code":50215,"data":{"status":"done","video_url":"https://example.com/r.mp4"}}`, `{"code":10000,"data":{"status":"done"}}`, `{"code":10000,"data":{"status":"done","video_url":"file:///r.mp4"}}`, `{"data":{"status":"done","video_url":"https://example.com/r.mp4"}}`} {
		result, err := a.ParsePoll(context.Background(), PollContext{TaskID: "mine"}, []byte(raw))
		if err == nil && result.Status != StatusFailed {
			t.Fatalf("false success: %s", raw)
		}
	}
}

func TestOmniV15RejectsUnverifiedAudioAndUnknownOverrides(t *testing.T) {
	a := omniV15Adapter(t)
	for _, duration := range []any{nil, 0, -1, 60000, 90000, "6374"} {
		r := omniV15Request()
		r.Audios[0].Metadata = map[string]any{"durationMs": duration}
		if _, err := a.BuildCreate(context.Background(), RequestContext{Request: r}); err == nil {
			t.Errorf("invalid audio duration accepted: %v", duration)
		}
	}
	r := omniV15Request()
	r.ProviderOptions[omniV15ID]["seed"] = 42
	if _, err := a.BuildCreate(context.Background(), RequestContext{Request: r}); err == nil {
		t.Error("unmapped seed silently lost")
	}
}
