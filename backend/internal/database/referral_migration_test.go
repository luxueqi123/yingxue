package database

import (
	"encoding/json"
	"testing"

	"infinite-canvas/backend/internal/model"
)

func TestReferralMigration51PreservesExistingLedgerOrdersAndChecksums(t *testing.T) {
	db := mainMigrationDatabaseAt(t, 50)
	// baseline 使用当前 Models；还原推广迁移之前实际没有的新字段与表。
	if err := db.Migrator().DropTable(&model.ReferralProfile{}, &model.ReferralBinding{}, &model.ReferralCommission{}); err != nil {
		t.Fatal(err)
	}
	if err := db.Migrator().DropIndex(&model.User{}, "IsPromoter"); err != nil {
		t.Fatal(err)
	}
	if err := db.Migrator().DropColumn(&model.User{}, "IsPromoter"); err != nil {
		t.Fatal(err)
	}
	if err := db.Exec("INSERT INTO users (id, username, display_name, role, status) VALUES (?, ?, ?, ?, ?)", "old-user", "old-user", "Old User", "user", "active").Error; err != nil {
		t.Fatal(err)
	}
	ref := "legacy-entry"
	for _, row := range []any{
		&model.CreditAccount{UserID: "old-user", AvailableMicrocredits: 12345, ReservedMicrocredits: 678, Version: 9},
		&model.CreditLedgerEntry{ID: "old-entry", UserID: "old-user", Type: model.CreditLedgerRecharge, AmountMicrocredits: 12345, ReferenceKey: &ref},
		&model.PaymentOrder{ID: "old-payment", UserID: "old-user", MerchantOrderNo: "old-merchant", Status: model.PaymentOrderCredited, CreditsMicrocredits: 12345},
		&model.EPayPaymentOrder{ID: "old-epay", UserID: "old-user", Status: model.EPayPaymentOrderPaid, AmountCents: 100},
		&model.SystemSetting{Key: "unrelated-policy", ValueJSON: `{"enabled":true}`},
	} {
		if err := db.Create(row).Error; err != nil {
			t.Fatal(err)
		}
	}
	var oldMigrations []schemaMigration
	if err := db.Order("version").Find(&oldMigrations).Error; err != nil {
		t.Fatal(err)
	}
	beforeMigrations, _ := json.Marshal(oldMigrations)
	var beforeTables []json.RawMessage
	for _, table := range []string{"credit_accounts", "credit_ledger_entries", "payment_topup_orders", "payment_orders", "system_settings"} {
		var rows []map[string]any
		if err := db.Table(table).Find(&rows).Error; err != nil {
			t.Fatal(err)
		}
		encoded, err := json.Marshal(rows)
		if err != nil {
			t.Fatal(err)
		}
		beforeTables = append(beforeTables, encoded)
	}
	for range 2 {
		if err := MigrateSchema(db); err != nil {
			t.Fatal(err)
		}
	}
	var preserved []schemaMigration
	if err := db.Where("version <= ?", 50).Order("version").Find(&preserved).Error; err != nil {
		t.Fatal(err)
	}
	afterMigrations, _ := json.Marshal(preserved)
	if string(beforeMigrations) != string(afterMigrations) {
		t.Fatal("old migration rows changed")
	}
	for index, table := range []string{"credit_accounts", "credit_ledger_entries", "payment_topup_orders", "payment_orders", "system_settings"} {
		var rows []map[string]any
		if err := db.Table(table).Find(&rows).Error; err != nil {
			t.Fatal(err)
		}
		encoded, err := json.Marshal(rows)
		if err != nil {
			t.Fatal(err)
		}
		if string(encoded) != string(beforeTables[index]) {
			t.Fatalf("%s changed: %s -> %s", table, beforeTables[index], encoded)
		}
	}
	status, err := ReadSchemaStatus(db)
	if err != nil || !status.Ready || status.Current != CurrentSchemaVersion {
		t.Fatalf("schema = %#v, %v", status, err)
	}
	var user model.User
	if err := db.First(&user, "id = ?", "old-user").Error; err != nil || user.IsPromoter {
		t.Fatalf("old user promoted: %#v, %v", user, err)
	}
	for _, table := range []any{&model.ReferralProfile{}, &model.ReferralBinding{}, &model.ReferralCommission{}} {
		var count int64
		if err := db.Model(table).Count(&count).Error; err != nil || count != 0 {
			t.Fatalf("new table %T invalid: %d, %v", table, count, err)
		}
	}
}
