package assets

import "testing"

func TestMediaHistoryRetainsOwnedResources(t *testing.T) {
	raw := `{"nodes":[{"id":"shot","metadata":{"storageKey":"resource:current","mediaVersions":[{"id":"v1","media":{"storageKey":"resource:old","videoPreview":{"storageKey":"resource:old-preview"}}},{"id":"v2","media":{"storageKey":"resource:current"}}]}}]}`
	ids := map[string]struct{}{}
	if err := CollectOwnedDocumentReferences(raw, ids); err != nil {
		t.Fatal(err)
	}
	for _, id := range []string{"old", "old-preview", "current"} {
		if _, ok := ids[id]; !ok {
			t.Fatalf("history resource %s lost from ownership scan", id)
		}
		if !DocumentReferences(raw, map[string]struct{}{id: {}}) {
			t.Fatalf("in-use history resource %s could be deleted", id)
		}
	}
}
