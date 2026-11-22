package app

import (
	"encoding/json"
	"errors"
	"strings"
	"testing"
	"time"

	"infinite-canvas/backend/internal/model"
	"infinite-canvas/backend/internal/repository"
)

func TestSaveCreationCanvasWithHistoryUsesOperationsAndOuterTransaction(t *testing.T) {
	s, db, _ := agentMediaFixture(t)
	original, err := s.repo.CanvasProjectForUser("user", "agent-canvas")
	if err != nil {
		t.Fatal(err)
	}
	baseDocument, err := creationDocument(original.PayloadJSON)
	if err != nil {
		t.Fatal(err)
	}
	baseDocument["chatSessions"] = []any{}
	normalized, err := json.Marshal(baseDocument)
	if err != nil {
		t.Fatal(err)
	}
	if err := db.Model(&model.CanvasProject{}).Where("id = ? AND user_id = ?", original.ID, original.UserID).Update("payload_json", string(normalized)).Error; err != nil {
		t.Fatal(err)
	}
	original.PayloadJSON = string(normalized)

	editDocument := func(payload, content string) map[string]any {
		doc, err := creationDocument(payload)
		if err != nil {
			t.Fatal(err)
		}
		nodes := creationMaps(doc["nodes"])
		if len(nodes) == 0 {
			t.Fatal("test canvas has no node to edit")
		}
		metadata, ok := nodes[0]["metadata"].(map[string]any)
		if !ok {
			t.Fatal("test canvas node has no metadata object")
		}
		metadata["content"] = content
		return doc
	}
	countReceipts := func() int64 {
		var count int64
		if err := db.Model(&model.CanvasMutationReceipt{}).Where("canvas_id = ?", original.ID).Count(&count).Error; err != nil {
			t.Fatal(err)
		}
		return count
	}
	countSnapshots := func() int64 {
		var count int64
		if err := db.Model(&model.CanvasSnapshot{}).Where("canvas_id = ?", original.ID).Count(&count).Error; err != nil {
			t.Fatal(err)
		}
		return count
	}

	desired, err := json.Marshal(editDocument(original.PayloadJSON, "第一笔 operations 内容"))
	if err != nil {
		t.Fatal(err)
	}
	project := *original
	project.PayloadJSON = string(desired)
	if err := saveCreationCanvasWithHistory(s.repo, &project, original.PayloadJSON); err != nil {
		t.Fatal(err)
	}
	persisted, err := s.repo.CanvasProjectForUser("user", original.ID)
	if err != nil {
		t.Fatal(err)
	}
	if project.Revision != persisted.Revision || project.PayloadJSON != persisted.PayloadJSON || project.UpdatedAt != persisted.UpdatedAt {
		t.Fatalf("creation canvas pointer is stale after write: memory rev=%d db rev=%d", project.Revision, persisted.Revision)
	}
	if project.Revision != original.Revision+1 || !strings.Contains(persisted.PayloadJSON, "第一笔 operations 内容") {
		t.Fatalf("creation operation did not persist one new revision: revision=%d payload=%s", project.Revision, persisted.PayloadJSON)
	}
	if countReceipts() != 1 || countSnapshots() != 1 {
		t.Fatalf("operation write should commit its receipt and history: receipts=%d snapshots=%d", countReceipts(), countSnapshots())
	}

	stalePreimage := *persisted
	if err := saveCreationCanvasWithHistory(s.repo, &stalePreimage, original.PayloadJSON); !errors.Is(err, repository.ErrCreationConflict) {
		t.Fatalf("changed preimage was not rejected: %v", err)
	}
	staleRevision := *persisted
	staleRevision.Revision = original.Revision
	if err := saveCreationCanvasWithHistory(s.repo, &staleRevision, persisted.PayloadJSON); !errors.Is(err, repository.ErrCreationConflict) {
		t.Fatalf("stale revision was not rejected: %v", err)
	}

	if err := db.Model(&model.CanvasSnapshot{}).Where("canvas_id = ?", original.ID).Update("created_at", time.Now().Add(-10*time.Minute)).Error; err != nil {
		t.Fatal(err)
	}
	policy, err := s.RuntimePolicy()
	if err != nil {
		t.Fatal(err)
	}
	rollbackCanvas := *persisted
	rollbackDoc := editDocument(persisted.PayloadJSON, "外层 Agent 事务回滚内容")
	rollbackErr := errors.New("abort outer Agent transaction")
	err = s.repo.Transaction(func(tx *repository.Repository) error {
		if err := saveCloudAgentDocument(tx, &rollbackCanvas, rollbackDoc, policy); err != nil {
			return err
		}
		if rollbackCanvas.Revision != persisted.Revision+1 || !strings.Contains(rollbackCanvas.PayloadJSON, "外层 Agent 事务回滚内容") {
			return errors.New("in-memory canvas did not read back its committed operation inside the outer transaction")
		}
		return rollbackErr
	})
	if !errors.Is(err, rollbackErr) {
		t.Fatalf("outer Agent transaction did not return its abort cause: %v", err)
	}
	afterRollback, err := s.repo.CanvasProjectForUser("user", original.ID)
	if err != nil {
		t.Fatal(err)
	}
	if afterRollback.Revision != persisted.Revision || afterRollback.PayloadJSON != persisted.PayloadJSON {
		t.Fatalf("outer Agent rollback left canvas content or revision behind: before=%d after=%d", persisted.Revision, afterRollback.Revision)
	}
	if countReceipts() != 1 || countSnapshots() != 1 {
		t.Fatalf("outer Agent rollback left receipt or history behind: receipts=%d snapshots=%d", countReceipts(), countSnapshots())
	}
}
