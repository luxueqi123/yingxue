package database

import (
	"fmt"
	"os"
	"reflect"
	"testing"
	"time"

	"gorm.io/gorm"
	"infinite-canvas/backend/internal/model"
)

func TestCanvasAgentActivityMigrationV54PreservesRowsAndBackfillsOwnedCheckpoints(t *testing.T) {
	db := mainMigrationDatabaseAt(t, 53)
	testCanvasAgentActivityMigration(t, db)
}

func TestCanvasAgentActivityMigrationV54Postgres(t *testing.T) {
	dsn := os.Getenv("CANVAS_TEST_POSTGRES_DSN")
	if dsn == "" {
		t.Skip("CANVAS_TEST_POSTGRES_DSN is not configured")
	}
	base, err := Open(Config{Driver: "postgres", DSN: dsn})
	if err != nil {
		t.Fatal(err)
	}
	baseSQL, err := base.DB()
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = baseSQL.Close() })
	schemaName := fmt.Sprintf("canvas_agent_v54_%d", time.Now().UnixNano())
	if err := base.Exec("CREATE SCHEMA " + schemaName).Error; err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		if err := base.Exec("DROP SCHEMA " + schemaName + " CASCADE").Error; err != nil {
			t.Error(err)
		}
	})
	testDSN, err := postgresDSNWithSearchPath(dsn, schemaName)
	if err != nil {
		t.Fatal(err)
	}
	db, err := Open(Config{Driver: "postgres", DSN: testDSN})
	if err != nil {
		t.Fatal(err)
	}
	conn, err := db.DB()
	if err != nil {
		t.Fatal(err)
	}
	// ALTER TABLE changes the result shape of SELECT *; close idle pgx
	// connections so the pre-migration test query plan cannot survive the DDL.
	conn.SetMaxIdleConns(0)
	t.Cleanup(func() { _ = conn.Close() })
	if err := db.AutoMigrate(&schemaMigration{}); err != nil {
		t.Fatal(err)
	}
	for _, item := range schemaMigrations {
		if item.version > 53 {
			break
		}
		if err := item.apply(db); err != nil {
			t.Fatal(err)
		}
		if err := db.Create(&schemaMigration{Version: item.version, Name: item.name, Checksum: item.checksum, AppliedAt: time.Now().UTC()}).Error; err != nil {
			t.Fatal(err)
		}
	}
	testCanvasAgentActivityMigration(t, db)
}

