package protocol

import (
	"fmt"
	"net/http"
	"net/url"
	"strings"
)

// CTMO returns authenticated content endpoints; never trust a provider result URL
// to carry our credentials or expose it directly to the browser.
func ctmoVideoAdapter() Adapter {
	info := metadata("ctmo-video", "靠谱 API 视频", "CTMO", CapabilityVideo, "POST /v1/videos", "GET /v1/videos/{task_id}", "application/json")
	info.Parameters = videoParams()
	return builtinAdapter{info: info, parseCreate: parseAsyncCreate,
		create: func(r GenerationRequest) (RequestSpec, error) {
			if r.Duration <= 0 {
				return RequestSpec{}, fmt.Errorf("视频时长必须大于零")
			}
			if strings.HasPrefix(r.Model, "seedance-2-pro-") && len(r.Audios) > 0 && len(r.Images) == 0 {
				return RequestSpec{}, fmt.Errorf("该渠道的参考音频必须同时提供参考图片")
			}
			prompt := r.Prompt
			if r.Model == "seedance2.0-svip-900-720p" {
				if r.Duration != 10 && r.Duration != 15 {
					return RequestSpec{}, fmt.Errorf("此规格仅支持 10 秒或 15 秒")
				}
				prompt += fmt.Sprintf("\n视频时长：%d秒。", r.Duration)
			}
			body := map[string]any{"model": r.Model, "prompt": prompt, "seconds": r.Duration, "aspect_ratio": r.AspectRatio}
			if len(r.Images) > 0 {
				body["images"] = mediaValues(r.Images)
			}
			if len(r.Videos) > 0 {
				body["videos"] = mediaValues(r.Videos)
			}
			if len(r.Audios) > 0 {
				body["audios"] = mediaValues(r.Audios)
			}
			return jsonSpec(http.MethodPost, "/v1/videos", body), nil
		},
		poll: func(c PollContext) (RequestSpec, error) {
			return RequestSpec{Method: http.MethodGet, Path: "/v1/videos/" + url.PathEscape(c.TaskID)}, nil
		},
		parsePoll: func(c PollContext, p map[string]any) (PollResult, error) {
			state, err := parseAsyncMediaPoll(c, p, CapabilityVideo)
			if err == nil && state.Status == StatusSucceeded {
				base, parseErr := url.Parse(c.BaseURL)
				if parseErr != nil {
					return PollResult{}, parseErr
				}
				base.Path = "/v1/videos/" + url.PathEscape(c.TaskID) + "/content"
				base.RawPath = ""
				base.RawQuery = ""
				base.Fragment = ""
				state.Result = &Result{Videos: []MediaReference{{URL: base.String(), Kind: "video"}}}
			}
			return state, err
		},
	}
}
