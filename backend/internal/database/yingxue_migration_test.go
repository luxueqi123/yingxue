package database

import (
	"path/filepath"
	"reflect"
	"testing"
	"time"

	"gorm.io/gorm"
	"infinite-canvas/backend/internal/model"
)

func yingxueLegacyMigrationFixture(t *testing.T) *gorm.DB {
	t.Helper()
	db, err := Open(Config{Driver: "sqlite", DSN: filepath.Join(t.TempDir(), "migration.db")})
	if err != nil {
		t.Fatal(err)
	}
	sqlDB, err := db.DB()
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = sqlDB.Close() })
	if err := db.AutoMigrate(&schemaMigration{}, &model.PaymentProviderConfig{}, &model.CreditAccount{}, &model.CreditLedgerEntry{}); err != nil {
		t.Fatal(err)
	}
	names := []string{"baseline_gorm_schema", "schema_migrations_applied_at_index", "asset_taxonomy_candidate_identity", "payment_orders", "payment_order_qrcode_image", "resource_upload_key", "payment_topup", "asset_library_folders", "payment_method_routing", "gpt6_token_pricing"}
	checksums := []string{"sha256:open-ai-canvas-schema-v1-20260830", "sha256:schema-migrations-applied-at-index-v2-20260830", "sha256:asset-taxonomy-candidate-identity-v3-20260831-r1", "sha256:payment-orders-v4-20260902-r1", "sha256:payment-order-qrcode-image-v5-20260902-r1", "sha256:resource-upload-key-v6-20260905", "sha256:payment-topup-v7-20260905", "sha256:asset-library-folders-v8-20260905", "sha256:payment-method-routing-v9-20260905", "sha256:gpt6-token-pricing-v10-20260907"}
	for i, name := range names {
		if err := db.Create(&schemaMigration{Version: int64(i + 1), Name: name, Checksum: checksums[i], AppliedAt: time.Date(2026, 9, 7, 0, 0, 0, 0, time.UTC)}).Error; err != nil {
			t.Fatal(err)
		}
	}
	if err := db.Exec(`CREATE TABLE payment_orders (
		id text PRIMARY KEY, user_id text, idempotency_key text, plan_id text, plan_name text, amount_cents bigint, merchant_key_cipher text,
		merchant_order_no text, product_id text, product_name text, provider_id text, plugin_id text, plugin_version text,
		provider_config_id text, provider_config_version bigint, amount_fen bigint, currency text, credits_microcredits bigint,
		status text, payment_method text, payment_channel_id text, paid_at datetime, credited_at datetime, created_at datetime, updated_at datetime
	)`).Error; err != nil {
		t.Fatal(err)
	}
	if err := db.Create(&model.PaymentProviderConfig{ID: "config-1", ProviderID: "cloudcat-epay", PluginID: "yingxue-payment-cloudcat-epay", Version: 1, ConfigCipher: "encrypted-config-snapshot"}).Error; err != nil {
		t.Fatal(err)
	}
	for _, row := range []map[string]any{
		{"id": "legacy-paid", "user_id": "owner", "idempotency_key": "legacy", "plan_id": "plan-10", "amount_cents": 1000, "credits_microcredits": 100_000_000, "status": "paid", "merchant_key_cipher": "encrypted-legacy-snapshot"},
		{"id": "topup-credited", "user_id": "owner", "idempotency_key": "credited", "plan_id": "plan-10", "amount_cents": 1000, "merchant_key_cipher": "encrypted-dual-snapshot", "merchant_order_no": "trade-credited", "product_id": "product-10", "product_name": "100 credits", "provider_id": "cloudcat-epay", "plugin_id": "yingxue-payment-cloudcat-epay", "provider_config_id": "config-1", "provider_config_version": 1, "amount_fen": 1000, "currency": "CNY", "credits_microcredits": 100_000_000, "status": "credited", "payment_method": "wxpay", "payment_channel_id": "202"},
		{"id": "topup-pending", "user_id": "owner", "idempotency_key": "pending", "merchant_order_no": "trade-pending", "product_id": "product-10", "provider_id": "cloudcat-epay", "plugin_id": "yingxue-payment-cloudcat-epay", "provider_config_id": "config-1", "provider_config_version": 1, "amount_fen": 1000, "currency": "CNY", "credits_microcredits": 100_000_000, "status": "pending", "payment_method": "alipay", "payment_channel_id": "101"},
	} {
		if err := db.Table("payment_orders").Create(row).Error; err != nil {
			t.Fatal(err)
		}
	}
	if err := db.Create(&model.CreditAccount{UserID: "owner", AvailableMicrocredits: 100_000_000}).Error; err != nil {
		t.Fatal(err)
	}
	ref := "payment-topup:topup-credited"
	if err := db.Create(&model.CreditLedgerEntry{ID: "ledger-credited", UserID: "owner", PaymentOrderID: "topup-credited", ReferenceKey: &ref, Type: model.CreditLedgerPaymentTopup, AmountMicrocredits: 100_000_000}).Error; err != nil {
		t.Fatal(err)
	}
	return db
}

