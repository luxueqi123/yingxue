package database

import (
	"fmt"
	"os"
	"strings"
	"testing"
	"time"

	"infinite-canvas/backend/internal/model"
)

func TestCanvasSyncMigrationPostgresCreatesTablesAndIndexes(t *testing.T) {
	dsn := strings.TrimSpace(os.Getenv("CANVAS_TEST_POSTGRES_DSN"))
	if dsn == "" {
		t.Skip("CANVAS_TEST_POSTGRES_DSN is not configured")
	}

	base, err := Open(Config{Driver: "postgres", DSN: dsn})
	if err != nil {
		t.Fatalf("open postgres: %v", err)
	}
	baseSQL, err := base.DB()
	if err != nil {
		t.Fatalf("postgres sql db: %v", err)
	}
	t.Cleanup(func() { _ = baseSQL.Close() })

	schemaName := fmt.Sprintf("canvas_sync_v53_%d", time.Now().UnixNano())
	if err := base.Exec(`CREATE SCHEMA "` + schemaName + `"`).Error; err != nil {
		t.Fatalf("create isolated test schema: %v", err)
	}
	t.Cleanup(func() {
		if err := base.Exec(`DROP SCHEMA IF EXISTS "` + schemaName + `" CASCADE`).Error; err != nil {
			t.Errorf("drop isolated test schema: %v", err)
		}
	})

	testDSN, err := postgresDSNWithSearchPath(dsn, schemaName)
	if err != nil {
		t.Fatalf("test postgres dsn: %v", err)
	}
	db, err := Open(Config{Driver: "postgres", DSN: testDSN})
	if err != nil {
		t.Fatalf("open isolated test schema: %v", err)
	}
	dbSQL, err := db.DB()
	if err != nil {
		t.Fatalf("test schema sql db: %v", err)
	}
	t.Cleanup(func() { _ = dbSQL.Close() })

	if err := MigrateSchema(db); err != nil {
		t.Fatalf("prepare isolated postgres schema: %v", err)
	}
	if err := db.Table("schema_migrations").Where("version >= ?", 53).Delete(&schemaMigration{}).Error; err != nil {
		t.Fatalf("restore the v52 migration ledger: %v", err)
	}
	if err := db.Migrator().DropTable(&model.CanvasMutationReceipt{}, &model.CanvasEditLease{}); err != nil {
		t.Fatalf("restore the v52 canvas schema: %v", err)
	}
	for _, index := range []string{"idx_tasks_canvas_agent_reservation", "idx_cloud_agent_canvas_active"} {
		if err := db.Exec(`DROP INDEX IF EXISTS "` + schemaName + `"."` + index + `"`).Error; err != nil {
			t.Fatal(err)
		}
	}
	if err := db.Migrator().DropColumn(&model.Task{}, "AgentExecutionReady"); err != nil {
		t.Fatal(err)
	}
	if err := replayCanvasSyncV53(db); err != nil {
		t.Fatalf("replay v53 on isolated postgres schema: %v", err)
	}
	status, err := ReadSchemaStatus(db)
	if err != nil || status.Ready != (CurrentSchemaVersion == 53) || status.Current != 53 {
		t.Fatalf("postgres schema status = %+v, %v", status, err)
	}
	if !db.Migrator().HasTable(&model.CanvasMutationReceipt{}) || !db.Migrator().HasTable(&model.CanvasEditLease{}) {
		t.Fatal("PostgreSQL v53 migration did not create both canvas sync tables")
	}
	if !db.Migrator().HasIndex(&model.CanvasMutationReceipt{}, "idx_canvas_mutation_receipt_identity") ||
		!db.Migrator().HasIndex(&model.CanvasEditLease{}, "idx_canvas_edit_leases_expires_at") {
		t.Fatal("PostgreSQL v53 migration did not create the receipt and lease indexes")
	}
}
