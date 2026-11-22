package app

import (
	"bytes"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestUploadedPackageFailedInstallRetainsExistingArtifact(t *testing.T) {
	manifest := `{"apiVersion":"yingce.plugin/v1","id":"update-storage-contract","version":"1.0.0","name":"Update Storage Contract","author":"Test","contributes":{"providers":[{"id":"update-storage-contract","label":"Update Storage Contract","capabilities":["video"],"scopes":["canvas"],"create":{"method":"POST","path":"/tasks","fields":{"prompt":"request.prompt"}},"response":{"statusPaths":["status"]}}]}}`
	original := testPluginPackage(t, []byte(manifest))
	for _, item := range []struct {
		name string
		data []byte
	}{
		{"same-package", original},
		{"new-version", testPluginPackage(t, []byte(strings.Replace(manifest, `"version":"1.0.0"`, `"version":"2.0.0"`, 1)))},
	} {
		t.Run(item.name, func(t *testing.T) {
			dataDir := t.TempDir()
			center, err := newPluginRuntime(dataDir)
			if err != nil {
				t.Fatal(err)
			}
			installed, err := center.install(original, "update-storage-contract.yingce-plugin")
			if err != nil {
				t.Fatal(err)
			}
			packagePath := filepath.Join(center.packageDir, installed.SHA256+".yingce-plugin")
			registryBefore, err := os.ReadFile(center.registryPath)
			if err != nil {
				t.Fatal(err)
			}
			// A temporary filesystem obstruction exercises the real storage-error path.
			registryBackup := center.registryPath + ".before"
			if err := os.Rename(center.registryPath, registryBackup); err != nil {
				t.Fatal(err)
			}
			if err := os.Mkdir(center.registryPath, 0o700); err != nil {
				t.Fatal(err)
			}
			restoreRegistry := func() {
				if err := os.Remove(center.registryPath); err != nil {
					t.Fatal(err)
				}
				if err := os.Rename(registryBackup, center.registryPath); err != nil {
					t.Fatal(err)
				}
			}
			defer func() {
				if restoreRegistry != nil {
					restoreRegistry()
				}
			}()
			if _, err := center.install(item.data, "retry.yingce-plugin"); err == nil {
				t.Fatal("registry storage failure was hidden")
			}
			retained, err := os.ReadFile(packagePath)
			if err != nil || !bytes.Equal(retained, original) {
				t.Fatalf("failed installation removed or changed the active package: %v", err)
			}
			preservedRegistry, err := os.ReadFile(registryBackup)
			if err != nil || !bytes.Equal(preservedRegistry, registryBefore) {
				t.Fatal("failed installation changed the saved registry", err)
			}
			if err := validateGenerationInterfaceWithRegistry(center.registrySnapshot(), "video", "update-storage-contract"); err != nil {
				t.Fatal("failed installation disabled the existing provider", err)
			}
			if pluginHash(item.data) != installed.SHA256 {
				if _, err := os.Stat(filepath.Join(center.packageDir, pluginHash(item.data)+".yingce-plugin")); !os.IsNotExist(err) {
					t.Fatal("failed new version left an unregistered package", err)
				}
			}
			restoreRegistry()
			restoreRegistry = nil
			reloaded, err := newPluginRuntime(dataDir)
			if err != nil {
				t.Fatal(err)
			}
			if err := validateGenerationInterfaceWithRegistry(reloaded.registrySnapshot(), "video", "update-storage-contract"); err != nil {
				t.Fatal("existing provider did not survive reload after failed updates", err)
			}
			for _, view := range reloaded.list() {
				if view.Manifest.ID == installed.Manifest.ID {
					if view.SHA256 != installed.SHA256 || view.Manifest.Version != "1.0.0" || view.Status != "enabled" {
						t.Fatalf("failed update replaced the old package: %#v", view)
					}
					return
				}
			}
			t.Fatal("old package was lost after reload")
		})
	}
}
