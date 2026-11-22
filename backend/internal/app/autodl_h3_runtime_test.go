package app

import (
	"context"
	"strings"
	"testing"

	"infinite-canvas/backend/internal/model"
	"infinite-canvas/backend/internal/protocol"
)

func TestPluginRuntimeKeepsNativeH3WorkflowsAfterReload(t *testing.T) {
	runtime, err := newPluginRuntime(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	for _, phase := range []string{"startup", "reload"} {
		t.Run(phase, func(t *testing.T) {
			if phase == "reload" {
				if err := runtime.reload(); err != nil {
					t.Fatal(err)
				}
			}
			ctx := withProtocolRegistry(context.Background(), runtime.registrySnapshot())
			adapter, ok := protocolAdapterForContext(ctx, string(model.ChannelInterfaceAutoDLH3Video))
			if !ok {
				t.Fatal("configured H3 models have no adapter in the live plugin registry")
			}
			if !adapter.Metadata().RequiresPublicMediaURLs {
				t.Fatal("H3 references must use the host's public URL preparation")
			}
			for _, workflow := range protocol.AutoDLH3Workflows() {
				request := protocol.GenerationRequest{
					Model: workflow.ID, Prompt: "character raises her hand",
					Duration: workflow.MaxSecond, Resolution: "480p", AspectRatio: "9:16",
				}
				for index := 0; index < workflow.MinImages; index++ {
					request.Images = append(request.Images, protocol.MediaReference{URL: "https://cdn.example/reference.png"})
				}
				if workflow.ID == "minimax_h3_image_audio_to_video" {
					request.Audios = []protocol.MediaReference{{URL: "https://cdn.example/reference.mp3"}}
				}
				spec, err := adapter.BuildCreate(ctx, protocol.RequestContext{Request: request})
				if err != nil {
					t.Fatalf("%s: %v", workflow.ID, err)
				}
				wantPath := "/api/v1/comfyui/comfyui_workflow/" + workflow.ID
				if spec.Path != wantPath {
					t.Fatalf("%s request path = %q, want %q", workflow.ID, spec.Path, wantPath)
				}
			}
		})
	}
}

func TestAutoDLH3RuntimeHydratesOwnedReferencesToPublicURL(t *testing.T) {
	t.Setenv("CANVAS_PUBLIC_BASE_URL", "https://canvas.example.com")
	svc := newResourceTestService(t)
	resource := model.Resource{ID: "h3-reference", UserID: "h3-owner", Status: model.ResourceStatusReady, Provider: "local", ObjectKey: "reference.png", MimeType: "image/png"}
	if err := svc.repo.CreateResource(&resource); err != nil {
		t.Fatal(err)
	}
	runtime, err := newPluginRuntime(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	for _, phase := range []string{"startup", "reload"} {
		t.Run(phase, func(t *testing.T) {
			if phase == "reload" {
				if err := runtime.reload(); err != nil {
					t.Fatal(err)
				}
			}
			ctx := withProtocolRegistry(context.Background(), runtime.registrySnapshot())
			input := canvasGenerationInput{
				Mode: "video", Prompt: "character raises her hand",
				Config:          providerConfig{InterfaceType: string(model.ChannelInterfaceAutoDLH3Video), Model: "minimax_h3_image_audio_to_video_v2_15s", VideoSeconds: "15", Size: "9:16", VQuality: "480p"},
				ReferenceImages: []providerMedia{{ID: resource.ID, StorageKey: "resource:" + resource.ID, Role: "first_frame"}},
			}
			policy := providerMediaHydrationPolicyFor(ctx, input)
			if !policy.requireURL || !policy.preferURL {
				t.Fatal("H3 resource references would be hydrated as inline bytes")
			}
			if err := svc.hydrateGenerationMedia(resource.UserID, &input, policy); err != nil {
				t.Fatal(err)
			}
			media := input.ReferenceImages[0]
			if !strings.HasPrefix(media.URL, "https://canvas.example.com/api/public/resources/"+resource.ID+"/file?") || media.DataURL != "" {
				t.Fatal("owned reference did not become an ephemeral signed public URL")
			}
			adapter, _ := protocolAdapterForContext(ctx, input.Config.InterfaceType)
			spec, err := adapter.BuildCreate(ctx, protocol.RequestContext{Request: protocolRequestFromInput(input)})
			if err != nil {
				t.Fatal(err)
			}
			if spec.Body.(map[string]any)["ref_image_0"] != media.URL {
				t.Fatal("H3 request lost the prepared reference URL")
			}
			foreign := canvasGenerationInput{Mode: "video", ReferenceImages: []providerMedia{{StorageKey: "resource:" + resource.ID}}}
			if err := svc.hydrateGenerationMedia("different-owner", &foreign, policy); err == nil {
				t.Fatal("H3 accepted another user's reference resource")
			}
		})
	}
}
