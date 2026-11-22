package protocol

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
)

// Exercise the installed-package boundary, not just the private validator.
func TestInstalledUploadManifestRejectsUnsafeRecoveryContracts(t *testing.T) {
	raw, err := os.ReadFile(filepath.Join("..", "..", "..", "plugin-packages", "topaz-video-enhance", "manifest.json"))
	if err != nil {
		t.Fatal(err)
	}
	for _, name := range []string{"no-poll", "image-provider", "missing-path", "overlap", "empty-state", "uppercase-state"} {
		t.Run(name, func(t *testing.T) {
			var document map[string]any
			if err := json.Unmarshal(raw, &document); err != nil {
				t.Fatal(err)
			}
			providers := document["contributes"].(map[string]any)["providers"].([]any)
			provider := providers[0].(map[string]any)
			upload := provider["upload"].(map[string]any)
			switch name {
			case "no-poll":
				delete(provider, "poll")
			case "image-provider":
				provider["capabilities"] = []string{"image"}
			case "missing-path":
				delete(upload, "pendingUrlsPath")
			case "overlap":
				upload["pendingStatuses"] = upload["receivedStatuses"]
			case "empty-state":
				upload["pendingStatuses"] = []string{""}
			case "uppercase-state":
				upload["pendingStatuses"] = []string{"Accepted"}
			}
			modified, err := json.Marshal(document)
			if err != nil {
				t.Fatal(err)
			}
			if _, err := LoadInstalledProviders(modified, nil); err == nil {
				t.Fatal("invalid upload recovery contract installed")
			}
		})
	}
}
