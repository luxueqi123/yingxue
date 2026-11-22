package repository

import (
	"encoding/json"
	"errors"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
	"infinite-canvas/backend/internal/model"
	"testing"
	"time"
)

func TestGPT6LongContextPricing(t *testing.T) {
	var order model.BillingOrder
	if err := json.Unmarshal([]byte(`{"capability":"text","tokenPricingPolicy":"gpt-6-astra-2026-09-v1","inputTokenPriceMicrocredits":671090000,"outputTokenPriceMicrocredits":3355450000,"cachedTokenPriceMicrocredits":67109000,"multiplierBasisPoints":10000}`), &order); err != nil {
		t.Fatal(err)
	}
	var usage BillingUsage
	if err := json.Unmarshal([]byte(`{"InputTokens":272001,"OutputTokens":1000,"CacheWriteTokensAvailable":true}`), &usage); err != nil {
		t.Fatal(err)
	}
	amount, _, err := tokenUsageAmount(order, &usage)
	if err != nil {
		t.Fatal(err)
	}
	if amount != 370107478 {
		t.Fatalf("long-context amount = %d, want 370107478", amount)
	}
}

func TestGPT6FailedRestoreRetainsUsageEvidence(t *testing.T) {
	db, err := gorm.Open(sqlite.Open("file:gpt6-failed-restore?mode=memory&cache=shared"), &gorm.Config{})
	if err != nil {
		t.Fatal(err)
	}
	if err := db.AutoMigrate(&model.CreditAccount{}, &model.BillingOrder{}, &model.ApiCallLog{}, &model.CreditLedgerEntry{}); err != nil {
		t.Fatal(err)
	}
	order := model.BillingOrder{ID: "order", UserID: "missing", IdempotencyKey: "task", BillingMode: "token", Status: model.BillingStatusRefunded, TokenPricingPolicy: model.GPT6TokenPricingPolicy, InputTokenPriceMicrocredits: 671090000, OutputTokenPriceMicrocredits: 3355450000, CachedTokenPriceMicrocredits: 67109000, MultiplierBasisPoints: 10000}
	if err := db.Create(&order).Error; err != nil {
		t.Fatal(err)
	}
	if err := db.Create(&model.ApiCallLog{ID: "log", BillingOrderID: "order", Status: model.ApiCallStatusSucceeded, UsageAvailable: true, InputTokens: 100, OutputTokens: 5, CachedTokens: 20, CacheWriteTokens: 30, CacheWriteTokensAvailable: true}).Error; err != nil {
		t.Fatal(err)
	}
	if err := (&Repository{db: db}).RestoreRefundedBillingOrder("order", "provider"); err == nil {
		t.Fatal("expected missing account failure")
	}
	if err := db.First(&order, "id = ?", "order").Error; err != nil {
		t.Fatal(err)
	}
	if order.Status != model.BillingStatusRefunded || !order.CacheWriteTokensAvailable || order.CacheWriteTokens != 30 || order.ActualAmountMicrocredits != 76840 {
		t.Fatalf("failed restore lost evidence: %#v", order)
	}
}

func TestGPT6SettlementAndRefundRestorePreserveUsage(t *testing.T) {
	for _, restore := range []bool{false, true} {
		t.Run(map[bool]string{false: "settle", true: "restore"}[restore], func(t *testing.T) {
			db, err := gorm.Open(sqlite.Open("file:gpt6-"+t.Name()+"?mode=memory&cache=shared"), &gorm.Config{})
			if err != nil {
				t.Fatal(err)
			}
			if err := db.AutoMigrate(&model.CreditAccount{}, &model.BillingOrder{}, &model.ApiCallLog{}, &model.CreditLedgerEntry{}); err != nil {
				t.Fatal(err)
			}
			order := model.BillingOrder{ID: "order", UserID: "user", IdempotencyKey: "task", BillingMode: "token", Capability: "text", Status: model.BillingStatusRunning, AmountMicrocredits: 100000, ReservedAmountMicrocredits: 100000, TokenPricingPolicy: model.GPT6TokenPricingPolicy, InputTokenPriceMicrocredits: 671090000, OutputTokenPriceMicrocredits: 3355450000, CachedTokenPriceMicrocredits: 67109000, MultiplierBasisPoints: 10000}
			for _, value := range []any{&model.CreditAccount{UserID: "user", ReservedMicrocredits: 100000}, &order, &model.ApiCallLog{ID: "log", BillingOrderID: "order", Status: model.ApiCallStatusSucceeded, UsageAvailable: true, InputTokens: 100, OutputTokens: 5, CachedTokens: 20, CacheWriteTokens: 30, CacheWriteTokensAvailable: true}} {
				if err := db.Create(value).Error; err != nil {
					t.Fatal(err)
				}
			}
			repo := &Repository{db: db}
			if restore {
				if err := repo.RefundBillingOrder("order", "timeout"); err != nil {
					t.Fatal(err)
				}
				err = repo.RestoreRefundedBillingOrder("order", "provider")
			} else {
				err = repo.SettleBillingOrder("order", "provider")
			}
			if err != nil {
				t.Fatal(err)
			}
			if err := db.First(&order, "id = ?", "order").Error; err != nil {
				t.Fatal(err)
			}
			if order.ActualAmountMicrocredits != 76840 || order.CacheWriteTokens != 30 || !order.CacheWriteTokensAvailable || order.TokenPricingPolicy != model.GPT6TokenPricingPolicy {
				t.Fatalf("order lost pricing evidence: %#v", order)
			}
			var account model.CreditAccount
			if err := db.First(&account, "user_id = ?", "user").Error; err != nil {
				t.Fatal(err)
			}
			if account.AvailableMicrocredits != 23160 || account.ReservedMicrocredits != 0 {
				t.Fatalf("wrong funds: %#v", account)
			}
		})
	}
}

