package app

import (
	"context"
	"encoding/base64"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"infinite-canvas/backend/internal/protocol"
)

func TestTopazImageRuntime(t *testing.T) {
	raw, err := os.ReadFile(filepath.Join("..", "..", "..", "plugin-packages", "topaz-image-enhance.yingce-plugin"))
	if err != nil {
		t.Fatal(err)
	}
	pkg, err := protocol.ParsePluginPackage(raw)
	if err != nil {
		t.Fatal(err)
	}
	adapters, err := protocol.LoadInstalledProviders(pkg.ManifestRaw, nil)
	if err != nil {
		t.Fatal(err)
	}
	png, _ := base64.StdEncoding.DecodeString("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aTAAAAABJRU5ErkJggg==")
	for _, failure := range []string{"", "status", "download"} {
		t.Run("failure="+failure, func(t *testing.T) {
			var calls []string
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				calls = append(calls, r.Method+" "+r.URL.Path)
				if r.Header.Get("X-API-Key") != "test-key" {
					http.Error(w, "missing auth", 401)
					return
				}
				switch r.URL.Path {
				case "/image/v1/enhance/async":
					if err := r.ParseMultipartForm(1 << 20); err != nil {
						t.Error(err)
						http.Error(w, "multipart", 400)
						return
					}
					defer r.MultipartForm.RemoveAll()
					file, _, err := r.FormFile("image")
					if err != nil {
						t.Error(err)
						http.Error(w, "missing image", 400)
						return
					}
					defer file.Close()
					data, _ := io.ReadAll(file)
					if string(data) != string(png) || r.FormValue("model") != "Standard V2" || r.FormValue("output_width") != "2" || r.FormValue("output_height") != "2" {
						t.Error("lost source or enhancement dimensions")
					}
					w.Header().Set("Content-Type", "application/json")
					_, _ = w.Write([]byte(`{"process_id":"topaz-job"}`))
				case "/image/v1/status/topaz-job":
					w.Header().Set("Content-Type", "application/json")
					if failure == "status" {
						_, _ = w.Write([]byte(`{"status":"Failed","message":"enhance failed"}`))
						return
					}
					_, _ = w.Write([]byte(`{"status":"Completed"}`))
				case "/image/v1/download/topaz-job":
					if failure == "download" {
						http.Error(w, "download unavailable", 503)
						return
					}
					w.Header().Set("Content-Type", "image/png")
					_, _ = w.Write(png)
				default:
					http.NotFound(w, r)
				}
			}))
			defer server.Close()
			config := providerConfig{BaseURL: server.URL + "/image/v1", APIKey: "test-key", Model: "Standard V2", Count: "1", AllowLocalChannel: true}
			ctx := withProviderOutboundPolicy(context.Background(), config)
			input := canvasGenerationInput{Mode: "image", Config: config, ReferenceImages: []providerMedia{{DataURL: "data:image/png;base64," + base64.StdEncoding.EncodeToString(png)}}, Metadata: map[string]interface{}{"providerOptions": map[string]any{"topaz-image-enhance": map[string]any{"output_width": 2, "output_height": 2}}}}
			result, err := runProtocolAdapterTaskWithPolicy(ctx, input, adapters[0], fastVideoPollPolicy())
			if failure == "" {
				if err != nil || result["mode"] != "image" || len(calls) != 3 {
					t.Fatalf("result=%#v err=%v calls=%v", result, err, calls)
				}
				images, ok := result["images"].([]interface{})
				if !ok || len(images) != 1 {
					t.Fatalf("missing image bytes: %#v", result)
				}
				image, ok := images[0].(map[string]interface{})
				if !ok || image["dataUrl"] != "data:image/png;base64,"+base64.StdEncoding.EncodeToString(png) {
					t.Fatalf("downloaded bytes changed: %#v", images)
				}
				svc := newResourceTestService(t)
				stored, err := svc.persistGeneratedMediaResult("user-1", result)
				if err != nil {
					t.Fatal(err)
				}
				storedImage := stored["images"].([]interface{})[0].(map[string]interface{})
				key := stringField(storedImage, "storageKey")
				if !strings.HasPrefix(key, "resource:") {
					t.Fatalf("missing persistent resource: %#v", storedImage)
				}
				resourceID := strings.TrimPrefix(key, "resource:")
				_, body, err := svc.OpenResource("user-1", resourceID)
				if err != nil {
					t.Fatal(err)
				}
				readBack, err := io.ReadAll(body)
				body.Close()
				if err != nil || string(readBack) != string(png) {
					t.Fatal("persisted image bytes changed")
				}
				if _, otherBody, err := svc.OpenResource("user-2", resourceID); err == nil {
					otherBody.Close()
					t.Fatal("another user could read the enhanced image")
				}
			} else if err == nil {
				t.Fatal("failure reported as success")
			}
			if failure == "status" && strings.Contains(strings.Join(calls, " "), "download") {
				t.Fatal("download after failed generation")
			}
		})
	}
}

