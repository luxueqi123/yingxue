package protocol

import (
	"bytes"
	"context"
	"encoding/json"
	"os"
	"strings"
	"testing"
)

func murekaAdapters(t *testing.T) map[string]Adapter {
	t.Helper()
	source, err := os.ReadFile("../../../plugin-packages/mureka-instrumental/manifest.json")
	if err != nil {
		t.Fatal(err)
	}
	archive, err := os.ReadFile("../../../plugin-packages/mureka-instrumental.yingce-plugin")
	if err != nil {
		t.Fatal(err)
	}
	pkg, err := ParsePluginPackage(archive)
	if err != nil {
		t.Fatal(err)
	}
	if !bytes.Equal(source, pkg.ManifestRaw) {
		t.Fatal("source/package mismatch")
	}
	result := map[string]Adapter{}
	for name, raw := range map[string][]byte{"source": source, "package": pkg.ManifestRaw} {
		providers, err := LoadInstalledProviders(raw, nil)
		if err != nil || len(providers) != 1 {
			t.Fatalf("load: %v", err)
		}
		result[name] = providers[0]
	}
	return result
}
func murekaRequest() GenerationRequest {
	return GenerationRequest{Capability: CapabilityAudio, Model: "mureka-8", Prompt: "完整原文：弦乐与低音鼓", Extra: map[string]any{"count": "1", "audioFormat": "mp3"}, ProviderOptions: map[string]map[string]any{"mureka-instrumental": {"forceInstrumental": true}}}
}
func TestMurekaExactInstrumentalRequest(t *testing.T) {
	for name, a := range murekaAdapters(t) {
		t.Run(name, func(t *testing.T) {
			r := murekaRequest()
			spec, err := a.BuildCreate(context.Background(), RequestContext{Request: r})
			if err != nil {
				t.Fatal(err)
			}
			b := manifestTestBody(t, spec)
			if spec.Path != "/v1/instrumental/generate" || !spec.OriginPath || b["model"] != "mureka-8" || b["prompt"] != r.Prompt || b["n"] != float64(1) || b["stream"] != false || len(b) != 4 {
				t.Fatalf("changed request: %#v", b)
			}
			poll, err := a.BuildPoll(context.Background(), PollContext{TaskID: "task-42"})
			if err != nil || poll.Path != "/v1/instrumental/query/task-42" || !poll.OriginPath {
				t.Fatalf("poll: %#v %v", poll, err)
			}
		})
	}
}
func TestMurekaRejectsUnrepresentedInput(t *testing.T) {
	changes := map[string]func(*GenerationRequest){
		"fractional-count": func(r *GenerationRequest) { r.Extra["count"] = 1.5 },
		"version":          func(r *GenerationRequest) { r.Model = "mureka-9" },
		"auto":             func(r *GenerationRequest) { r.Model = "auto" },
		"vendor":           func(r *GenerationRequest) { r.Model = "music_v2_5" },
		"empty":            func(r *GenerationRequest) { r.Prompt = "  " },
		"long":             func(r *GenerationRequest) { r.Prompt = strings.Repeat("文", 1025) },
		"count":            func(r *GenerationRequest) { r.Extra["count"] = "2" },
		"song":             func(r *GenerationRequest) { r.ProviderOptions["mureka-instrumental"]["forceInstrumental"] = false },
		"missing-mode":     func(r *GenerationRequest) { delete(r.ProviderOptions, "mureka-instrumental") },
		"audio":            func(r *GenerationRequest) { r.Audios = []MediaReference{{URL: "https://example.com/ref.mp3"}} },
		"image":            func(r *GenerationRequest) { r.Images = []MediaReference{{URL: "https://example.com/ref.png"}} },
		"video":            func(r *GenerationRequest) { r.Videos = []MediaReference{{URL: "https://example.com/ref.mp4"}} },
		"duration":         func(r *GenerationRequest) { r.ProviderOptions["mureka-instrumental"]["durationMs"] = 60000 },
	}
	for name, a := range murekaAdapters(t) {
		for change, mutate := range changes {
			t.Run(name+"/"+change, func(t *testing.T) {
				r := murekaRequest()
				mutate(&r)
				if _, err := a.BuildCreate(context.Background(), RequestContext{Request: r}); err == nil {
					t.Fatal("unsupported request accepted")
				}
			})
		}
	}
}
func TestMurekaTerminalStateGatesResult(t *testing.T) {
	for name, a := range murekaAdapters(t) {
		t.Run(name, func(t *testing.T) {
			for _, status := range []string{"preparing", "queued", "running", "streaming", "succeeded", "failed", "timeouted", "cancelled", "unknown", ""} {
				raw, _ := json.Marshal(map[string]any{"id": "task-42", "status": status, "choices": []any{map[string]any{"url": "https://example.com/original.mp3", "stream_url": "https://example.com/stream"}}})
				result, err := a.ParsePoll(context.Background(), PollContext{TaskID: "task-42"}, raw)
				if err != nil {
					t.Fatal(err)
				}
				media := result.Result != nil && len(result.Result.Audios) > 0
				if status == "succeeded" {
					if result.Status != StatusSucceeded || !media || len(result.Result.Audios) != 1 || !result.Result.Audios[0].Ephemeral {
						t.Fatalf("lost result: %#v", result)
					}
				} else if result.Status == StatusSucceeded || media {
					t.Fatalf("premature success %s: %#v", status, result)
				}
			}
			for _, choices := range []any{nil, []any{}, []any{map[string]any{"url": ""}}, []any{map[string]any{"url": "data:audio/mp3;base64,AA=="}}, []any{map[string]any{"url": "https://example.com/one.mp3"}, map[string]any{"url": "https://example.com/two.mp3"}}} {
				raw, _ := json.Marshal(map[string]any{"id": "task-42", "status": "succeeded", "choices": choices})
				result, err := a.ParsePoll(context.Background(), PollContext{TaskID: "task-42"}, raw)
				if err == nil && (result.Status == StatusSucceeded || (result.Result != nil && len(result.Result.Audios) > 0)) {
					t.Fatalf("invalid success: %#v", result)
				}
			}
		})
	}
}
