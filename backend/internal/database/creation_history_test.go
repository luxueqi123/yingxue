package database

import (
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
	"infinite-canvas/backend/internal/model"
	"path/filepath"
	"testing"
)

func TestCreationHistoryMigration(t *testing.T) {
	db, err := gorm.Open(sqlite.Open(filepath.Join(t.TempDir(), "migration.db")), &gorm.Config{})
	if err != nil {
		t.Fatal(err)
	}
	sqlDB, _ := db.DB()
	defer sqlDB.Close()
	if err = db.AutoMigrate(&schemaMigration{}); err != nil {
		t.Fatal(err)
	}
	var historyMigration migration
	for _, step := range schemaMigrations {
		if step.name == "creation_conversation_history" {
			historyMigration = step
		}
	}
	if historyMigration.apply == nil {
		t.Fatal("missing creation history migration")
	}
	for i := 0; i < 2; i++ {
		if err := historyMigration.apply(db); err != nil {
			t.Fatal(err)
		}
	}
	for _, row := range []any{&model.CreationConversation{}, &model.CreationConversationMessage{}, &model.CreationConversationResource{}} {
		if !db.Migrator().HasTable(row) {
			t.Fatal("missing creation history table")
		}
	}
}
