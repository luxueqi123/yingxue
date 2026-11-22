package assets

import "testing"

func TestStoryboardReferenceFramesAreOwnedResourceReferences(t *testing.T) {
	raw := `{"nodes":[{"metadata":{"storyboard":{"rows":[{"videoReference":{"startTime":0.5,"endTime":1,"referenceFrameImage":"/api/resources/frame-1/file"},"plotDescription":"/api/resources/not-a-frame/file"}]}}}]}`
	ids := map[string]struct{}{}
	if err := CollectOwnedDocumentReferences(raw, ids); err != nil {
		t.Fatal(err)
	}
	if len(ids) != 1 {
		t.Fatalf("unexpected references: %#v", ids)
	}
	if _, ok := ids["frame-1"]; !ok {
		t.Fatal("nested storyboard reference was lost")
	}
	if !DocumentReferences(raw, map[string]struct{}{"frame-1": {}}) {
		t.Fatal("in-use reference frame must block deletion")
	}
	if DocumentReferences(raw, map[string]struct{}{"not-a-frame": {}}) {
		t.Fatal("prompt text must not become a resource reference")
	}
}

func TestCollectDocumentResourceReferencesIncludesNestedVideoPreview(t *testing.T) {
	raw := `{"nodes":[{"id":"node-video","metadata":{"videoPreview":{"storageKey":"resource:poster-1","source":{"id":"nested-not-node","url":"/api/resources/poster-2/file"}}}}]}`
	refs, err := CollectDocumentResourceReferences(raw)
	if err != nil {
		t.Fatal(err)
	}
	got := map[string]DocumentResourceReference{}
	for _, ref := range refs {
		got[ref.ResourceID] = ref
	}
	if ref := got["poster-1"]; ref.Path != "nodes[node-video].metadata.videoPreview.storageKey" || ref.NodeID != "node-video" || ref.ReferenceType != "storageKey" {
		t.Fatalf("nested storageKey reference = %#v", ref)
	}
	if ref := got["poster-2"]; ref.Path != "nodes[node-video].metadata.videoPreview.source.url" || ref.NodeID != "node-video" {
		t.Fatalf("nested URL reference = %#v", ref)
	}
}

func TestCollectDocumentResourceReferencesUsesExplicitFieldsOnly(t *testing.T) {
	raw := `{"nodes":[{"id":"node-1","metadata":{"label":"resource:not-a-reference","videoPreview":{"resourceId":"poster-3"}}}],"log":"/api/resources/log-1/file"}`
	refs, err := CollectDocumentResourceReferences(raw)
	if err != nil {
		t.Fatal(err)
	}
	if len(refs) != 1 || refs[0].ResourceID != "poster-3" || refs[0].NodeID != "node-1" || refs[0].ReferenceType != "resourceId" {
		t.Fatalf("references = %#v", refs)
	}
}

func TestCollectDocumentResourceReferencesIncludesWorkbenchCatalogFields(t *testing.T) {
	raw := `{"iconResourceId":"tool-icon","coverResourceId":"tool-cover","inputContract":{"slots":[{"coverResourceId":"slot-cover","sampleResourceId":"slot-sample"}]},"resultExample":{"imageResourceIds":["example-image-1","example-image-2"],"videoResourceId":"example-video"}}`
	refs, err := CollectDocumentResourceReferences(raw)
	if err != nil {
		t.Fatal(err)
	}
	want := map[string]bool{
		"tool-icon": false, "tool-cover": false, "slot-cover": false, "slot-sample": false,
		"example-image-1": false, "example-image-2": false, "example-video": false,
	}
	for _, reference := range refs {
		if _, exists := want[reference.ResourceID]; exists {
			want[reference.ResourceID] = true
		}
	}
	for resourceID, found := range want {
		if !found {
			t.Errorf("workbench resource %q was not collected", resourceID)
		}
	}
}

func TestCollectDocumentResourceReferencesReportsInvalidJSON(t *testing.T) {
	if _, err := CollectDocumentResourceReferences(`{"nodes":`); err == nil {
		t.Fatal("expected malformed document to be rejected")
	}
}
