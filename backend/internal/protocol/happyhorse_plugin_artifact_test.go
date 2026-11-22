package protocol

import (
	"bytes"
	"context"
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestHappyHorsePluginRejectsPromptTruncationAndPreservesUnicodeText(t *testing.T) {
	for origin, adapter := range happyHorseAdapters(t) {
		for _, item := range []struct {
			name       string
			prompt     string
			namespaced any
			allowed    bool
		}{
			{"latin-limit", strings.Repeat("a", 5000), nil, true},
			{"latin-overflow", strings.Repeat("a", 5001), nil, false},
			{"unicode-latin-limit", strings.Repeat("é", 5000), nil, true},
			{"emoji-limit", strings.Repeat("🎥", 5000), nil, true},
			{"chinese-limit", strings.Repeat("拍", 2500), nil, true},
			{"chinese-overflow", strings.Repeat("拍", 2501), nil, false},
			{"supplementary-han-limit", strings.Repeat("𠀀", 2500), nil, true},
			{"supplementary-han-overflow", strings.Repeat("𠀀", 2501), nil, false},
			{"mixed-overflow", "拍" + strings.Repeat("a", 2500), nil, false},
			{"namespace-overflow", "short", strings.Repeat("拍", 2501), false},
			{"namespace-precedence", strings.Repeat("a", 5001), "切到[Image 2]，再[Image 1]", true},
			{"whitespace", " \n\t ", nil, false},
			{"namespace-non-text", "short", map[string]any{"text": "short"}, false},
		} {
			t.Run(origin+"/"+item.name, func(t *testing.T) {
				r := happyHorseRequest()
				r.Prompt = item.prompt
				if item.namespaced != nil {
					r.ProviderOptions = map[string]map[string]any{"dashscope-happyhorse-reference-video": {"prompt": item.namespaced}}
				}
				spec, err := adapter.BuildCreate(context.Background(), RequestContext{Request: r})
				if !item.allowed {
					if err == nil {
						t.Fatal("invalid prompt reached an upstream request and could be truncated")
					}
					return
				}
				if err != nil {
					t.Fatal(err)
				}
				encoded, err := json.Marshal(spec.Body)
				if err != nil {
					t.Fatal(err)
				}
				var body map[string]any
				if err := json.Unmarshal(encoded, &body); err != nil {
					t.Fatal(err)
				}
				want := any(item.prompt)
				if item.namespaced != nil {
					want = item.namespaced
				}
				if body["input"].(map[string]any)["prompt"] != want {
					t.Fatal("valid Unicode prompt was rewritten")
				}
			})
		}
	}
}

func happyHorseAdapters(t *testing.T) map[string]Adapter {
	t.Helper()
	root := filepath.Join("..", "..", "..", "plugin-packages")
	source, err := os.ReadFile(filepath.Join(root, "dashscope-happyhorse-reference-video", "manifest.json"))
	if err != nil {
		t.Fatal(err)
	}
	archive, err := os.ReadFile(filepath.Join(root, "dashscope-happyhorse-reference-video.yingce-plugin"))
	if err != nil {
		t.Fatal(err)
	}
	pkg, err := ParsePluginPackage(archive)
	if err != nil {
		t.Fatal(err)
	}
	if !bytes.Equal(source, pkg.ManifestRaw) {
		t.Fatal("package manifest differs from source")
	}
	adapters := map[string]Adapter{}
	for name, data := range map[string][]byte{"source": source, "package": pkg.ManifestRaw} {
		loaded, err := LoadInstalledProviders(data, nil)
		if err != nil {
			t.Fatal(err)
		}
		for _, adapter := range loaded {
			if adapter.Metadata().ID == "dashscope-happyhorse-reference-video" {
				adapters[name] = adapter
			}
		}
	}
	if len(adapters) != 2 {
		t.Fatal("native HappyHorse reference provider missing")
	}
	return adapters
}

func happyHorseRequest() GenerationRequest {
	return GenerationRequest{Capability: CapabilityVideo, Model: "happyhorse-1.1-r2v", Prompt: "[Image 1] meets [Image 2]",
		Operation: "reference_to_video", Duration: 7, AspectRatio: "4:3", Resolution: "720P",
		Images: []MediaReference{{URL: "https://example.com/b.png", Role: "reference_image", Order: 2}, {URL: "https://example.com/a.png", Role: "reference_image", Order: 1}}}
}

func TestHappyHorsePluginBuildsNativeOrderedReferences(t *testing.T) {
	for origin, adapter := range happyHorseAdapters(t) {
		t.Run(origin, func(t *testing.T) {
			r := happyHorseRequest()
			r.Output = OutputOptions{Duration: 9, AspectRatio: "3:4", Resolution: "1080P", Watermark: true}
			r.ProviderOptions = map[string]map[string]any{"dashscope-happyhorse-reference-video": {"prompt": "original [Image 2]", "seed": 0}}
			spec, err := adapter.BuildCreate(context.Background(), RequestContext{Request: r})
			if err != nil {
				t.Fatal(err)
			}
			if spec.Path != "/api/v1/services/aigc/video-generation/video-synthesis" || spec.Method != "POST" || spec.Headers["X-DashScope-Async"] != "enable" {
				t.Fatalf("wrong native create: %#v", spec)
			}
			data, _ := json.Marshal(spec.Body)
			var body map[string]any
			if err := json.Unmarshal(data, &body); err != nil {
				t.Fatal(err)
			}
			input := body["input"].(map[string]any)
			media := input["media"].([]any)
			parameters := body["parameters"].(map[string]any)
			if body["model"] != r.Model || input["prompt"] != "original [Image 2]" || len(media) != 2 || media[0].(map[string]any)["url"] != r.Images[1].URL || media[1].(map[string]any)["url"] != r.Images[0].URL || media[0].(map[string]any)["type"] != "reference_image" {
				t.Fatalf("references or prompt changed: %s", data)
			}
			if parameters["ratio"] != "3:4" || parameters["resolution"] != "1080P" || parameters["duration"] != float64(9) || parameters["watermark"] != true || parameters["seed"] != float64(0) {
				t.Fatalf("output contract changed: %s", data)
			}
			poll, err := adapter.BuildPoll(context.Background(), PollContext{TaskID: "original-task", Model: r.Model})
			if err != nil || poll.Method != "GET" || poll.Path != "/api/v1/tasks/original-task" {
				t.Fatalf("wrong native poll: %#v %v", poll, err)
			}
		})
	}
}

func TestHappyHorsePluginRejectsUnsupportedInputs(t *testing.T) {
	for origin, adapter := range happyHorseAdapters(t) {
		for name, mutate := range map[string]func(*GenerationRequest){
			"wrongVersion":    func(r *GenerationRequest) { r.Model = "happyhorse-2.0-r2v" },
			"firstFrameModel": func(r *GenerationRequest) { r.Model = "happyhorse-1.1-i2v" },
			"wrongOperation":  func(r *GenerationRequest) { r.Operation = "image_to_video" },
			"zeroReferences":  func(r *GenerationRequest) { r.Images = nil },
			"tooManyReferences": func(r *GenerationRequest) {
				for len(r.Images) < 10 {
					r.Images = append(r.Images, r.Images[0])
				}
			},
			"firstFrameRole": func(r *GenerationRequest) { r.Images[0].Role = "first_frame" },
			"videoInput":     func(r *GenerationRequest) { r.Videos = []MediaReference{{URL: "https://example.com/a.mp4"}} },
			"audioInput":     func(r *GenerationRequest) { r.Audios = []MediaReference{{URL: "https://example.com/a.mp3"}} },
			"shortDuration":  func(r *GenerationRequest) { r.Duration = 2 },
			"longDuration":   func(r *GenerationRequest) { r.Duration = 16 },
			"invalidTier":    func(r *GenerationRequest) { r.Resolution = "2K" },
			"invalidRatio":   func(r *GenerationRequest) { r.AspectRatio = "2:1" },
			"soundToggle":    func(r *GenerationRequest) { r.GenerateAudio = true },
			"batchOutput":    func(r *GenerationRequest) { r.Output.Count = 2 },
			"emptyPrompt":    func(r *GenerationRequest) { r.Prompt = "" },
		} {
			t.Run(origin+"/"+name, func(t *testing.T) {
				r := happyHorseRequest()
				mutate(&r)
				if _, err := adapter.BuildCreate(context.Background(), RequestContext{Request: r}); err == nil {
					t.Fatal("unsupported request was admitted")
				}
			})
		}
	}
}

func TestHappyHorsePluginParsesNativeTaskResults(t *testing.T) {
	for origin, adapter := range happyHorseAdapters(t) {
		t.Run(origin, func(t *testing.T) {
			created, err := adapter.ParseCreate(context.Background(), []byte(`{"output":{"task_id":"original-task","task_status":"PENDING"}}`))
			if err != nil || created.TaskID != "original-task" || created.Status != StatusPending {
				t.Fatalf("create: %#v %v", created, err)
			}
			for _, state := range []string{"RUNNING", "SUCCEEDED", "FAILED", "CANCELED", "UNKNOWN"} {
				payload := map[string]any{"output": map[string]any{"task_status": state}}
				if state == "SUCCEEDED" {
					payload["output"].(map[string]any)["video_url"] = "https://example.com/result.mp4"
				}
				data, _ := json.Marshal(payload)
				result, err := adapter.ParsePoll(context.Background(), PollContext{TaskID: "original-task"}, data)
				if err != nil {
					t.Fatal(err)
				}
				if result.TaskID != "original-task" {
					t.Fatal("original task ID lost")
				}
				if state == "SUCCEEDED" {
					if result.Status != StatusSucceeded || result.Result == nil || len(result.Result.Videos) != 1 || !result.Result.Videos[0].Ephemeral {
						t.Fatalf("missing real ephemeral video: %#v", result)
					}
				} else if state == "RUNNING" {
					if result.Status != StatusProcessing {
						t.Fatalf("running: %#v", result)
					}
				} else if state == "CANCELED" {
					if result.Status != StatusCancelled {
						t.Fatalf("canceled task lost its terminal status: %#v", result)
					}
				} else if result.Status == StatusSucceeded || result.Status == StatusPending {
					t.Fatalf("terminal failure became active/success: %#v", result)
				}
			}
			for _, data := range []string{`{"output":{"task_status":"SUCCEEDED"}}`, `{"code":"InvalidApiKey","message":"rejected"}`} {
				result, err := adapter.ParsePoll(context.Background(), PollContext{TaskID: "original-task"}, []byte(data))
				if err != nil || result.Status != StatusFailed || result.Result != nil {
					t.Fatalf("false success: %#v %v", result, err)
				}
			}
			missing, err := adapter.ParseCreate(context.Background(), []byte(`{"output":{"task_status":"PENDING"}}`))
			if err != nil || missing.Status != StatusFailed {
				t.Fatalf("missing task ID admitted: %#v %v", missing, err)
			}
			if _, err := adapter.ParseCreate(context.Background(), []byte("not json")); err == nil {
				t.Fatal("non-JSON response admitted")
			}
		})
	}
}

func TestHappyHorsePluginValidatesOptionalSeedWithoutRewriting(t *testing.T) {
	for origin, adapter := range happyHorseAdapters(t) {
		for _, item := range []struct {
			name    string
			seed    any
			allowed bool
		}{
			{"unspecified", nil, true},
			{"zero", 0, true},
			{"maximum", 2147483647, true},
			{"negative", -1, false},
			{"overflow", int64(2147483648), false},
			{"fractional", 0.5, false},
			{"string", "12", false},
			{"boolean", true, false},
			{"empty-string", "", false},
		} {
			t.Run(origin+"/"+item.name, func(t *testing.T) {
				r := happyHorseRequest()
				r.ProviderOptions = map[string]map[string]any{"dashscope-happyhorse-reference-video": {"seed": item.seed}}
				spec, err := adapter.BuildCreate(context.Background(), RequestContext{Request: r})
				if !item.allowed {
					if err == nil {
						t.Fatalf("invalid seed reached upstream request: %#v", item.seed)
					}
					return
				}
				if err != nil {
					t.Fatal(err)
				}
				data, err := json.Marshal(spec.Body)
				if err != nil {
					t.Fatal(err)
				}
				var body map[string]any
				if err := json.Unmarshal(data, &body); err != nil {
					t.Fatal(err)
				}
				parameters := body["parameters"].(map[string]any)
				if item.seed == nil {
					if _, exists := parameters["seed"]; exists {
						t.Fatal("unspecified seed was invented")
					}
				} else if parameters["seed"] != float64(item.seed.(int)) {
					t.Fatalf("valid seed was rewritten: %s", data)
				}
			})
		}
	}
}
