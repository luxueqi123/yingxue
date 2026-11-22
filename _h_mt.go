package main

import (
	"path/filepath"
	"sync"
	"testing"

	"infinite-canvas/backend/internal/database"

	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
	"gorm.io/gorm/schema"
)

func TestMigrationListCoversSchemaModels(t *testing.T) {
	want := make(map[string]bool, len(database.Models()))
	cache := &sync.Map{}
	for _, value := range database.Models() {
		parsed, err := schema.Parse(value, cache, schema.NamingStrategy{})
		if err != nil {
			t.Fatal(err)
		}
		want[parsed.Table] = false
	}
	for _, migration := range migrations() {
		if _, exists := want[migration.name]; !exists {
			t.Fatalf("migration list contains unknown table %q", migration.name)
		}
		if want[migration.name] {
			t.Fatalf("migration list contains duplicate table %q", migration.name)
		}
		want[migration.name] = true
	}
	for table, covered := range want {
		if !covered {
			t.Errorf("migration list is missing table %q", table)
		}
	}
}

func TestPaymentExportCoverageRejectsMixedPaymentHistoryWithoutWrites(t *testing.T) {
	db, err := gorm.Open(sqlite.Open(filepath.Join(t.TempDir(), "source.db")), &gorm.Config{})
	if err != nil {
		t.Fatal(err)
	}
	sqlDB, err := db.DB()
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = sqlDB.Close() })
	if err := db.Exec("CREATE TABLE payment_orders (id text PRIMARY KEY, product_id text)").Error; err != nil {
		t.Fatal(err)
	}
	if err := verifyPaymentExportCoverage(db); err != nil {
		t.Fatal(err)
	}
	if err := db.Exec("INSERT INTO payment_orders (id, product_id) VALUES ('history', 'product')").Error; err != nil {
		t.Fatal(err)
	}
	if err := verifyPaymentExportCoverage(db); err == nil {
		t.Fatal("mixed payment history would silently lose source fields")
	}
	var count int64
	if err := db.Table("payment_orders").Count(&count).Error; err != nil {
		t.Fatal(err)
	}
	if count != 1 || db.Migrator().HasTable("payment_topup_orders") {
		t.Fatal("export preflight changed the source")
	}
}
