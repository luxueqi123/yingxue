package canvas

import (
	"encoding/json"
	"errors"
	"net/http"
	"testing"

	"infinite-canvas/backend/internal/kernel"
)

func TestCanvasDocumentRejectsInvalidCollections(t *testing.T) {
	for _, field := range []string{"nodes", "connections", "chatSessions"} {
		for _, bad := range []string{"missing", "null", "{}", `"text"`, "[null]", "[[]]", "[1]"} {
			t.Run(field+"/"+bad, func(t *testing.T) {
				doc := map[string]json.RawMessage{"id": json.RawMessage(`"fixture"`), "revision": json.RawMessage(`0`), "nodes": json.RawMessage(`[]`), "connections": json.RawMessage(`[]`), "chatSessions": json.RawMessage(`[]`)}
				if bad == "missing" {
					delete(doc, field)
				} else {
					doc[field] = json.RawMessage(bad)
				}
				raw, _ := json.Marshal(doc)
				_, err := canvasProjectFromJSON("owner", raw)
				var appError *kernel.AppError
				if !errors.As(err, &appError) || appError.Status != http.StatusBadRequest {
					t.Fatalf("invalid %s=%s accepted: %v", field, bad, err)
				}
			})
		}
	}
}

func TestCanvasDocumentPreservesRawContent(t *testing.T) {
	raw := json.RawMessage(`{"id":"fixture","revision":0,"nodes":[{"id":"n","metadata":{"prompt":"原文 {name}","custom":{"exact":true}}}],"connections":[],"chatSessions":[{"id":"s","messages":[]}],"unknownExtension":{"keep":true}}`)
	project, err := canvasProjectFromJSON("owner", raw)
	if err != nil {
		t.Fatal(err)
	}
	if project.PayloadJSON != string(raw) {
		t.Fatal("validation rewrote the source document")
	}
}

func TestCanvasDocumentRejectsMissingSessionMessages(t *testing.T) {
	_, err := canvasProjectFromJSON("owner", json.RawMessage(`{"id":"fixture","revision":0,"nodes":[],"connections":[],"chatSessions":[{"id":"s"}]}`))
	if err == nil {
		t.Fatal("session without messages accepted")
	}
}

func TestCanvasInvalidCollectionCannotReplaceSavedContent(t *testing.T) {
	svc := newCanvasHistoryTestService(t)
	initial := json.RawMessage(`{"id":"guarded","revision":0,"nodes":[],"connections":[],"chatSessions":[]}`)
	if _, err := svc.UpsertUserCanvasProject("owner", initial); err != nil {
		t.Fatal(err)
	}
	before, err := svc.UserCanvasProject("owner", "guarded")
	if err != nil {
		t.Fatal(err)
	}
	invalid := json.RawMessage(`{"id":"guarded","revision":1,"nodes":[],"connections":[],"chatSessions":null}`)
	for _, save := range []func(string, json.RawMessage) (UserDataSummary, error){svc.UpsertUserCanvasProject, svc.RepairUserCanvasProject} {
		_, err := save("owner", invalid)
		var appError *kernel.AppError
		if !errors.As(err, &appError) || appError.Status != http.StatusBadRequest {
			t.Fatalf("invalid write: %v", err)
		}
	}
	after, err := svc.UserCanvasProject("owner", "guarded")
	if err != nil {
		t.Fatal(err)
	}
	if string(before) != string(after) {
		t.Fatal("rejected write changed saved content or revision")
	}
	history, err := svc.CanvasHistory("owner", "guarded")
	if err != nil {
		t.Fatal(err)
	}
	if len(history.Snapshots) != 0 || history.CurrentRevision != 1 {
		t.Fatal("rejected write created history or advanced revision")
	}
}
