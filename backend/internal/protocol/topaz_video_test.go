package protocol

import (
	"context"
	"encoding/json"
	"os"
	"path/filepath"
	"reflect"
	"testing"
)

type topazUploadProtocol interface {
	Adapter
	UploadAdapter
	UploadRecoveryAdapter
}

func loadTopazUploadProtocol(t *testing.T) topazUploadProtocol {
	t.Helper()
	raw, err := os.ReadFile(filepath.Join("..", "..", "..", "plugin-packages", "topaz-video-enhance", "manifest.json"))
	if err != nil {
		t.Fatal(err)
	}
	adapters, err := LoadInstalledProviders(raw, nil)
	if err != nil || len(adapters) != 1 {
		t.Fatalf("load independent upload protocol: %v", err)
	}
	adapter, ok := adapters[0].(topazUploadProtocol)
	if !ok {
		t.Fatal("upload interfaces missing")
	}
	return adapter
}

func TestTopazVideoKeepsExplicitProductionOptions(t *testing.T) {
	var options map[string]any
	_ = json.Unmarshal([]byte(`{"source":{"container":"mov"},"filters":[{"model":"prob-4","auto":"Auto"},{"model":"apo-8","fps":60,"slowmo":2}],"output":{"resolution":{"width":3840,"height":1648},"frameRate":60,"audioTransfer":"Copy","audioCodec":"AAC","videoEncoder":"H264","dynamicCompressionLevel":"Low","cropToFit":false}}`), &options)
	request := RequestContext{Request: GenerationRequest{Model: "apo-8", Videos: []MediaReference{{URL: "https://example.test/source.mov"}}, ProviderOptions: map[string]map[string]any{"topazVideo": options}}}
	a := loadTopazUploadProtocol(t)
	spec, err := a.BuildCreate(context.Background(), request)
	if err != nil || !reflect.DeepEqual(spec.Body, options) || spec.Path != "/video/express" || spec.Auth.Header != "X-API-Key" {
		t.Fatalf("options changed: %v", err)
	}
	output := options["output"].(map[string]any)
	delete(output, "audioTransfer")
	if _, err := a.BuildCreate(context.Background(), request); err == nil {
		t.Fatal("silent audio default accepted")
	}
	output["audioTransfer"] = "Copy"
	delete(output, "dynamicCompressionLevel")
	if _, err := a.BuildCreate(context.Background(), request); err == nil {
		t.Fatal("silent compression default accepted")
	}
	output["dynamicCompressionLevel"] = "Low"
	request.Request.Videos = append(request.Request.Videos, request.Request.Videos[0])
	if _, err := a.BuildCreate(context.Background(), request); err == nil {
		t.Fatal("extra video silently ignored")
	}
}

func TestHostPluginPreservesTopazUploadInterfaces(t *testing.T) {
	raw, err := os.ReadFile(filepath.Join("..", "..", "..", "plugin-packages", "agnes-video-v20", "manifest.json"))
	if err != nil {
		t.Fatal(err)
	}
	var document map[string]any
	if err := json.Unmarshal(raw, &document); err != nil {
		t.Fatal(err)
	}
	document["runtime"] = map[string]any{"backend": "host:upload-fixture"}
	raw, _ = json.Marshal(document)
	engine := loadTopazUploadProtocol(t)
	adapters, err := LoadInstalledProviders(raw, func(name string) (Adapter, bool) { return engine, name == "upload-fixture" })
	if err != nil {
		t.Fatal(err)
	}
	if len(adapters) != 1 {
		t.Fatal("wrong provider count")
	}
	upload, ok := adapters[0].(UploadAdapter)
	if !ok {
		t.Fatal("host wrapper dropped upload execution")
	}
	count, err := upload.ParseUploadedVideos(context.Background(), PollContext{}, []byte(`{"status":"processing"}`))
	if err != nil || count != 1 {
		t.Fatal("host wrapper changed upload status")
	}
	if _, ok := adapters[0].(UploadRecoveryAdapter); !ok {
		t.Fatal("host wrapper dropped missing checkpoint recovery")
	}
}

func TestTopazVideoStatusAndUploadRecovery(t *testing.T) {
	a := loadTopazUploadProtocol(t)
	ctx := context.Background()
	poll := PollContext{TaskID: "job", Request: GenerationRequest{Videos: []MediaReference{{URL: "https://example.test/source.mp4"}}}}
	for _, status := range []string{"initializing", "preprocessing", "processing", "postprocessing", "complete"} {
		count, err := a.ParseUploadedVideos(ctx, poll, []byte(`{"status":"`+status+`"}`))
		if err != nil || count != 1 {
			t.Fatalf("received input not recognized for %s", status)
		}
	}
	for _, raw := range []string{`{"status":"accepted"}`, `{"status":"requested"}`, `{"status":"failed"}`, `{"status":"canceled"}`, `{"status":"unknown"}`} {
		if _, err := a.ParseUploadedVideos(ctx, poll, []byte(raw)); err == nil {
			t.Fatalf("ambiguous upload state accepted: %s", raw)
		}
	}
	uploads, err := a.RecoverUploads(ctx, poll, []byte(`{"status":"accepted","urls":["https://example.test/signed?signature=test"]}`))
	if err != nil || len(uploads) != 1 || uploads[0].URL == "" {
		t.Fatal("outstanding upload URL lost")
	}
	if result, err := a.ParsePoll(ctx, poll, []byte(`{"status":"complete"}`)); err == nil && result.Status != StatusFailed {
		t.Fatal("complete without result accepted")
	}
	for source, expected := range map[string]Status{"failed": StatusFailed, "canceled": StatusCancelled, "canceling": StatusPending} {
		result, err := a.ParsePoll(ctx, poll, []byte(`{"status":"`+source+`"}`))
		if err != nil || result.Status != expected {
			t.Fatalf("wrong terminal semantics for %s", source)
		}
	}
	spec, err := a.BuildCancel(ctx, poll)
	if err != nil || spec.Method != "DELETE" || spec.Path != "/video/job" {
		t.Fatal("incorrect cancel endpoint")
	}
}