func TestGPT6PricingBoundariesAndValidation(t *testing.T) {
	order := model.BillingOrder{TokenPricingPolicy: model.GPT6TokenPricingPolicy, Capability: "text", InputTokenPriceMicrocredits: 671090000, OutputTokenPriceMicrocredits: 3355450000, CachedTokenPriceMicrocredits: 67109000, MultiplierBasisPoints: 10000}
	for _, tc := range []struct {
		name                               string
		input, output, cached, write, want int64
	}{
		{"threshold", 272000, 1000, 0, 0, 185891930},
		{"long write split", 272001, 1000, 10000, 20000, 364738758},
		{"short write split", 100, 5, 20, 30, 76840},
		{"large legal request", 1000000, 128000, 0, 0, 1986426400},
	} {
		t.Run(tc.name, func(t *testing.T) {
			amount, _, err := tokenUsageAmount(order, &BillingUsage{InputTokens: tc.input, OutputTokens: tc.output, CachedTokens: tc.cached, CacheWriteTokens: tc.write, CacheWriteTokensAvailable: true})
			if err != nil || amount != tc.want {
				t.Fatalf("amount %d error %v, want %d", amount, err, tc.want)
			}
		})
	}
	for _, usage := range []*BillingUsage{nil, {InputTokens: 100}, {InputTokens: -1, CacheWriteTokensAvailable: true}, {InputTokens: 100, CachedTokens: 101, CacheWriteTokensAvailable: true}, {InputTokens: 100, CachedTokens: 70, CacheWriteTokens: 31, CacheWriteTokensAvailable: true}, {InputTokens: 100, OutputTokens: -1, CacheWriteTokensAvailable: true}} {
		if _, _, err := tokenUsageAmount(order, usage); err == nil {
			t.Fatalf("accepted invalid usage %#v", usage)
		}
	}
	order.TokenPricingPolicy = ""
	amount, _, err := tokenUsageAmount(order, &BillingUsage{InputTokens: 100, OutputTokens: 5, CachedTokens: 20, CacheWriteTokens: 30})
	if err != nil || amount != 71807 {
		t.Fatalf("historical pricing changed: %d %v", amount, err)
	}
}

func TestGPT6BillingUsagePreservesWrites(t *testing.T) {
	db, err := gorm.Open(sqlite.Open("file:gpt6-usage?mode=memory&cache=shared"), &gorm.Config{})
	if err != nil {
		t.Fatal(err)
	}
	if err := db.AutoMigrate(&model.ApiCallLog{}); err != nil {
		t.Fatal(err)
	}
	if err := db.Create(&model.ApiCallLog{ID: "gpt6-log", BillingOrderID: "gpt6-order", Status: model.ApiCallStatusSucceeded, UsageAvailable: true, InputTokens: 100, CacheWriteTokens: 30, CacheWriteTokensAvailable: true}).Error; err != nil {
		t.Fatal(err)
	}
	usage, err := (&Repository{db: db}).BillingUsage("gpt6-order")
	if err != nil {
		t.Fatal(err)
	}
	if !usage.CacheWriteTokensAvailable || usage.CacheWriteTokens != 30 {
		t.Fatalf("lost writes: %#v", usage)
	}
}

