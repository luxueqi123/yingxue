package canvas

import (
	"encoding/json"
	"errors"
	"net/http"
	"strings"
	"testing"

	"infinite-canvas/backend/internal/kernel"
	"infinite-canvas/backend/internal/model"
	"infinite-canvas/backend/internal/repository"

	"gorm.io/gorm"
)

func TestCanvasOperationsPreserveHistoryWithoutCopyingDocumentIntoReceipt(t *testing.T) {
	svc := newCanvasOperationTestService(t)
	payload, err := json.Marshal(map[string]any{
		"nodes":        []map[string]any{{"id": "node", "type": "text", "metadata": map[string]any{"title": "before", "content": strings.Repeat("retained original text ", 4096)}}},
		"connections":  []any{},
		"chatSessions": []any{},
	})
	if err != nil {
		t.Fatal(err)
	}
	initial := model.CanvasProject{ID: "history", UserID: "user", Revision: 1, PayloadJSON: string(payload)}
	if err := svc.repo.Create(&initial); err != nil {
		t.Fatal(err)
	}
	req := CanvasOperationsRequest{MutationID: "rename", Operations: []CanvasOperation{{
		Type: "patch_node", ID: "node",
		Patch:  map[string]json.RawMessage{"metadata.title": json.RawMessage(`"after"`)},
		Before: map[string]json.RawMessage{"metadata.title": json.RawMessage(`"before"`)},
	}}}
	result, err := svc.ApplyUserCanvasOperations("user", initial.ID, req)
	if err != nil {
		t.Fatal(err)
	}
	history, err := svc.repo.CanvasSnapshots("user", initial.ID, 20)
	if err != nil || len(history) != 1 {
		t.Fatalf("pre-edit history missing: %v, %d snapshots", err, len(history))
	}
	snapshot, err := svc.repo.CanvasSnapshot("user", initial.ID, history[0].ID)
	if err != nil || !strings.Contains(snapshot.PayloadJSON, `"title":"before"`) || !strings.Contains(snapshot.PayloadJSON, "retained original text") {
		t.Fatalf("original content not retained: %v", err)
	}
	receipt, err := svc.repo.CanvasMutationReceiptForUser("user", initial.ID, req.MutationID)
	if err != nil {
		t.Fatal(err)
	}
	if len(receipt.ResultJSON) > 2048 || strings.Contains(receipt.ResultJSON, "retained original text") {
		t.Fatalf("receipt copied a full document: %d bytes", len(receipt.ResultJSON))
	}
	replayed, err := svc.ApplyUserCanvasOperations("user", initial.ID, req)
	if err != nil || replayed.ID != result.ID || replayed.Revision != result.Revision {
		t.Fatalf("compact receipt cannot replay the original response: %#v, %v", replayed, err)
	}
	history, err = svc.repo.CanvasSnapshots("user", initial.ID, 20)
	if err != nil || len(history) != 1 {
		t.Fatalf("replay duplicated history: %v, %d snapshots", err, len(history))
	}
}

func TestCanvasOperationsReplayDoesNotConfirmDeletedCanvas(t *testing.T) {
	svc := newCanvasOperationTestService(t)
	request := CanvasOperationsRequest{MutationID: "create", Operations: []CanvasOperation{{Type: "create_canvas", ID: "deleted"}}}
	if _, err := svc.ApplyUserCanvasOperations("user", "deleted", request); err != nil {
		t.Fatal(err)
	}
	if err := svc.repo.DeleteCanvasProject("user", "deleted"); err != nil {
		t.Fatal(err)
	}
	_, err := svc.ApplyUserCanvasOperations("user", "deleted", request)
	var appError *kernel.AppError
	if !errors.As(err, &appError) || appError.Status != http.StatusNotFound {
		t.Fatalf("replay falsely confirmed a deleted canvas: %v", err)
	}
	if _, err := svc.repo.CanvasProjectForUser("user", "deleted"); !errors.Is(err, gorm.ErrRecordNotFound) {
		t.Fatalf("replay recreated the deleted canvas: %v", err)
	}
	if _, err := svc.repo.CanvasMutationReceiptForUser("user", "deleted", "create"); err != nil {
		t.Fatalf("replay discarded the historical receipt: %v", err)
	}
}

