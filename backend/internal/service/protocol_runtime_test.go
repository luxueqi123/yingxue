package service

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"infinite-canvas/backend/internal/protocol"
)

func TestPluginViewIncludesDocumentationForEveryBundledProtocol(t *testing.T) {
	center, err := newPluginRuntime(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	plugins := center.list()
	if len(plugins) != len(protocol.Builtins().List("", "", true)) {
		t.Fatalf("plugin views = %d, builtins = %d", len(plugins), len(protocol.Builtins().List("", "", true)))
	}
	for _, plugin := range plugins {
		if plugin.Source != "bundled" {
			continue
		}
		document := strings.TrimSpace(plugin.Manifest.Protocol.Documentation)
		if document == "" || !strings.Contains(document, "## 映雪运行时合同") {
			t.Errorf("bundled plugin %q has no complete documentation in PluginView", plugin.Manifest.ID)
		}
	}
}

func TestPluginRuntimeIsTheProtocolSourceOfTruth(t *testing.T) {
	dataDir := t.TempDir()
	center, err := newPluginRuntime(dataDir)
	if err != nil {
		t.Fatal(err)
	}
	if got := center.registrySnapshot().List("", "", false); len(got) == 0 {
		t.Fatal("bundled protocols were not reconciled into a new plugin directory")
	}
	manifest := []byte(`{"apiVersion":"v1","metadata":{"id":"uploaded-runtime","version":"1.0.0","name":"Uploaded Runtime","vendor":"Test","categories":["video"],"scopes":["canvas"],"documentation":"# Uploaded Runtime"},"create":{"method":"POST","path":"/tasks","fields":{"prompt":"request.prompt"}},"response":{"statusPaths":["status"]}}`)
	plugin, err := center.install(manifest)
	if err != nil {
		t.Fatal(err)
	}
	if plugin.Status != "enabled" || !center.registrySnapshot().IsCapability("uploaded-runtime", protocol.CapabilityVideo) {
		t.Fatalf("installed plugin was not activated: %#v", plugin)
	}
	if _, err := center.install(manifest); err == nil {
		t.Fatal("duplicate plugin id overwrote an installed plugin")
	}
	if _, err := center.setEnabled("uploaded-runtime", false); err != nil {
		t.Fatal(err)
	}
	if _, ok := center.registrySnapshot().Resolve("uploaded-runtime"); !ok {
		t.Fatal("disabled plugin was removed from registry snapshot instead of being represented as unavailable")
	}
	if center.registrySnapshot().IsCapability("uploaded-runtime", protocol.CapabilityVideo) {
		t.Fatal("disabled plugin remained selectable")
	}
	if err := center.uninstall("uploaded-runtime"); err != nil {
		t.Fatal(err)
	}
	if _, ok := center.registrySnapshot().Resolve("uploaded-runtime"); ok {
		t.Fatal("uninstalled plugin remained selectable")
	}
}

func TestDeclarativeProtocolRuntimeExecutesCreatePollAndDownload(t *testing.T) {
	manifest := []byte(`{
		"apiVersion":"v1",
			"metadata":{"id":"test-declarative-video-runtime","version":"1.0.0","name":"Test Declarative Video","vendor":"Test","categories":["video"],"scopes":["canvas"],"documentation":"# Test Declarative Video"},
		"create":{"method":"POST","path":"/tasks","fields":{"model":"request.model","prompt":"request.prompt","seconds":"request.duration"}},
		"poll":{"method":"GET","path":"/tasks/{{taskId}}"},
		"response":{"taskIdPaths":["id"],"statusPaths":["status"],"resultUrlPaths":["video_url"],"resultKind":"video"}
	}`)
	center, err := newPluginRuntime(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	if _, err := center.install(manifest); err != nil {
		t.Fatal(err)
	}

	var server *httptest.Server
	server = httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/v1/tasks":
			w.Header().Set("Content-Type", "application/json")
			_, _ = w.Write([]byte(`{"id":"task-1","status":"pending"}`))
		case "/v1/tasks/task-1":
			w.Header().Set("Content-Type", "application/json")
			_, _ = w.Write([]byte(`{"id":"task-1","status":"succeeded","video_url":"` + server.URL + `/media.mp4"}`))
		case "/media.mp4":
			w.Header().Set("Content-Type", "video/mp4")
			_, _ = w.Write([]byte("video"))
		default:
			http.NotFound(w, r)
		}
	}))
	defer server.Close()

	config := providerConfig{BaseURL: server.URL + "/v1", APIKey: "key", Model: "test-model", APIFormat: "openai", InterfaceType: "test-declarative-video-runtime", AllowLocalChannel: true}
	ctx := withProviderOutboundPolicy(context.Background(), config)
	ctx = withProtocolRegistry(ctx, center.registrySnapshot())
	result, err := runDeclarativeProtocolTask(ctx, canvasGenerationInput{Mode: "video", Prompt: "a clip", Config: config})
	if err != nil {
		t.Fatal(err)
	}
	if result["mode"] != "video" {
		t.Fatalf("result = %#v", result)
	}
}

func TestAutoDLH3RuntimeUsesRawTokenAndPersistsTemporaryResult(t *testing.T) {
	const token = "test-comfyui-token"
	var server *httptest.Server
	server = httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if got := r.Header.Get("Authorization"); got != token {
			t.Errorf("Authorization = %q", got)
		}
		switch r.URL.Path {
		case "/api/v1/comfyui/comfyui_workflow/minimax_h3_lightx2v_v5":
			var body map[string]any
			if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
				t.Fatal(err)
			}
			if body["resolution"] != "768p竖" || body["ref_image_0"] != server.URL+"/reference.png" {
				t.Errorf("create body = %#v", body)
			}
			_, _ = w.Write([]byte(`{"code":"Success","data":{"task_id":"h3-1","status":"QUEUED"}}`))
		case "/api/v1/comfyui/comfyui_workflow/result/h3-1":
			_, _ = w.Write([]byte(`{"code":"Success","data":{"task_id":"h3-1","status":"completed","results":[{"url":"` + server.URL + `/result.mp4","type":"video"}]}}`))
		case "/result.mp4":
			w.Header().Set("Content-Type", "video/mp4")
			_, _ = w.Write([]byte("video"))
		default:
			http.NotFound(w, r)
		}
	}))
	defer server.Close()

	config := providerConfig{BaseURL: server.URL, APIKey: token, Model: "minimax_h3_lightx2v_v5", APIFormat: "openai", InterfaceType: "autodl-h3-video", VideoSeconds: "5", VQuality: "768p", Size: "9:16", AllowLocalChannel: true}
	ctx := withProviderOutboundPolicy(context.Background(), config)
	ctx = withProtocolRegistry(ctx, protocol.Builtins())
	result, err := runVideoTask(ctx, canvasGenerationInput{Mode: "video", Prompt: "test", Config: config, ReferenceImages: []providerMedia{{URL: server.URL + "/reference.png"}}})
	if err != nil {
		t.Fatal(err)
	}
	video, ok := result["video"].(map[string]interface{})
	if !ok || !strings.HasPrefix(video["dataUrl"].(string), "data:video/mp4;base64,") {
		t.Fatalf("result = %#v", result)
	}
}
