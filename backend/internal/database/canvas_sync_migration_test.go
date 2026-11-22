package database

import (
	"reflect"
	"testing"
	"time"

	"gorm.io/gorm"
	"infinite-canvas/backend/internal/model"
)

func TestCanvasSyncMigrationV53ReplaysWithoutChangingExistingRowsOrHistory(t *testing.T) {
	db := mainMigrationDatabaseAt(t, 52)
	if err := db.Migrator().DropTable(&model.CanvasMutationReceipt{}, &model.CanvasEditLease{}); err != nil {
		t.Fatal(err)
	}
	// Older migrations create current models; restore the deployed v52 boundary.
	if db.Migrator().HasColumn(&model.Task{}, "AgentExecutionReady") {
		if err := db.Migrator().DropColumn(&model.Task{}, "AgentExecutionReady"); err != nil {
			t.Fatal(err)
		}
	}

	var historyBefore []schemaMigration
	if err := db.Table("schema_migrations").Order("version ASC").Find(&historyBefore).Error; err != nil {
		t.Fatal(err)
	}
	if len(historyBefore) != 52 {
		t.Fatalf("pre-migration history has %d records, want 52", len(historyBefore))
	}

	fixedTime := time.Date(2026, 10, 29, 9, 30, 0, 0, time.UTC)
	canvasBefore := model.CanvasProject{
		ID: "canvas-preserved", UserID: "user-preserved", Title: "existing canvas",
		PayloadJSON: `{"nodes":[{"id":"legacy"}]}`, Revision: 17,
		CreatedAt: fixedTime, UpdatedAt: fixedTime,
	}
	snapshotBefore := model.CanvasSnapshot{
		ID: "snapshot-preserved", CanvasID: canvasBefore.ID, UserID: canvasBefore.UserID,
		Revision: 16, Title: canvasBefore.Title, PayloadJSON: canvasBefore.PayloadJSON,
		PayloadBytes: len(canvasBefore.PayloadJSON), Reason: "interval",
		ContentUpdatedAt: fixedTime, CreatedAt: fixedTime,
	}
	billingBefore := model.BillingOrder{
		ID: "billing-preserved", UserID: canvasBefore.UserID, IdempotencyKey: "billing-key-preserved",
		Model: "model-preserved", AmountMicrocredits: 987654, Status: "succeeded", CreatedAt: fixedTime,
	}
	ledgerBefore := model.CreditLedgerEntry{
		ID: "credit-ledger-preserved", UserID: canvasBefore.UserID, Type: model.CreditLedgerRecharge,
		AmountMicrocredits: 987654, AvailableDeltaMicrocredits: 987654,
		AvailableAfterMicrocredits: 987654, Note: "preserve across canvas schema migration", CreatedAt: fixedTime,
	}
	for _, value := range []any{&canvasBefore, &snapshotBefore, &billingBefore, &ledgerBefore} {
		if err := db.Create(value).Error; err != nil {
			t.Fatalf("seed existing row: %v", err)
		}
	}

	if err := replayCanvasSyncV53(db); err != nil {
		t.Fatalf("replay schema v53 from v52: %v", err)
	}
	if !db.Migrator().HasTable(&model.CanvasMutationReceipt{}) || !db.Migrator().HasTable(&model.CanvasEditLease{}) {
		t.Fatal("schema v53 did not create both canvas sync tables")
	}
	if !db.Migrator().HasIndex(&model.CanvasMutationReceipt{}, "idx_canvas_mutation_receipt_identity") {
		t.Fatal("schema v53 did not create the receipt identity index")
	}
	if !db.Migrator().HasIndex(&model.CanvasEditLease{}, "idx_canvas_edit_leases_expires_at") {
		t.Fatal("schema v53 did not create the lease expiration index")
	}
	if db.Migrator().HasIndex(&model.CloudAgentExecution{}, "idx_cloud_agent_canvas_active") ||
		db.Migrator().HasIndex(&model.Task{}, "idx_tasks_canvas_agent_reservation") {
		t.Fatal("schema v53 unexpectedly applied the official v57 Agent activity indexes")
	}
	if db.Migrator().HasColumn("tasks", "agent_execution_ready") {
		t.Fatal("schema v53 unexpectedly applied the official v57 task-column migration")
	}
	receipt := model.CanvasMutationReceipt{
		ID: "receipt-v53", UserID: "user-v53", CanvasID: "canvas-v53", MutationID: "mutation-v53",
		PayloadDigest: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
		ResultJSON:    `{"revision":18}`, Revision: 18, CreatedAt: fixedTime,
	}
	if err := db.Create(&receipt).Error; err != nil {
		t.Fatalf("insert migrated receipt: %v", err)
	}
	duplicateReceipt := receipt
	duplicateReceipt.ID = "receipt-v53-duplicate"
	if err := db.Create(&duplicateReceipt).Error; err == nil {
		t.Fatal("receipt identity index did not reject a duplicate mutation identity")
	}
	lease := model.CanvasEditLease{
		UserID: "user-v53", CanvasID: "canvas-v53", NodeID: "node-v53", SessionID: "session-v53",
		Token: "token-v53", ExpiresAt: fixedTime.Add(time.Minute),
	}
	if err := db.Create(&lease).Error; err != nil {
		t.Fatalf("insert migrated lease: %v", err)
	}
	if err := db.Create(&lease).Error; err == nil {
		t.Fatal("lease composite primary key did not reject a duplicate node lease")
	}

	var historyAfter []schemaMigration
	if err := db.Table("schema_migrations").Order("version ASC").Find(&historyAfter).Error; err != nil {
		t.Fatal(err)
	}
	if len(historyAfter) != 53 {
		t.Fatalf("post-migration history has %d records, want 53", len(historyAfter))
	}
	for index, before := range historyBefore {
		after := historyAfter[index]
		if before.Version != after.Version || before.Name != after.Name || before.Checksum != after.Checksum || !before.AppliedAt.Equal(after.AppliedAt) {
			t.Fatalf("existing migration history changed at index %d: before=%+v after=%+v", index, before, after)
		}
	}
	v53 := historyAfter[len(historyAfter)-1]
	if v53.Version != 53 || v53.Name != "canvas_sync_persistence" || v53.Checksum != "sha256:yingxue-canvas-sync-v53-20261029" {
		t.Fatalf("unexpected v53 migration record: %+v", v53)
	}
	status, err := ReadSchemaStatus(db)
	if err != nil || status.Ready != (CurrentSchemaVersion == 53) || status.Current != 53 {
		t.Fatalf("schema status after v53 = %+v, %v", status, err)
	}

	var canvasAfter model.CanvasProject
	var snapshotAfter model.CanvasSnapshot
	var billingAfter model.BillingOrder
	var ledgerAfter model.CreditLedgerEntry
	for _, query := range []struct {
		id    string
		value any
	}{
		{canvasBefore.ID, &canvasAfter},
		{snapshotBefore.ID, &snapshotAfter},
		{billingBefore.ID, &billingAfter},
		{ledgerBefore.ID, &ledgerAfter},
	} {
		if err := db.First(query.value, "id = ?", query.id).Error; err != nil {
			t.Fatalf("read preserved row %s: %v", query.id, err)
		}
	}
	for _, pair := range [][2]time.Time{
		{canvasBefore.CreatedAt, canvasAfter.CreatedAt},
		{canvasBefore.UpdatedAt, canvasAfter.UpdatedAt},
		{snapshotBefore.ContentUpdatedAt, snapshotAfter.ContentUpdatedAt},
		{snapshotBefore.CreatedAt, snapshotAfter.CreatedAt},
		{billingBefore.CreatedAt, billingAfter.CreatedAt},
		{billingBefore.UpdatedAt, billingAfter.UpdatedAt},
		{ledgerBefore.CreatedAt, ledgerAfter.CreatedAt},
	} {
		if !pair[0].Equal(pair[1]) {
			t.Fatalf("schema v53 changed an existing row timestamp: before=%s after=%s", pair[0], pair[1])
		}
	}
	canvasBefore.CreatedAt, canvasBefore.UpdatedAt = time.Time{}, time.Time{}
	canvasAfter.CreatedAt, canvasAfter.UpdatedAt = time.Time{}, time.Time{}
	snapshotBefore.ContentUpdatedAt, snapshotBefore.CreatedAt = time.Time{}, time.Time{}
	snapshotAfter.ContentUpdatedAt, snapshotAfter.CreatedAt = time.Time{}, time.Time{}
	billingBefore.CreatedAt, billingBefore.UpdatedAt = time.Time{}, time.Time{}
	billingAfter.CreatedAt, billingAfter.UpdatedAt = time.Time{}, time.Time{}
	ledgerBefore.CreatedAt, ledgerAfter.CreatedAt = time.Time{}, time.Time{}
	for _, pair := range [][2]any{
		{canvasBefore, canvasAfter},
		{snapshotBefore, snapshotAfter},
		{billingBefore, billingAfter},
		{ledgerBefore, ledgerAfter},
	} {
		if !reflect.DeepEqual(pair[0], pair[1]) {
			t.Fatalf("schema v53 changed existing row: before=%#v after=%#v", pair[0], pair[1])
		}
	}

	if err := replayCanvasSyncV53(db); err != nil {
		t.Fatalf("repeat schema v53 migration: %v", err)
	}
	var historyAfterRetry []schemaMigration
	if err := db.Table("schema_migrations").Order("version ASC").Find(&historyAfterRetry).Error; err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(historyAfter, historyAfterRetry) {
		t.Fatal("replaying schema v53 changed migration history")
	}
}

// Exercise the historical v53 migration without silently applying later stages.
func replayCanvasSyncV53(db *gorm.DB) error {
	return db.Transaction(func(tx *gorm.DB) error {
		item := schemaMigrations[52]
		var applied schemaMigration
		if err := tx.Where("version = ?", item.version).Find(&applied).Error; err != nil {
			return err
		}
		if applied.Version != 0 {
			return validateMigrationRecord(applied, item)
		}
		if err := item.apply(tx); err != nil {
			return err
		}
		return tx.Create(&schemaMigration{Version: item.version, Name: item.name, Checksum: item.checksum, AppliedAt: time.Now().UTC()}).Error
	})
}
