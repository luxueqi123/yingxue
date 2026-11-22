package main

import (
	"sync"
	"testing"
	"time"

	"gorm.io/gorm"
	"gorm.io/gorm/schema"
	"infinite-canvas/backend/internal/database"
	"infinite-canvas/backend/internal/model"
)

func TestCanvasSyncModelsAreCoveredAndCopiedBySQLitePostgresMigration(t *testing.T) {
	modelTables := make(map[string]struct{}, len(database.Models()))
	cache := &sync.Map{}
	for _, value := range database.Models() {
		parsed, err := schema.Parse(value, cache, schema.NamingStrategy{})
		if err != nil {
			t.Fatal(err)
		}
		modelTables[parsed.Table] = struct{}{}
	}

	tableMigrations := make(map[string]tableMigration, len(migrations()))
	for _, item := range migrations() {
		tableMigrations[item.name] = item
	}
	for _, name := range []string{"canvas_mutation_receipts", "canvas_edit_leases"} {
		if _, ok := modelTables[name]; !ok {
			t.Errorf("database.Models() is missing %s", name)
		}
		if _, ok := tableMigrations[name]; !ok {
			t.Errorf("SQLite to PostgreSQL migration list is missing %s", name)
		}
	}
	if t.Failed() {
		return
	}

	source, err := database.Open(database.Config{Driver: "sqlite", DSN: "file:canvas-sync-copy-source?mode=memory&cache=shared"})
	if err != nil {
		t.Fatal(err)
	}
	target, err := database.Open(database.Config{Driver: "sqlite", DSN: "file:canvas-sync-copy-target?mode=memory&cache=shared"})
	if err != nil {
		t.Fatal(err)
	}
	for _, db := range []*gorm.DB{source, target} {
		sqlDB, err := db.DB()
		if err != nil {
			t.Fatal(err)
		}
		t.Cleanup(func() { _ = sqlDB.Close() })
		if err := db.AutoMigrate(&model.CanvasMutationReceipt{}, &model.CanvasEditLease{}); err != nil {
			t.Fatal(err)
		}
	}
	now := time.Date(2026, 10, 29, 9, 30, 0, 0, time.UTC)
	if err := source.Create(&model.CanvasMutationReceipt{
		ID: "receipt-copy", UserID: "user-copy", CanvasID: "canvas-copy", MutationID: "mutation-copy",
		PayloadDigest: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
		ResultJSON:    `{"revision":2}`, Revision: 2, CreatedAt: now,
	}).Error; err != nil {
		t.Fatal(err)
	}
	if err := source.Create(&model.CanvasEditLease{
		UserID: "user-copy", CanvasID: "canvas-copy", NodeID: "node-copy",
		SessionID: "session-copy", Token: "token-copy", ExpiresAt: now.Add(time.Minute),
	}).Error; err != nil {
		t.Fatal(err)
	}
	for _, name := range []string{"canvas_mutation_receipts", "canvas_edit_leases"} {
		count, err := tableMigrations[name].run(source, target, true)
		if err != nil || count != 1 {
			t.Fatalf("copy/verify %s: count=%d err=%v", name, count, err)
		}
	}
}
