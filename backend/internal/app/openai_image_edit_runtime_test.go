package app

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"infinite-canvas/backend/internal/protocol"
)

func TestOpenAIImagesPackagedRequestUsesMultipartForEdits(t *testing.T) {
	raw, err := os.ReadFile(filepath.Join("..", "..", "..", "plugin-packages", "openai-images.yingce-plugin"))
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
	if adapters[0].Metadata().RequiresPublicMediaURLs {
		t.Fatal("multipart image inputs must permit authorized local media bytes")
	}
	image := []byte("source-image-bytes")
	secondImage := []byte("second-reference-bytes")
	mask := []byte("mask-image-bytes")
	encode := func(data []byte) string { return "data:image/png;base64," + base64.StdEncoding.EncodeToString(data) }
	for _, name := range []string{"reference", "masked", "transparent-source-as-mask", "portrait-4k-mask", "multi-reference-mask"} {
		masked := name != "reference"
		expectedMask := mask
		if name == "transparent-source-as-mask" {
			expectedMask = image
		}
		t.Run(name, func(t *testing.T) {
			calls := 0
			size, count := "1024x1024", "1"
			if masked {
				// Transport proof only: this fake upstream does not certify a real model's 2K output.
				size, count = "2752x1536", "2"
			}
			if name == "portrait-4k-mask" {
				size, count = "3584x4800", "1"
			}
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				calls++
				if r.URL.Path != "/v1/images/edits" || !strings.HasPrefix(r.Header.Get("Content-Type"), "multipart/form-data;") {
					t.Errorf("wrong edit request: %s %s %s", r.Method, r.URL.Path, r.Header.Get("Content-Type"))
				}
				if err := r.ParseMultipartForm(1 << 20); err != nil {
					t.Error(err)
					http.Error(w, "multipart", 400)
					return
				}
				defer r.MultipartForm.RemoveAll()
				checkFile := func(field string, want ...[]byte) {
					headers := r.MultipartForm.File[field]
					if len(headers) != len(want) {
						t.Errorf("%s file count: got %d want %d", field, len(headers), len(want))
						return
					}
					for index, header := range headers {
						file, err := header.Open()
						if err != nil {
							t.Error(err)
							return
						}
						got, err := io.ReadAll(file)
						file.Close()
						if err != nil || !bytes.Equal(got, want[index]) || header.Header.Get("Content-Type") != "image/png" {
							t.Errorf("%s[%d] bytes/MIME mismatch: %q %s %v", field, index, got, header.Header.Get("Content-Type"), err)
						}
					}
				}
				if name == "multi-reference-mask" {
					checkFile("image[]", image, secondImage)
				} else {
					checkFile("image", image)
				}
				if masked {
					checkFile("mask", expectedMask)
				} else if _, _, err := r.FormFile("mask"); err == nil {
					t.Error("unexpected mask")
				}
				if r.FormValue("model") != "gpt-image-1" || r.FormValue("prompt") != "edit it" || r.FormValue("size") != size || r.FormValue("n") != count || r.FormValue("quality") != "" {
					t.Errorf("lost edit fields: %#v", r.MultipartForm.Value)
				}
				w.Header().Set("Content-Type", "application/json")
				_, _ = w.Write([]byte(`{"data":[{"b64_json":"` + base64.StdEncoding.EncodeToString(image) + `"}]}`))
			}))
			defer server.Close()
			config := providerConfig{InterfaceType: "openai-image", BaseURL: server.URL + "/v1", APIKey: "test-key", Model: "gpt-image-1", Size: size, Count: count, AllowLocalChannel: true}
			input := canvasGenerationInput{Mode: "image", Config: config, Prompt: "edit it", ReferenceImages: []providerMedia{{DataURL: encode(image), MimeType: "image/png"}}}
			if name == "multi-reference-mask" {
				input.ReferenceImages = append(input.ReferenceImages, providerMedia{DataURL: encode(secondImage), MimeType: "image/png"})
			}
			if masked {
				input.Mask = &providerMedia{DataURL: encode(expectedMask), MimeType: "image/png"}
			}
			ctx := withProviderOutboundPolicy(withProtocolRegistry(context.Background(), registry), config)
			result, err := runImageTask(ctx, input)
			if err != nil || result["mode"] != "image" || calls != 1 {
				t.Fatalf("result=%#v err=%v calls=%d", result, err, calls)
			}
		})
	}
	_, err = runImageTask(withProtocolRegistry(context.Background(), registry), canvasGenerationInput{
		Mode: "image", Config: providerConfig{InterfaceType: "openai-image"}, Mask: &providerMedia{DataURL: encode(mask)},
	})
	if err == nil || !strings.Contains(err.Error(), "源图片") {
		t.Fatalf("mask without source must fail before request: %v", err)
	}
	unsupported := DefaultImageCapabilityConfig("openai-image", "gpt-image-1")
	unsupported.References.MaskSupported = false
	if err := validateImageTask(unsupported, canvasGenerationInput{
		Mode: "image", Config: providerConfig{InterfaceType: "openai-image", Model: "gpt-image-1"},
		ReferenceImages: []providerMedia{{DataURL: encode(image)}}, Mask: &providerMedia{DataURL: encode(mask)},
	}); err == nil || !strings.Contains(err.Error(), "不支持蒙版") {
		t.Fatalf("maskSupported=false must reject before request: %v", err)
	}
}

