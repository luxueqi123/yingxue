package database

import (
	"testing"
	"time"

	"infinite-canvas/backend/internal/model"
)

func TestMigrateStorageCapacityV52PreservesCreditAndReferralHistory(t *testing.T) {
	db, err := Open(Config{Driver: "sqlite", DSN: "file:" + t.Name() + "?mode=memory&cache=shared"})
	if err != nil {
		t.Fatal(err)
	}
	sqlDB, err := db.DB()
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = sqlDB.Close() })
	if err := MigrateSchema(db); err != nil {
		t.Fatal(err)
	}

	product := model.TopupProduct{ID: "legacy-product", Name: "积分档", AmountFen: 1234, CreditsMicrocredits: 5678000, Enabled: true}
	order := model.PaymentOrder{
		ID: "legacy-order", UserID: "legacy-user", IdempotencyKey: "legacy-key", MerchantOrderNo: "legacy-merchant",
		ProductID: product.ID, ProductName: product.Name, AmountFen: product.AmountFen, CreditsMicrocredits: product.CreditsMicrocredits,
		ProviderID: "legacy-provider", Currency: "CNY", Status: model.PaymentOrderPending, ExpiresAt: time.Now().Add(time.Hour),
	}
	commission := model.ReferralCommission{
		ID: "legacy-commission", InviterUserID: "inviter", InviteeUserID: order.UserID, PaymentOrderID: order.ID,
		OrderAmountFen: 1234, OrderCreditsMicrocredits: 5678000, RateBasisPoints: 2500, CommissionMicrocredits: 1419500,
	}
	for _, row := range []any{&product, &order, &commission} {
		if err := db.Create(row).Error; err != nil {
			t.Fatal(err)
		}
	}
	var v51Before schemaMigration
	if err := db.First(&v51Before, "version = ?", 51).Error; err != nil {
		t.Fatal(err)
	}

	if err := db.Migrator().DropIndex(&model.TopupProduct{}, "idx_topup_products_kind"); err != nil {
		t.Fatal(err)
	}
	for _, field := range []struct {
		model any
		name  string
	}{
		{&model.TopupProduct{}, "Kind"}, {&model.TopupProduct{}, "StorageBytes"}, {&model.TopupProduct{}, "StorageDurationDays"},
		{&model.PaymentOrder{}, "ProductKind"}, {&model.PaymentOrder{}, "StorageBytes"}, {&model.PaymentOrder{}, "StorageDurationDays"},
	} {
		if err := db.Migrator().DropColumn(field.model, field.name); err != nil {
			t.Fatalf("drop v52 field %s: %v", field.name, err)
		}
	}
	if err := db.Migrator().DropTable(&model.UserStorageGrant{}, &model.UserStorageState{}); err != nil {
		t.Fatal(err)
	}
	if err := db.Where("version = ?", 52).Delete(&schemaMigration{}).Error; err != nil {
		t.Fatal(err)
	}

	for attempt := 0; attempt < 2; attempt++ {
		if err := MigrateSchema(db); err != nil {
			t.Fatalf("upgrade v51 database: %v", err)
		}
	}
	for _, value := range []any{&model.UserStorageGrant{}, &model.UserStorageState{}} {
		if !db.Migrator().HasTable(value) {
			t.Errorf("v52 table missing: %T", value)
		}
	}
	for _, field := range []struct {
		model any
		name  string
	}{
		{&model.TopupProduct{}, "Kind"}, {&model.TopupProduct{}, "StorageBytes"}, {&model.TopupProduct{}, "StorageDurationDays"},
		{&model.PaymentOrder{}, "ProductKind"}, {&model.PaymentOrder{}, "StorageBytes"}, {&model.PaymentOrder{}, "StorageDurationDays"},
	} {
		if !db.Migrator().HasColumn(field.model, field.name) {
			t.Errorf("v52 column missing: %T.%s", field.model, field.name)
		}
	}
	var storedProduct model.TopupProduct
	if err := db.First(&storedProduct, "id = ?", product.ID).Error; err != nil {
		t.Fatal(err)
	}
	if storedProduct.Kind != model.TopupProductKindCredits || storedProduct.AmountFen != product.AmountFen || storedProduct.CreditsMicrocredits != product.CreditsMicrocredits {
		t.Fatalf("legacy product changed: %#v", storedProduct)
	}
	var storedOrder model.PaymentOrder
	if err := db.First(&storedOrder, "id = ?", order.ID).Error; err != nil {
		t.Fatal(err)
	}
	if storedOrder.ProductKind != model.TopupProductKindCredits || storedOrder.AmountFen != order.AmountFen || storedOrder.CreditsMicrocredits != order.CreditsMicrocredits || storedOrder.Status != order.Status {
		t.Fatalf("legacy order changed: %#v", storedOrder)
	}
	var storedCommission model.ReferralCommission
	if err := db.First(&storedCommission, "id = ?", commission.ID).Error; err != nil {
		t.Fatal(err)
	}
	if storedCommission.CommissionMicrocredits != commission.CommissionMicrocredits || storedCommission.OrderAmountFen != commission.OrderAmountFen || storedCommission.OrderCreditsMicrocredits != commission.OrderCreditsMicrocredits {
		t.Fatalf("legacy referral commission changed: %#v", storedCommission)
	}
	var v51After schemaMigration
	if err := db.First(&v51After, "version = ?", 51).Error; err != nil {
		t.Fatal(err)
	}
	if v51After.Name != v51Before.Name || v51After.Checksum != v51Before.Checksum || !v51After.AppliedAt.Equal(v51Before.AppliedAt) {
		t.Fatalf("v51 lineage changed: before=%+v after=%+v", v51Before, v51After)
	}
}
