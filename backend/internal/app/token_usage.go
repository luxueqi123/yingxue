package app

import "encoding/json"

// maxExactUsageInteger 是 JSON number 能无歧义表示的上限（2^53-1）；超过它的计数
// 在解码成 float64 时已经失真，必须视为畸形而不是权威用量。
const maxExactUsageInteger = 9007199254740991

// A malformed or missing count must not silently become an authoritative zero.
func strictUsageInteger(raw any) (int64, bool) {
	switch value := raw.(type) {
	case float64:
		if value < 0 || value > maxExactUsageInteger {
			return 0, false
		}
		parsed := int64(value)
		return parsed, float64(parsed) == value
	case int64:
		return value, value >= 0 && value <= maxExactUsageInteger
	case json.Number:
		parsed, err := value.Int64()
		return parsed, err == nil && parsed >= 0 && parsed <= maxExactUsageInteger
	}
	return 0, false
}