func TestCanvasOperationsHistoryAndReceiptCommitAtomically(t *testing.T) {
	for _, failure := range []struct {
		name, table string
		update      bool
	}{
		{"history insert", "canvas_snapshots", false},
		{"history resource protection", "canvas_snapshot_resources", false},
		{"receipt finalization", "canvas_mutation_receipts", true},
	} {
		t.Run(failure.name, func(t *testing.T) {
			svc, db := newCanvasOperationTestDatabase(t)
			resource := model.Resource{ID: "original-media", UserID: "user", Status: model.ResourceStatusReady}
			if err := db.Create(&resource).Error; err != nil {
				t.Fatal(err)
			}
			node := json.RawMessage(`{"id":"original","type":"image","metadata":{"storageKey":"resource:original-media"}}`)
			initial := model.CanvasProject{ID: "atomic", UserID: "user", Revision: 1,
				PayloadJSON: `{"nodes":[` + string(node) + `],"connections":[],"chatSessions":[]}`}
			if err := db.Create(&initial).Error; err != nil {
				t.Fatal(err)
			}
			notifications := 0
			svc.repo = svc.repo.WithCanvasChangeNotifier(func(userID, canvasID string) {
				if userID != initial.UserID || canvasID != initial.ID {
					t.Errorf("notification escaped the canvas: %s %s", userID, canvasID)
				}
				notifications++
			})
			injected := errors.New("injected persistence failure")
			failWrite := func(tx *gorm.DB) {
				if tx.Statement.Table == failure.table {
					tx.AddError(injected)
				}
			}
			if failure.update {
				if err := db.Callback().Update().Before("gorm:update").Register("test:atomic_failure", failWrite); err != nil {
					t.Fatal(err)
				}
			} else if err := db.Callback().Create().Before("gorm:create").Register("test:atomic_failure", failWrite); err != nil {
				t.Fatal(err)
			}
			request := CanvasOperationsRequest{MutationID: "remove-original", Operations: []CanvasOperation{{Type: "remove_node", ID: "original", Expected: node}}}
			if _, err := svc.ApplyUserCanvasOperations("user", initial.ID, request); !errors.Is(err, injected) {
				t.Fatalf("did not reach the requested persistence failure: %v", err)
			}
			stored, err := svc.repo.CanvasProjectForUser("user", initial.ID)
			if err != nil || stored.Revision != initial.Revision || stored.PayloadJSON != initial.PayloadJSON {
				t.Fatalf("failed save changed the document or revision: %#v %v", stored, err)
			}
			for _, table := range []string{"canvas_snapshots", "canvas_snapshot_resources", "canvas_mutation_receipts"} {
				var count int64
				if err := db.Table(table).Count(&count).Error; err != nil || count != 0 {
					t.Fatalf("failed save left rows in %s: %d %v", table, count, err)
				}
			}
			if notifications != 0 {
				t.Fatalf("rolled-back write notified other windows: %d", notifications)
			}
			if failure.update {
				if err := db.Callback().Update().Remove("test:atomic_failure"); err != nil {
					t.Fatal(err)
				}
			} else if err := db.Callback().Create().Remove("test:atomic_failure"); err != nil {
				t.Fatal(err)
			}
			result, err := svc.ApplyUserCanvasOperations("user", initial.ID, request)
			if err != nil || result.Revision != initial.Revision+1 || notifications != 1 {
				t.Fatalf("same request could not commit after rollback: %#v %v, notifications=%d", result, err, notifications)
			}
			for _, table := range []string{"canvas_snapshots", "canvas_snapshot_resources", "canvas_mutation_receipts"} {
				var count int64
				if err := db.Table(table).Count(&count).Error; err != nil || count != 1 {
					t.Fatalf("committed save missing %s: %d %v", table, count, err)
				}
			}
			if err := svc.repo.RequireNoCanvasHistoryReferences([]string{resource.ID}); !errors.Is(err, repository.ErrCanvasHistoryResourceReferenced) {
				t.Fatalf("history media lost deletion protection: %v", err)
			}
			replayed, err := svc.ApplyUserCanvasOperations("user", initial.ID, request)
			if err != nil || replayed.Revision != result.Revision || notifications != 1 {
				t.Fatalf("replay wrote again: %#v %v, notifications=%d", replayed, err, notifications)
			}
		})
	}
}

