package sms

import (
	"context"
	"encoding/json"
	"net/http"
	"regexp"
	"strings"
	"sync/atomic"
	"time"

	"github.com/aliyun/alibaba-cloud-sdk-go/sdk"
	"github.com/aliyun/alibaba-cloud-sdk-go/sdk/requests"
	sender "github.com/casdoor/go-sms-sender"
	"infinite-canvas/backend/internal/model"
)

const aliyunPNSHost = "dypnsapi.aliyuncs.com"

var verificationCodePattern = regexp.MustCompile(`^[0-9]{6}$`)

type pnsTransport struct {
	ctx       context.Context
	base      http.RoundTripper
	attempted atomic.Bool
}

func (t *pnsTransport) RoundTrip(req *http.Request) (*http.Response, error) {
	if req.URL.Scheme != "https" || req.URL.Host != aliyunPNSHost || t.attempted.Swap(true) {
		return nil, sender.ErrSendUnknown
	}
	return t.base.RoundTrip(req.Clone(t.ctx))
}

// The documented custom-code mode preserves the host's purpose-bound tickets,
// HMAC verification and one-time consumption. Cloud-generated codes are not used.
func sendAliyunPNS(ctx context.Context, transport http.RoundTripper, channel model.SMSChannel, template Template, id, key, phone, code string) (sender.SendResult, error) {
	unknown := sender.SendResult{State: "unknown", Code: "acceptance_unknown"}
	normalized, err := NormalizePhone(phone)
	if err != nil || !verificationCodePattern.MatchString(code) || transport == nil || id == "" || key == "" {
		return sender.SendResult{State: "rejected", Code: "invalid_configuration"}, sender.ErrSendRejected
	}
	client, err := sdk.NewClientWithAccessKey("cn-hangzhou", id, key)
	if err != nil {
		return sender.SendResult{State: "rejected", Code: "invalid_configuration"}, sender.ErrSendRejected
	}
	client.GetConfig().AutoRetry = false
	client.SetReadTimeout(10 * time.Second)
	client.SetConnectTimeout(5 * time.Second)
	client.SetTransport(&pnsTransport{ctx: ctx, base: transport})
	params := make(map[string]string, len(template.Parameters))
	for _, param := range template.Parameters {
		if param.Value == "code" {
			params[param.Name] = code
		} else {
			params[param.Name] = "10"
		}
	}
	encoded, _ := json.Marshal(params)
	request := requests.NewCommonRequest()
	request.Scheme, request.Domain, request.Method = "https", aliyunPNSHost, "POST"
	request.Version, request.ApiName = "2017-05-25", "SendSmsVerifyCode"
	request.FormParams = map[string]string{
		"PhoneNumber": strings.TrimPrefix(normalized, "+86"), "CountryCode": "86",
		"SignName": channel.SignName, "TemplateCode": template.TemplateID, "TemplateParam": string(encoded),
		"CodeLength": "6", "ValidTime": "600", "Interval": "60", "ReturnVerifyCode": "false", "AutoRetry": "0",
	}
	response, sendErr := client.ProcessCommonRequest(request)
	if response == nil || len(response.GetHttpContentBytes()) > 1<<20 {
		return unknown, sender.ErrSendUnknown
	}
	var body struct {
		Code, RequestID string
		Success         bool
		Model           struct{ BizID, RequestID string }
	}
	if json.Unmarshal(response.GetHttpContentBytes(), &body) != nil {
		return unknown, sender.ErrSendUnknown
	}
	result := sender.SendResult{State: "unknown", Code: "acceptance_unknown", RequestID: sanitize(body.RequestID)}
	if result.RequestID == "" {
		result.RequestID = sanitize(body.Model.RequestID)
	}
	status := response.GetHttpStatus()
	if status >= 200 && status < 500 && body.Code != "" && body.Code != "OK" {
		result.State, result.Code = "rejected", sanitize(body.Code)
		return result, sender.ErrSendRejected
	}
	if sendErr != nil || status < 200 || status >= 300 || body.Code != "OK" || !body.Success || result.RequestID == "" || sanitize(body.Model.BizID) == "" {
		return result, sender.ErrSendUnknown
	}
	result.State, result.Code, result.MessageID = "accepted", "", sanitize(body.Model.BizID)
	return result, nil
}