func testCanvasAgentActivityMigration(t *testing.T, db *gorm.DB) {
	t.Helper()
	// Early migrations use current models. Restore the actual deployed v53 shape.
	if db.Migrator().HasColumn(&model.Task{}, "AgentExecutionReady") {
		if err := db.Migrator().DropColumn(&model.Task{}, "AgentExecutionReady"); err != nil {
			t.Fatal(err)
		}
	}
	var historyBefore []schemaMigration
	if err := db.Order("version").Find(&historyBefore).Error; err != nil {
		t.Fatal(err)
	}
	if len(historyBefore) != 53 {
		t.Fatalf("expected real v53 ledger, got %d", len(historyBefore))
	}
	fixedTime := time.Date(2026, 10, 29, 9, 0, 0, 0, time.UTC)
	for _, item := range []struct{ id, operation string }{
		{"checkpoint", "cloud_agent"}, {"reservation", "cloud_agent"},
		{"foreign-checkpoint", "cloud_agent"}, {"ordinary", "generate"},
	} {
		if err := db.Table("tasks").Create(map[string]any{
			"id": item.id, "user_id": "owner", "project_id": "canvas", "operation": item.operation,
			"status": "text_replay", "prompt": "preserved prompt", "input_json": `{"private":"input"}`,
			"result_json": `{"private":"result"}`, "created_at": fixedTime, "updated_at": fixedTime,
		}).Error; err != nil {
			t.Fatal(err)
		}
	}
	for _, run := range []model.CloudAgentExecution{
		{ID: "checkpoint", UserID: "owner", Status: "completed", StateJSON: `{"private":"transcript"}`},
		{ID: "foreign-checkpoint", UserID: "someone-else", Status: "running"},
		{ID: "ordinary", UserID: "owner", Status: "completed"},
	} {
		if err := db.Create(&run).Error; err != nil {
			t.Fatal(err)
		}
	}
	var tasksBefore []model.Task
	var executionsBefore []model.CloudAgentExecution
	if err := db.Order("id").Find(&tasksBefore).Error; err != nil {
		t.Fatal(err)
	}
	if err := db.Order("id").Find(&executionsBefore).Error; err != nil {
		t.Fatal(err)
	}
	for range 2 {
		for _, migration := range schemaMigrations {
			if migration.version != 54 {
				continue
			}
			var applied int64
			if err := db.Model(&schemaMigration{}).Where("version = ?", migration.version).Count(&applied).Error; err != nil {
				t.Fatal(err)
			}
			if applied != 0 {
				continue
			}
			if err := db.Transaction(func(tx *gorm.DB) error {
				if err := migration.apply(tx); err != nil {
					return err
				}
				return tx.Create(&schemaMigration{Version: migration.version, Name: migration.name, Checksum: migration.checksum, AppliedAt: time.Now().UTC()}).Error
			}); err != nil {
				t.Fatal(err)
			}
		}
	}
	var historyAfter []schemaMigration
	if err := db.Where("version <= 53").Order("version").Find(&historyAfter).Error; err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(historyBefore, historyAfter) {
		t.Fatal("migration changed ledger versions 1-53")
	}
	var tasksAfter []model.Task
	var executionsAfter []model.CloudAgentExecution
	if err := db.Order("id").Find(&tasksAfter).Error; err != nil {
		t.Fatal(err)
	}
	if err := db.Order("id").Find(&executionsAfter).Error; err != nil {
		t.Fatal(err)
	}
	if len(tasksAfter) != len(tasksBefore) {
		t.Fatal("migration changed task count")
	}
	for i := range tasksAfter {
		if tasksAfter[i].AgentExecutionReady != (tasksAfter[i].ID == "checkpoint") {
			t.Fatalf("incorrect checkpoint backfill for %s", tasksAfter[i].ID)
		}
		tasksAfter[i].AgentExecutionReady = false
	}
	if !reflect.DeepEqual(tasksBefore, tasksAfter) || !reflect.DeepEqual(executionsBefore, executionsAfter) {
		t.Fatal("migration changed existing task/execution fields")
	}
	for table, index := range map[string]string{
		"tasks": "idx_tasks_canvas_agent_reservation", "cloud_agent_executions": "idx_cloud_agent_canvas_active",
	} {
		if !db.Migrator().HasIndex(table, index) {
			t.Fatalf("missing partial index %s", index)
		}
	}
	status, err := ReadSchemaStatus(db)
	if err != nil || status.Ready || status.Current != 54 {
		t.Fatalf("unexpected v54 schema status: %+v %v", status, err)
	}
	var deployedHistory []schemaMigration
	if err := db.Order("version").Find(&deployedHistory).Error; err != nil {
		t.Fatal(err)
	}
	for range 2 {
		if err := MigrateSchema(db); err != nil {
			t.Fatal(err)
		}
	}
	var upgradedHistory []schemaMigration
	if err := db.Where("version <= ?", 54).Order("version").Find(&upgradedHistory).Error; err != nil || !reflect.DeepEqual(deployedHistory, upgradedHistory) {
		t.Fatalf("upgrade changed deployed v1-v54 ledger: %v", err)
	}
	for _, original := range tasksBefore {
		var stored model.Task
		if err := db.First(&stored, "id = ?", original.ID).Error; err != nil {
			t.Fatal(err)
		}
		if stored.UserID != original.UserID || stored.ProjectID != original.ProjectID || stored.Prompt != original.Prompt || stored.InputJSON != original.InputJSON || stored.ResultJSON != original.ResultJSON {
			t.Fatalf("upgrade changed existing task content %s", original.ID)
		}
	}
	for _, original := range executionsBefore {
		var stored model.CloudAgentExecution
		if err := db.First(&stored, "id = ?", original.ID).Error; err != nil || stored.UserID != original.UserID || stored.StateJSON != original.StateJSON {
			t.Fatalf("upgrade changed existing conversation content %s: %v", original.ID, err)
		}
	}
	status, err = ReadSchemaStatus(db)
	if err != nil || !status.Ready || status.Current != CurrentSchemaVersion {
		t.Fatalf("unexpected upgraded schema status: %+v %v", status, err)
	}
}
