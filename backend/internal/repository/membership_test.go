package repository

import (
	"encoding/json"
	"errors"
	"fmt"
	"testing"
	"time"

	"gorm.io/gorm"
	"infinite-canvas/backend/internal/model"
)

func memberDB(t *testing.T) *gorm.DB {
	t.Helper()
	db := openPaymentTestDB(t)
	if err := db.AutoMigrate(&model.MembershipPlan{}, &model.MembershipSubscription{}, &model.MembershipCreditLot{}, &model.MembershipCreditAllocation{}, &model.BillingOrder{}, &model.AdminAuditEvent{}); err != nil {
		t.Fatal(err)
	}
	return db
}
func memberPlan() model.MembershipPlan {
	return model.MembershipPlan{ID: "plan", Name: "轻创", MonthlyAmountFen: 2900, MonthlyCreditsMicrocredits: 3480_000_000, ConcurrentTasks: 3, StorageBytes: 20 << 30}
}
func TestMembershipCalendarAnchor(t *testing.T) {
	anchor := time.Date(2024, 1, 31, 10, 12, 0, 0, time.UTC)
	for month, day := range map[int]int{1: 29, 2: 31, 3: 30, 12: 31, 13: 28} {
		got := MembershipMonthBoundary(anchor, month)
		if got.Day() != day {
			t.Fatalf("month %d: %s", month, got)
		}
	}
	if MembershipProductID("plan", 1) == MembershipProductID("plan", 12) || len(MembershipProductID("plan", 12)) > 36 {
		t.Fatal("product IDs must be distinct and fit schema")
	}
}
func TestMembershipPaymentAndCyclesIdempotent(t *testing.T) {
	db := memberDB(t)
	repo := New(db)
	plan := memberPlan()
	plan.AnnualAmountFen = 34800
	if err := repo.SaveMembershipPlan(&plan, 0, "admin"); err != nil {
		t.Fatal(err)
	}
	plans, err := repo.MembershipPlans(true)
	if err != nil || len(plans) != 1 {
		t.Fatalf("plans=%v err=%v", plans, err)
	}
	snapshot, _ := json.Marshal(plan)
	order := model.PaymentOrder{ID: "member-pay", UserID: "user", IdempotencyKey: "member-key", MerchantOrderNo: "member-no", ProductKind: model.TopupProductKindMembership, ProviderID: "test", AmountFen: 34800, ChargeAmountFen: 34800, Currency: "CNY", ChargeCurrency: "CNY", CreditsMicrocredits: plan.MonthlyCreditsMicrocredits, MembershipMonths: 12, MembershipSnapshotJSON: string(snapshot), Status: model.PaymentOrderPending}
	if err := db.Create(&order).Error; err != nil {
		t.Fatal(err)
	}
	evidence := PaymentEvidence{ProviderTradeNo: "test-trade", AmountFen: 34800, Currency: "CNY"}
	for i := 0; i < 2; i++ {
		_, granted, err := repo.CompletePaymentOrder("test", "member-no", evidence)
		if err != nil || granted != (i == 0) {
			t.Fatalf("callback %d: %t %v", i, granted, err)
		}
	}
	subs, err := repo.MembershipSubscriptions("user")
	if err != nil || len(subs) != 1 || subs[0].GrantedCycles != 1 {
		t.Fatalf("subs %v %v", subs, err)
	}
	account, err := repo.CreditAccount("user")
	if err != nil || account.AvailableMicrocredits != plan.MonthlyCreditsMicrocredits {
		t.Fatalf("annual paid must only grant first month: %v %v", account, err)
	}
	after := MembershipMonthBoundary(subs[0].StartsAt, 3).Add(time.Minute)
	for i := 0; i < 2; i++ {
		if err := repo.SyncMembership("user", after); err != nil {
			t.Fatal(err)
		}
	}
	var lots []model.MembershipCreditLot
	db.Find(&lots, "user_id = ?", "user")
	if len(lots) != 4 {
		t.Fatalf("cycle lots = %d", len(lots))
	}
	if err := db.First(account, "user_id = ?", "user").Error; err != nil {
		t.Fatal(err)
	}
	if account.AvailableMicrocredits != plan.MonthlyCreditsMicrocredits {
		t.Fatalf("missed expired cycles must not accumulate: %d", account.AvailableMicrocredits)
	}
	stale := plan
	stale.Name = "stale"
	if err := repo.SaveMembershipPlan(&stale, 0, "admin"); !errors.Is(err, ErrMembershipVersion) {
		t.Fatalf("stale update=%v", err)
	}
	plan.MonthlyCreditsMicrocredits *= 2
	if err := repo.SaveMembershipPlan(&plan, 1, "admin"); err != nil {
		t.Fatal(err)
	}
	benefits, err := repo.MembershipBenefits("user", after)
	if err != nil || benefits.MonthlyCreditsMicrocredits*2 != plan.MonthlyCreditsMicrocredits {
		t.Fatalf("purchased snapshot changed: %v %v", benefits, err)
	}
}
func seedMemberLot(t *testing.T, db *gorm.DB, expires time.Time) {
	t.Helper()
	if err := db.Create(&model.CreditAccount{UserID: "u", AvailableMicrocredits: 150, HasMembershipCredits: true}).Error; err != nil {
		t.Fatal(err)
	}
	if err := db.Create(&model.MembershipCreditLot{ID: "lot", UserID: "u", ReferenceKey: "lot", GrantedMicrocredits: 100, AvailableMicrocredits: 100, ExpiresAt: expires.UTC()}).Error; err != nil {
		t.Fatal(err)
	}
}
func TestMembershipFreezeExpiryAndOriginalReturn(t *testing.T) {
	db := memberDB(t)
	repo := New(db)
	now := time.Now().UTC()
	seedMemberLot(t, db, now.Add(time.Hour))
	order := model.BillingOrder{ID: "bill", UserID: "u", AmountMicrocredits: 120, Status: model.BillingStatusReserved}
	if err := repo.ReserveBillingOrder(&order); err != nil {
		t.Fatal(err)
	}
	var lot model.MembershipCreditLot
	db.First(&lot, "id = ?", "lot")
	if lot.ReservedMicrocredits != 100 || lot.AvailableMicrocredits != 0 {
		t.Fatalf("member funds should reserve first: %v", lot)
	}
	db.Model(&lot).Update("expires_at", now.Add(-time.Minute))
	if err := repo.SyncMembership("u", now); err != nil {
		t.Fatal(err)
	}
	if err := db.Transaction(func(tx *gorm.DB) error { return refundBillingOrder(tx, order, "failed") }); err != nil {
		t.Fatal(err)
	}
	var compensation model.MembershipCreditLot
	if err := db.First(&compensation, "refund_origin_id = ?", "lot").Error; err != nil {
		t.Fatal(err)
	}
	if compensation.AvailableMicrocredits != 100 || !compensation.ExpiresAt.After(now) {
		t.Fatalf("return=%v", compensation)
	}
	db.First(&lot, "id = ?", "lot")
	if lot.GrantedMicrocredits != lot.AvailableMicrocredits+lot.ReservedMicrocredits+lot.ConsumedMicrocredits+lot.ExpiredMicrocredits+lot.TransferredMicrocredits {
		t.Fatalf("lot does not balance: %v", lot)
	}
	deadline := compensation.ExpiresAt
	second := model.BillingOrder{ID: "bill2", IdempotencyKey: "bill2", UserID: "u", AmountMicrocredits: 50, Status: model.BillingStatusReserved}
	if err := repo.ReserveBillingOrder(&second); err != nil {
		t.Fatal(err)
	}
	db.Model(&compensation).Update("expires_at", now.Add(-time.Second))
	if err := db.Transaction(func(tx *gorm.DB) error { return refundBillingOrder(tx, second, "failed again") }); err != nil {
		t.Fatal(err)
	}
	db.First(&lot, "id = ?", "lot")
	if lot.RefundGraceUntil == nil || !lot.RefundGraceUntil.Equal(deadline) {
		t.Fatal("repeat return extended origin grace")
	}
	account, err := repo.CreditAccount("u")
	if err != nil || account.AvailableMicrocredits != 50 || account.ReservedMicrocredits != 0 {
		t.Fatalf("expired compensation should leave only permanent funds: %v %v", account, err)
	}
}
func TestMembershipExpiredFundsCannotBeSpent(t *testing.T) {
	db := memberDB(t)
	repo := New(db)
	seedMemberLot(t, db, time.Now().Add(-time.Hour))
	order := model.BillingOrder{ID: "no-credit", UserID: "u", AmountMicrocredits: 60, Status: model.BillingStatusReserved}
	if err := repo.ReserveBillingOrder(&order); !errors.Is(err, ErrInsufficientCredits) {
		t.Fatalf("expired grant funded order: %v", err)
	}
	account, err := repo.CreditAccount("u")
	if err != nil || account.AvailableMicrocredits != 50 {
		t.Fatalf("expiry account=%v err=%v", account, err)
	}
}

