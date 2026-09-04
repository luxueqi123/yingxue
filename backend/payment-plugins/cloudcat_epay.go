package paymentplugins

import (
	"context"
	"crypto/md5"
	"crypto/subtle"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/url"
	"regexp"
	"sort"
	"strings"
	"time"
)

const (
	defaultCloudCatEPayGateway   = "https://m.ooeao.com/xpay/epay/mapi.php"
	maxCloudCatEPayResponseBytes = 256 << 10
	maxCloudCatNotificationBytes = 64 << 10
)

var (
	cloudCatMerchantIDPattern = regexp.MustCompile(`^[0-9]{1,32}$`)
	cloudCatOrderIDPattern    = regexp.MustCompile(`^[A-Za-z0-9_-]{1,64}$`)
)

type CloudCatEPayProvider struct {
	client *http.Client
}

func NewCloudCatEPayProvider(client *http.Client) *CloudCatEPayProvider {
	if client == nil {
		client = http.DefaultClient
	}
	return &CloudCatEPayProvider{client: client}
}

func (p *CloudCatEPayProvider) Descriptor() Descriptor {
	return Descriptor{
		ID: ProviderCloudCatEPay, PluginID: PluginCloudCatEPay, PluginVersion: "1.0.0",
		Name: "云猫码支付", Icon: "brand:cloudcat-pay", CheckoutMode: "redirect",
		IdentityFields:      []string{"merchantId"},
		NotificationSuccess: NotificationResponse{Status: 200, ContentType: "text/plain; charset=utf-8", Body: "success"},
		NotificationFailure: NotificationResponse{Status: 400, ContentType: "text/plain; charset=utf-8", Body: "failure"},
	}
}

func (p *CloudCatEPayProvider) ValidateConfig(config Config) error {
	for _, key := range []string{"publicBaseUrl", "merchantId", "merchantKey", "paymentType"} {
		if strings.TrimSpace(config[key]) == "" {
			return fmt.Errorf("云猫码支付配置缺少 %s", key)
		}
	}
	if !cloudCatMerchantIDPattern.MatchString(strings.TrimSpace(config["merchantId"])) {
		return errors.New("云猫码商户 ID 必须为 1 至 32 位数字")
	}
	if keyLength := len(strings.TrimSpace(config["merchantKey"])); keyLength < 8 || keyLength > 512 {
		return errors.New("云猫码商户密钥长度无效")
	}
	switch strings.ToLower(strings.TrimSpace(config["paymentType"])) {
	case "alipay", "wxpay", "qqpay":
	default:
		return errors.New("云猫码支付方式仅支持 alipay、wxpay 或 qqpay")
	}
	if _, err := cloudCatPublicBaseURL(config["publicBaseUrl"]); err != nil {
		return err
	}
	parsed, err := url.Parse(cloudCatGateway(config))
	if err != nil || parsed.Scheme != "https" || strings.ToLower(parsed.Hostname()) != "m.ooeao.com" || parsed.User != nil || parsed.Fragment != "" || parsed.RawQuery != "" || parsed.EscapedPath() != "/xpay/epay/mapi.php" || (parsed.Port() != "" && parsed.Port() != "443") {
		return errors.New("云猫码网关必须是官方 HTTPS mapi.php 地址")
	}
	return nil
}

