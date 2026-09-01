package service

import (
	"context"
	"crypto/md5"
	"crypto/subtle"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"math"
	"net/http"
	"net/url"
	"sort"
	"strconv"
	"strings"
	"time"

	"infinite-canvas/backend/internal/model"

	"gorm.io/gorm"
)

const paymentSettingKey = "payment"
const defaultEPayBaseURL = "https://m.ooeao.com"
const defaultEPayAPIPath = "/xpay/epay/mapi.php"

type PaymentSettingRequest struct {
	Enabled     bool     `json:"enabled"`
	BaseURL     string   `json:"baseUrl"`
	APIPath     string   `json:"apiPath"`
	MerchantID  string   `json:"merchantId"`
	MerchantKey string   `json:"merchantKey"`
	SiteURL     string   `json:"siteUrl"`
	PayTypes    []string `json:"payTypes"`
}

type PublicPaymentSetting struct {
	Enabled        bool      `json:"enabled"`
	BaseURL        string    `json:"baseUrl"`
	APIPath        string    `json:"apiPath"`
	MerchantID     string    `json:"merchantId"`
	HasMerchantKey bool      `json:"hasMerchantKey"`
	SiteURL        string    `json:"siteUrl"`
	PayTypes       []string  `json:"payTypes"`
	UpdatedBy      string    `json:"updatedBy,omitempty"`
	CreatedAt      time.Time `json:"createdAt,omitempty"`
	UpdatedAt      time.Time `json:"updatedAt,omitempty"`
}

type PublicPaymentConfig struct {
	Enabled  bool     `json:"enabled"`
	PayTypes []string `json:"payTypes"`
}

type paymentSettingValue struct {
	Enabled     bool     `json:"enabled"`
	BaseURL     string   `json:"baseUrl"`
	APIPath     string   `json:"apiPath"`
	MerchantID  string   `json:"merchantId"`
	MerchantKey string   `json:"merchantKey"`
	SiteURL     string   `json:"siteUrl"`
	PayTypes    []string `json:"payTypes"`
}

type CreatePaymentOrderRequest struct {
	PlanID         string `json:"planId"`
	PayType        string `json:"payType"`
	IdempotencyKey string `json:"-"`
}

type PaymentCheckoutResult struct {
	Order *model.PaymentOrder `json:"order"`
}

type ePayCreateResponse struct {
	Code      int    `json:"code"`
	Message   string `json:"msg"`
	TradeNo   string `json:"trade_no"`
	PayURL    string `json:"payurl"`
	QRCode    string `json:"qrcode"`
	ImageURL  string `json:"img"`
	URLScheme string `json:"urlscheme"`
}

func (s *Service) AdminPaymentSetting(actor *model.User) (*PublicPaymentSetting, error) {
	if err := s.RequireAdmin(actor); err != nil {
		return nil, err
	}
	setting, value, err := s.readPaymentSetting()
	if err != nil {
		return nil, err
	}
	return publicPaymentSetting(setting, value), nil
}

func (s *Service) AdminPaymentOrders(actor *model.User, limit int) ([]model.PaymentOrder, error) {
	if err := s.RequireAdmin(actor); err != nil {
		return nil, err
	}
	return s.repo.PaymentOrders(limit)
}

func (s *Service) UpdatePaymentSetting(actor *model.User, req PaymentSettingRequest) (*PublicPaymentSetting, error) {
	if err := s.RequireAdmin(actor); err != nil {
		return nil, err
	}
	currentSetting, current, err := s.readPaymentSetting()
	if err != nil {
		return nil, err
	}
	next := normalizePaymentSetting(paymentSettingValue{
		Enabled: req.Enabled, BaseURL: req.BaseURL, APIPath: req.APIPath, MerchantID: req.MerchantID,
		MerchantKey: req.MerchantKey, SiteURL: req.SiteURL, PayTypes: req.PayTypes,
	})
	if next.MerchantKey == "" {
		next.MerchantKey = current.MerchantKey
	}
	if err := validatePaymentSetting(next); err != nil {
		return nil, err
	}
	stored := next
	stored.MerchantKey, err = s.encryptSettingSecret(next.MerchantKey)
	if err != nil {
		return nil, err
	}
	encoded, err := json.Marshal(stored)
	if err != nil {
		return nil, err
	}
	setting := model.SystemSetting{Key: paymentSettingKey, ValueJSON: string(encoded), UpdatedBy: actor.ID}
	if currentSetting != nil {
		setting.CreatedAt = currentSetting.CreatedAt
	}
	if err := s.repo.SaveSystemSetting(&setting); err != nil {
		return nil, err
	}
	if err := s.appendAdminAudit(actor, "payment_setting.update", "system_setting", paymentSettingKey, "更新在线支付配置", map[string]any{"enabled": next.Enabled, "baseUrl": next.BaseURL, "apiPath": next.APIPath, "merchantId": next.MerchantID, "siteUrl": next.SiteURL, "payTypes": next.PayTypes}); err != nil {
		return nil, err
	}
	return publicPaymentSetting(&setting, next), nil
}

