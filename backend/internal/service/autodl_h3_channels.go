package service

import (
	"encoding/json"
	"net/url"
	"strconv"
	"strings"

	"infinite-canvas/backend/internal/model"
	"infinite-canvas/backend/internal/protocol"
)

func isAutoDLH3Channel(channel model.ModelChannel, items []model.ChannelModel) bool {
	if !isAutoDLBaseURL(channel.BaseURL) {
		return false
	}
	for _, item := range items {
		if item.Protocol == model.ChannelInterfaceAutoDLH3Video {
			return true
		}
		if _, ok := protocol.AutoDLH3WorkflowByID(item.ModelKey); ok {
			return true
		}
	}
	for _, name := range channelModelNames(channel) {
		if _, ok := protocol.AutoDLH3WorkflowByID(name); ok {
			return true
		}
	}
	return false
}

func isAutoDLBaseURL(baseURL string) bool {
	parsed, err := url.Parse(strings.TrimSpace(baseURL))
	return err == nil && strings.EqualFold(parsed.Hostname(), "autodl.art")
}

func autoDLH3Protocol(items []model.ChannelModel) model.ChannelInterfaceType {
	for _, item := range items {
		if item.Protocol == model.ChannelInterfaceAutoDLH3Video {
			return model.ChannelInterfaceAutoDLH3Video
		}
	}
	// 已上传的旧插件不能在服务重启时自动替换为新包；新增 H3 工作流固定使用
	// 宿主内置协议，避免旧插件把首尾帧或音频工作流错误映射为通用多图请求。
	return model.ChannelInterfaceAutoDLH3Video
}

func autoDLH3Catalog() []ChannelModelCatalogItem {
	workflows := protocol.AutoDLH3Workflows()
	items := make([]ChannelModelCatalogItem, 0, len(workflows))
	for _, workflow := range workflows {
		items = append(items, ChannelModelCatalogItem{
			ID:          workflow.ID,
			DisplayName: workflow.Label,
			ModelType:   "video",
			DefaultParameters: ChannelModelCatalogDefaultParameters{
				AspectRatio:     "9:16",
				DurationSeconds: "5",
				Resolution:      "768p",
			},
			Options: ChannelModelCatalogOptions{
				AspectRatio:     stringOptions(workflow.Ratios),
				DurationSeconds: rangeOptions(workflow.MaxSecond),
				Resolution:      stringOptions(workflow.Resolutions),
			},
			MinImages: func() *int { value := workflow.MinImages; return &value }(),
			MaxImages: func() *int { value := workflow.MaxImages; return &value }(),
		})
	}
	return items
}

func stringOptions(values []string) []ChannelModelCatalogOption {
	items := make([]ChannelModelCatalogOption, 0, len(values))
	for _, value := range values {
		items = append(items, ChannelModelCatalogOption{Value: value, Label: value})
	}
	return items
}

func rangeOptions(max int) []ChannelModelCatalogOption {
	items := make([]ChannelModelCatalogOption, 0, max)
	for value := 1; value <= max; value++ {
		text := strconv.Itoa(value)
		items = append(items, ChannelModelCatalogOption{Value: text, Label: text + " 秒"})
	}
	return items
}

func (s *Service) syncAutoDLH3ChannelModels(channel *model.ModelChannel, existing []model.ChannelModel) error {
	if channel == nil || !isAutoDLH3Channel(*channel, existing) {
		return nil
	}
	known := make(map[string]struct{}, len(existing))
	for _, item := range existing {
		known[channelModelCatalogKey(item.ModelKey)] = struct{}{}
	}
	protocolID := autoDLH3Protocol(existing)
	for _, workflow := range protocol.AutoDLH3Workflows() {
		if _, exists := known[channelModelCatalogKey(workflow.ID)]; exists {
			continue
		}
		item, err := s.newAutoDLH3ChannelModel(channel.ID, workflow, protocolID)
		if err != nil {
			return err
		}
		if err := s.repo.SaveChannelModel(&item); err != nil {
			return err
		}
	}
	return nil
}

func (s *Service) newAutoDLH3ChannelModel(channelID string, workflow protocol.AutoDLH3Workflow, protocolID model.ChannelInterfaceType) (model.ChannelModel, error) {
	modelID, err := s.repo.NextPrefixedID("MODEL")
	if err != nil {
		return model.ChannelModel{}, err
	}
	capability := DefaultModelCapabilityConfigForModel(string(model.ChannelInterfaceAutoDLH3Video), workflow.ID)
	encoded, err := json.Marshal(capability)
	if err != nil {
		return model.ChannelModel{}, err
	}
	return model.ChannelModel{
		ID:                   modelID,
		ChannelID:            channelID,
		ModelKey:             workflow.ID,
		ProviderModelKey:     workflow.ID,
		DisplayName:          workflow.Label,
		Capability:           "video",
		Protocol:             protocolID,
		BillingMode:          "fixed_request",
		Enabled:              false,
		PriceConfigured:      false,
		PriceVersion:         1,
		CapabilityVersion:    1,
		CapabilityConfigJSON: string(encoded),
	}, nil
}
