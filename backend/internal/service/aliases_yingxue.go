package service

import "infinite-canvas/backend/internal/app"

const LibTVMaxImportJSONBytes = app.LibTVMaxImportJSONBytes
const PaymentPluginCloudCatEPay = app.PaymentPluginCloudCatEPay
const PaymentProviderCloudCatEPay = app.PaymentProviderCloudCatEPay

var ResolveSystemProxyTextBody = app.ResolveSystemProxyTextBody

type (
	PromptItem                    = app.PromptItem
	PromptCategory                = app.PromptCategory
	PromptMode                    = app.PromptMode
	PromptListRequest             = app.PromptListRequest
	PromptList                    = app.PromptList
	PromptMutationRequest         = app.PromptMutationRequest
	PaymentSettingRequest         = app.PaymentSettingRequest
	PublicPaymentSetting          = app.PublicPaymentSetting
	PublicPaymentConfig           = app.PublicPaymentConfig
	CreateEPayPaymentOrderRequest = app.CreateEPayPaymentOrderRequest
	PaymentCheckoutResult         = app.PaymentCheckoutResult
	PublicRechargePlan            = app.PublicRechargePlan
	UserPaymentOrderPage          = app.UserPaymentOrderPage
)