func (s *Service) PaymentConfig(user *model.User) (PublicPaymentConfig, error) {
	if user == nil {
		return PublicPaymentConfig{}, Unauthorized("请先登录")
	}
	_, setting, err := s.readPaymentSetting()
	if err != nil {
		return PublicPaymentConfig{}, err
	}
	return PublicPaymentConfig{Enabled: paymentSettingReady(setting), PayTypes: append([]string(nil), setting.PayTypes...)}, nil
}

func (s *Service) CreatePaymentOrder(ctx context.Context, user *model.User, req CreatePaymentOrderRequest, clientIP string) (*PaymentCheckoutResult, error) {
	if user == nil {
		return nil, Unauthorized("请先登录")
	}
	if err := s.RequireFeature(FeatureCredits); err != nil {
		return nil, err
	}
	_, setting, err := s.readPaymentSetting()
	if err != nil {
		return nil, err
	}
	if !paymentSettingReady(setting) {
		return nil, Forbidden("平台尚未启用在线支付")
	}
	plan, ok := publicRechargePlan(req.PlanID)
	if !ok {
		return nil, BadAuthRequest("充值套餐不存在")
	}
	payType := strings.ToLower(strings.TrimSpace(req.PayType))
	if !containsPaymentType(setting.PayTypes, payType) {
		return nil, BadAuthRequest("当前支付方式不可用")
	}
	idempotencyKey := strings.TrimSpace(req.IdempotencyKey)
	if idempotencyKey == "" || len(idempotencyKey) > 160 {
		return nil, BadAuthRequest("支付请求标识无效，请刷新后重试")
	}
	order := &model.PaymentOrder{
		ID: newID(), UserID: user.ID, IdempotencyKey: idempotencyKey,
		PlanID: plan.ID, PlanName: fmt.Sprintf("映雪 %s 积分", formatPaymentCredits(plan.CreditsMicrocredits)),
		AmountCents: plan.PriceCents, CreditsMicrocredits: plan.CreditsMicrocredits,
		PayType: payType, Status: model.PaymentOrderPending, MerchantID: setting.MerchantID,
	}
	order.MerchantKeyCipher, err = s.encryptSettingSecret(setting.MerchantKey)
	if err != nil {
		return nil, err
	}
	order, created, err := s.repo.CreateOrGetPaymentOrder(order)
	if err != nil {
		return nil, err
	}
	if !created && (order.CheckoutURL != "" || order.QRCode != "" || order.QRCodeImage != "" || order.URLScheme != "" || order.Status == model.PaymentOrderPaid) {
		return &PaymentCheckoutResult{Order: order}, nil
	}

	base, err := ValidateOutboundURL(setting.BaseURL)
	if err != nil {
		return nil, WrapAppError(http.StatusBadGateway, "支付平台地址不可用", err)
	}
	notifyURL, returnURL, err := paymentCallbackURLs(setting.SiteURL, order.ID)
	if err != nil {
		return nil, err
	}
	params := url.Values{
		"pid":          {setting.MerchantID},
		"type":         {payType},
		"out_trade_no": {order.ID},
		"notify_url":   {notifyURL},
		"return_url":   {returnURL},
		"name":         {order.PlanName},
		"money":        {formatPaymentMoney(order.AmountCents)},
		"param":        {order.ID},
		"clientip":     {truncateRunes(strings.TrimSpace(clientIP), 64)},
		"device":       {"pc"},
		"sign_type":    {"MD5"},
	}
	params.Set("sign", paymentSign(params, setting.MerchantKey))
	target := base.ResolveReference(&url.URL{Path: setting.APIPath})
	httpRequest, err := http.NewRequestWithContext(ctx, http.MethodPost, target.String(), strings.NewReader(params.Encode()))
	if err != nil {
		return nil, err
	}
	httpRequest.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	response, err := s.OutboundHTTPClientForChannel(20*time.Second, target, false).Do(httpRequest)
	if err != nil {
		_ = s.repo.MarkPaymentOrderFailed(order.ID, "支付平台连接失败")
		return nil, WrapAppError(http.StatusBadGateway, "支付平台暂时不可用，请稍后重试", err)
	}
	defer response.Body.Close()
	body, readErr := io.ReadAll(io.LimitReader(response.Body, 64<<10))
	if readErr != nil {
		_ = s.repo.MarkPaymentOrderFailed(order.ID, "支付平台响应读取失败")
		return nil, WrapAppError(http.StatusBadGateway, "读取支付平台响应失败", readErr)
	}
	var upstream ePayCreateResponse
	if response.StatusCode < 200 || response.StatusCode >= 300 || json.Unmarshal(body, &upstream) != nil || upstream.Code != 1 || strings.TrimSpace(upstream.TradeNo) == "" {
		message := strings.TrimSpace(upstream.Message)
		if message == "" {
			message = fmt.Sprintf("支付平台返回状态 %d", response.StatusCode)
		}
		_ = s.repo.MarkPaymentOrderFailed(order.ID, "支付平台拒绝创建订单")
		return nil, WrapAppError(http.StatusBadGateway, "创建支付订单失败，请稍后重试", errors.New(message))
	}
	if err := validatePaymentCheckout(upstream.PayURL, upstream.QRCode, upstream.ImageURL, upstream.URLScheme); err != nil {
		_ = s.repo.MarkPaymentOrderFailed(order.ID, "支付平台返回的收银台地址无效")
		return nil, WrapAppError(http.StatusBadGateway, "支付平台返回了无效收银台地址", err)
	}
	if err := s.repo.SavePaymentCheckout(order.ID, upstream.TradeNo, upstream.PayURL, upstream.QRCode, upstream.ImageURL, upstream.URLScheme); err != nil {
		return nil, err
	}
	order, err = s.repo.PaymentOrderForUser(user.ID, order.ID)
	if err != nil {
		return nil, err
	}
	return &PaymentCheckoutResult{Order: order}, nil
}

