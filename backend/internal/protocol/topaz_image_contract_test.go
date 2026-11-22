package protocol

import (
	"context"
	"testing"
)

func TestTopazImageEnhanceContract(t *testing.T) {
	adapter := officialPackageAdapter(t, "topaz-image-enhance.yingce-plugin", "topaz-image-enhance")
	ctx := context.Background()
	request := GenerationRequest{Capability: CapabilityImage, Model: "Standard V2", Images: []MediaReference{{DataURL: "data:image/png;base64,aGVsbG8="}}, ImageCount: 1, ProviderOptions: map[string]map[string]any{"topaz-image-enhance": {"output_width": 2048, "output_height": 1024}}}
	for _, model := range []string{"Standard V2", "Low Resolution V2", "CGI", "High Fidelity V2", "Text Refine"} {
		request.Model = model
		spec, err := adapter.BuildCreate(ctx, RequestContext{Request: request})
		if err != nil {
			t.Fatal(err)
		}
		body := manifestTestBody(t, spec)
		if spec.Path != "/enhance/async" || spec.Auth.Header != "X-API-Key" || len(spec.Files) != 1 || spec.Files[0].Name != "image" || body["output_width"] != float64(2048) || body["output_height"] != float64(1024) || body["model"] != model || body["crop_to_fill"] != false {
			t.Fatalf("lost enhancement parameters: %#v %#v", spec, body)
		}
	}
	created, err := adapter.ParseCreate(ctx, []byte(`{"process_id":"job-1"}`))
	if err != nil || created.TaskID != "job-1" || created.Status != StatusPending {
		t.Fatalf("create: %#v %v", created, err)
	}
	pollContext := PollContext{Request: request, Model: request.Model, TaskID: created.TaskID}
	for status, expected := range map[string]Status{"Completed": StatusSucceeded, "Failed": StatusFailed, "Cancelled": StatusCancelled, "Processing": StatusProcessing} {
		state, err := adapter.ParsePoll(ctx, pollContext, []byte(`{"status":"`+status+`"}`))
		if err != nil || state.Status != expected {
			t.Fatalf("status %s: %#v %v", status, state, err)
		}
	}
	download, err := adapter.(ResultAdapter).BuildResult(ctx, pollContext)
	if err != nil || download.Path != "/download/job-1" || download.Auth.Header != "X-API-Key" {
		t.Fatalf("download: %#v %v", download, err)
	}
	request.ProviderOptions["topaz-image-enhance"]["output_width"] = 1.5
	if _, err := adapter.BuildCreate(ctx, RequestContext{Request: request}); err == nil {
		t.Fatal("fractional pixels accepted")
	}
}
