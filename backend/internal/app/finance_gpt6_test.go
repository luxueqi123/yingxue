package app

import (
	"encoding/json"
	"infinite-canvas/backend/internal/model"
	"testing"
	"time"
)

func TestGPT6UsageIncludesCacheWrites(t *testing.T) {
	log := &model.ApiCallLog{Capability: "text"}
	(&Service{}).EnrichAPICallLog(log, []byte(`{"usage":{"input_tokens":100,"output_tokens":5,"input_tokens_details":{"cached_tokens":20,"cache_write_tokens":30}}}`))
	data, _ := json.Marshal(log)
	var fields map[string]any
	json.Unmarshal(data, &fields)
	if fields["cacheWriteTokens"] != float64(30) || fields["cacheWriteTokensAvailable"] != true {
		t.Fatalf("missing write usage: %s", data)
	}
}

func TestGPT6UnifiedOrderSnapshotsPolicy(t *testing.T) {
	s, db := newChannelModelTestService(t)
	if err := db.Create(&model.User{ID: "user", Username: "user", Role: model.UserRoleUser, Status: model.UserStatusActive}).Error; err != nil {
		t.Fatal(err)
	}
	if err := db.AutoMigrate(&model.LogicalModel{}, &model.LogicalModelRevision{}, &model.LogicalModelRoute{}); err != nil {
		t.Fatal(err)
	}
	for _, value := range []any{
		&model.ChannelModel{ID: "cm", ChannelID: "ch", ModelKey: "alias", ProviderModelKey: "gpt-6-astra", Capability: "text", Protocol: model.ChannelInterfaceOpenAIResponse},
		&model.LogicalModel{ID: "lm", Code: "public", Enabled: true, ActiveRevisionID: "rev", PricePolicy: "unified", BillingMode: "token", InputPriceMicrocredits: 671090000, OutputPriceMicrocredits: 3355450000, CachedPriceMicrocredits: 67109000},
		&model.LogicalModelRevision{ID: "rev", LogicalModelID: "lm", Version: 1},
		&model.LogicalModelRoute{ID: "route", LogicalModelRevisionID: "rev", ChannelModelID: "cm"},
	} {
		if err := db.Create(value).Error; err != nil {
			t.Fatal(err)
		}
	}
	order, err := s.newLogicalModelBillingOrder("user", &model.Task{ID: "task", LogicalModelID: "lm", LogicalModelRevisionID: "rev", RouteID: "route", ChannelModelID: "cm", Type: "text"}, map[string]any{"mode": "text", "config": map[string]any{}})
	if err != nil {
		t.Fatal(err)
	}
	if order.TokenPricingPolicy != model.GPT6TokenPricingPolicy {
		t.Fatalf("unified policy missing: %#v", order)
	}
}

func TestGPT6UsageRejectsMalformedCounts(t *testing.T) {
	for _, raw := range []string{`null`, `-1`, `0.5`, `"0"`, `9007199254740992`} {
		log := &model.ApiCallLog{Capability: "text"}
		(&Service{}).EnrichAPICallLog(log, []byte(`{"usage":{"input_tokens":100,"output_tokens":5,"input_tokens_details":{"cached_tokens":0,"cache_write_tokens":`+raw+`}}}`))
		if log.CacheWriteTokensAvailable {
			t.Fatalf("accepted malformed writes %s", raw)
		}
	}
	for _, key := range []string{"input_tokens", "output_tokens"} {
		log := &model.ApiCallLog{Capability: "text"}
		usage := map[string]any{"input_tokens": 100, "output_tokens": 5, "input_tokens_details": map[string]any{"cached_tokens": 0, "cache_write_tokens": 0}}
		usage[key] = 1.5
		data, _ := json.Marshal(map[string]any{"usage": usage})
		(&Service{}).EnrichAPICallLog(log, data)
		if log.CacheWriteTokensAvailable {
			t.Fatalf("accepted fractional %s", key)
		}
	}
}

