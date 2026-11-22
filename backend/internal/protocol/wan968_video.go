package protocol

import (
	"fmt"
	"net/http"
	"net/url"
	"strings"
)

// The 968 canvas uses plural videos/generations and typed reference URL arrays.
func wan968VideoAdapter() Adapter {
	info := metadata("wan968-video", "968 万相视频", "968", CapabilityVideo, "POST /v1/videos/generations", "GET /v1/videos/generations/{request_id}", "application/json")
	info.Parameters = videoParams()
	info.RequiresPublicMediaURLs = true
	return builtinAdapter{info: info, parseCreate: parseAsyncCreate,
		create: func(r GenerationRequest) (RequestSpec, error) {
			if r.Duration < 4 || r.Duration > 30 {
				return RequestSpec{}, fmt.Errorf("万相视频生成时长必须在4至30秒之间")
			}
			if r.Model != "wan3.0-image" && r.Model != "wan3.0-video" {
				return RequestSpec{}, fmt.Errorf("不支持的968万相模型")
			}
			resolution := strings.ToLower(r.Resolution)
			if resolution != "480p" && resolution != "720p" && resolution != "1080p" {
				return RequestSpec{}, fmt.Errorf("请选择480P、720P或1080P")
			}
			body := map[string]any{"model": r.Model, "prompt": r.Prompt, "duration": r.Duration, "resolution": resolution, "aspect_ratio": r.AspectRatio, "face_split": false, "videoGenerateAudio": r.GenerateAudio, "video_refs": mediaValues(r.Videos), "audio_refs": mediaValues(r.Audios)}
			images := mediaValues(r.Images)
			if len(images) == 1 {
				body["image"] = map[string]any{"url": images[0]}
			} else if len(images) > 1 {
				refs := make([]map[string]any, 0, len(images))
				for _, image := range images {
					refs = append(refs, map[string]any{"url": image})
				}
				body["images"] = refs
			}
			return jsonSpec(http.MethodPost, "/v1/videos/generations", body), nil
		},
		poll: func(c PollContext) (RequestSpec, error) {
			return RequestSpec{Method: http.MethodGet, Path: "/v1/videos/generations/" + url.PathEscape(c.TaskID)}, nil
		},
		parsePoll: func(c PollContext, p map[string]any) (PollResult, error) {
			status, _ := p["status"].(string)
			switch status {
			case "done":
				video, _ := p["video"].(map[string]any)
				value, _ := video["url"].(string)
				if strings.TrimSpace(value) == "" {
					return PollResult{}, fmt.Errorf("万相任务完成但未返回视频地址")
				}
				return PollResult{TaskID: c.TaskID, Status: StatusSucceeded, Result: &Result{Videos: []MediaReference{{URL: value, Kind: "video"}}}}, nil
			case "failed", "expired":
				message := "万相视频生成失败"
				if detail, ok := p["error"].(map[string]any); ok {
					if text, ok := detail["message"].(string); ok && text != "" {
						message = text
					}
				}
				return PollResult{TaskID: c.TaskID, Status: StatusFailed, Message: message}, nil
			default:
				return PollResult{TaskID: c.TaskID, Status: StatusPending}, nil
			}
		},
	}
}
