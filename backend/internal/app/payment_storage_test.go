package app

import (
	"testing"
	"time"

	"infinite-canvas/backend/internal/model"
	"infinite-canvas/backend/internal/repository"

	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

func TestStorageProductAndLegacyPaymentViewsDeclareProductKind(t *testing.T) {
	creditProduct, err := topupProductFromRequest("credit", "admin", TopupProductRequest{
		Name: "积分充值", AmountFen: 1000, CreditsMicrocredits: 1000000,
	}, 0, 0)
	if err != nil {
		t.Fatal(err)
	}
	if creditProduct.Kind != model.TopupProductKindCredits {
		t.Fatalf("legacy product kind = %q", creditProduct.Kind)
	}
	storageProduct, err := topupProductFromRequest("storage", "admin", TopupProductRequest{
		Kind: model.TopupProductKindStorage, Name: "存储空间", AmountFen: 1000, StorageBytes: 1 << 30, StorageDurationDays: 0,
	}, 0, 0)
	if err != nil {
		t.Fatal(err)
	}
	if storageProduct.Kind != model.TopupProductKindStorage || storageProduct.CreditsMicrocredits != 0 || storageProduct.StorageBytes != 1<<30 {
		t.Fatalf("storage product = %#v", storageProduct)
	}
	if _, err := topupProductFromRequest("mixed", "admin", TopupProductRequest{
		Kind: model.TopupProductKindStorage, Name: "混合权益", AmountFen: 1000, CreditsMicrocredits: 1, StorageBytes: 1 << 30,
	}, 0, 0); err == nil {
		t.Fatal("mixed credit and storage product was accepted")
	}

	legacyView := paymentOrderView(model.PaymentOrder{ID: "legacy-order"})
	if legacyView.ProductKind != model.TopupProductKindCredits {
		t.Fatalf("legacy order view kind = %q", legacyView.ProductKind)
	}
	storageView := paymentOrderView(model.PaymentOrder{ID: "storage-order", ProductKind: model.TopupProductKindStorage, StorageBytes: 2 << 30, StorageDurationDays: 30})
	if storageView.ProductKind != model.TopupProductKindStorage || storageView.StorageBytes != 2<<30 || storageView.StorageDurationDays != 30 {
		t.Fatalf("storage order view = %#v", storageView)
	}
}

func TestStoragePaymentOrderGrantsCapacityOnceWithoutCreditLedger(t *testing.T) {
	db, err := gorm.Open(sqlite.Open("file:"+t.Name()+"?mode=memory&cache=shared"), &gorm.Config{})
	if err != nil {
		t.Fatal(err)
	}
	if err := db.AutoMigrate(&model.TopupProduct{}, &model.PaymentOrder{}, &model.UserStorageGrant{}, &model.CreditAccount{}, &model.CreditLedgerEntry{}); err != nil {
		t.Fatal(err)
	}
	now := time.Now().UTC()
	order := model.PaymentOrder{
		ID: "storage-order", UserID: "owner", IdempotencyKey: "storage-key", MerchantOrderNo: "storage-merchant",
		ProductID: "storage-product", ProductName: "1GB 存储", ProductKind: model.TopupProductKindStorage,
		StorageBytes: 1 << 30, StorageDurationDays: 30, ProviderID: "provider", AmountFen: 1000,
		Currency: "CNY", ChargeAmountFen: 1000, ChargeCurrency: "CNY", Status: model.PaymentOrderPending, ExpiresAt: now.Add(time.Hour),
	}
	if err := db.Create(&order).Error; err != nil {
		t.Fatal(err)
	}
	repo := repository.New(db)
	evidence := repository.PaymentEvidence{ProviderTradeNo: "trade-1", ProviderStatus: "SUCCESS", AmountFen: 1000, Currency: "CNY", PaidAt: now}
	completed, granted, err := repo.CompletePaymentOrder(order.ProviderID, order.MerchantOrderNo, evidence)
	if err != nil || !granted || completed.Status != model.PaymentOrderCredited {
		t.Fatalf("first completion = %#v, granted=%v, err=%v", completed, granted, err)
	}
	completed, granted, err = repo.CompletePaymentOrder(order.ProviderID, order.MerchantOrderNo, evidence)
	if err != nil || granted || completed.Status != model.PaymentOrderCredited {
		t.Fatalf("repeated completion = %#v, granted=%v, err=%v", completed, granted, err)
	}
	var grants int64
	if err := db.Model(&model.UserStorageGrant{}).Where("payment_order_id = ?", order.ID).Count(&grants).Error; err != nil {
		t.Fatal(err)
	}
	var creditEntries int64
	if err := db.Model(&model.CreditLedgerEntry{}).Count(&creditEntries).Error; err != nil {
		t.Fatal(err)
	}
	if grants != 1 || creditEntries != 0 {
		t.Fatalf("storage grant rows=%d credit ledger rows=%d", grants, creditEntries)
	}
	var grant model.UserStorageGrant
	if err := db.First(&grant, "payment_order_id = ?", order.ID).Error; err != nil {
		t.Fatal(err)
	}
	if grant.Bytes != order.StorageBytes || grant.DurationDays != order.StorageDurationDays || grant.ExpiresAt == nil || grant.ReferenceKey == nil {
		t.Fatalf("payment storage grant = %#v", grant)
	}
}
