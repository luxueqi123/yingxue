package app

import (
	"errors"
	"infinite-canvas/backend/internal/protocol"
	"net/http"
	"os"
	"path/filepath"
	"testing"
)

func TestAutoDLPluginPackageBootstrapsAndRejectsUploadedReplacement(t *testing.T) {
	data, err := os.ReadFile(filepath.Join("..", "..", "..", "plugin-packages", "autodl-comfyui.yingce-plugin"))
	if err != nil {
		t.Fatal(err)
	}
	expected, err := protocol.ParsePluginPackage(data)
	if err != nil {
		t.Fatal(err)
	}
	center, err := newPluginRuntime(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	plugin, exists := runtimePluginByID(center.list(), "autodl-comfyui")
	if !exists || plugin.Status != "enabled" || plugin.Manifest.Version != expected.Manifest.Metadata.Version || len(plugin.Manifest.Contributes.Workflows) != len(expected.Manifest.Contributes.Workflows) || plugin.Package != protocol.PluginPackageFormat {
		t.Fatalf("built-in AutoDL plugin: exists=%v status=%s version=%s workflows=%d", exists, plugin.Status, plugin.Manifest.Version, len(plugin.Manifest.Contributes.Workflows))
	}
	_, installErr := center.install(data, "autodl-comfyui.yingce-plugin")
	var conflict *AppError
	if !errors.As(installErr, &conflict) || conflict.Status != http.StatusConflict {
		t.Fatalf("built-in replacement must report an actionable conflict, got %v", installErr)
	}
	current, exists := runtimePluginByID(center.list(), "autodl-comfyui")
	if !exists || current.SHA256 != plugin.SHA256 || current.Status != plugin.Status {
		t.Fatal("rejected upload changed the built-in AutoDL runtime")
	}
	if !center.registrySnapshot().IsCapability("autodl-comfyui", protocol.CapabilityVideo) {
		t.Fatal("AutoDL package provider was not registered")
	}
	catalog := (&Service{pluginRuntime: center}).PluginProviderCatalog(string(protocol.SurfaceAdminSystemChannel), string(protocol.CapabilityVideo), false)
	var autoDL *PluginProviderCatalogItem
	for index := range catalog {
		if catalog[index].ID == "autodl-comfyui" {
			autoDL = &catalog[index]
		}
		if catalog[index].ID == "autodl-comfyui-plugin" {
			t.Fatal("legacy AutoDL provider ID leaked into administrator catalog")
		}
	}
	if autoDL == nil {
		t.Fatal("AutoDL video provider is missing from the administrator catalog")
	}
	if len(autoDL.Workflows) != len(expected.Manifest.Contributes.Workflows) {
		t.Fatalf("AutoDL video workflow count=%d, want %d", len(autoDL.Workflows), len(expected.Manifest.Contributes.Workflows))
	}
}