func (p *CloudCatEPayProvider) CreateOrder(ctx context.Context, config Config, request CreateRequest) (Checkout, error) {
	if err := p.ValidateConfig(config); err != nil {
		return Checkout{}, err
	}
	if !cloudCatOrderIDPattern.MatchString(strings.TrimSpace(request.MerchantOrderNo)) || request.AmountFen <= 0 || request.Currency != "CNY" || !request.ExpiresAt.After(time.Now().Add(-time.Minute)) {
		return Checkout{}, errors.New("云猫码下单参数无效")
	}
	clientIP := net.ParseIP(strings.TrimSpace(request.ClientIP))
	if clientIP == nil {
		return Checkout{}, errors.New("云猫码下单缺少有效客户端 IP")
	}
	publicBase, _ := cloudCatPublicBaseURL(config["publicBaseUrl"])
	if err := validateCloudCatCallbackURL(request.NotifyURL, publicBase, "/api/payments/notify/"); err != nil {
		return Checkout{}, fmt.Errorf("云猫码异步通知地址无效：%w", err)
	}
	if err := validateCloudCatCallbackURL(request.ReturnURL, publicBase, "/api/payments/return/"); err != nil {
		return Checkout{}, fmt.Errorf("云猫码同步返回地址无效：%w", err)
	}
	values := url.Values{
		"pid":          {strings.TrimSpace(config["merchantId"])},
		"type":         {strings.ToLower(strings.TrimSpace(config["paymentType"]))},
		"out_trade_no": {strings.TrimSpace(request.MerchantOrderNo)},
		"notify_url":   {request.NotifyURL},
		"return_url":   {request.ReturnURL},
		"name":         {truncateUTF8(strings.TrimSpace(request.Description), 127)},
		"money":        {formatFen(request.AmountFen)},
		"param":        {strings.TrimSpace(request.MerchantOrderNo)},
		"clientip":     {clientIP.String()},
		"device":       {"pc"},
		"sign_type":    {"MD5"},
	}
	values.Set("sign", cloudCatEPaySign(values, config["merchantKey"]))
	httpRequest, err := http.NewRequestWithContext(ctx, http.MethodPost, cloudCatGateway(config), strings.NewReader(values.Encode()))
	if err != nil {
		return Checkout{}, err
	}
	httpRequest.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	httpRequest.Header.Set("Accept", "application/json")
	response, err := p.client.Do(httpRequest)
	if err != nil {
		return Checkout{}, &ProviderError{Code: "cloudcat_transport_error", Message: "云猫码支付网络请求失败", Temporary: true}
	}
	defer response.Body.Close()
	body, err := io.ReadAll(io.LimitReader(response.Body, maxCloudCatEPayResponseBytes+1))
	if err != nil {
		return Checkout{}, &ProviderError{Code: "cloudcat_response_read_error", Message: "读取云猫码支付响应失败", Temporary: true}
	}
	if len(body) > maxCloudCatEPayResponseBytes {
		return Checkout{}, errors.New("云猫码支付响应超过安全限制")
	}
	if response.StatusCode < 200 || response.StatusCode >= 300 {
		return Checkout{}, &ProviderError{Code: "cloudcat_http_error", Message: "云猫码支付接口返回失败", Temporary: response.StatusCode >= 500}
	}
	var result cloudCatCreateResponse
	if err := json.Unmarshal(body, &result); err != nil {
		return Checkout{}, errors.New("云猫码支付响应不是有效 JSON")
	}
	if result.Code != 1 {
		message := strings.TrimSpace(result.Msg)
		if message == "" {
			message = strings.TrimSpace(result.Message)
		}
		if message == "" {
			message = "云猫码支付拒绝创建订单"
		}
		return Checkout{}, &ProviderError{Code: "cloudcat_create_rejected", Message: message}
	}
	if strings.TrimSpace(result.TradeNo) == "" {
		return Checkout{}, errors.New("云猫码支付响应缺少交易号")
	}
	return cloudCatCheckout(result.cloudCatCreatePayload, request.ExpiresAt)
}

func (p *CloudCatEPayProvider) QueryOrder(_ context.Context, config Config, _ QueryRequest) (Result, error) {
	if err := p.ValidateConfig(config); err != nil {
		return Result{}, err
	}
	return Result{}, &ProviderError{Code: "cloudcat_query_unsupported", Message: "云猫码查单合同尚未验证，当前版本不执行查单"}
}