func (s *Service) PaymentOrder(user *model.User, id string) (*model.PaymentOrder, error) {
	if user == nil {
		return nil, Unauthorized("请先登录")
	}
	order, err := s.repo.PaymentOrderForUser(user.ID, strings.TrimSpace(id))
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, NotFound("充值订单不存在")
	}
	return order, err
}

func (s *Service) PaymentOrders(user *model.User, limit int) ([]model.PaymentOrder, error) {
	if user == nil {
		return nil, Unauthorized("请先登录")
	}
	return s.repo.PaymentOrdersForUser(user.ID, limit)
}

func (s *Service) CompleteEPayPayment(values url.Values) (bool, error) {
	orderID := strings.TrimSpace(values.Get("out_trade_no"))
	if orderID == "" {
		return false, BadAuthRequest("支付通知订单号无效")
	}
	order, err := s.repo.PaymentOrder(orderID)
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return false, NotFound("充值订单不存在")
	}
	if err != nil {
		return false, err
	}
	merchantKey, err := s.decryptSettingSecret(order.MerchantKeyCipher)
	if err != nil || order.MerchantID == "" || merchantKey == "" {
		return false, Forbidden("充值订单的支付凭据无效")
	}
	providerTradeNo, err := validateEPayNotification(values, order, merchantKey)
	if err != nil {
		return false, err
	}
	_, granted, err := s.repo.CompletePaymentOrder(order.ID, providerTradeNo)
	return granted, err
}

func validateEPayNotification(values url.Values, order *model.PaymentOrder, merchantKey string) (string, error) {
	providedSign := strings.ToLower(strings.TrimSpace(values.Get("sign")))
	expectedSign := paymentSign(values, merchantKey)
	if len(providedSign) != len(expectedSign) || subtle.ConstantTimeCompare([]byte(providedSign), []byte(expectedSign)) != 1 {
		return "", BadAuthRequest("支付通知签名无效")
	}
	if values.Get("pid") != order.MerchantID || values.Get("trade_status") != "TRADE_SUCCESS" {
		return "", BadAuthRequest("支付通知状态无效")
	}
	paidCents, err := parsePaymentMoney(values.Get("money"))
	if err != nil || paidCents != order.AmountCents || values.Get("type") != order.PayType {
		return "", BadAuthRequest("支付通知金额或支付方式不匹配")
	}
	providerTradeNo := strings.TrimSpace(values.Get("trade_no"))
	if providerTradeNo == "" {
		return "", BadAuthRequest("支付通知交易号无效")
	}
	if order.ProviderTradeNo != nil && strings.TrimSpace(*order.ProviderTradeNo) != "" && providerTradeNo != strings.TrimSpace(*order.ProviderTradeNo) {
		return "", BadAuthRequest("支付通知交易号与原订单不匹配")
	}
	return providerTradeNo, nil
}