func TestGPT6UsageDoesNotReusePreviousCompleteness(t *testing.T) {
	log := &model.ApiCallLog{Capability: "text"}
	s := &Service{}
	s.EnrichAPICallLog(log, []byte(`{"usage":{"input_tokens":100,"output_tokens":5,"input_tokens_details":{"cached_tokens":20,"cache_write_tokens":30}}}`))
	s.EnrichAPICallLog(log, []byte(`{"usage":{"input_tokens":200,"output_tokens":10}}`))
	if log.CacheWriteTokensAvailable {
		t.Fatal("missing final cache writes inherited earlier completeness")
	}
}

func TestGPT6NewOrderSnapshotsProviderPricing(t *testing.T) {
	s, db := newChannelModelTestService(t)
	if err := db.Create(&model.User{ID: "user", Username: "user", Role: model.UserRoleUser, Status: model.UserStatusActive}).Error; err != nil {
		t.Fatal(err)
	}
	if err := db.AutoMigrate(&model.SystemSetting{}); err != nil {
		t.Fatal(err)
	}
	if err := db.Create(&model.SystemSetting{Key: creditPolicySettingKey, ValueJSON: `{"defaultMultiplierBasisPoints":5000}`}).Error; err != nil {
		t.Fatal(err)
	}
	item := model.ChannelModel{ID: "gpt6-model", ChannelID: "channel", ModelKey: "public-alias", ProviderModelKey: "other", Capability: "text", Protocol: model.ChannelInterfaceOpenAIResponse, Enabled: true}
	if err := db.Create(&item).Error; err != nil {
		t.Fatal(err)
	}
	tier := model.ChannelModelPriceTier{ID: "gpt6-tier", ChannelModelID: item.ID, ProviderModelKey: "gpt-6-astra", BillingMode: "token", Enabled: true, PriceConfigured: true, InputTokenPriceMicrocredits: 671090000, OutputTokenPriceMicrocredits: 3355450000, CachedTokenPriceMicrocredits: 67109000, PriceVersion: 7}
	if err := db.Create(&tier).Error; err != nil {
		t.Fatal(err)
	}
	order, err := s.newBillingOrderWithPriceTier("user", "task", "idempotency", "channel", "public-alias", "text", "test", 1, tokenBillingEstimate{InputTokens: 272001, OutputTokens: 1000}, tier.ID)
	if err != nil {
		t.Fatal(err)
	}
	if order.TokenPricingPolicy != model.GPT6TokenPricingPolicy || order.MultiplierBasisPoints != 10000 || order.AmountMicrocredits != 461376053 {
		t.Fatalf("wrong GPT6 snapshot: %#v", order)
	}
	if order.InputTokenPriceMicrocredits != tier.InputTokenPriceMicrocredits || order.PriceTierVersion != 7 {
		t.Fatalf("prices not snapshotted: %#v", order)
	}
	if err := db.Model(&tier).Update("provider_model_key", "gpt-6-astra-preview").Error; err != nil {
		t.Fatal(err)
	}
	other, err := s.newBillingOrderWithPriceTier("user", "task", "second", "channel", "public-alias", "text", "test", 1, tokenBillingEstimate{InputTokens: 100, OutputTokens: 5}, tier.ID)
	if err != nil {
		t.Fatal(err)
	}
	if other.TokenPricingPolicy != "" || other.MultiplierBasisPoints != 5000 {
		t.Fatalf("non-exact provider key changed pricing: %#v", other)
	}
	if order.TokenPricingPolicy != model.GPT6TokenPricingPolicy || order.InputTokenPriceMicrocredits != 671090000 {
		t.Fatal("existing snapshot changed")
	}
}

