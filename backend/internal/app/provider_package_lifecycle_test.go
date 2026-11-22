package app

import (
	"bytes"
	"context"
	"encoding/json"
	"net/url"
	"os"
	"path/filepath"
	"testing"

	"infinite-canvas/backend/internal/protocol"
)

func TestNewVideoPackagesKeepManifestVersionInHostView(t *testing.T) {
	center, err := newPluginRuntime(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	for _, id := range []string{"minimax-hailuo-video-v1", "minimax-hailuo-video-v2", "dashscope-happyhorse-reference-video", "dashscope-happyhorse-first-frame-video"} {
		t.Run(id, func(t *testing.T) {
			data, err := os.ReadFile(filepath.Join("..", "..", "..", "plugin-packages", id+".yingce-plugin"))
			if err != nil {
				t.Fatal(err)
			}
			pkg, err := protocol.ParsePluginPackage(data)
			if err != nil {
				t.Fatal(err)
			}
			for _, view := range center.list() {
				if view.Manifest.ID == id {
					if view.Manifest.APIVersion != pkg.Manifest.APIVersion {
						t.Fatalf("host view changed package API version: got %s, want %s", view.Manifest.APIVersion, pkg.Manifest.APIVersion)
					}
					if view.Manifest.Version != pkg.Manifest.Metadata.Version || view.SHA256 != pluginHash(data) || view.Status != "enabled" {
						t.Fatalf("package identity/status changed: %s %s %s", view.Manifest.ID, view.Manifest.Version, view.Status)
					}
					return
				}
			}
			t.Fatal("official package was not loaded into host")
		})
	}
}

func TestNewVideoPackagesPersistDisableAndReloadWithoutChangingBytes(t *testing.T) {
	dataDir := t.TempDir()
	center, err := newPluginRuntime(dataDir)
	if err != nil {
		t.Fatal(err)
	}
	for _, item := range []struct{ plugin, provider string }{
		{"minimax-hailuo-video-v1", "minimax-video-v1"},
		{"minimax-hailuo-video-v2", "minimax-video"},
		{"dashscope-happyhorse-reference-video", "dashscope-happyhorse-reference-video"},
		{"dashscope-happyhorse-first-frame-video", "dashscope-happyhorse-first-frame-video"},
	} {
		t.Run(item.plugin, func(t *testing.T) {
			var original PluginView
			for _, view := range center.list() {
				if view.Manifest.ID == item.plugin {
					original = view
				}
			}
			if original.Manifest.ID == "" {
				t.Fatal("package is missing")
			}
			cachedPath := filepath.Join(center.packageDir, original.SHA256+".yingce-plugin")
			cached, err := os.ReadFile(cachedPath)
			if err != nil {
				t.Fatal(err)
			}
			shipped, err := os.ReadFile(filepath.Join("..", "..", "..", "plugin-packages", item.plugin+".yingce-plugin"))
			if err != nil || !bytes.Equal(cached, shipped) {
				t.Fatal("host cache differs from shipped package", err)
			}
			if err := validateGenerationInterfaceWithRegistry(center.registrySnapshot(), "video", item.provider); err != nil {
				t.Fatal("enabled package did not register its provider")
			}
			if _, err := center.setEnabled(item.plugin, false); err != nil {
				t.Fatal(err)
			}
			if err := validateGenerationInterfaceWithRegistry(center.registrySnapshot(), "video", item.provider); err == nil {
				t.Fatal("disabled provider can still receive requests")
			}
			center, err = newPluginRuntime(dataDir)
			if err != nil {
				t.Fatal(err)
			}
			if err := validateGenerationInterfaceWithRegistry(center.registrySnapshot(), "video", item.provider); err == nil {
				t.Fatal("host reload re-enabled a disabled provider")
			}
			view, err := center.setEnabled(item.plugin, true)
			if err != nil || view.Status != "enabled" {
				t.Fatal("cannot re-enable package", err)
			}
			center, err = newPluginRuntime(dataDir)
			if err != nil {
				t.Fatal(err)
			}
			adapter, ok := center.registrySnapshot().Get(item.provider)
			if !ok || !adapter.Metadata().Enabled {
				t.Fatal("re-enabled provider was lost after host reload")
			}
			if item.provider == "minimax-video-v1" {
				poll := protocol.PollContext{TaskID: "task-11", Model: "MiniMax-Hailuo-2.3"}
				result, err := adapter.ParsePoll(context.Background(), poll, []byte(`{"task_id":"task-11","status":"Success","file_id":"file-22","base_resp":{"status_code":0}}`))
				if err != nil || result.Result == nil {
					t.Fatal("reloaded V1 cannot parse file query metadata", err)
				}
				lookup, ok := adapter.(protocol.ResultAdapter)
				if !ok {
					t.Fatal("reloaded V1 lost result adapter")
				}
				poll.Metadata = result.Result.Metadata
				spec, err := lookup.BuildResult(context.Background(), poll)
				if err != nil || url.Values(spec.Query).Get("file_id") != "file-22" {
					t.Fatalf("reloaded V1 lost independent file ID: %#v %v", spec, err)
				}
			}
			reread, err := os.ReadFile(cachedPath)
			if err != nil || !bytes.Equal(cached, reread) {
				t.Fatal("lifecycle mutated package bytes", err)
			}
		})
	}
}

func TestPluginHostViewRetainsV1ManifestVersion(t *testing.T) {
	manifest := protocol.Manifest{APIVersion: "yingce.plugin/v1", Metadata: protocol.Metadata{ID: "v1-contract", Name: "V1 contract", Version: "1.0.0"}}
	raw, err := json.Marshal(manifest)
	if err != nil {
		t.Fatal(err)
	}
	view := pluginManifestView(raw, manifest.Metadata, PluginOriginUploaded)
	if view.APIVersion != manifest.APIVersion {
		t.Fatal("V1 manifest was upgraded instead of retained")
	}
}
