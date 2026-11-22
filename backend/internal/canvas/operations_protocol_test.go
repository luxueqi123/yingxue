package canvas

import (
	"encoding/json"
	"errors"
	"testing"
)

func TestCanvasOperationsProtocolConcurrentEdits(t *testing.T) {
	for _, test := range []struct {
		name     string
		current  string
		field    string
		before   string
		desired  string
		conflict bool
	}{
		{"disjoint field survives", `{"title":"other window","prompt":"old"}`, "metadata.prompt", `"old"`, `"new"`, false},
		{"same field rejects stale base", `{"title":"other window","prompt":"old"}`, "metadata.title", `"original"`, `"new"`, true},
		{"already applied value converges", `{"title":"new","prompt":"old"}`, "metadata.title", `"original"`, `"new"`, false},
	} {
		t.Run(test.name, func(t *testing.T) {
			payload := map[string]json.RawMessage{
				"nodes":       json.RawMessage(`[{"id":"node","metadata":` + test.current + `}]`),
				"connections": json.RawMessage(`[]`),
			}
			original := string(payload["nodes"])
			err := applyCanvasOperations(payload, []CanvasOperation{{
				Type: "patch_node", ID: "node",
				Patch:  map[string]json.RawMessage{test.field: json.RawMessage(test.desired)},
				Before: map[string]json.RawMessage{test.field: json.RawMessage(test.before)},
			}})
			if test.conflict {
				if !errors.Is(err, ErrCanvasOperationConflict) || string(payload["nodes"]) != original {
					t.Fatalf("stale edit must fail without changing the document: %v, %s", err, payload["nodes"])
				}
				return
			}
			if err != nil {
				t.Fatal(err)
			}
			var nodes []struct {
				Metadata map[string]string `json:"metadata"`
			}
			if err := json.Unmarshal(payload["nodes"], &nodes); err != nil {
				t.Fatal(err)
			}
			if len(nodes) != 1 || nodes[0].Metadata[test.field[len("metadata."):]] != "new" {
				t.Fatalf("desired edit was not saved: %s", payload["nodes"])
			}
			if test.field == "metadata.prompt" && nodes[0].Metadata["title"] != "other window" {
				t.Fatal("unrelated concurrent edit was overwritten")
			}
		})
	}
}

func TestCanvasOperationsProtocolDeletedNodeStaysDeleted(t *testing.T) {
	payload := map[string]json.RawMessage{"nodes": json.RawMessage(`[]`), "connections": json.RawMessage(`[]`)}
	err := applyCanvasOperations(payload, []CanvasOperation{{
		Type: "patch_node", ID: "deleted",
		Patch:  map[string]json.RawMessage{"metadata.title": json.RawMessage(`"late edit"`)},
		Before: map[string]json.RawMessage{"metadata.title": json.RawMessage(`"original"`)},
	}})
	if !errors.Is(err, ErrCanvasObjectMissing) || string(payload["nodes"]) != `[]` {
		t.Fatalf("late edit recreated a deleted node: %v, %s", err, payload["nodes"])
	}
}

func TestCanvasOperationsProtocolPreservesCreationBrief(t *testing.T) {
	payload := map[string]json.RawMessage{"nodes": json.RawMessage(`[]`), "connections": json.RawMessage(`[]`), "chatSessions": json.RawMessage(`[]`)}
	brief := json.RawMessage(`{"prompt":"retain the existing home-page creation brief","referenceNodeIds":["source"]}`)
	err := applyCanvasOperations(payload, []CanvasOperation{{Type: "set_field", Field: "agentDraft", Value: brief, BeforeValue: json.RawMessage(`null`)}})
	if err != nil || string(payload["agentDraft"]) != string(brief) {
		t.Fatalf("creation brief was rejected or lost by operations: %s %v", payload["agentDraft"], err)
	}
	err = applyCanvasOperations(payload, []CanvasOperation{{Type: "set_field", Field: "agentDraft", Value: json.RawMessage(`null`), BeforeValue: brief}})
	if err != nil {
		t.Fatalf("completed brief cannot be cleared: %v", err)
	}
}