func TestGPT6EstimatePricesAllInputAsPotentialWrites(t *testing.T) {
	amount, err := tokenEstimateAmount(&model.ChannelModel{ProviderModelKey: "gpt-6-astra", InputTokenPriceMicrocredits: 671090000, OutputTokenPriceMicrocredits: 3355450000, CachedTokenPriceMicrocredits: 67109000}, tokenBillingEstimate{InputTokens: 272001, OutputTokens: 1000}, 10000)
	if err != nil {
		t.Fatal(err)
	}
	if amount != 461376053 {
		t.Fatalf("reserve = %d, want 461376053", amount)
	}
}

func TestGPT6UnifiedQuoteUsesProviderPricing(t *testing.T) {
	for _, tc := range []struct {
		provider    string
		want        int64
		inputTokens int64
	}{
		{"gpt-6-astra", 13_759_862, 19},
		{"gpt-6-astra-preview", 13_758_017, 21},
	} {
		t.Run(tc.provider, func(t *testing.T) {
			spec := CapabilitySpec{Version: 1, Capability: "text"}
			cached := cachedLogicalModel{
				Model:       model.LogicalModel{ID: "logical", PricePolicy: "unified", BillingMode: "token", Capability: "text", InputPriceMicrocredits: 671090000, OutputPriceMicrocredits: 3355450000, CachedPriceMicrocredits: 67109000},
				ProductSpec: spec,
				Routes: []cachedLogicalRoute{{
					Route: model.LogicalModelRoute{ID: "route", Enabled: true, Weight: 1}, CapabilitySpec: spec,
					ChannelModel: model.ChannelModel{ID: "channel-model", ChannelID: "channel", ModelKey: "alias", ProviderModelKey: tc.provider, Capability: "text", Protocol: model.ChannelInterfaceOpenAIResponse},
				}},
			}
			svc, db := newModelCatalogTestService(t)
			ensureTestUsers(t, db, "gpt6-quote-user")
			svc.routeCatalogTTL = time.Hour
			svc.routeCatalog = &routeCatalogSnapshot{LoadedAt: time.Now(), Models: map[string]cachedLogicalModel{"logical": cached}}
			quote, err := svc.QuoteLogicalModel("gpt6-quote-user", "logical", ModelRequestIntent{Capability: "text"})
			if err != nil {
				t.Fatal(err)
			}
			// The resolved quote includes providerModelKey in its serialized input.
			// Reserve 4096 output tokens and preserve the provider-specific input rate.
			if !quote.Estimated || quote.Quantity != tc.inputTokens+4096 || quote.AmountMicrocredits != tc.want {
				t.Fatalf("provider %s quote = %#v, want %d", tc.provider, quote, tc.want)
			}
		})
	}
}

func TestGPT6UsageSupportsChatCompletionAndPreservesZero(t *testing.T) {
	for _, tc := range []struct {
		name          string
		body          string
		cached, write int64
		complete      bool
	}{
		{"chat completion", `{"usage":{"prompt_tokens":100,"completion_tokens":5,"prompt_tokens_details":{"cached_tokens":20,"cache_write_tokens":30}}}`, 20, 30, true},
		{"authoritative zero", `{"usage":{"input_tokens":100,"output_tokens":5,"input_tokens_details":{"cached_tokens":0,"cache_write_tokens":0},"prompt_tokens_details":{"cached_tokens":20,"cache_write_tokens":30}}}`, 0, 0, true},
		{"malformed cached", `{"usage":{"input_tokens":100,"output_tokens":5,"input_tokens_details":{"cached_tokens":"0","cache_write_tokens":0}}}`, 0, 0, false},
	} {
		t.Run(tc.name, func(t *testing.T) {
			log := &model.ApiCallLog{Capability: "text"}
			(&Service{}).EnrichAPICallLog(log, []byte(tc.body))
			if log.CachedTokens != tc.cached || log.CacheWriteTokens != tc.write || log.CacheWriteTokensAvailable != tc.complete {
				t.Fatalf("usage = %#v", log)
			}
		})
	}
}
