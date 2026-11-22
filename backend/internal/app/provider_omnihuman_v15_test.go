package app

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"infinite-canvas/backend/internal/protocol"
)

func TestOmniV15HostSignsNativeRequestAndWaitsForDone(t *testing.T) {
	raw, err := os.ReadFile(filepath.Join("..", "..", "..", "plugin-packages", "volcengine-omnihuman-v15.yingce-plugin"))
	if err != nil {
		t.Fatal(err)
	}
	pkg, err := protocol.ParsePluginPackage(raw)
	if err != nil {
		t.Fatal(err)
	}
	adapters, err := protocol.LoadInstalledProviders(pkg.ManifestRaw, nil)
	if err != nil || len(adapters) != 1 {
		t.Fatalf("load: %v", err)
	}
	t.Setenv("CANVAS_ALLOWED_PRIVATE_UPSTREAM_HOSTS", "127.0.0.1")
	creates, polls, downloads := 0, 0, 0
	output := []byte("OmniHuman transport fixture; not a generated video")
	var server *httptest.Server
	server = httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/result.mp4" {
			downloads++
			if polls != 2 {
				t.Error("premature download")
			}
			w.Header().Set("Content-Type", "video/mp4")
			_, _ = w.Write(output)
			return
		}
		if r.URL.Path != "/" || r.Method != "POST" || r.URL.Query().Get("Version") != "2022-08-31" {
			t.Errorf("wrong endpoint %s", r.URL)
		}
		authorization := r.Header.Get("Authorization")
		if !strings.HasPrefix(authorization, "HMAC-SHA256 ") || !strings.Contains(authorization, "/cn-north-1/cv/request") || r.Header.Get("X-Date") == "" || r.Header.Get("X-Content-Sha256") == "" {
			t.Error("missing scoped signature")
		}
		var body map[string]any
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			t.Error(err)
			return
		}
		if body["req_key"] != "jimeng_realman_avatar_picture_omni_v15" {
			t.Error("wrong model key")
		}
		w.Header().Set("Content-Type", "application/json")
		switch r.URL.Query().Get("Action") {
		case "CVSubmitTask":
			creates++
			if body["image_url"] != "https://example.com/person.png" || body["audio_url"] != "https://example.com/song.mp3" || body["pe_fast_mode"] != false || body["prompt"] != "唱歌，梦核" || len(body) != 5 {
				t.Errorf("lost fields: %#v", body)
			}
			_, _ = w.Write([]byte(`{"code":10000,"data":{"task_id":"omni-task"}}`))
		case "CVGetResult":
			polls++
			if body["task_id"] != "omni-task" || len(body) != 2 {
				t.Error("poll identity lost")
			}
			state := "generating"
			if polls == 2 {
				state = "done"
			}
			_ = json.NewEncoder(w).Encode(map[string]any{"code": 10000, "data": map[string]any{"status": state, "video_url": server.URL + "/result.mp4"}})
		default:
			t.Error("unexpected action")
			http.NotFound(w, r)
		}
	}))
	defer server.Close()
	input := canvasGenerationInput{Mode: "video", Prompt: "唱歌，梦核", Config: providerConfig{BaseURL: server.URL, APIKey: "fixture-ak", SecretKey: "fixture-sk", Model: "omnihuman-1.5", Count: "1", VideoSeconds: "auto", VQuality: "auto", Size: "adaptive"}, ReferenceImages: []providerMedia{{ID: "person", URL: "https://example.com/person.png"}}, ReferenceAudios: []providerMedia{{ID: "song", URL: "https://example.com/song.mp3", DurationMs: 6374}}, Metadata: map[string]any{"providerOptions": map[string]any{"volcengine-omnihuman-v15": map[string]any{"fastMode": false}}}}
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	result, err := runProtocolAdapterTaskWithPolicy(ctx, input, adapters[0], videoPollPolicy{Interval: time.Millisecond})
	if err != nil || creates != 1 || polls != 2 || downloads != 1 {
		t.Fatalf("chain %d/%d/%d: %v", creates, polls, downloads, err)
	}
	video, ok := result["video"].(map[string]interface{})
	if !ok || video["dataUrl"] != inputImageDataURL("video/mp4", output) {
		t.Fatal("result bytes lost")
	}
}