func (p *CloudCatEPayProvider) CloseOrder(_ context.Context, config Config, _ CloseRequest) (Result, error) {
	if err := p.ValidateConfig(config); err != nil {
		return Result{}, err
	}
	return Result{}, &ProviderError{Code: "cloudcat_close_unsupported", Message: "云猫码未提供已验证的关单合同"}
}

func (p *CloudCatEPayProvider) VerifyNotification(_ context.Context, config Config, _ http.Header, rawBody []byte) (Notification, error) {
	if err := p.ValidateConfig(config); err != nil {
		return Notification{}, err
	}
	if len(rawBody) == 0 || len(rawBody) > maxCloudCatNotificationBytes {
		return Notification{}, errors.New("云猫码支付通知大小无效")
	}
	values, err := url.ParseQuery(string(rawBody))
	if err != nil {
		return Notification{}, errors.New("云猫码支付通知格式无效")
	}
	provided := strings.ToLower(strings.TrimSpace(values.Get("sign")))
	expected := cloudCatEPaySign(values, config["merchantKey"])
	if values.Get("sign_type") != "MD5" || len(provided) != len(expected) || subtle.ConstantTimeCompare([]byte(provided), []byte(expected)) != 1 {
		return Notification{}, errors.New("云猫码支付通知签名无效")
	}
	if values.Get("pid") != strings.TrimSpace(config["merchantId"]) || strings.ToLower(values.Get("type")) != strings.ToLower(strings.TrimSpace(config["paymentType"])) || values.Get("trade_status") != "TRADE_SUCCESS" {
		return Notification{}, errors.New("云猫码支付通知商户、支付方式或状态不匹配")
	}
	merchantOrderNo := strings.TrimSpace(values.Get("out_trade_no"))
	providerTradeNo := strings.TrimSpace(values.Get("trade_no"))
	if !cloudCatOrderIDPattern.MatchString(merchantOrderNo) || providerTradeNo == "" || len(providerTradeNo) > 128 {
		return Notification{}, errors.New("云猫码支付通知订单号无效")
	}
	if parameter := strings.TrimSpace(values.Get("param")); parameter != "" && parameter != merchantOrderNo {
		return Notification{}, errors.New("云猫码支付通知扩展订单号不匹配")
	}
	amountFen, err := parseYuanToFen(values.Get("money"))
	if err != nil || amountFen <= 0 {
		return Notification{}, errors.New("云猫码支付通知金额无效")
	}
	status := values.Get("trade_status")
	return Notification{EventID: "cloudcat:" + providerTradeNo + ":" + status, Result: Result{
		MerchantOrderNo: merchantOrderNo, ProviderTradeNo: providerTradeNo, ProviderStatus: status,
		AmountFen: amountFen, Currency: "CNY", Paid: true,
	}}, nil
}

func (p *CloudCatEPayProvider) DownloadTradeBill(_ context.Context, config Config, _ time.Time) ([]BillRecord, error) {
	if err := p.ValidateConfig(config); err != nil {
		return nil, err
	}
	return nil, &ProviderError{Code: "cloudcat_bill_unsupported", Message: "云猫码未提供已验证的交易账单下载合同"}
}

type cloudCatCreatePayload struct {
	TradeNo   string `json:"trade_no"`
	PayURL    string `json:"payurl"`
	QRCode    string `json:"qrcode"`
	ImageURL  string `json:"img"`
	URLScheme string `json:"urlscheme"`
	Redirect  string `json:"redirect"`
}

type cloudCatCreateResponse struct {
	Code    int    `json:"code"`
	Msg     string `json:"msg"`
	Message string `json:"message"`
	cloudCatCreatePayload
}