func (s *Service) readPaymentSetting() (*model.SystemSetting, paymentSettingValue, error) {
	setting, err := s.repo.SystemSetting(paymentSettingKey)
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, normalizePaymentSetting(paymentSettingValue{}), nil
	}
	if err != nil {
		return nil, paymentSettingValue{}, err
	}
	var value paymentSettingValue
	if err := json.Unmarshal([]byte(setting.ValueJSON), &value); err != nil {
		return nil, paymentSettingValue{}, errors.New("在线支付配置格式无效")
	}
	value.MerchantKey, err = s.decryptSettingSecret(value.MerchantKey)
	if err != nil {
		return nil, paymentSettingValue{}, err
	}
	return setting, normalizePaymentSetting(value), nil
}

func normalizePaymentSetting(value paymentSettingValue) paymentSettingValue {
	value.BaseURL = strings.TrimRight(strings.TrimSpace(value.BaseURL), "/")
	if value.BaseURL == "" {
		value.BaseURL = defaultEPayBaseURL
	}
	value.APIPath = strings.TrimSpace(value.APIPath)
	if value.APIPath == "" {
		value.APIPath = defaultEPayAPIPath
	}
	value.MerchantID = strings.TrimSpace(value.MerchantID)
	value.MerchantKey = strings.TrimSpace(value.MerchantKey)
	value.SiteURL = strings.TrimRight(strings.TrimSpace(value.SiteURL), "/")
	seen := map[string]bool{}
	payTypes := make([]string, 0, len(value.PayTypes))
	for _, item := range value.PayTypes {
		item = strings.ToLower(strings.TrimSpace(item))
		if validPaymentType(item) && !seen[item] {
			seen[item] = true
			payTypes = append(payTypes, item)
		}
	}
	if len(payTypes) == 0 {
		payTypes = []string{"alipay", "wxpay"}
	}
	value.PayTypes = payTypes
	return value
}

func validatePaymentSetting(value paymentSettingValue) error {
	if !value.Enabled {
		return nil
	}
	if value.MerchantID == "" || value.MerchantKey == "" || value.SiteURL == "" {
		return BadAuthRequest("启用在线支付前请完整填写商户 ID、商户密钥和本站公网地址")
	}
	if _, err := ValidateOutboundURL(value.BaseURL); err != nil {
		return BadAuthRequest("支付平台地址必须是可公开访问的 HTTPS 地址")
	}
	if err := validatePaymentAPIPath(value.APIPath); err != nil {
		return BadAuthRequest("支付接口路径必须是以 / 开头且不含查询参数的站内路径")
	}
	parsed, err := url.Parse(value.SiteURL)
	if err != nil || parsed.Scheme != "https" || parsed.Host == "" || parsed.User != nil || parsed.RawQuery != "" || parsed.Fragment != "" {
		return BadAuthRequest("本站公网地址必须是无查询参数的 HTTPS 地址")
	}
	return nil
}

func paymentSettingReady(value paymentSettingValue) bool {
	return value.Enabled && value.MerchantID != "" && value.MerchantKey != "" && value.SiteURL != "" && len(value.PayTypes) > 0
}

func publicPaymentSetting(setting *model.SystemSetting, value paymentSettingValue) *PublicPaymentSetting {
	result := &PublicPaymentSetting{Enabled: value.Enabled, BaseURL: value.BaseURL, APIPath: value.APIPath, MerchantID: value.MerchantID, HasMerchantKey: value.MerchantKey != "", SiteURL: value.SiteURL, PayTypes: append([]string(nil), value.PayTypes...)}
	if setting != nil {
		result.UpdatedBy = setting.UpdatedBy
		result.CreatedAt = setting.CreatedAt
		result.UpdatedAt = setting.UpdatedAt
	}
	return result
}

func publicRechargePlan(id string) (PublicRechargePlan, bool) {
	for _, plan := range publicRechargePlans {
		if plan.ID == strings.TrimSpace(id) {
			return plan, true
		}
	}
	return PublicRechargePlan{}, false
}