func TestTopazImageCancellationRuntime(t *testing.T) {
	raw, err := os.ReadFile(filepath.Join("..", "..", "..", "plugin-packages", "topaz-image-enhance.yingce-plugin"))
	if err != nil {
		t.Fatal(err)
	}
	pkg, err := protocol.ParsePluginPackage(raw)
	if err != nil {
		t.Fatal(err)
	}
	adapters, err := protocol.LoadInstalledProviders(pkg.ManifestRaw, nil)
	if err != nil {
		t.Fatal(err)
	}
	registry, err := protocol.NewRegistry(adapters...)
	if err != nil {
		t.Fatal(err)
	}
	status := "Processing"
	reject := false
	var methods []string
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		methods = append(methods, r.Method+" "+r.URL.Path)
		if r.Header.Get("X-API-Key") != "test-key" {
			http.Error(w, "missing auth", 401)
			return
		}
		switch r.URL.Path {
		case "/image/v1/cancel/job-1":
			if r.Method != http.MethodDelete {
				http.Error(w, "method", 405)
				return
			}
			if reject {
				http.Error(w, "already completed", 409)
				return
			}
			w.WriteHeader(http.StatusNoContent)
		case "/image/v1/status/job-1":
			if r.Method != http.MethodGet {
				http.Error(w, "method", 405)
				return
			}
			w.Header().Set("Content-Type", "application/json")
			_, _ = io.WriteString(w, `{"status":"`+status+`"}`)
		default:
			http.NotFound(w, r)
		}
	}))
	defer server.Close()
	config := providerConfig{BaseURL: server.URL + "/image/v1", APIKey: "test-key", Model: "CGI", InterfaceType: "topaz-image-enhance", AllowLocalChannel: true, registry: registry}
	ctx := withProviderOutboundPolicy(withProtocolRegistry(context.Background(), registry), config)
	svc := &Service{pluginRuntime: &pluginRuntime{registry: registry}}
	if !canCancelProviderConfig(config) {
		t.Fatal("installed cancellation not discovered")
	}
	if canCancelProviderConfig(providerConfig{InterfaceType: config.InterfaceType, registry: emptyProtocolRegistry}) {
		t.Fatal("uninstalled protocol accepted")
	}
	if err := svc.cancelProviderTask(ctx, canvasGenerationInput{Mode: "image", Config: config}, "job-1"); err != nil {
		t.Fatal(err)
	}
	for rawStatus, expected := range map[string]providerCancellationOutcome{"Processing": providerCancellationPending, "Cancelled": providerCancellationConfirmed, "Completed": providerCancellationSucceeded, "Failed": providerCancellationFailed} {
		status = rawStatus
		outcome, _, err := svc.queryProviderCancellation(ctx, canvasGenerationInput{Mode: "image", Config: config}, "job-1")
		if err != nil || outcome != expected {
			t.Fatalf("status %s: %s %v", status, outcome, err)
		}
	}
	reject = true
	if err := svc.cancelProviderTask(ctx, canvasGenerationInput{Mode: "image", Config: config}, "job-1"); err == nil {
		t.Fatal("conflict was reported as success")
	}
	for _, method := range methods {
		if strings.Contains(method, "download") || strings.Contains(method, "enhance/async") {
			t.Fatal("cancellation submitted or downloaded a generation")
		}
	}
}
