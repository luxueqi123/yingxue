package app

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"image"
	"image/color"
	"image/gif"
	"image/jpeg"
	"image/png"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"testing"

	"infinite-canvas/backend/internal/protocol"
)

func inputImageBytes(t *testing.T, format string, width, height int) []byte {
	t.Helper()
	m := image.NewRGBA(image.Rect(0, 0, width, height))
	m.Set(0, 0, color.RGBA{255, 128, 64, 255})
	var b bytes.Buffer
	var err error
	switch format {
	case "png":
		err = png.Encode(&b, m)
	case "jpeg":
		err = jpeg.Encode(&b, m, nil)
	case "gif":
		err = gif.Encode(&b, m, nil)
	}
	if err != nil {
		t.Fatal(err)
	}
	return b.Bytes()
}

func inputImageDataURL(mime string, data []byte) string {
	return "data:" + mime + ";base64," + base64.StdEncoding.EncodeToString(data)
}

func inputImageHappyHorseAdapter(t *testing.T) protocol.Adapter {
	t.Helper()
	data, err := os.ReadFile(filepath.Join("..", "..", "..", "plugin-packages", "dashscope-happyhorse-reference-video.yingce-plugin"))
	if err != nil {
		t.Fatal(err)
	}
	pkg, err := protocol.ParsePluginPackage(data)
	if err != nil {
		t.Fatal(err)
	}
	adapters, err := protocol.LoadInstalledProviders(pkg.ManifestRaw, nil)
	if err != nil {
		t.Fatal(err)
	}
	return adapters[0]
}

func inputImageHappyHorseRequest(endpoint string, refs []providerMedia) canvasGenerationInput {
	return canvasGenerationInput{Mode: "video", Prompt: "Original [Image 1]", Config: providerConfig{
		BaseURL: endpoint, APIKey: "fixture-key", Model: "happyhorse-1.1-r2v", Size: "4:3", VQuality: "720P", VideoSeconds: "7", Count: "1",
	}, ReferenceImages: refs, Metadata: map[string]any{"videoEditOperation": "reference_to_video"}}
}

func TestHappyHorseHostRejectsUnverifiedImageBytesBeforeSubmission(t *testing.T) {
	t.Setenv("CANVAS_ALLOWED_PRIVATE_UPSTREAM_HOSTS", "127.0.0.1")
	valid := inputImageBytes(t, "png", 400, 401)
	oversized := append(append([]byte{}, valid...), make([]byte, 20000001-len(valid))...)
	for _, item := range []struct{ name, data string }{
		{"small-short-side", inputImageDataURL("image/png", inputImageBytes(t, "png", 399, 900))},
		{"over-20MB", inputImageDataURL("image/png", oversized)},
		{"bad-base64", "data:image/png;base64,!"},
		{"not-image", inputImageDataURL("image/png", []byte("not an image"))},
		{"MIME-mismatch", inputImageDataURL("image/jpeg", valid)},
		{"unsupported-GIF", inputImageDataURL("image/gif", inputImageBytes(t, "gif", 400, 400))},
		{"empty-image", "data:image/png;base64,"},
	} {
		t.Run(item.name, func(t *testing.T) {
			creates := 0
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				creates++
				http.Error(w, "fixture stops unexpected submission", http.StatusBadRequest)
			}))
			defer server.Close()
			input := inputImageHappyHorseRequest(server.URL, []providerMedia{{DataURL: item.data, Width: 1920, Height: 1080, Bytes: 1, MimeType: "image/png"}})
			result, err := runProtocolAdapterTask(context.Background(), input, inputImageHappyHorseAdapter(t))
			if creates != 0 || err == nil || result != nil {
				t.Fatalf("unverified input reached generation: creates=%d error=%v", creates, err)
			}
			if strings.Contains(err.Error(), item.data) || strings.Contains(err.Error(), "fixture-key") {
				t.Fatal("rejection leaked image or key")
			}
		})
	}
}