func TestCanvasOperationsRejectedWritesLeaveNoReceiptOrHistory(t *testing.T) {
	for _, scenario := range []struct {
		name, actor, payload string
	}{
		{"another owner", "other-user", `{"nodes":[{"id":"node","metadata":{"title":"before"}}],"connections":[],"chatSessions":[]}`},
		{"new missing media", "user", `{"nodes":[{"id":"node","metadata":{"title":"before"}}],"connections":[],"chatSessions":[]}`},
		{"malformed collection", "user", `{"nodes":[{"id":"node","metadata":{"title":"before"}}],"connections":[],"chatSessions":{}}`},
	} {
		t.Run(scenario.name, func(t *testing.T) {
			svc, db := newCanvasOperationTestDatabase(t)
			initial := model.CanvasProject{ID: "protected", UserID: "user", Revision: 1, PayloadJSON: scenario.payload}
			if err := db.Create(&initial).Error; err != nil {
				t.Fatal(err)
			}
			var original struct{ Nodes []json.RawMessage }
			if err := json.Unmarshal([]byte(scenario.payload), &original); err != nil {
				t.Fatal(err)
			}
			request := CanvasOperationsRequest{MutationID: "rejected", Operations: []CanvasOperation{{Type: "remove_node", ID: "node", Expected: original.Nodes[0]}}}
			if scenario.name == "new missing media" {
				request.Operations = []CanvasOperation{{Type: "patch_node", ID: "node",
					Patch:  map[string]json.RawMessage{"metadata.storageKey": json.RawMessage(`"resource:missing"`)},
					Before: map[string]json.RawMessage{"metadata.storageKey": json.RawMessage(`null`)}}}
			}
			if _, err := svc.ApplyUserCanvasOperations(scenario.actor, initial.ID, request); err == nil {
				t.Fatal("invalid write was accepted")
			}
			stored, err := svc.repo.CanvasProjectForUser("user", initial.ID)
			if err != nil || stored.PayloadJSON != initial.PayloadJSON || stored.Revision != initial.Revision {
				t.Fatalf("invalid write changed the protected canvas: %#v %v", stored, err)
			}
			for _, table := range []string{"canvas_snapshots", "canvas_snapshot_resources", "canvas_mutation_receipts"} {
				var count int64
				if err := db.Table(table).Count(&count).Error; err != nil || count != 0 {
					t.Fatalf("rejected write left %s rows: %d %v", table, count, err)
				}
			}
		})
	}
}

func TestCanvasHistoryNotifiesOnlyAfterWholeSaveCommits(t *testing.T) {
	svc, db := newCanvasOperationTestDatabase(t)
	initial := model.CanvasProject{ID: "legacy-put", UserID: "user", Revision: 1,
		PayloadJSON: `{"nodes":[{"id":"node","metadata":{"content":"original"}}],"connections":[],"chatSessions":[]}`}
	if err := db.Create(&initial).Error; err != nil {
		t.Fatal(err)
	}
	notifications := 0
	svc.repo = svc.repo.WithCanvasChangeNotifier(func(_, _ string) { notifications++ })
	injected := errors.New("history cannot be persisted")
	if err := db.Callback().Create().Before("gorm:create").Register("test:history_failure", func(tx *gorm.DB) {
		if tx.Statement.Table == "canvas_snapshots" {
			tx.AddError(injected)
		}
	}); err != nil {
		t.Fatal(err)
	}
	request := json.RawMessage(`{"id":"legacy-put","revision":1,"nodes":[],"connections":[],"chatSessions":[]}`)
	if _, err := svc.UpsertUserCanvasProject("user", request); !errors.Is(err, injected) {
		t.Fatalf("expected history persistence failure: %v", err)
	}
	if notifications != 0 {
		t.Fatalf("history rollback broadcast an uncommitted save: %d", notifications)
	}
	if err := db.Callback().Create().Remove("test:history_failure"); err != nil {
		t.Fatal(err)
	}
	result, err := svc.UpsertUserCanvasProject("user", request)
	if err != nil || result.Revision != 2 || notifications != 1 {
		t.Fatalf("whole save did not notify once after commit: %#v %v %d", result, err, notifications)
	}
}
