package service

import "testing"

func TestPublicRechargePlansMatchPublishedTiers(t *testing.T) {
	if len(publicRechargePlans) != 5 {
		t.Fatalf("public recharge plan count = %d, want 5", len(publicRechargePlans))
	}
	want := []struct {
		priceCents int64
		credits    int64
		bonus      int64
	}{
		{1_000, 105, 5},
		{5_000, 550, 10},
		{10_000, 1_150, 15},
		{30_000, 3_600, 20},
		{100_000, 12_000, 20},
	}
	for index, item := range publicRechargePlans {
		if item.PriceCents != want[index].priceCents || item.CreditsMicrocredits != want[index].credits*CreditScale || item.BonusPercent != want[index].bonus {
			t.Fatalf("plan %d = %#v, want price=%d credits=%d bonus=%d", index, item, want[index].priceCents, want[index].credits*CreditScale, want[index].bonus)
		}
	}
}

func TestPublicPricingNoticeMatchesCreditExchangeRate(t *testing.T) {
	if len(publicPricingNotice.Rates) != 5 {
		t.Fatalf("public pricing rate count = %d, want 5", len(publicPricingNotice.Rates))
	}
	for _, rate := range publicPricingNotice.Rates {
		want := rate.PriceCentsPerSecond * publicCreditPerYuan * CreditScale / 100
		if rate.CreditsMicrocreditsPerSecond != want {
			t.Fatalf("%s %s credits/sec = %d, want %d from %d cents/sec at %d credits/yuan", rate.Channel, rate.Resolution, rate.CreditsMicrocreditsPerSecond, want, rate.PriceCentsPerSecond, publicCreditPerYuan)
		}
	}
}