func TestYingxueMigrationPreservesLineageAndMixedPaymentData(t *testing.T) {
	db := yingxueLegacyMigrationFixture(t)
	var history []schemaMigration
	if err := db.Order("version").Find(&history).Error; err != nil {
		t.Fatal(err)
	}
	if err := MigrateSchema(db); err != nil {
		t.Fatal(err)
	}
	if err := MigrateSchema(db); err != nil {
		t.Fatalf("repeat migration: %v", err)
	}
	var preserved []schemaMigration
	if err := db.Order("version").Find(&preserved).Error; err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(history, preserved) {
		t.Fatal("deployed schema history was rewritten")
	}
	if !db.Migrator().HasTable("yingxue_upstream_schema_migrations") {
		t.Fatal("missing distinct upstream migration history")
	}
	var copied []model.PaymentOrder
	if err := db.Order("id").Find(&copied).Error; err != nil {
		t.Fatal(err)
	}
	if len(copied) != 2 || copied[0].ID != "topup-credited" || copied[0].Status != model.PaymentOrderCredited || copied[0].AmountFen != 1000 || copied[0].PaymentMethod != "wxpay" || copied[0].PaymentChannelID != "202" || copied[0].ProviderConfigID != "config-1" {
		t.Fatalf("payment copy did not preserve the contract: %#v", copied)
	}
	var sourceCount, ledgerCount int64
	if err := db.Table("payment_orders").Count(&sourceCount).Error; err != nil {
		t.Fatal(err)
	}
	if err := db.Model(&model.CreditLedgerEntry{}).Count(&ledgerCount).Error; err != nil {
		t.Fatal(err)
	}
	var account model.CreditAccount
	if err := db.First(&account, "user_id = ?", "owner").Error; err != nil {
		t.Fatal(err)
	}
	if sourceCount != 3 || ledgerCount != 1 || account.AvailableMicrocredits != 100_000_000 {
		t.Fatal("migration altered source orders or granted credits")
	}
	var cipher string
	if err := db.Table("payment_orders").Select("merchant_key_cipher").Where("id = ?", "topup-credited").Scan(&cipher).Error; err != nil {
		t.Fatal(err)
	}
	if cipher != "encrypted-dual-snapshot" {
		t.Fatal("historical merchant-key snapshot was lost")
	}
	if err := RequireSchemaVersion(db); err != nil {
		t.Fatal(err)
	}
}

func TestYingxueMigrationAcceptsProductionHistoryThroughV11(t *testing.T) {
	db := yingxueLegacyMigrationFixture(t)
	if err := db.AutoMigrate(&model.BillingOrder{}, &model.ApiCallLog{}); err != nil {
		t.Fatal(err)
	}
	if err := migrateYingxuePaymentIsolation(db); err != nil {
		t.Fatalf("prepare production v11 history: %v", err)
	}
	if err := db.Create(&schemaMigration{
		Version: 11, Name: yingxuePaymentIsolationName, Checksum: yingxuePaymentIsolationChecksum,
		AppliedAt: time.Date(2026, 9, 12, 0, 0, 0, 0, time.UTC),
	}).Error; err != nil {
		t.Fatal(err)
	}
	var history []schemaMigration
	if err := db.Order("version").Find(&history).Error; err != nil {
		t.Fatal(err)
	}

	if err := MigrateSchema(db); err != nil {
		t.Fatalf("production v11 history must migrate: %v", err)
	}
	var preserved []schemaMigration
	if err := db.Order("version").Find(&preserved).Error; err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(history, preserved) {
		t.Fatal("production deployed schema history was rewritten")
	}
	if !db.Migrator().HasTable("yingxue_upstream_schema_migrations") {
		t.Fatal("missing distinct upstream migration history")
	}
	if err := RequireSchemaVersion(db); err != nil {
		t.Fatal(err)
	}
}

func TestYingxueMigrationAcceptsV10HistoryWithExistingPaymentTables(t *testing.T) {
	db := yingxueLegacyMigrationFixture(t)
	if err := db.AutoMigrate(&model.BillingOrder{}, &model.ApiCallLog{}); err != nil {
		t.Fatal(err)
	}
	if err := migrateYingxuePaymentIsolation(db); err != nil {
		t.Fatalf("prepare existing payment tables: %v", err)
	}
	var before []schemaMigration
	if err := db.Order("version").Find(&before).Error; err != nil {
		t.Fatal(err)
	}
	var sourceCount, targetCount int64
	if err := db.Table("payment_orders").Count(&sourceCount).Error; err != nil {
		t.Fatal(err)
	}
	if err := db.Table("payment_topup_orders").Count(&targetCount).Error; err != nil {
		t.Fatal(err)
	}

	if err := MigrateSchema(db); err != nil {
		t.Fatalf("v10 history with already migrated payment tables must migrate: %v", err)
	}
	var after []schemaMigration
	if err := db.Order("version").Find(&after).Error; err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(before, after) {
		t.Fatal("v10 deployed schema history was rewritten")
	}
	var finalSourceCount, finalTargetCount int64
	if err := db.Table("payment_orders").Count(&finalSourceCount).Error; err != nil {
		t.Fatal(err)
	}
	if err := db.Table("payment_topup_orders").Count(&finalTargetCount).Error; err != nil {
		t.Fatal(err)
	}
	if finalSourceCount != sourceCount || finalTargetCount != targetCount {
		t.Fatalf("existing payment tables changed: source %d->%d target %d->%d", sourceCount, finalSourceCount, targetCount, finalTargetCount)
	}
	if err := RequireSchemaVersion(db); err != nil {
		t.Fatal(err)
	}
}