func TestOpenAIImagesPackagedBackgroundOptions(t *testing.T) {
	raw, err := os.ReadFile(filepath.Join("..", "..", "..", "plugin-packages", "openai-images.yingce-plugin"))
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
	for _, background := range []string{"auto", "transparent", "opaque"} {
		for _, edit := range []bool{false, true} {
			t.Run(fmt.Sprintf("%s/edit=%v", background, edit), func(t *testing.T) {
				calls := 0
				server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
					calls++
					var actual any
					if edit {
						if err := r.ParseMultipartForm(1 << 20); err != nil {
							t.Error(err)
							return
						}
						defer r.MultipartForm.RemoveAll()
						actual = r.FormValue("background")
					} else {
						var body map[string]any
						if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
							t.Error(err)
							return
						}
						actual = body["background"]
					}
					if actual != background {
						t.Errorf("background: got %v want %s", actual, background)
					}
					w.Header().Set("Content-Type", "application/json")
					_, _ = w.Write([]byte(`{"data":[{"b64_json":"aGVsbG8="}]}`))
				}))
				defer server.Close()
				config := providerConfig{InterfaceType: "openai-image", BaseURL: server.URL + "/v1", Model: "gpt-image-1", AllowLocalChannel: true, TransparentBackground: "true"}
				input := canvasGenerationInput{Mode: "image", Config: config, Prompt: "tree", Metadata: map[string]interface{}{
					"providerOptions": map[string]interface{}{"openai-image": map[string]interface{}{"background": background}},
				}}
				if edit {
					input.ReferenceImages = []providerMedia{{DataURL: "data:image/png;base64,aGVsbG8=", MimeType: "image/png"}}
				}
				ctx := withProviderOutboundPolicy(withProtocolRegistry(context.Background(), registry), config)
				if _, err := runImageTask(ctx, input); err != nil {
					t.Fatal(err)
				}
				if calls != 1 {
					t.Fatalf("expected one request, got %d", calls)
				}
			})
		}
	}
}

func TestOpenAIImagesPackagedTextToImageStaysJSON(t *testing.T) {
	raw, err := os.ReadFile(filepath.Join("..", "..", "..", "plugin-packages", "openai-images.yingce-plugin"))
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
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/v1/images/generations" || r.Header.Get("Content-Type") != "application/json" {
			t.Errorf("wrong generation request: %s %s", r.URL.Path, r.Header.Get("Content-Type"))
		}
		var body map[string]any
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			t.Error(err)
		}
		if body["model"] != "gpt-image-1" || body["prompt"] != "new picture" || body["size"] != "1024x1024" {
			t.Errorf("lost generation fields: %#v", body)
		}
		if _, hasImages := body["images"]; hasImages {
			t.Errorf("unexpected images in generation: %#v", body)
		}
		if _, hasMask := body["mask"]; hasMask {
			t.Errorf("unexpected mask in generation: %#v", body)
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"data":[{"b64_json":"aGVsbG8="}]}`))
	}))
	defer server.Close()
	config := providerConfig{InterfaceType: "openai-image", BaseURL: server.URL + "/v1", APIKey: "test-key", Model: "gpt-image-1", Size: "1024x1024", AllowLocalChannel: true}
	input := canvasGenerationInput{Mode: "image", Config: config, Prompt: "new picture"}
	ctx := withProviderOutboundPolicy(withProtocolRegistry(context.Background(), registry), config)
	result, err := runImageTask(ctx, input)
	if err != nil || result["mode"] != "image" {
		t.Fatalf("result=%#v err=%v", result, err)
	}
}
