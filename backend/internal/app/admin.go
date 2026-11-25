package app

import (
	"encoding/json"
	"infinite-canvas/backend/internal/kernel"
	"infinite-canvas/backend/internal/model"
	"strings"
	"time"
)

type CreateAdminUserRequest struct {
	Username    string           `json:"username"`
	DisplayName string           `json:"displayName"`
	Email       string           `json:"email"`
	Password    string           `json:"password"`
	Role        model.UserRole   `json:"role"`
	Status      model.UserStatus `json:"status"`

	UserGroup string `json:"userGroup"`
}
type UpdateUserRequest struct {
	DisplayName string           `json:"displayName"`
	Email       string           `json:"email"`
	Password    string           `json:"password"`
	Role        model.UserRole   `json:"role"`
	Status      model.UserStatus `json:"status"`
	// IsPromoter 为空表示不修改推广人标记。
	IsPromoter *bool `json:"isPromoter"`

	UserGroup *string `json:"userGroup"`
}
type BulkDisableUsersRequest struct {
	UserIDs []string `json:"userIds"`
}
type BulkDisableUsersResult struct {
	Users         []model.User `json:"users"`
	DisabledCount int          `json:"disabledCount"`
}
type AdminListQuery struct {
	Keyword string
	Status  string
	Type    string
	Page    int
	Limit   int

	Group string
}
type AdminUserPage struct {
	Users []AdminUser `json:"users"`
	Total int64       `json:"total"`
	Page  int         `json:"page"`
	Limit int         `json:"pageSize"`
}
type AdminUser struct {
	model.User
	AvailableMicrocredits int64 `json:"availableMicrocredits"`
	ReservedMicrocredits  int64 `json:"reservedMicrocredits"`
	// 仅列表接口填充：累计充值到账积分与累计已结算消耗。
	RechargedMicrocredits int64 `json:"rechargedMicrocredits"`
	ConsumedMicrocredits  int64 `json:"consumedMicrocredits"`
}
type AdminChannelPage struct {
	Channels []PublicModelChannel `json:"channels"`
	Total    int64                `json:"total"`
	Page     int                  `json:"page"`
	Limit    int                  `json:"pageSize"`
}
type AdminUserReference struct {
	ID          string `json:"id"`
	Username    string `json:"username"`
	DisplayName string `json:"displayName"`
}
type AdminChannelReference struct {
	ID                string   `json:"id"`
	Name              string   `json:"name"`
	Enabled           bool     `json:"enabled"`
	Models            []string `json:"models"`
	ModelDisplayNames []string `json:"modelDisplayNames"`
}
type AdminReferenceData struct {
	Users    []AdminUserReference    `json:"users"`
	Channels []AdminChannelReference `json:"channels"`
}
type ChannelRequest struct {
	ExpectedUpdatedAt    time.Time                `json:"expectedUpdatedAt,omitempty"`
	WebsiteID            string                   `json:"websiteId"`
	APIFormat            *string                  `json:"apiFormat"`
	MediaTransport       *ReferenceMediaTransport `json:"mediaTransport"`
	Name                 string                   `json:"name"`
	SortOrder            *int                     `json:"sortOrder"`
	BaseURL              string                   `json:"baseUrl"`
	AllowLocalChannel    *bool                    `json:"allowLocalChannel"`
	APIKey               string                   `json:"apiKey"`
	SecretKey            string                   `json:"secretKey"`
	ConcurrencyLimit     *int                     `json:"concurrencyLimit"`
	UseGlobalConcurrency *bool                    `json:"useGlobalConcurrency"`
	Models               []string                 `json:"models"`
	Headers              []OutboundHeader         `json:"headers"`
	Enabled              *bool                    `json:"enabled"`

	ProxyURL *string `json:"proxyUrl"`
}
type PublicModelChannel struct {
	WebsiteID         string                    `json:"websiteId,omitempty"`
	Capabilities      []string                  `json:"capabilities,omitempty"`
	MediaTransport    *ReferenceMediaTransport  `json:"mediaTransport,omitempty"`
	ID                string                    `json:"id"`
	UserID            string                    `json:"userId"`
	Scope             model.ChannelScope        `json:"scope"`
	Enabled           bool                      `json:"enabled"`
	Name              string                    `json:"name"`
	SortOrder         int                       `json:"sortOrder"`
	BaseURL           string                    `json:"baseUrl"`
	AllowLocalChannel bool                      `json:"allowLocalChannel,omitempty"`
	APIKey            string                    `json:"apiKey"`
	APIFormat         string                    `json:"apiFormat"`
	ConcurrencyLimit  int                       `json:"concurrencyLimit"`
	Models            []string                  `json:"models"`
	ModelCount        int                       `json:"modelCount"`
	EnabledModelCount int                       `json:"enabledModelCount"`
	ModelCosts        []PublicChannelModelPrice `json:"modelCosts"`
	Headers           []OutboundHeader          `json:"headers,omitempty"`
	HasAPIKey         bool                      `json:"hasApiKey"`
	HasSecretKey      bool                      `json:"hasSecretKey"`
	CreatedAt         time.Time                 `json:"createdAt"`
	UpdatedAt         time.Time                 `json:"updatedAt"`

	ProxyURL string `json:"proxyUrl"`

	CatalogProvider string `json:"catalogProviderId,omitempty"`
}
type PublicChannelModelPrice struct {
	Model                            string                     `json:"model"`
	DisplayName                      string                     `json:"displayName"`
	ChannelLabel                     string                     `json:"channelLabel"`
	Tags                             []model.ChannelModelTag    `json:"tags"`
	Description                      string                     `json:"description"`
	Icon                             string                     `json:"icon"`
	Capability                       string                     `json:"capability"`
	Protocol                         model.ChannelInterfaceType `json:"protocol"`
	BillingMode                      string                     `json:"billingMode"`
	UnitPriceMicrocredits            int64                      `json:"unitPriceMicrocredits"`
	InputTokenPriceMicrocredits      int64                      `json:"inputTokenPriceMicrocredits"`
	OutputTokenPriceMicrocredits     int64                      `json:"outputTokenPriceMicrocredits"`
	CachedTokenPriceMicrocredits     int64                      `json:"cachedTokenPriceMicrocredits"`
	CacheWriteTokenPriceMicrocredits int64                      `json:"cacheWriteTokenPriceMicrocredits"`
	CapabilityConfig                 *ModelCapabilityConfig     `json:"capabilityConfig,omitempty"`
}

