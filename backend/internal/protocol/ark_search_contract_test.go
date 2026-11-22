package protocol

import (
	"context"
	"encoding/json"
	"fmt"
	"testing"
)

// Local protocol construction and parsing only; no provider requests.
func TestArkSearchContracts(t *testing.T) {
	builtin, _ := Builtins().Get("volcengine-ark-video")
	packaged := officialPackageAdapter(t, "volcengine-ark-seedance.yingce-plugin", "volcengine-ark-video")
	for name, adapter := range map[string]Adapter{"builtin": builtin, "package": packaged} {
		t.Run(name, func(t *testing.T) {
			build := func(r GenerationRequest) (map[string]any, error) {
				spec, err := adapter.BuildCreate(context.Background(), RequestContext{Request: r})
				if err != nil {
					return nil, err
				}
				if spec.Path != "/api/v3/contents/generations/tasks" {
					t.Fatalf("wrong path: %s", spec.Path)
				}
				raw, _ := json.Marshal(spec.Body)
				var body map[string]any
				err = json.Unmarshal(raw, &body)
				return body, err
			}
			r := GenerationRequest{Capability: CapabilityVideo, Model: "doubao-seedance-2-0-260128", Prompt: "local contract", Duration: 5, Resolution: "2160p", ProviderOptions: map[string]map[string]any{"volcengine-ark-video": {"webSearch": true}}, Images: []MediaReference{{URL: "https://example.test/start.png", Role: "first_frame"}, {URL: "https://example.test/end.png", Role: "last_frame", Order: 1}}}
			body, err := build(r)
			if err != nil {
				t.Fatal(err)
			}
			if body["generate_audio"] != false || body["resolution"] != "4k" {
				t.Fatalf("settings lost: %#v", body)
			}
			content := body["content"].([]any)
			if len(content) != 3 || content[1].(map[string]any)["role"] != "first_frame" || content[2].(map[string]any)["role"] != "last_frame" {
				t.Fatalf("frames lost: %#v", content)
			}
			if tools, ok := body["tools"].([]any); !ok || len(tools) != 1 || tools[0].(map[string]any)["type"] != "web_search" {
				t.Fatalf("search lost: %#v", body)
			}
			r.ProviderOptions["volcengine-ark-video"]["webSearch"] = false
			body, err = build(r)
			if err != nil {
				t.Fatal(err)
			}
			if _, ok := body["tools"]; ok {
				t.Fatal("disabled search emitted tools")
			}
			r.ProviderOptions["volcengine-ark-video"]["webSearch"] = "true"
			if _, err = build(r); err == nil {
				t.Fatal("invalid switch silently accepted")
			}
			r.ProviderOptions["volcengine-ark-video"]["webSearch"] = true
			r.Model = "doubao-seedance-1-5-pro"
			if _, err = build(r); err == nil {
				t.Fatal("search accepted on unsupported model")
			}
			r.Model = "doubao-seedance-2-5-260628"
			r.Resolution = "1080p"
			r.Images = make([]MediaReference, 30)
			for i := range r.Images {
				r.Images[i] = MediaReference{URL: fmt.Sprintf("https://example.test/%d.png", i), Order: i}
			}
			body, err = build(r)
			if err != nil || len(body["content"].([]any)) != 31 {
				t.Fatalf("2.5 references truncated: %v", err)
			}
			r.Images = append(r.Images, MediaReference{URL: "https://example.test/overflow.png"})
			if _, err = build(r); err == nil {
				t.Fatal("overflow accepted")
			}
			r.Images = nil
			r.Audios = []MediaReference{{URL: "https://example.test/audio.mp3"}}
			if _, err = build(r); err != nil {
				t.Fatalf("2.5 audio-only: %v", err)
			}
			r.Model = "doubao-seedance-2-0-260128"
			if _, err = build(r); err == nil {
				t.Fatal("2.0 audio-only accepted")
			}
			for _, count := range []int{0, 3} {
				state, err := adapter.ParsePoll(context.Background(), PollContext{TaskID: "local-only"}, []byte(fmt.Sprintf(`{"id":"local-only","status":"succeeded","content":{"video_url":"https://example.test/result.mp4"},"usage":{"tool_usage":{"web_search":%d}}}`, count)))
				if err != nil || state.Result == nil || state.Status != StatusSucceeded {
					t.Fatalf("poll: %#v %v", state, err)
				}
				raw, _ := json.Marshal(state.Result.Usage)
				var usage struct {
					ToolUsage struct {
						Search *int `json:"web_search"`
					} `json:"tool_usage"`
				}
				if err := json.Unmarshal(raw, &usage); err != nil || usage.ToolUsage.Search == nil || *usage.ToolUsage.Search != count {
					t.Fatalf("usage lost: %s", raw)
				}
			}
		})
	}
}

func TestArkOptionalSearchSwitch(t *testing.T) {
	adapter := officialPackageAdapter(t, "volcengine-ark-seedance.yingce-plugin", "volcengine-ark-video")
	for _, options := range []map[string]map[string]any{nil, {}, {"volcengine-ark-video": {}}} {
		spec, err := adapter.BuildCreate(context.Background(), RequestContext{Request: GenerationRequest{
			Capability: CapabilityVideo, Model: "doubao-seedance-2-0-260128", Prompt: "story", Duration: 5, ProviderOptions: options,
		}})
		if err != nil {
			t.Fatalf("omitted search switch rejected: %v", err)
		}
		if _, exists := manifestTestBody(t, spec)["tools"]; exists {
			t.Fatal("omitted search switch emitted tools")
		}
	}
}
