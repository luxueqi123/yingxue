package app

import (
	"infinite-canvas/backend/internal/model"
	"testing"
)

func TestApplyChannelModelPriceTierSummaryIgnoresDisabledWildcard(t *testing.T) {
	item := &model.ChannelModel{}
	tiers := []model.ChannelModelPriceTier{
		{Resolution: "1080p", BillingMode: "per_second", UnitPriceMicrocredits: 1_200_000, Enabled: true, PriceConfigured: true},
		{Resolution: "*", BillingMode: "fixed_request", UnitPriceMicrocredits: 0, Enabled: false, PriceConfigured: false},
	}
	(&Service{}).applyChannelModelPriceTierSummary(item, tiers)
	if !item.PriceConfigured || item.BillingMode != "per_second" || item.UnitPriceMicrocredits != 1_200_000 {
		t.Fatalf("summary = %#v", item)
	}
}