func containsPaymentType(values []string, target string) bool {
	for _, value := range values {
		if value == target {
			return true
		}
	}
	return false
}

func validPaymentType(value string) bool {
	switch value {
	case "alipay", "wxpay", "qqpay", "bank", "jdpay", "paypal":
		return true
	default:
		return false
	}
}

func paymentCallbackURLs(siteURL string, orderID string) (string, string, error) {
	base, err := url.Parse(siteURL)
	if err != nil {
		return "", "", err
	}
	notify := base.ResolveReference(&url.URL{Path: "/api/payments/epay/notify"})
	callback := base.ResolveReference(&url.URL{Path: "/wallet", RawQuery: url.Values{"paymentOrder": {orderID}}.Encode()})
	return notify.String(), callback.String(), nil
}

func paymentSign(values url.Values, key string) string {
	keys := make([]string, 0, len(values))
	for name := range values {
		if name == "sign" || name == "sign_type" || values.Get(name) == "" {
			continue
		}
		keys = append(keys, name)
	}
	sort.Strings(keys)
	parts := make([]string, 0, len(keys))
	for _, name := range keys {
		parts = append(parts, name+"="+values.Get(name))
	}
	sum := md5.Sum([]byte(strings.Join(parts, "&") + key)) //nolint:gosec // 易支付协议固定使用 MD5 签名。
	return hex.EncodeToString(sum[:])
}

func formatPaymentMoney(cents int64) string {
	return fmt.Sprintf("%d.%02d", cents/100, cents%100)
}

func parsePaymentMoney(value string) (int64, error) {
	value = strings.TrimSpace(value)
	parts := strings.Split(value, ".")
	if value == "" || len(parts) > 2 || parts[0] == "" {
		return 0, errors.New("支付金额格式无效")
	}
	whole, err := strconv.ParseInt(parts[0], 10, 64)
	if err != nil || whole < 0 {
		return 0, errors.New("支付金额格式无效")
	}
	fraction := int64(0)
	if len(parts) == 2 {
		if len(parts[1]) == 0 || len(parts[1]) > 2 {
			return 0, errors.New("支付金额格式无效")
		}
		fraction, err = strconv.ParseInt(parts[1], 10, 64)
		if err != nil {
			return 0, errors.New("支付金额格式无效")
		}
		if len(parts[1]) == 1 {
			fraction *= 10
		}
	}
	if whole > (math.MaxInt64-fraction)/100 {
		return 0, errors.New("支付金额超出范围")
	}
	return whole*100 + fraction, nil
}

func formatPaymentCredits(microcredits int64) string {
	if microcredits%CreditScale == 0 {
		return fmt.Sprintf("%d", microcredits/CreditScale)
	}
	return fmt.Sprintf("%.6f", float64(microcredits)/float64(CreditScale))
}

func validatePaymentCheckout(payURL string, qrCode string, imageURL string, urlScheme string) error {
	if payURL == "" && qrCode == "" && imageURL == "" && urlScheme == "" {
		return errors.New("支付平台未返回收银台地址")
	}
	if payURL != "" {
		if _, err := ValidateOutboundURL(payURL); err != nil {
			return err
		}
	}
	if imageURL != "" {
		if _, err := ValidateOutboundURL(imageURL); err != nil {
			return err
		}
	}
	for _, raw := range []string{qrCode, urlScheme} {
		if raw == "" {
			continue
		}
		parsed, err := url.Parse(raw)
		if err != nil {
			return err
		}
		if parsed.Scheme == "http" || parsed.Scheme == "https" {
			if _, err := ValidateOutboundURL(raw); err != nil {
				return err
			}
			continue
		}
		switch strings.ToLower(parsed.Scheme) {
		case "weixin", "alipays", "alipay":
		default:
			return errors.New("支付平台返回了不受支持的跳转协议")
		}
	}
	return nil
}

func validatePaymentAPIPath(value string) error {
	parsed, err := url.Parse(value)
	if err != nil || !strings.HasPrefix(value, "/") || strings.HasPrefix(value, "//") || parsed.IsAbs() || parsed.Host != "" || parsed.RawQuery != "" || parsed.Fragment != "" {
		return errors.New("invalid payment api path")
	}
	for _, part := range strings.Split(parsed.EscapedPath(), "/") {
		if part == "." || part == ".." || strings.EqualFold(part, "%2e") || strings.EqualFold(part, "%2e%2e") {
			return errors.New("invalid payment api path")
		}
	}
	return nil
}
