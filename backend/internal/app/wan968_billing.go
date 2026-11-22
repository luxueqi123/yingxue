package app

import "fmt"

// Keep reference-video charging on the server for quotes and billing orders.
// Duration metadata is mandatory; missing data must never become free input.
func wan968Charge(mode string, price, seconds, multiplier int64, intent *ModelRequestIntent) (int64, error) {
	if intent == nil {
		return 0, fmt.Errorf("万相计费缺少参考素材信息")
	}
	count := intent.Inputs["video"]
	if count < 0 {
		return 0, fmt.Errorf("参考视频数量无效")
	}
	if mode == "fixed_request" {
		if seconds < 4 || seconds > 30 {
			return 0, fmt.Errorf("万相按次仅支持4至30秒")
		}
		quantity := int64(1)
		if count > 0 {
			quantity = 2
		}
		return creditAmount(price, quantity, multiplier)
	}
	if mode != "per_second" || seconds < 4 || seconds > 15 {
		return 0, fmt.Errorf("万相按秒仅支持4至15秒")
	}
	if count != len(intent.ReferenceVideoDurationsMs) {
		return 0, fmt.Errorf("无法确认参考视频时长，请重新添加素材")
	}
	ms := seconds * 1000
	for _, duration := range intent.ReferenceVideoDurationsMs {
		if duration <= 0 || duration > 3600000 || ms > 3600000-duration {
			return 0, fmt.Errorf("参考视频时长无效")
		}
		ms += duration
	}
	amount, err := creditAmount(price, ms, multiplier)
	if err != nil {
		return 0, err
	}
	rounded := amount / 1000
	if amount%1000 != 0 {
		rounded++
	}
	return rounded, nil
}