func TestYingxueMigrationRejectsUnknownDeployedChecksum(t *testing.T) {
	db := yingxueLegacyMigrationFixture(t)
	if err := db.Model(&schemaMigration{}).Where("version = ?", 4).Update("checksum", "unknown-checksum").Error; err != nil {
		t.Fatal(err)
	}
	if err := MigrateSchema(db); err == nil {
		t.Fatal("unknown deployed lineage was accepted")
	}
	if db.Migrator().HasTable("payment_topup_orders") {
		t.Fatal("failed migration left a new payment table")
	}
}

func TestYingxueMigrationPreservesTerminalLegacyOrdersWithoutInventingConfig(t *testing.T) {
	db := yingxueLegacyMigrationFixture(t)
	paidAt := time.Date(2026, 9, 2, 1, 0, 0, 0, time.UTC)
	if err := db.Table("payment_orders").Where("id = ?", "topup-credited").Updates(map[string]any{
		"provider_config_id": "", "provider_config_version": 0, "merchant_key_cipher": "",
		"paid_at": paidAt, "credited_at": paidAt,
	}).Error; err != nil {
		t.Fatal(err)
	}
	if err := db.Table("payment_orders").Create(map[string]any{
		"id": "legacy-closed", "user_id": "owner", "idempotency_key": "closed", "plan_id": "plan-10", "amount_cents": 1000,
		"merchant_order_no": "trade-closed", "product_id": "product-10", "provider_id": "cloudcat-epay", "plugin_id": "yingxue-payment-cloudcat-epay",
		"provider_config_id": "", "provider_config_version": 0, "amount_fen": 1000, "currency": "CNY", "credits_microcredits": 100_000_000, "status": "closed",
		"payment_method": "", "payment_channel_id": "",
	}).Error; err != nil {
		t.Fatal(err)
	}
	for i := 0; i < 2; i++ {
		if err := MigrateSchema(db); err != nil {
			t.Fatal(err)
		}
	}
	for _, id := range []string{"topup-credited", "legacy-closed"} {
		var copied model.PaymentOrder
		if err := db.First(&copied, "id = ?", id).Error; err != nil {
			t.Fatal(err)
		}
		if copied.ProviderConfigID != "" || copied.ProviderConfigVersion != 0 {
			t.Fatal("migration invented a historical config snapshot")
		}
		if id == "topup-credited" && (copied.Status != model.PaymentOrderCredited || copied.CreditedAt == nil) {
			t.Fatal("credited history changed")
		}
		if id == "legacy-closed" && copied.Status != model.PaymentOrderClosed {
			t.Fatal("closed history changed")
		}
	}
	var ledgerCount int64
	if err := db.Model(&model.CreditLedgerEntry{}).Count(&ledgerCount).Error; err != nil {
		t.Fatal(err)
	}
	var account model.CreditAccount
	if err := db.First(&account, "user_id = ?", "owner").Error; err != nil {
		t.Fatal(err)
	}
	if ledgerCount != 1 || account.AvailableMicrocredits != 100_000_000 {
		t.Fatal("historical orders were credited again")
	}
}

func TestYingxueMigrationRejectsUnexplainedMissingConfig(t *testing.T) {
	for _, status := range []string{"pending", "create_failed", "credited"} {
		t.Run(status, func(t *testing.T) {
			db := yingxueLegacyMigrationFixture(t)
			if err := db.Table("payment_orders").Where("id = ?", "topup-credited").Updates(map[string]any{
				"provider_config_id": "", "provider_config_version": 0, "status": status,
			}).Error; err != nil {
				t.Fatal(err)
			}
			if err := MigrateSchema(db); err == nil {
				t.Fatal("missing config without complete terminal evidence was accepted")
			}
			if db.Migrator().HasTable(&model.PaymentOrder{}) {
				var count int64
				if err := db.Model(&model.PaymentOrder{}).Count(&count).Error; err != nil {
					t.Fatal(err)
				}
				if count != 0 {
					t.Fatal("failed copy left partially migrated payment orders")
				}
			}
		})
	}
}
