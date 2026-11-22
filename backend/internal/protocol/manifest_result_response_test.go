package protocol

import (
	"context"
	"encoding/json"
	"strings"
	"testing"
)

const resultResponseManifest = `{
 "apiVersion":"yingce.plugin/v1","id":"file-result-test","name":"File result","version":"1.0.0",
 "contributes":{"providers":[{
  "id":"file-result-test","label":"File result","capabilities":["video"],"scopes":["canvas"],
  "create":{"method":"POST","path":"/v1/video_generation"},
  "poll":{"method":"GET","path":"/v1/query/video_generation","query":{"task_id":{"$ref":"taskId"}}},
  "response":{"taskIdPaths":["task_id"],"statusPaths":["status"],"metadata":{"file_id":{"$ref":"response.file_id"}}},
  "result":{"method":"GET","path":"/v1/files/retrieve","query":{"file_id":{"$ref":"metadata.file_id"}},
   "validations":[{"assert":{"$ref":"metadata.file_id"},"message":"missing file id"}],
   "response":{"errorPaths":["base_resp.status_code"],"messagePaths":["base_resp.status_msg"],"resultPaths":["file.download_url"],"resultKind":"video","resultEphemeral":true}}
 }]}}
`

func TestManifestResultPreservesFileIDWithoutReplacingTaskID(t *testing.T) {
	adapters, err := LoadInstalledProviders([]byte(resultResponseManifest), nil)
	if err != nil {
		t.Fatal(err)
	}
	adapter := adapters[0]
	c := PollContext{TaskID: "task-11"}
	state, err := adapter.ParsePoll(context.Background(), c, []byte(`{"task_id":"task-11","status":"Success","file_id":"file-22"}`))
	if err != nil {
		t.Fatal(err)
	}
	if state.Status != StatusSucceeded || state.TaskID != "task-11" || state.Result == nil {
		t.Fatalf("file metadata lost: %#v", state)
	}
	data, _ := json.Marshal(state.Result)
	var parsed struct {
		Metadata map[string]any `json:"metadata"`
	}
	if err := json.Unmarshal(data, &parsed); err != nil {
		t.Fatal(err)
	}
	c.Metadata = parsed.Metadata
	spec, err := adapter.(ResultAdapter).BuildResult(context.Background(), c)
	if err != nil || len(spec.Query["file_id"]) != 1 || spec.Query["file_id"][0] != "file-22" {
		t.Fatalf("file id not used: %#v %v", spec, err)
	}
	if _, err := adapter.(ResultAdapter).BuildResult(context.Background(), PollContext{TaskID: "task-11"}); err == nil {
		t.Fatal("missing file id fell back to task id or empty query")
	}
}

func TestManifestResultJSONResponseIsExplicitAndRejectsErrors(t *testing.T) {
	adapters, err := LoadInstalledProviders([]byte(resultResponseManifest), nil)
	if err != nil {
		t.Fatal(err)
	}
	parser, ok := adapters[0].(interface {
		ResultResponseAvailable() bool
		ParseResult(context.Context, PollContext, []byte) (*Result, error)
	})
	if !ok || !parser.ResultResponseAvailable() {
		t.Fatal("JSON result response is unavailable")
	}
	result, err := parser.ParseResult(context.Background(), PollContext{}, []byte(`{"file":{"download_url":"https://cdn.example/video.mp4"},"base_resp":{"status_code":0}}`))
	if err != nil || result == nil || len(result.Videos) != 1 || result.Videos[0].URL != "https://cdn.example/video.mp4" || !result.Videos[0].Ephemeral {
		t.Fatalf("file URL not parsed: %#v %v", result, err)
	}
	for _, body := range []string{`{"base_resp":{"status_code":1001,"status_msg":"rejected"},"file":{"download_url":"https://cdn.example/video.mp4"}}`, `{}`, `not JSON`} {
		if _, err := parser.ParseResult(context.Background(), PollContext{}, []byte(body)); err == nil {
			t.Fatalf("invalid file result accepted: %s", body)
		}
	}
}

func TestManifestResultRejectsIncompleteValidation(t *testing.T) {
	broken := strings.Replace(resultResponseManifest, `"message":"missing file id"`, `"message":""`, 1)
	if _, err := LoadInstalledProviders([]byte(broken), nil); err == nil {
		t.Fatal("result validation without an error message was accepted")
	}
}
