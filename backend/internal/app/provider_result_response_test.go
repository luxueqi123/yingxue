package app

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"infinite-canvas/backend/internal/protocol"
)

func fileResultHTTPAdapter(t *testing.T) protocol.Adapter {
	t.Helper()
	adapters, err := protocol.LoadInstalledProviders([]byte(`{
 "apiVersion":"yingce.plugin/v2","id":"file-result-test","name":"File result","version":"1.0.0",
 "contributes":{"providers":[{
  "id":"file-result-test","label":"File result","capabilities":["video"],"scopes":["canvas"],"auth":{"type":"bearer","field":"apiKey"},
  "create":{"method":"POST","path":"/v1/video_generation"},
  "poll":{"method":"GET","path":"/v1/query/video_generation"},
  "response":{"taskIdPaths":["task_id"],"statusPaths":["status"],"metadata":{"file_id":{"$ref":"response.file_id"}}},
  "result":{"method":"GET","path":"/v1/files/retrieve","query":{"file_id":{"$ref":"metadata.file_id"}},
   "validations":[{"assert":{"$ref":"metadata.file_id"},"message":"missing file id"}],
   "response":{"errorPaths":["base_resp.status_code"],"messagePaths":["base_resp.status_msg"],"resultPaths":["file.download_url"],"resultKind":"video","resultEphemeral":true}}
 }]}}`), nil)
	if err != nil {
		t.Fatal(err)
	}
	return adapters[0]
}

func TestProtocolResultRetrievesFileURLBeforeDownloadingMedia(t *testing.T) {
	t.Setenv("CANVAS_ALLOWED_PRIVATE_UPSTREAM_HOSTS", "127.0.0.1")
	for _, scenario := range []string{"success", "missing-file", "api-error", "empty-result", "non-json", "http-error", "download-error", "private-result"} {
		t.Run(scenario, func(t *testing.T) {
			retrieveCalls, downloadCalls := 0, 0
			var server *httptest.Server
			server = httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				switch r.URL.Path {
				case "/v1/files/retrieve":
					retrieveCalls++
					if r.URL.Query().Get("file_id") != "file-22" {
						t.Errorf("wrong file id: %q", r.URL.Query().Get("file_id"))
					}
					if r.Header.Get("Authorization") != "Bearer contract-test-key" {
						t.Error("retrieval lost host authentication")
					}
					w.Header().Set("Content-Type", "application/json")
					switch scenario {
					case "api-error":
						fmt.Fprint(w, `{"base_resp":{"status_code":1001,"status_msg":"denied"},"file":{"download_url":"https://cdn.example/wrong.mp4"}}`)
					case "empty-result":
						fmt.Fprint(w, `{}`)
					case "non-json":
						fmt.Fprint(w, `not JSON`)
					case "http-error":
						http.Error(w, "denied", http.StatusForbidden)
					case "private-result":
						fmt.Fprint(w, `{"file":{"download_url":"http://192.168.123.199/video.mp4"},"base_resp":{"status_code":0}}`)
					default:
						_ = json.NewEncoder(w).Encode(map[string]any{"file": map[string]any{"download_url": server.URL + "/video.mp4"}, "base_resp": map[string]any{"status_code": 0}})
					}
				case "/video.mp4":
					downloadCalls++
					if scenario == "download-error" {
						http.Error(w, "expired", http.StatusForbidden)
						return
					}
					w.Header().Set("Content-Type", "video/mp4")
					fmt.Fprint(w, "contract-video-bytes")
				default:
					http.NotFound(w, r)
				}
			}))
			defer server.Close()
			adapter := fileResultHTTPAdapter(t)
			payload := `{"task_id":"task-11","status":"Success","file_id":"file-22"}`
			if scenario == "missing-file" {
				payload = `{"task_id":"task-11","status":"Success"}`
			}
			state, err := adapter.ParsePoll(context.Background(), protocol.PollContext{TaskID: "task-11"}, []byte(payload))
			if err != nil {
				t.Fatal(err)
			}
			input := canvasGenerationInput{Mode: "video", Config: providerConfig{BaseURL: server.URL, APIKey: "contract-test-key"}}
			output, err := finishProtocolAdapterResult(context.Background(), input, adapter, protocol.GenerationRequest{Model: "model"}, "task-11", state.Result, defaultVideoPollPolicy())
			if scenario != "success" {
				if err == nil || output != nil {
					t.Fatalf("invalid result became video: %#v %v", output, err)
				}
				if scenario == "missing-file" && retrieveCalls != 0 {
					t.Fatal("missing file id made retrieval request")
				}
				if scenario != "download-error" && downloadCalls != 0 {
					t.Fatal("invalid retrieval downloaded media")
				}
				return
			}
			if err != nil {
				t.Fatal(err)
			}
			video, ok := output["video"].(map[string]interface{})
			if !ok {
				t.Fatalf("video missing: %#v", output)
			}
			want := "data:video/mp4;base64," + base64.StdEncoding.EncodeToString([]byte("contract-video-bytes"))
			if video["dataUrl"] != want || video["mimeType"] != "video/mp4" || retrieveCalls != 1 || downloadCalls != 1 {
				t.Fatalf("retrieval JSON used as media: %#v", output)
			}
			if strings.Contains(fmt.Sprint(output), "file-22") {
				t.Fatal("private result metadata leaked into completed output")
			}
		})
	}
}

func TestProtocolBinaryResultEndpointRemainsBinary(t *testing.T) {
	t.Setenv("CANVAS_ALLOWED_PRIVATE_UPSTREAM_HOSTS", "127.0.0.1")
	calls := 0
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls++
		if r.URL.Path != "/v1/download/task-11" {
			t.Errorf("wrong binary path: %s", r.URL.Path)
		}
		w.Header().Set("Content-Type", "video/mp4")
		fmt.Fprint(w, "binary-result-bytes")
	}))
	defer server.Close()
	adapters, err := protocol.LoadInstalledProviders([]byte(`{
 "apiVersion":"yingce.plugin/v2","id":"binary-test","name":"Binary","version":"1.0.0",
 "contributes":{"providers":[{"id":"binary-test","label":"Binary","capabilities":["video"],"scopes":["canvas"],
 "create":{"method":"POST","path":"/create"},"result":{"method":"GET","path":"/download/{{taskId}}"},"response":{}}]}}`), nil)
	if err != nil {
		t.Fatal(err)
	}
	input := canvasGenerationInput{Mode: "video", Config: providerConfig{BaseURL: server.URL}}
	output, err := finishProtocolAdapterResult(context.Background(), input, adapters[0], protocol.GenerationRequest{}, "task-11", nil, defaultVideoPollPolicy())
	if err != nil {
		t.Fatal(err)
	}
	video := output["video"].(map[string]interface{})
	if calls != 1 || video["dataUrl"] != "data:video/mp4;base64,"+base64.StdEncoding.EncodeToString([]byte("binary-result-bytes")) {
		t.Fatalf("binary contract changed: %#v", output)
	}
}

func TestProtocolInlineResultSkipsFileLookup(t *testing.T) {
	result := &protocol.Result{Videos: []protocol.MediaReference{{DataURL: "data:video/mp4;base64,Ynl0ZXM="}}}
	output, err := finishProtocolAdapterResult(context.Background(), canvasGenerationInput{Mode: "video"}, fileResultHTTPAdapter(t), protocol.GenerationRequest{}, "task-11", result, defaultVideoPollPolicy())
	if err != nil || output == nil {
		t.Fatalf("inline result incorrectly required file lookup: %#v %v", output, err)
	}
}
