package app

import (
	"context"
	"encoding/base64"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"
	"time"

	"infinite-canvas/backend/internal/protocol"
)

func TestSignedMediaUploadPreservesBytesWithoutProviderCredentials(t *testing.T) {
	data := []byte("original-video-byte-stream")
	reference := protocol.MediaReference{DataURL: "data:video/mp4;base64," + base64.StdEncoding.EncodeToString(data)}
	status, calls := 204, 0
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls++
		if r.Method != http.MethodPut || r.URL.RawQuery != "X-Amz-Signature=fixture-signature" {
			t.Error("upload method or signed query changed")
		}
		for _, name := range []string{"Authorization", "X-API-Key", "Cookie", "X-Custom-Key"} {
			if r.Header.Get(name) != "" {
				t.Errorf("provider credential leaked in %s", name)
			}
		}
		received, err := io.ReadAll(r.Body)
		if err != nil || string(received) != string(data) || r.ContentLength != int64(len(data)) {
			t.Error("original bytes changed")
		}
		w.WriteHeader(status)
	}))
	defer server.Close()
	config := providerConfig{BaseURL: server.URL, APIKey: "must-not-leak", AllowLocalChannel: true}
	config.Headers = []OutboundHeader{{Name: "X-Custom-Key", Value: "must-not-forward"}, {Name: "Cookie", Value: "private-session"}}
	ctx := withProviderOutboundPolicy(context.Background(), config)
	target := server.URL + "/original.mp4?X-Amz-Signature=fixture-signature"
	if err := putProtocolMediaUpload(ctx, config, target, reference); err != nil {
		t.Fatal(err)
	}
	status = 503
	if err := putProtocolMediaUpload(ctx, config, target, reference); err == nil || strings.Contains(err.Error(), "fixture-signature") {
		t.Fatalf("failure not safely propagated: %v", err)
	}
	cancelled, cancel := context.WithCancel(ctx)
	cancel()
	if err := putProtocolMediaUpload(cancelled, config, target, reference); !errors.Is(err, context.Canceled) || strings.Contains(err.Error(), "fixture-signature") {
		t.Fatalf("cancellation lost: %v", err)
	}
	if calls != 2 {
		t.Fatalf("unexpected upload retries: %d", calls)
	}
	expired, stop := context.WithDeadline(ctx, time.Now().Add(-time.Second))
	defer stop()
	if err := putProtocolMediaUpload(expired, config, target, reference); err != context.DeadlineExceeded {
		t.Fatalf("deadline lost or URL retained: %v", err)
	}
	if err := putProtocolMediaUpload(context.Background(), config, "http://169.254.169.254/file", reference); err == nil {
		t.Fatal("private destination accepted without scoped policy")
	}
	message := safeProviderLogError(&url.Error{Op: "Put", URL: target, Err: errors.New("connection failed")})
	if strings.Contains(message, "fixture-signature") || !strings.Contains(message, "connection failed") {
		t.Fatalf("unsafe request error: %s", message)
	}
}

func TestSignedMediaUploadRejectsRedirects(t *testing.T) {
	for _, status := range []int{301, 302, 303, 307, 308} {
		t.Run(http.StatusText(status), func(t *testing.T) {
			redirected := 0
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				if r.URL.Path == "/destination" {
					redirected++
					w.WriteHeader(http.StatusOK)
					return
				}
				w.Header().Set("Location", "/destination")
				w.WriteHeader(status)
			}))
			defer server.Close()
			config := providerConfig{BaseURL: server.URL, AllowLocalChannel: true}
			ctx := withProviderOutboundPolicy(context.Background(), config)
			err := putProtocolMediaUpload(ctx, config, server.URL+"/upload", protocol.MediaReference{DataURL: "data:video/mp4;base64,eA=="})
			if err == nil || redirected != 0 {
				t.Fatalf("redirect falsely acknowledged or followed: err=%v calls=%d", err, redirected)
			}
		})
	}
}

func TestSignedMediaUploadInflightCancellationRedactsURL(t *testing.T) {
	for _, sourceDownload := range []bool{false, true} {
		name := "upload"
		if sourceDownload {
			name = "source-download"
		}
		t.Run(name, func(t *testing.T) {
			ctx, cancel := context.WithCancel(context.Background())
			defer cancel()
			release := make(chan struct{})
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				cancel()
				<-release
			}))
			defer server.Close()
			defer close(release)
			config := providerConfig{BaseURL: server.URL, AllowLocalChannel: true}
			ctx = withProviderOutboundPolicy(ctx, config)
			target := server.URL + "/media?signature=must-not-appear"
			reference := protocol.MediaReference{DataURL: "data:video/mp4;base64,eA=="}
			if sourceDownload {
				reference = protocol.MediaReference{URL: target}
			}
			err := putProtocolMediaUpload(ctx, config, target, reference)
			if err != context.Canceled {
				t.Fatalf("cancellation not canonical: %v", err)
			}
		})
	}
}
