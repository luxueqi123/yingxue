package database

import (
	"reflect"
	"testing"
	"time"

	"infinite-canvas/backend/internal/model"
)

func TestYingxueThumbnailUpgradePreserves41LedgerAndResources(t *testing.T) {
	db, err := Open(Config{Driver: "sqlite", DSN: "file:yingxue-thumbnail-42?mode=memory&cache=shared"})
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
		if item.version > 41 {
			break
		}
		if err := item.apply(db); err != nil {
			t.Fatal(err)
		}
		if err := db.Create(&schemaMigration{Version: item.version, Name: item.name, Checksum: item.checksum, AppliedAt: time.Date(2026, 9, 27, 0, 0, 0, 0, time.UTC)}).Error; err != nil {
			t.Fatal(err)
		}
	}
	fields := []string{"ThumbnailStatus", "ThumbnailMimeType", "ThumbnailSize", "ThumbnailWidth", "ThumbnailHeight"}
	// Baseline AutoMigrate uses today's model; remove new columns to reproduce schema 41.
	for _, field := range fields {
		if err := db.Migrator().DropColumn(&model.Resource{}, field); err != nil {
			t.Fatal(err)
		}
	}
	if err := db.Table("resources").Create(map[string]any{"id": "thumbnail-fixture", "user_id": "owner", "object_key": "images/original.png", "status": model.ResourceStatusReady}).Error; err != nil {
		t.Fatal(err)
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
			t.Fatalf("status %#v: %v", status, err)
		}
	}
	var after []schemaMigration
	if err := db.Where("version <= ?", 41).Order("version").Find(&after).Error; err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(before, after) {
		t.Fatal("existing migration ledger changed")
	}
	for _, field := range fields {
		if !db.Migrator().HasColumn(&model.Resource{}, field) {
			t.Fatalf("missing %s", field)
		}
	}
	var resource model.Resource
	if err := db.First(&resource, "id = ?", "thumbnail-fixture").Error; err != nil {
		t.Fatal(err)
	}
	if resource.UserID != "owner" || resource.ObjectKey != "images/original.png" || resource.Status != model.ResourceStatusReady || resource.ThumbnailStatus != "" {
		t.Fatalf("resource changed: %#v", resource)
	}
}