func channelFromRequest(req ChannelRequest, channel model.ModelChannel) (model.ModelChannel, error) {
	return (&Service{}).channelFromRequest(req, channel)
}
func (s *Service) channelFromRequest(req ChannelRequest, channel model.ModelChannel) (model.ModelChannel, error) {
	if _, err := normalizeReferenceMediaTransport(req.MediaTransport); err != nil {
		return channel, err
	}
	if req.ProxyURL != nil {
		proxyURL, err := ValidateProxyURL(*req.ProxyURL)
		if err != nil {
			return channel, err
		}
		channel.ProxyURL = ""
		if proxyURL != nil {
			channel.ProxyURL = proxyURL.String()
		}
	}
	name := strings.TrimSpace(req.Name)
	baseURL := strings.TrimSpace(req.BaseURL)
	if name == "" {
		return channel, BadAuthRequest("请填写渠道名称")
	}
	if baseURL == "" {
		return channel, BadAuthRequest("请填写 Base URL")
	}
	// 启用/停用或只修改价格、模型等配置时，不应要求上游域名当前可解析。
	// 地址或本机模式变化才重新解析；本机模式每次都重新核对当前宿主能力。
	allowLocal := channel.AllowLocalChannel
	if req.AllowLocalChannel != nil {
		allowLocal = *req.AllowLocalChannel
	}
	connectionChanged := model.CanonicalWebsiteURL(baseURL) != model.CanonicalWebsiteURL(channel.BaseURL) || allowLocal != channel.AllowLocalChannel
	if connectionChanged || allowLocal {
		if _, err := s.validateChannelOutboundURL(baseURL, allowLocal, false, channel.ProxyURL); err != nil {
			return channel, err
		}
	}
	models := uniqueNonEmpty(req.Models)
	modelsJSON, _ := json.Marshal(models)
	headersJSON, err := EncodeOutboundHeadersJSON(req.Headers)
	if err != nil {
		return channel, err
	}
	channel.Name = name
	if req.SortOrder != nil {
		if err := validateChannelSortOrder(*req.SortOrder); err != nil {
			return channel, err
		}
		channel.SortOrder = *req.SortOrder
	}
	channel.BaseURL = baseURL
	channel.AllowLocalChannel = allowLocal
	if req.APIKey != "" {
		channel.APIKey = req.APIKey
	}
	if req.SecretKey != "" {
		channel.SecretKey = req.SecretKey
	}
	// 系统渠道只保存地址与凭证；实际协议和鉴权方式由所选模型决定。
	if req.APIFormat != nil {
		format := strings.ToLower(strings.TrimSpace(*req.APIFormat))
		if format != "openai" && format != "gemini" {
			return channel, BadAuthRequest("目录格式只支持 OpenAI 或 Gemini")
		}
		channel.APIFormat = format
	} else if channel.APIFormat == "" {
		channel.APIFormat = "openai"
	}
	if req.UseGlobalConcurrency != nil && *req.UseGlobalConcurrency {
		channel.ConcurrencyLimit = 0
	} else if req.ConcurrencyLimit != nil {
		if *req.ConcurrencyLimit < minChannelConcurrencyLimit || *req.ConcurrencyLimit > maxChannelConcurrencyLimit {
			return channel, BadAuthRequest("最大并发数必须是 1-999 的整数")
		}
		channel.ConcurrencyLimit = *req.ConcurrencyLimit
	} else if req.UseGlobalConcurrency != nil {
		return channel, BadAuthRequest("请填写渠道最大并发数")
	}
	channel.ModelsJSON = string(modelsJSON)
	channel.HeadersJSON = headersJSON
	if req.Enabled != nil {
		channel.Enabled = *req.Enabled
	}
	return channel, nil
}
func mergeChannelRequest(req ChannelRequest, channel model.ModelChannel) ChannelRequest {
	if req.ProxyURL == nil {
		value := channel.ProxyURL
		req.ProxyURL = &value
	}
	if req.AllowLocalChannel == nil {
		value := channel.AllowLocalChannel
		req.AllowLocalChannel = &value
	}
	if strings.TrimSpace(req.Name) == "" {
		req.Name = channel.Name
	}
	if strings.TrimSpace(req.BaseURL) == "" {
		req.BaseURL = channel.BaseURL
	}
	if req.Models == nil {
		req.Models = channelModelNames(channel)
	}
	if req.Headers == nil {
		req.Headers, _ = ParseOutboundHeadersJSON(channel.HeadersJSON)
	}
	return req
}
func publicChannel(channel model.ModelChannel, admin bool, channelModels []model.ChannelModel) PublicModelChannel {
	models := make([]string, 0, len(channelModels))
	modelCosts := make([]PublicChannelModelPrice, 0, len(channelModels))
	modelCount := len(channelModels)
	enabledModelCount := 0
	var capabilities []string
	if admin {
		for _, capability := range []string{"text", "video", "image", "audio"} {
			for _, item := range channelModels {
				if item.Capability == capability {
					capabilities = append(capabilities, capability)
					break
				}
			}
		}
	}
	for _, item := range channelModels {
		if !item.Enabled {
			continue
		}
		enabledModelCount++
		models = append(models, item.ModelKey)
		if item.Enabled && item.PriceConfigured {
			capabilityConfig, decodeErr := DecodeModelCapabilityConfig(item.CapabilityConfigJSON)
			if decodeErr == nil && capabilityConfig != nil {
				if normalized, normalizeErr := NormalizeModelCapabilityConfigForModel(item.Capability, string(item.Protocol), firstNonEmpty(item.ProviderModelKey, item.ModelKey), capabilityConfig); normalizeErr == nil {
					capabilityConfig = normalized
				}
			}
			modelCosts = append(modelCosts, PublicChannelModelPrice{Model: item.ModelKey, DisplayName: item.DisplayName, ChannelLabel: item.ChannelLabel, Tags: item.Tags, Description: item.Description, Icon: item.Icon, Capability: item.Capability, Protocol: item.Protocol, BillingMode: item.BillingMode, UnitPriceMicrocredits: item.UnitPriceMicrocredits, InputTokenPriceMicrocredits: item.InputTokenPriceMicrocredits, OutputTokenPriceMicrocredits: item.OutputTokenPriceMicrocredits, CachedTokenPriceMicrocredits: item.CachedTokenPriceMicrocredits, CacheWriteTokenPriceMicrocredits: item.CacheWriteTokenPriceMicrocredits, CapabilityConfig: capabilityConfig})
		}
	}
	if len(models) == 0 {
		_ = json.Unmarshal([]byte(channel.ModelsJSON), &models)
		if modelCount == 0 {
			modelCount = len(models)
			enabledModelCount = len(models)
		}
	}
	apiKey := ""
	proxyURL := ""
	if admin {
		proxyURL = channel.ProxyURL
	}
	baseURL := channel.BaseURL
	var headers []OutboundHeader
	if channel.Scope == model.ChannelScopeSystem {
		if !admin {
			apiKey = "system"
			baseURL = "/api/ai/system/" + channel.ID
		}
		if admin {
			headers, _ = ParseOutboundHeadersJSON(channel.HeadersJSON)
		}
	} else if admin {
		apiKey = channel.APIKey
	}
	return PublicModelChannel{
		WebsiteID:         channel.WebsiteID,
		Capabilities:      capabilities,
		ID:                channel.ID,
		UserID:            channel.UserID,
		Scope:             channel.Scope,
		Enabled:           channel.Enabled,
		Name:              channel.Name,
		SortOrder:         channel.SortOrder,
		BaseURL:           baseURL,
		ProxyURL:          proxyURL,
		AllowLocalChannel: admin && channel.AllowLocalChannel,
		APIKey:            apiKey,
		APIFormat:         channel.APIFormat,
		ConcurrencyLimit:  channel.ConcurrencyLimit,
		Models:            models,
		ModelCount:        modelCount,
		EnabledModelCount: enabledModelCount,
		ModelCosts:        modelCosts,
		Headers:           headers,
		HasAPIKey:         strings.TrimSpace(channel.APIKey) != "",
		HasSecretKey:      strings.TrimSpace(channel.SecretKey) != "",
		CatalogProvider:   catalogProviderForAdmin(channel, admin),
		CreatedAt:         channel.CreatedAt,
		UpdatedAt:         channel.UpdatedAt,
	}
}
func uniqueNonEmpty(values []string) []string {
	return kernel.UniqueNonEmpty(values)
}
