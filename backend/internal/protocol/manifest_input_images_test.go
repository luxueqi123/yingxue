package protocol

import (
	"encoding/json"
	"fmt"
	"testing"
)

func inputImageManifest(policy string, publicURLs bool) []byte {
	return []byte(fmt.Sprintf(`{"apiVersion":"yingce.plugin/v2","id":"image-inspection","name":"Image inspection","version":"1.0.0","contributes":{"providers":[{"id":"image-inspection","label":"Image inspection","capabilities":["video"],"scopes":["canvas"],"requiresPublicMediaUrls":%t,"inputImages":%s,"create":{"method":"POST","path":"/create"},"response":{"taskIdPaths":["id"]}}]}}`, publicURLs, policy))
}

func TestManifestPreservesInputImageRequirements(t *testing.T) {
	raw := inputImageManifest(`{"formats":["jpeg","png","webp"],"maxBytes":20000000,"minShortSide":400}`, false)
	manifest, err := decodeManifest(raw)
	if err != nil {
		t.Fatal(err)
	}
	encoded, err := json.Marshal(manifest.Contributes.Providers[0])
	if err != nil {
		t.Fatal(err)
	}
	var fields map[string]any
	_ = json.Unmarshal(encoded, &fields)
	if fields["inputImages"] == nil {
		t.Fatal("inputImages requirements silently discarded during manifest decoding")
	}
	if _, err := LoadInstalledProviders(raw, nil); err != nil {
		t.Fatal(err)
	}
}

func TestManifestRejectsInvalidInputImageRequirements(t *testing.T) {
	for _, item := range []struct {
		name, policy string
		publicURLs   bool
	}{
		{"empty", `{}`, false},
		{"no-formats", `{"maxBytes":20000000,"minShortSide":400}`, false},
		{"unsupported-format", `{"formats":["svg"],"maxBytes":20000000,"minShortSide":400}`, false},
		{"duplicate-format", `{"formats":["png","png"],"maxBytes":20000000,"minShortSide":400}`, false},
		{"unbounded-bytes", `{"formats":["png"],"maxBytes":0,"minShortSide":400}`, false},
		{"excessive-bytes", `{"formats":["png"],"maxBytes":67108865,"minShortSide":400}`, false},
		{"negative-side", `{"formats":["png"],"maxBytes":20000000,"minShortSide":-1}`, false},
		{"mutable-public-url", `{"formats":["png"],"maxBytes":20000000,"minShortSide":400}`, true},
		{"negative-ratio", `{"formats":["png"],"maxBytes":20000000,"minAspectRatio":-0.4,"maxAspectRatio":2.5}`, false},
		{"inverted-ratio", `{"formats":["png"],"maxBytes":20000000,"minAspectRatio":2.5,"maxAspectRatio":0.4}`, false},
		{"missing-max-ratio", `{"formats":["png"],"maxBytes":20000000,"minAspectRatio":0.4}`, false},
		{"missing-min-ratio", `{"formats":["png"],"maxBytes":20000000,"maxAspectRatio":2.5}`, false},
	} {
		t.Run(item.name, func(t *testing.T) {
			if _, err := LoadInstalledProviders(inputImageManifest(item.policy, item.publicURLs), nil); err == nil {
				t.Fatal("invalid image input declaration loaded")
			}
		})
	}
}
