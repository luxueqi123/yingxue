package service

import (
	"bytes"
	"encoding/json"
	"io"
	"mime"
	"mime/multipart"
	"strconv"
	"strings"
)

// ModelRequestIntentFromProxyRequest 从系统代理的 JSON 或 multipart 请求中
// 提取计费相关规格。它只读取公开请求字段，不读取或记录密钥、Cookie 等鉴权信息。
// 解析失败时返回能力本身，后续价格档匹配会拒绝无法确定规格的多档模型，避免误扣。
func ModelRequestIntentFromProxyRequest(capability string, contentType string, body []byte) ModelRequestIntent {
	intent := ModelRequestIntent{Capability: normalizeCapability(capability), Inputs: map[string]int{}, Options: map[string]any{}}
	if mediaType, params, err := mime.ParseMediaType(contentType); err == nil && strings.HasPrefix(mediaType, "multipart/") && params["boundary"] != "" {
		readMultipartProxyIntent(&intent, body, params["boundary"])
		return intent
	}
	var payload map[string]any
	if json.Unmarshal(body, &payload) == nil {
		applyProxyPayloadIntent(&intent, payload)
	}
	return intent
}

func readMultipartProxyIntent(intent *ModelRequestIntent, body []byte, boundary string) {
	reader := multipart.NewReader(bytes.NewReader(body), boundary)
	for {
		part, err := reader.NextPart()
		if err != nil {
			return
		}
		name := strings.TrimSpace(part.FormName())
		fileName := part.FileName()
		value, readErr := io.ReadAll(io.LimitReader(part, 4096))
		_ = part.Close()
		if readErr != nil {
			continue
		}
		if fileName != "" {
			addProxyInputCount(intent, name)
			continue
		}
		applyProxyIntentField(intent, name, string(value))
	}
}

func applyProxyPayloadIntent(intent *ModelRequestIntent, payload map[string]any) {
	// 常见供应商请求会把参数放在 input/parameters 下；递归查找只取白名单键。
	for _, key := range []string{"operation"} {
		if value, ok := findProxyPayloadValue(payload, key); ok {
			applyProxyIntentField(intent, key, value)
		}
	}
	for _, key := range []string{"vquality", "resolution", "videoQuality", "video_quality", "videoSeconds", "seconds", "duration", "durationSeconds", "size", "aspectRatio", "aspect_ratio", "count"} {
		if value, ok := findProxyPayloadValue(payload, key); ok {
			applyProxyIntentField(intent, key, value)
		}
	}
	for _, key := range []string{"referenceImages", "reference_images", "images", "image_urls", "imageUrls"} {
		if value, ok := findProxyPayloadValue(payload, key); ok {
			addProxyArrayCount(intent, "image", value)
		}
	}
	for _, key := range []string{"referenceVideos", "reference_videos", "videos", "video_urls", "videoUrls"} {
		if value, ok := findProxyPayloadValue(payload, key); ok {
			addProxyArrayCount(intent, "video", value)
		}
	}
	for _, key := range []string{"referenceAudios", "reference_audios", "audios", "audio_urls", "audioUrls"} {
		if value, ok := findProxyPayloadValue(payload, key); ok {
			addProxyArrayCount(intent, "audio", value)
		}
	}
}

func findProxyPayloadValue(payload map[string]any, wanted string) (any, bool) {
	if value, ok := payload[wanted]; ok {
		return value, true
	}
	for _, nestedKey := range []string{"input", "parameters", "request", "data"} {
		nested, ok := payload[nestedKey].(map[string]any)
		if !ok {
			continue
		}
		if value, found := findProxyPayloadValue(nested, wanted); found {
			return value, true
		}
	}
	return nil, false
}

func applyProxyIntentField(intent *ModelRequestIntent, rawName string, rawValue any) {
	name := strings.ToLower(strings.TrimSpace(rawName))
	switch name {
	case "resolution", "vquality", "videoquality", "video_quality":
		name = "vquality"
	case "duration", "seconds", "videoseconds", "durationseconds":
		name = "videoSeconds"
	case "aspectratio", "aspect_ratio":
		name = "size"
	case "imagecount":
		name = "imageCount"
	default:
		name = canonicalCapabilityOptionName(strings.TrimSpace(rawName))
	}
	value := strings.TrimSpace(toProxyIntentString(rawValue))
	if value == "" {
		return
	}
	switch name {
	case "operation":
		intent.Operation = strings.ToLower(value)
	case "vquality", "size", "videoSeconds", "count":
		intent.Options[name] = normalizeModelRequestOption(name, value)
	case "imageCount":
		count, err := strconv.Atoi(value)
		if err == nil && count > 0 {
			intent.Inputs["image"] = maxInt(intent.Inputs["image"], count)
		}
	}
}

func addProxyInputCount(intent *ModelRequestIntent, fieldName string) {
	name := strings.ToLower(strings.TrimSpace(fieldName))
	switch {
	case strings.Contains(name, "image"):
		intent.Inputs["image"]++
	case strings.Contains(name, "video"):
		intent.Inputs["video"]++
	case strings.Contains(name, "audio"):
		intent.Inputs["audio"]++
	}
}

func addProxyArrayCount(intent *ModelRequestIntent, kind string, value any) {
	switch typed := value.(type) {
	case []any:
		if len(typed) > 0 {
			intent.Inputs[kind] = maxInt(intent.Inputs[kind], len(typed))
		}
	case string:
		if strings.TrimSpace(typed) != "" {
			intent.Inputs[kind] = maxInt(intent.Inputs[kind], 1)
		}
	}
}

func toProxyIntentString(value any) string {
	switch typed := value.(type) {
	case string:
		return typed
	case json.Number:
		return typed.String()
	case float64:
		return strconv.FormatFloat(typed, 'f', -1, 64)
	case float32:
		return strconv.FormatFloat(float64(typed), 'f', -1, 32)
	case int:
		return strconv.Itoa(typed)
	case int64:
		return strconv.FormatInt(typed, 10)
	default:
		return ""
	}
}

func maxInt(left int, right int) int {
	if left > right {
		return left
	}
	return right
}
