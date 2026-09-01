package service

import (
	"encoding/json"
	"errors"
	"fmt"
	"net/url"
	"os"
	"strings"
	"time"

	"infinite-canvas/backend/internal/model"

	"gorm.io/gorm"
)

const creditPolicySettingKey = "credit_policy"

type CreditPolicy struct {
	SignupBonusMicrocredits  int64            `json:"signupBonusMicrocredits"`
	CheckinBonusMicrocredits int64            `json:"checkinBonusMicrocredits"`
	DefaultMultiplierBPS     int64            `json:"defaultMultiplierBasisPoints"`
	ModelMultiplierBPS       map[string]int64 `json:"modelMultiplierBasisPoints"`
}

type PublicCreditPolicy struct {
	SignupBonusMicrocredits  int64                `json:"signupBonusMicrocredits"`
	CheckinBonusMicrocredits int64                `json:"checkinBonusMicrocredits"`
	CheckedInToday           bool                 `json:"checkedInToday"`
	CreditPerYuan            int64                `json:"creditPerYuan"`
	RechargeStoreURL         string               `json:"rechargeStoreUrl"`
	RechargePlans            []PublicRechargePlan `json:"rechargePlans"`
	PricingNotice            PublicPricingNotice  `json:"pricingNotice"`
}

// PublicRechargePlan 是积分中心展示和云猫卡密商品的稳定对照表。
// 金额使用分，积分使用微积分，避免前后端浮点换算误差。
type PublicRechargePlan struct {
	ID                  string `json:"id"`
	PriceCents          int64  `json:"priceCents"`
	CreditsMicrocredits int64  `json:"creditsMicrocredits"`
	BonusPercent        int64  `json:"bonusPercent"`
	ProductURL          string `json:"productUrl,omitempty"`
}

type PublicPricingRate struct {
	Channel                      string `json:"channel"`
	Resolution                   string `json:"resolution"`
	PriceCentsPerSecond          int64  `json:"priceCentsPerSecond"`
	CreditsMicrocreditsPerSecond int64  `json:"creditsMicrocreditsPerSecond"`
}

type PublicPricingNotice struct {
	Rates []PublicPricingRate `json:"rates"`
}

const publicCreditPerYuan int64 = 10

var publicRechargePlans = []PublicRechargePlan{
	{ID: "yingxue-10", PriceCents: 1_000, CreditsMicrocredits: 105 * CreditScale, BonusPercent: 5},
	{ID: "yingxue-50", PriceCents: 5_000, CreditsMicrocredits: 550 * CreditScale, BonusPercent: 10},
	{ID: "yingxue-100", PriceCents: 10_000, CreditsMicrocredits: 1_150 * CreditScale, BonusPercent: 15},
	{ID: "yingxue-300", PriceCents: 30_000, CreditsMicrocredits: 3_600 * CreditScale, BonusPercent: 20},
	{ID: "yingxue-1000", PriceCents: 100_000, CreditsMicrocredits: 12_000 * CreditScale, BonusPercent: 20},
}

var publicPricingNotice = PublicPricingNotice{Rates: []PublicPricingRate{
	{Channel: "AutoDL ComfyUI H3", Resolution: "480p", PriceCentsPerSecond: 4, CreditsMicrocreditsPerSecond: 400_000},
	{Channel: "AutoDL ComfyUI H3", Resolution: "768p", PriceCentsPerSecond: 7, CreditsMicrocreditsPerSecond: 700_000},
	{Channel: "AutoDL ComfyUI H3", Resolution: "1080p", PriceCentsPerSecond: 12, CreditsMicrocreditsPerSecond: 1_200_000},
	{Channel: "秘塔 H3（MiniMax-H3）", Resolution: "768P", PriceCentsPerSecond: 15, CreditsMicrocreditsPerSecond: 1_500_000},
	{Channel: "秘塔 H3（MiniMax-H3）", Resolution: "2K", PriceCentsPerSecond: 25, CreditsMicrocreditsPerSecond: 2_500_000},
}}

func defaultCreditPolicy() CreditPolicy {
	return CreditPolicy{SignupBonusMicrocredits: 100 * CreditScale, CheckinBonusMicrocredits: 10 * CreditScale, DefaultMultiplierBPS: 10_000, ModelMultiplierBPS: map[string]int64{}}
}

func validateCreditPolicy(policy CreditPolicy) error {
	if policy.SignupBonusMicrocredits < 0 || policy.CheckinBonusMicrocredits < 0 {
		return BadAuthRequest("注册和签到奖励不能小于 0")
	}
	if policy.SignupBonusMicrocredits > 1_000_000*CreditScale || policy.CheckinBonusMicrocredits > 100_000*CreditScale {
		return BadAuthRequest("积分奖励超出允许范围")
	}
	if policy.DefaultMultiplierBPS <= 0 || policy.DefaultMultiplierBPS > 1_000_000 {
		return BadAuthRequest("默认模型倍率必须在 0.0001-100 之间")
	}
	for modelKey, multiplier := range policy.ModelMultiplierBPS {
		if strings.TrimSpace(modelKey) == "" || multiplier <= 0 || multiplier > 1_000_000 {
			return BadAuthRequest("模型倍率配置无效")
		}
	}
	return nil
}