func TestHappyHorseHostSubmitsSameOrderedImageBytes(t *testing.T) {
	t.Setenv("CANVAS_ALLOWED_PRIVATE_UPSTREAM_HOSTS", "127.0.0.1")
	for _, format := range []string{"png", "jpeg", "webp"} {
		t.Run(format, func(t *testing.T) {
			var raw []byte
			if format == "webp" {
				var err error
				raw, err = os.ReadFile(filepath.Join("..", "protocol", "testdata", "input-image-400.webp"))
				if err != nil {
					t.Fatal(err)
				}
			} else {
				raw = inputImageBytes(t, format, 400, 401)
			}
			expected := []string{inputImageDataURL("image/"+format, raw), inputImageDataURL("image/png", inputImageBytes(t, "png", 420, 400))}
			creates := 0
			var server *httptest.Server
			server = httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				switch r.URL.Path {
				case "/api/v1/services/aigc/video-generation/video-synthesis":
					creates++
					var body struct {
						Input struct {
							Prompt string
							Media  []struct{ Type, URL string }
						}
					}
					if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
						t.Error(err)
					}
					if body.Input.Prompt != "Original [Image 1]" || len(body.Input.Media) != 2 {
						t.Error("prompt or count changed")
						http.Error(w, "bad request", http.StatusBadRequest)
						return
					}
					for i, media := range body.Input.Media {
						if media.Type != "reference_image" || media.URL != expected[i] {
							t.Errorf("image %d bytes or order changed", i)
						}
					}
					w.Header().Set("Content-Type", "application/json")
					_ = json.NewEncoder(w).Encode(map[string]any{"output": map[string]any{"task_id": "fixture-task", "task_status": "SUCCEEDED", "video_url": server.URL + "/video.mp4"}})
				case "/video.mp4":
					w.Header().Set("Content-Type", "video/mp4")
					_, _ = w.Write([]byte("fixture video result"))
				default:
					http.NotFound(w, r)
				}
			}))
			defer server.Close()
			refs := []providerMedia{{DataURL: expected[0]}, {DataURL: expected[1]}}
			_, err := runProtocolAdapterTask(context.Background(), inputImageHappyHorseRequest(server.URL, refs), inputImageHappyHorseAdapter(t))
			if err != nil || creates != 1 {
				t.Fatalf("valid inputs not submitted once: %d %v", creates, err)
			}
		})
	}
}

func TestProtocolImagePreparationKeepsActualBytesAndCallerData(t *testing.T) {
	valid := inputImageBytes(t, "png", 400, 401)
	for _, size := range []int{len(valid), 20000000, 20000001} {
		t.Run(strconv.Itoa(size), func(t *testing.T) {
			data := append(append([]byte{}, valid...), make([]byte, size-len(valid))...)
			ref := protocol.MediaReference{ID: "original-id", Order: 4, Role: "style_reference", URL: "https://example.invalid/original.png", DataURL: inputImageDataURL("image/png", data), Metadata: map[string]any{"width": 1, "height": 1, "bytes": 1, "extra": "preserved"}}
			audio := protocol.MediaReference{ID: "audio-id", Kind: "audio", URL: "https://example.invalid/audio.wav"}
			request := protocol.GenerationRequest{Images: []protocol.MediaReference{ref}, Audios: []protocol.MediaReference{audio}, Inputs: []protocol.MediaReference{ref, audio}}
			prepared, err := prepareProtocolInputImages(context.Background(), providerConfig{}, request, &protocol.ImageInputRequirements{Formats: []string{"png"}, MaxBytes: 20000000, MinShortSide: 400})
			if size > 20000000 {
				if err == nil {
					t.Fatal("oversized actual bytes accepted")
				}
				return
			}
			if err != nil {
				t.Fatal(err)
			}
			actual := prepared.Images[0]
			if actual.DataURL != ref.DataURL || actual.URL != "" || actual.ID != ref.ID || actual.Role != ref.Role || actual.Order != ref.Order || actual.Metadata["bytes"] != size || actual.Metadata["width"] != 400 || actual.Metadata["height"] != 401 || actual.Metadata["extra"] != "preserved" {
				t.Fatal("actual bytes, identity, order or inspected metadata changed")
			}
			if request.Images[0].URL != ref.URL || request.Images[0].Metadata["width"] != 1 {
				t.Fatal("preparation mutated caller input")
			}
			if len(prepared.Inputs) != 2 || prepared.Inputs[0].URL != "" || prepared.Inputs[0].DataURL != actual.DataURL || prepared.Inputs[0].Metadata["width"] != 400 || prepared.Inputs[1].ID != audio.ID || request.Inputs[0].URL != ref.URL {
				t.Fatal("unified inputs projection retained unverified images or changed non-image references")
			}
		})
	}
}