func TestGPT6MissingWritesBlocksSettlementWithoutLosingEvidence(t *testing.T) {
	db, err := gorm.Open(sqlite.Open("file:gpt6-missing-writes?mode=memory&cache=shared"), &gorm.Config{})
	if err != nil {
		t.Fatal(err)
	}
	if err := db.AutoMigrate(&model.CreditAccount{}, &model.BillingOrder{}, &model.ApiCallLog{}, &model.CreditLedgerEntry{}); err != nil {
		t.Fatal(err)
	}
	order := model.BillingOrder{ID: "order", UserID: "user", IdempotencyKey: "task", BillingMode: "token", Status: model.BillingStatusRunning, AmountMicrocredits: 100000, ReservedAmountMicrocredits: 100000, TokenPricingPolicy: model.GPT6TokenPricingPolicy, InputTokenPriceMicrocredits: 671090000, OutputTokenPriceMicrocredits: 3355450000, CachedTokenPriceMicrocredits: 67109000, MultiplierBasisPoints: 10000}
	for _, value := range []any{&model.CreditAccount{UserID: "user", ReservedMicrocredits: 100000}, &order, &model.ApiCallLog{ID: "log", BillingOrderID: "order", Status: model.ApiCallStatusSucceeded, UsageAvailable: true, InputTokens: 100, OutputTokens: 5, CachedTokens: 20}} {
		if err := db.Create(value).Error; err != nil {
			t.Fatal(err)
		}
	}
	if err := (&Repository{db: db}).SettleBillingOrder("order", "provider"); err != ErrBillingUsageUnavailable {
		t.Fatalf("expected unavailable, got %v", err)
	}
	if err := db.First(&order, "id = ?", "order").Error; err != nil {
		t.Fatal(err)
	}
	if order.Status != model.BillingStatusRunning || !order.UsageAvailable || order.InputTokens != 100 || order.CacheWriteTokensAvailable {
		t.Fatalf("missing usage evidence %#v", order)
	}
	var account model.CreditAccount
	if err := db.First(&account, "user_id = ?", "user").Error; err != nil {
		t.Fatal(err)
	}
	if account.ReservedMicrocredits != 100000 || account.AvailableMicrocredits != 0 {
		t.Fatalf("funds changed: %#v", account)
	}
}

func TestGPT6IncompleteUsageBlocksRefundRecoveryUntilVerified(t *testing.T) {
	repo, db := newRefundedBillingRecoveryRepository(t)
	refundedAt := time.Now()
	order := model.BillingOrder{ID: "order", UserID: "user", IdempotencyKey: "task", Capability: "text", BillingMode: "token", Status: model.BillingStatusRefunded, AmountMicrocredits: 100000, ReservedAmountMicrocredits: 100000, RefundedAmountMicrocredits: 100000, RefundedAt: &refundedAt, TokenPricingPolicy: model.GPT6TokenPricingPolicy, InputTokenPriceMicrocredits: 671090000, OutputTokenPriceMicrocredits: 3355450000, CachedTokenPriceMicrocredits: 67109000, MultiplierBasisPoints: 10000}
	for _, value := range []any{
		&model.CreditAccount{UserID: "user", AvailableMicrocredits: 100000}, &order,
		&model.ApiCallLog{ID: "log", BillingOrderID: "order", Status: model.ApiCallStatusSucceeded, UsageAvailable: true, InputTokens: 100, OutputTokens: 5, CachedTokens: 20},
	} {
		if err := db.Create(value).Error; err != nil {
			t.Fatal(err)
		}
	}
	if err := repo.RestoreRefundedBillingOrder("order", "provider"); !errors.Is(err, ErrBillingUsageUnavailable) {
		t.Fatalf("incomplete recovery error = %v", err)
	}
	if err := db.First(&order, "id = ?", "order").Error; err != nil {
		t.Fatal(err)
	}
	if order.Status != model.BillingStatusRefunded || order.RefundedAt == nil || order.RefundedAmountMicrocredits != 100000 || !order.UsageAvailable || order.InputTokens != 100 || order.CacheWriteTokensAvailable || order.ActualAmountMicrocredits != 0 {
		t.Fatalf("incomplete recovery changed refund or lost usage: %#v", order)
	}
	var account model.CreditAccount
	if err := db.First(&account, "user_id = ?", "user").Error; err != nil {
		t.Fatal(err)
	}
	if account.AvailableMicrocredits != 100000 || account.ReservedMicrocredits != 0 {
		t.Fatalf("incomplete recovery changed funds: %#v", account)
	}
	if err := db.Model(&model.ApiCallLog{}).Where("id = ?", "log").Updates(map[string]any{"cache_write_tokens": 30, "cache_write_tokens_available": true}).Error; err != nil {
		t.Fatal(err)
	}
	for range 2 {
		if err := repo.RestoreRefundedBillingOrder("order", "provider"); err != nil {
			t.Fatal(err)
		}
	}
	if err := db.First(&account, "user_id = ?", "user").Error; err != nil {
		t.Fatal(err)
	}
	var consumes int64
	if err := db.Model(&model.CreditLedgerEntry{}).Where("billing_order_id = ? AND type = ?", "order", model.CreditLedgerConsume).Count(&consumes).Error; err != nil {
		t.Fatal(err)
	}
	if account.AvailableMicrocredits != 23160 || account.ReservedMicrocredits != 0 || consumes != 1 {
		t.Fatalf("verified recovery charged incorrectly: account=%#v consumes=%d", account, consumes)
	}
}
