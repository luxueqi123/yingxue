package app

import (
	"encoding/json"

	"infinite-canvas/backend/internal/model"
)

// ResolveSystemProxyTextBody maps the authorized public model to the provider
// model for the selected price tier. Authorization and billing keep the original
// body; RawMessage preserves unrelated numbers and provider-specific fields.
func ResolveSystemProxyTextBody(item *model.ChannelModel, contentType string, body []byte) ([]byte, error) {
	if item == nil || normalizeCapability(item.Capability) != "text" {
		return body, nil
	}
	switch item.Protocol {
	case model.ChannelInterfaceOpenAIResponse, model.ChannelInterfaceChatCompletion, model.ChannelInterfaceClaudeAPI:
	default:
		return body, nil
	}
	var payload map[string]json.RawMessage
	if err := json.Unmarshal(body, &payload); err != nil || payload == nil {
		return nil, BadAuthRequest("文本模型请求必须是有效 JSON 对象")
	}
	intent := ModelRequestIntentFromProxyRequest(item.Capability, contentType, body)
	providerKey := firstNonEmpty(item.ProviderModelKey, item.ModelKey)
	if tier := channelModelPriceTierForIntent(*item, intent); tier != nil {
		providerKey = firstNonEmpty(tier.ProviderModelKey, providerKey)
	}
	if providerKey == "" {
		return nil, BadAuthRequest("文本模型缺少供应商模型映射")
	}
	encoded, err := json.Marshal(providerKey)
	if err != nil {
		return nil, err
	}
	payload["model"] = encoded
	return json.Marshal(payload)
}