func TestProtocolImageURLReadsAreBoundedAndRespectOutboundPolicy(t *testing.T) {
	t.Setenv("CANVAS_ALLOWED_PRIVATE_UPSTREAM_HOSTS", "127.0.0.1")
	valid := inputImageBytes(t, "png", 400, 400)
	requirements := &protocol.ImageInputRequirements{Formats: []string{"png"}, MaxBytes: 4096, MinShortSide: 400}
	for _, scenario := range []string{"success", "MIME-spoof", "HTTP-error", "content-length-limit", "stream-limit", "redirect-private"} {
		t.Run(scenario, func(t *testing.T) {
			reads := 0
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				reads++
				if r.Header.Get("Authorization") != "" {
					t.Error("third-party image received channel credentials")
				}
				w.Header().Set("Content-Type", "image/png")
				switch scenario {
				case "MIME-spoof":
					w.Header().Set("Content-Type", "image/jpeg")
				case "HTTP-error":
					http.Error(w, "expired", http.StatusForbidden)
					return
				case "content-length-limit":
					w.Header().Set("Content-Length", "4097")
					w.WriteHeader(http.StatusOK)
					return
				case "stream-limit":
					w.(http.Flusher).Flush()
					_, _ = w.Write(append(valid, make([]byte, 4097-len(valid))...))
					return
				case "redirect-private":
					http.Redirect(w, r, "http://192.168.123.199/private.png", http.StatusFound)
					return
				}
				_, _ = w.Write(valid)
			}))
			defer server.Close()
			address := server.URL + "/reference?signature=fixture-private"
			request := protocol.GenerationRequest{Images: []protocol.MediaReference{{URL: address, MIMEType: "image/png", Metadata: map[string]any{"width": 900, "bytes": 1}}}}
			prepared, err := prepareProtocolInputImages(context.Background(), providerConfig{BaseURL: "https://different.example", APIKey: "fixture-secret"}, request, requirements)
			if reads != 1 {
				t.Fatalf("unexpected image read count: %d", reads)
			}
			if scenario == "success" {
				if err != nil || prepared.Images[0].DataURL != inputImageDataURL("image/png", valid) || prepared.Images[0].URL != "" {
					t.Fatalf("URL snapshot failed: %v", err)
				}
			} else if err == nil {
				t.Fatal("invalid remote input accepted")
			} else if strings.Contains(err.Error(), address) || strings.Contains(err.Error(), "fixture-private") || strings.Contains(err.Error(), "fixture-secret") {
				t.Fatal("remote failure leaked signed URL or key")
			}
		})
	}
	t.Run("unapproved-loopback", func(t *testing.T) {
		t.Setenv("CANVAS_ALLOWED_PRIVATE_UPSTREAM_HOSTS", "")
		reads := 0
		server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { reads++ }))
		defer server.Close()
		_, err := prepareProtocolInputImages(context.Background(), providerConfig{}, protocol.GenerationRequest{Images: []protocol.MediaReference{{URL: server.URL}}}, requirements)
		if err == nil || reads != 0 {
			t.Fatal("private image bypassed outbound policy")
		}
	})
	t.Run("cancellation", func(t *testing.T) {
		ctx, cancel := context.WithCancel(context.Background())
		cancel()
		_, err := prepareProtocolInputImages(ctx, providerConfig{}, protocol.GenerationRequest{Images: []protocol.MediaReference{{URL: "https://example.invalid/image.png"}}}, requirements)
		if err != context.Canceled {
			t.Fatalf("lost cancellation: %v", err)
		}
	})
}
