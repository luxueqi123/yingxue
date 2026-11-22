package database

import (
	"os"
	"path/filepath"
	"reflect"
	"testing"
	"time"

	"infinite-canvas/backend/internal/model"
)

func TestYingxueUpgrade36ToLatestPreservesLedger(t *testing.T) {
	testYingxueUpgradePreservesLedger(t, 36)
}

func TestYingxueUpgrade42ToLatestPreservesLedger(t *testing.T) {
	testYingxueUpgradePreservesLedger(t, 42)
}

func testYingxueUpgradePreservesLedger(t *testing.T, boundary int64) {
	t.Helper()
	dir := t.TempDir()
	db, err := Open(Config{Driver: "sqlite", DataDir: dir})
	if err != nil {
		t.Fatal(err)
	}
	sqlDB, err := db.DB()
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = sqlDB.Close() })
	if err := db.AutoMigrate(&schemaMigration{}); err != nil {
		t.Fatal(err)
	}
	for _, item := range schemaMigrations {
		if item.version > boundary {
			break
		}
		if err := item.apply(db); err != nil {
			t.Fatal(err)
		}
		if err := db.Create(&schemaMigration{Version: item.version, Name: item.name, Checksum: item.checksum, AppliedAt: time.Date(2026, 9, 22, 0, 0, 0, 0, time.UTC)}).Error; err != nil {
			t.Fatal(err)
		}
	}
	// The initial migration uses current models; restore the deployed boundary.
	newTables := []string{"cloud_agent_pi_sessions"}
	if boundary == 36 {
		newTables = append(newTables, "cloud_agent_gemini_caches", "skill_library_categories", "builtin_skill_tombstones")
	}
	for _, table := range newTables {
		if err := db.Migrator().DropTable(table); err != nil {
			t.Fatal(err)
		}
	}
	if boundary == 36 && db.Migrator().HasColumn(&model.UserSkillState{}, "library_category_id") {
		if err := db.Migrator().DropColumn(&model.UserSkillState{}, "library_category_id"); err != nil {
			t.Fatal(err)
		}
	}
	thumbnailColumns := []string{"ThumbnailStatus", "ThumbnailMimeType", "ThumbnailSize", "ThumbnailWidth", "ThumbnailHeight"}
	for _, column := range thumbnailColumns {
		if boundary == 36 {
			if err := db.Migrator().DropColumn(&model.Resource{}, column); err != nil {
				t.Fatal(err)
			}
		}
	}
	strategyColumns := []string{"SaleStrategy", "PeriodDays", "PeriodPurchaseLimit", "StockTotal", "StockRemaining", "SaleStartAt", "SaleEndAt"}
	for _, column := range strategyColumns {
		if err := db.Migrator().DropColumn(&model.TopupProduct{}, column); err != nil {
			t.Fatal(err)
		}
	}
	if err := db.Migrator().DropColumn(&model.PaymentOrder{}, "StockReserved"); err != nil {
		t.Fatal(err)
	}
	user := model.User{ID: "upgrade-fixture-user", Username: "upgrade-fixture", DisplayName: "Migration Fixture"}
	if err := db.Create(&user).Error; err != nil {
		t.Fatal(err)
	}
	// Compare database round-trips, not Go's pre-insert time location metadata.
	if err := db.First(&user, "id = ?", user.ID).Error; err != nil {
		t.Fatal(err)
	}
	backup := filepath.Join(dir, "before-upgrade.db")
	if err := db.Exec("VACUUM INTO ?", backup).Error; err != nil {
		t.Fatal(err)
	}
	backupBytes, err := os.ReadFile(backup)
	if err != nil || len(backupBytes) == 0 {
		t.Fatalf("backup is empty or unreadable: %v", err)
	}
	var before []schemaMigration
	if err := db.Order("version").Find(&before).Error; err != nil {
		t.Fatal(err)
	}
	for range 2 {
		if err := MigrateSchema(db); err != nil {
			t.Fatal(err)
		}
		status, err := ReadSchemaStatus(db)
		if err != nil || !status.Ready || status.Current != CurrentSchemaVersion {
			t.Fatalf("upgrade status: %#v, %v", status, err)
		}
	}
	var after []schemaMigration
	if err := db.Where("version <= ?", boundary).Order("version").Find(&after).Error; err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(before, after) {
		t.Fatal("deployed migration ledger changed")
	}
	for _, table := range newTables {
		if !db.Migrator().HasTable(table) {
			t.Fatalf("missing upgraded table %s", table)
		}
	}
	for _, column := range strategyColumns {
		if !db.Migrator().HasColumn(&model.TopupProduct{}, column) {
			t.Fatalf("missing sale strategy column %s", column)
		}
	}
	if !db.Migrator().HasColumn(&model.PaymentOrder{}, "StockReserved") {
		t.Fatal("missing stock reservation column")
	}
	if !db.Migrator().HasColumn(&model.UserSkillState{}, "library_category_id") {
		t.Fatal("missing library category column")
	}
	for _, column := range thumbnailColumns {
		if !db.Migrator().HasColumn(&model.Resource{}, column) {
			t.Fatalf("missing upgraded resource column %s", column)
		}
	}
	var preserved model.User
	if err := db.First(&preserved, "id = ?", user.ID).Error; err != nil || !reflect.DeepEqual(user, preserved) {
		t.Fatalf("user changed during migration: %v", err)
	}
	// Restore to another directory, never over the active database or its WAL.
	restoredDir := t.TempDir()
	if err := os.WriteFile(filepath.Join(restoredDir, "open_ai_canvas.db"), backupBytes, 0600); err != nil {
		t.Fatal(err)
	}
	restored, err := Open(Config{Driver: "sqlite", DataDir: restoredDir})
	if err != nil {
		t.Fatal(err)
	}
	restoredSQL, err := restored.DB()
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = restoredSQL.Close() })
	status, err := ReadSchemaStatus(restored)
	if err != nil || status.Current != boundary || status.Ready {
		t.Fatalf("restored schema boundary: %#v, %v", status, err)
	}
	var restoredLedger []schemaMigration
	if err := restored.Order("version").Find(&restoredLedger).Error; err != nil || !reflect.DeepEqual(before, restoredLedger) {
		t.Fatalf("restored ledger differs: %v", err)
	}
	var restoredUser model.User
	if err := restored.First(&restoredUser, "id = ?", user.ID).Error; err != nil || !reflect.DeepEqual(user, restoredUser) {
		t.Fatalf("restored user differs: %v", err)
	}
	if boundary == 36 && restored.Migrator().HasColumn(&model.Resource{}, "ThumbnailStatus") {
		t.Fatal("restored backup unexpectedly contains upgraded fields")
	}
	if restored.Migrator().HasTable(&model.CloudAgentPiSession{}) || restored.Migrator().HasColumn(&model.PaymentOrder{}, "StockReserved") {
		t.Fatal("restored backup unexpectedly contains Pi or stock fields")
	}
	if err := MigrateSchema(restored); err != nil {
		t.Fatalf("restored database cannot be upgraded again: %v", err)
	}
}