func cloudCatCheckout(payload cloudCatCreatePayload, expiresAt time.Time) (Checkout, error) {
	for _, candidate := range []string{payload.PayURL, payload.Redirect, payload.ImageURL} {
		candidate = strings.TrimSpace(candidate)
		if candidate == "" {
			continue
		}
		if err := validateCloudCatHTTPSCheckout(candidate); err != nil {
			return Checkout{}, err
		}
		parsed, _ := url.Parse(candidate)
		if !strings.EqualFold(parsed.Hostname(), "m.ooeao.com") {
			return Checkout{}, errors.New("云猫码跳转收银台必须属于 m.ooeao.com")
		}
		return Checkout{Mode: "redirect", Value: candidate, ExpiresAt: expiresAt}, nil
	}
	for _, candidate := range []string{payload.QRCode, payload.URLScheme} {
		candidate = strings.TrimSpace(candidate)
		if candidate == "" {
			continue
		}
		if err := validateCloudCatCheckoutValue(candidate); err != nil {
			return Checkout{}, err
		}
		return Checkout{Mode: "qr_code", Value: candidate, ExpiresAt: expiresAt}, nil
	}
	return Checkout{}, errors.New("云猫码支付响应缺少安全的收银台地址")
}

func cloudCatEPaySign(values url.Values, merchantKey string) string {
	keys := make([]string, 0, len(values))
	for key := range values {
		if key == "sign" || key == "sign_type" || values.Get(key) == "" {
			continue
		}
		keys = append(keys, key)
	}
	sort.Strings(keys)
	parts := make([]string, 0, len(keys))
	for _, key := range keys {
		parts = append(parts, key+"="+values.Get(key))
	}
	digest := md5.Sum([]byte(strings.Join(parts, "&") + strings.TrimSpace(merchantKey)))
	return hex.EncodeToString(digest[:])
}

func cloudCatGateway(config Config) string {
	if gateway := strings.TrimSpace(config["gateway"]); gateway != "" {
		return gateway
	}
	return defaultCloudCatEPayGateway
}

func cloudCatPublicBaseURL(raw string) (*url.URL, error) {
	parsed, err := url.Parse(strings.TrimSpace(raw))
	if err != nil || parsed.Scheme != "https" || parsed.Host == "" || parsed.User != nil || parsed.RawQuery != "" || parsed.Fragment != "" || (parsed.EscapedPath() != "" && parsed.EscapedPath() != "/") {
		return nil, errors.New("服务器公网地址必须是无路径和查询参数的 HTTPS 地址")
	}
	return parsed, nil
}

func validateCloudCatCallbackURL(raw string, base *url.URL, pathPrefix string) error {
	parsed, err := url.Parse(strings.TrimSpace(raw))
	if err != nil || parsed.Scheme != base.Scheme || !strings.EqualFold(parsed.Host, base.Host) || parsed.User != nil || parsed.Fragment != "" || !strings.HasPrefix(parsed.EscapedPath(), pathPrefix) {
		return errors.New("回调必须属于配置的服务器公网地址和支付路由")
	}
	return nil
}

func validateCloudCatHTTPSCheckout(raw string) error {
	parsed, err := url.Parse(strings.TrimSpace(raw))
	if err != nil || parsed.Scheme != "https" || parsed.Host == "" || parsed.User != nil {
		return errors.New("云猫码收银台必须使用无用户信息的 HTTPS 地址")
	}
	if ip := net.ParseIP(parsed.Hostname()); ip != nil && (ip.IsLoopback() || ip.IsPrivate() || ip.IsUnspecified() || ip.IsLinkLocalUnicast() || ip.IsLinkLocalMulticast()) {
		return errors.New("云猫码收银台不能指向本机或私网地址")
	}
	return nil
}

func validateCloudCatCheckoutValue(raw string) error {
	parsed, err := url.Parse(strings.TrimSpace(raw))
	if err != nil || parsed.Scheme == "" {
		return errors.New("云猫码二维码内容无效")
	}
	switch strings.ToLower(parsed.Scheme) {
	case "https":
		return validateCloudCatHTTPSCheckout(raw)
	case "weixin", "alipays":
		return nil
	default:
		return errors.New("云猫码二维码包含不支持的协议")
	}
}