func TestMembershipSettlementUsesFrozenSourceAndSupplement(t *testing.T) {
	for _, actual := range []int64{70, 120, 140} {
		t.Run(fmt.Sprint(actual), func(t *testing.T) {
			db := memberDB(t)
			repo := New(db)
			now := time.Now().UTC()
			seedMemberLot(t, db, now.Add(time.Hour))
			order := model.BillingOrder{ID: "settle", UserID: "u", AmountMicrocredits: 120, ReservedAmountMicrocredits: 120, Status: model.BillingStatusReserved, BillingMode: "per_second", Capability: "audio", UnitPriceMicrocredits: 1, MultiplierBasisPoints: 10000, Quantity: 120}
			if err := repo.ReserveBillingOrder(&order); err != nil {
				t.Fatal(err)
			}
			db.Model(&model.MembershipCreditLot{}).Where("id = ?", "lot").Update("expires_at", now.Add(-time.Hour))
			if err := repo.SettleBillingOrderWithAudioDuration(order.ID, "", actual*1000); err != nil {
				t.Fatal(err)
			}
			if err := repo.SettleBillingOrderWithAudioDuration(order.ID, "", actual*1000); err != nil {
				t.Fatal("repeat settlement:", err)
			}
			account, err := repo.CreditAccount("u")
			if err != nil || account.ReservedMicrocredits != 0 || account.AvailableMicrocredits != 150-actual {
				t.Fatalf("actual %d: account=%+v err=%v", actual, account, err)
			}
			var lot model.MembershipCreditLot
			db.First(&lot, "id = ?", "lot")
			if lot.ReservedMicrocredits != 0 || lot.ConsumedMicrocredits != min(actual, int64(100)) || lot.GrantedMicrocredits != lot.ConsumedMicrocredits+lot.TransferredMicrocredits {
				t.Fatalf("frozen source mismatch: %+v", lot)
			}
		})
	}
}
