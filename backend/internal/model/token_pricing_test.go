package model

import (
	"math"
	"testing"
)

func TestPolicyTokenAmountRoundsOnce(t *testing.T) {
	order := BillingOrder{TokenPricingPolicy: GPT6TokenPricingPolicy, InputTokenPriceMicrocredits: 1, OutputTokenPriceMicrocredits: 1, CachedTokenPriceMicrocredits: 1, MultiplierBasisPoints: 10000}
	amount, err := PolicyTokenAmount(order, 3, 1, 1, 1)
	if err != nil || amount != 1 {
		t.Fatalf("combined fractional charges = %d, error = %v, want one microcredit", amount, err)
	}
}

func TestPolicyTokenAmountRejectsUnknownPolicyAndOverflow(t *testing.T) {
	order := BillingOrder{TokenPricingPolicy: "unknown", InputTokenPriceMicrocredits: 1, MultiplierBasisPoints: 10000}
	if _, err := PolicyTokenAmount(order, 1, 0, 0, 0); err == nil {
		t.Fatal("unknown policy was accepted")
	}
	order.TokenPricingPolicy = GPT6TokenPricingPolicy
	order.InputTokenPriceMicrocredits = math.MaxInt64
	if _, err := PolicyTokenAmount(order, math.MaxInt64, 0, 0, 0); err == nil {
		t.Fatal("overflowing amount was accepted")
	}
}
