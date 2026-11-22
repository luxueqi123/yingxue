package app

import (
	"infinite-canvas/backend/internal/model"
	"testing"
)

func TestModelRequestIntentNormalizes768VideoResolution(t *testing.T) {
	for _, value := range []string{"768", "768p", "768P"} {
		input := map[string]any{
			"mode":   "video",
			"config": map[string]any{"vquality": value, "videoSeconds": "5", "size": "9:16"},
		}
		intent := ModelRequestIntentFromTaskInput(input, "video_generate", "text_to_video")
		if got := intent.Options["vquality"]; got != "768p" {
			t.Fatalf("vquality(%q) = %#v, want 768p", value, got)
		}
	}
}

func TestChannelModelPriceTierForBillingMatches768VideoResolution(t *testing.T) {
	modelWithTiers := model.ChannelModel{PriceTiers: []model.ChannelModelPriceTier{
		{ID: "768", SelectorJSON: `{"vquality":"768p"}`, Enabled: true, PriceConfigured: true, BillingMode: "per_second", UnitPriceMicrocredits: 700_000},
	}}
	input := map[string]any{
		"mode":   "video",
		"config": map[string]any{"vquality": "768", "videoSeconds": "5", "size": "9:16"},
	}
	intent := ModelRequestIntentFromTaskInput(input, "video_generate", "text_to_video")
	matched, err := (&Service{}).channelModelPriceTierForBilling(modelWithTiers, "", "video", intent)
	if err != nil {
		t.Fatal(err)
	}
	if matched == nil || matched.ID != "768" {
		t.Fatalf("matched tier = %#v, want 768p tier", matched)
	}
}

func TestChannelModelPriceTierForBillingUsesVideoResolutionIntent(t *testing.T) {
	modelWithTiers := model.ChannelModel{PriceTiers: []model.ChannelModelPriceTier{
		{ID: "480", SelectorJSON: `{"vquality":"480p"}`, Enabled: true, PriceConfigured: true, BillingMode: "per_second", UnitPriceMicrocredits: 400_000},
		{ID: "768", SelectorJSON: `{"vquality":"768p"}`, Enabled: true, PriceConfigured: true, BillingMode: "per_second", UnitPriceMicrocredits: 700_000},
		{ID: "1080", SelectorJSON: `{"vquality":"1080p"}`, Enabled: true, PriceConfigured: true, BillingMode: "per_second", UnitPriceMicrocredits: 1_200_000},
	}}
	intent := ModelRequestIntent{Capability: "video", Options: map[string]any{"vquality": "480p", "videoSeconds": "5"}}
	matched, err := (&Service{}).channelModelPriceTierForBilling(modelWithTiers, "", "video", intent)
	if err != nil {
		t.Fatal(err)
	}
	if matched == nil || matched.ID != "480" || matched.UnitPriceMicrocredits != 400_000 {
		t.Fatalf("matched tier = %#v, want 480p/400000", matched)
	}
	if matched, err := (&Service{}).channelModelPriceTierForBilling(modelWithTiers, "", "video"); err != nil || matched != nil {
		t.Fatalf("missing intent unexpectedly matched tier = %#v", matched)
	}
}