func (s *Service) creditPolicy() (CreditPolicy, error) {
	setting, err := s.repo.SystemSetting(creditPolicySettingKey)
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return defaultCreditPolicy(), nil
	}
	if err != nil {
		return CreditPolicy{}, err
	}
	var policy CreditPolicy
	if json.Unmarshal([]byte(setting.ValueJSON), &policy) != nil {
		return CreditPolicy{}, errors.New("积分策略配置格式无效")
	}
	if policy.ModelMultiplierBPS == nil {
		policy.ModelMultiplierBPS = map[string]int64{}
	}
	if err := validateCreditPolicy(policy); err != nil {
		return CreditPolicy{}, err
	}
	return policy, nil
}

func (s *Service) AdminCreditPolicy(actor *model.User) (CreditPolicy, error) {
	if err := s.RequireAdmin(actor); err != nil {
		return CreditPolicy{}, err
	}
	return s.creditPolicy()
}

func (s *Service) UpdateCreditPolicy(actor *model.User, policy CreditPolicy) (CreditPolicy, error) {
	if err := s.RequireAdmin(actor); err != nil {
		return CreditPolicy{}, err
	}
	if policy.ModelMultiplierBPS == nil {
		policy.ModelMultiplierBPS = map[string]int64{}
	}
	if err := validateCreditPolicy(policy); err != nil {
		return CreditPolicy{}, err
	}
	encoded, err := json.Marshal(policy)
	if err != nil {
		return CreditPolicy{}, err
	}
	setting := model.SystemSetting{Key: creditPolicySettingKey, ValueJSON: string(encoded), UpdatedBy: actor.ID}
	current, err := s.repo.SystemSetting(creditPolicySettingKey)
	if err == nil {
		setting.CreatedAt = current.CreatedAt
	} else if !errors.Is(err, gorm.ErrRecordNotFound) {
		return CreditPolicy{}, err
	}
	if err := s.repo.SaveSystemSetting(&setting); err != nil {
		return CreditPolicy{}, err
	}
	if err := s.appendAdminAudit(actor, "credit_policy.update", "system_setting", creditPolicySettingKey, "更新积分策略", policy); err != nil {
		return CreditPolicy{}, err
	}
	return policy, nil
}

func (s *Service) ensureSignupBonus(userID string) error {
	enabled, err := s.FeatureEnabled(FeatureCredits)
	if err != nil || !enabled {
		return err
	}
	policy, err := s.creditPolicy()
	if err != nil || policy.SignupBonusMicrocredits == 0 {
		return err
	}
	_, _, err = s.repo.GrantCreditsOnce(userID, model.CreditLedgerSignupBonus, policy.SignupBonusMicrocredits, "signup:"+userID, "新用户默认积分")
	return err
}

func (s *Service) CheckinCredits(user *model.User) (*model.CreditAccount, bool, error) {
	if user == nil {
		return nil, false, Unauthorized("请先登录")
	}
	if err := s.RequireFeature(FeatureCredits); err != nil {
		return nil, false, err
	}
	policy, err := s.creditPolicy()
	if err != nil {
		return nil, false, err
	}
	if policy.CheckinBonusMicrocredits == 0 {
		return nil, false, BadAuthRequest("当前未开启签到奖励")
	}
	day := time.Now().UTC().Format("2006-01-02")
	return s.repo.GrantCreditsOnce(user.ID, model.CreditLedgerCheckinBonus, policy.CheckinBonusMicrocredits, "checkin:"+user.ID+":"+day, "每日签到奖励")
}

func (s *Service) publicCreditPolicy(userID string) (PublicCreditPolicy, error) {
	policy, err := s.creditPolicy()
	if err != nil {
		return PublicCreditPolicy{}, err
	}
	reference := "checkin:" + userID + ":" + time.Now().UTC().Format("2006-01-02")
	checked, err := s.repo.CreditLedgerReferenceExists(reference)
	return PublicCreditPolicy{
		SignupBonusMicrocredits:  policy.SignupBonusMicrocredits,
		CheckinBonusMicrocredits: policy.CheckinBonusMicrocredits,
		CheckedInToday:           checked,
		CreditPerYuan:            publicCreditPerYuan,
		RechargeStoreURL:         publicRechargeStoreURL(),
		RechargePlans:            clonePublicRechargePlans(),
		PricingNotice:            publicPricingNotice,
	}, err
}

func publicRechargeStoreURL() string {
	raw := strings.TrimSpace(os.Getenv("CANVAS_RECHARGE_URL"))
	if raw == "" {
		return ""
	}
	parsed, err := url.Parse(raw)
	if err != nil || parsed.Scheme != "https" || parsed.Host == "" || parsed.User != nil {
		return ""
	}
	return parsed.String()
}

func clonePublicRechargePlans() []PublicRechargePlan {
	plans := make([]PublicRechargePlan, len(publicRechargePlans))
	copy(plans, publicRechargePlans)
	return plans
}

// 单价、数量和倍率全程使用整数并向上取整，避免浮点误差造成少扣积分。
func creditAmount(unitPrice int64, quantity int64, multiplierBPS int64) (int64, error) {
	if unitPrice < 0 || quantity <= 0 || multiplierBPS <= 0 {
		return 0, errors.New("积分计费参数无效")
	}
	if unitPrice > (1<<63-1)/quantity {
		return 0, errors.New("积分计费金额溢出")
	}
	base := unitPrice * quantity
	if base > ((1<<63-1)-9_999)/multiplierBPS {
		return 0, errors.New("积分计费金额溢出")
	}
	amount := (base*multiplierBPS + 9_999) / 10_000
	if amount < 0 {
		return 0, fmt.Errorf("积分计费金额无效：%d", amount)
	}
	return amount, nil
}
