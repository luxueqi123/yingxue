package protocol

import (
	"fmt"
	"slices"
	"strconv"
	"strings"
)

// AutoDLH3Workflow 是 AutoDL 公开 ComfyUI 目录中 MiniMax H3 工作流的稳定合同。
// 这里仅描述宿主需要校验和映射的能力；价格始终以渠道实际账单为准。
type AutoDLH3Workflow struct {
	ID          string
	Label       string
	MinImages   int
	MaxImages   int
	MaxAudios   int
	MaxSecond   int
	Resolutions []string
	Ratios      []string
}

var autoDLH3Workflows = []AutoDLH3Workflow{
	{ID: "minimax_h3_lightx2v_no_pic", Label: "H3 文生视频", MaxSecond: 15, Resolutions: []string{"480p", "768p"}, Ratios: []string{"9:16", "16:9", "1:1"}},
	{ID: "minimax_h3_lightx2v", Label: "H3 首尾帧生成视频", MinImages: 2, MaxImages: 2, MaxSecond: 15, Resolutions: []string{"480p", "768p"}, Ratios: []string{"9:16", "16:9"}},
	{ID: "minimax_h3_lightx2v_v5", Label: "H3 多图参考生视频", MinImages: 1, MaxImages: 9, MaxSecond: 10, Resolutions: []string{"480p", "768p", "1080p"}, Ratios: []string{"9:16", "16:9", "1:1"}},
	{ID: "minimax_h3_lightx2v_v5_15s", Label: "H3 多图生视频 15 秒", MinImages: 1, MaxImages: 9, MaxSecond: 15, Resolutions: []string{"480p", "768p"}, Ratios: []string{"9:16", "16:9", "1:1"}},
	{ID: "minimax_h3_image_audio_to_video", Label: "H3 图生视频-音频同步", MinImages: 1, MaxImages: 1, MaxAudios: 1, MaxSecond: 15, Resolutions: []string{"480p", "768p", "1080p"}, Ratios: []string{"9:16", "16:9"}},
	{ID: "minimax_h3_image_audio_to_video_v2", Label: "H3 多图多音频生视频", MaxImages: 9, MaxAudios: 3, MaxSecond: 10, Resolutions: []string{"480p", "768p", "1080p"}, Ratios: []string{"9:16", "16:9"}},
	{ID: "minimax_h3_image_audio_to_video_v2_15s", Label: "H3 多图多音频生视频 15 秒", MaxImages: 9, MaxAudios: 3, MaxSecond: 15, Resolutions: []string{"480p", "768p"}, Ratios: []string{"9:16", "16:9"}},
}

func AutoDLH3Workflows() []AutoDLH3Workflow {
	result := make([]AutoDLH3Workflow, len(autoDLH3Workflows))
	copy(result, autoDLH3Workflows)
	return result
}

func AutoDLH3WorkflowByID(id string) (AutoDLH3Workflow, bool) {
	key := strings.TrimSpace(id)
	for _, item := range autoDLH3Workflows {
		if item.ID == key {
			return item, true
		}
	}
	return AutoDLH3Workflow{}, false
}

func autoDLH3CreateFields(workflowID string, request GenerationRequest) (map[string]any, error) {
	workflow, ok := AutoDLH3WorkflowByID(workflowID)
	if !ok {
		return nil, fmt.Errorf("AutoDL H3 不支持工作流 %s", workflowID)
	}
	if request.Duration < 1 || request.Duration > workflow.MaxSecond {
		return nil, fmt.Errorf("%s 支持 1-%d 秒视频", workflow.Label, workflow.MaxSecond)
	}
	if len(request.Images) < workflow.MinImages || len(request.Images) > workflow.MaxImages {
		return nil, fmt.Errorf("%s 需要 %d-%d 张参考图", workflow.Label, workflow.MinImages, workflow.MaxImages)
	}
	if len(request.Audios) > workflow.MaxAudios {
		return nil, fmt.Errorf("%s 最多支持 %d 段参考音频", workflow.Label, workflow.MaxAudios)
	}
	resolution, err := autoDLH3Resolution(workflow, request.Resolution, request.AspectRatio)
	if err != nil {
		return nil, err
	}
	body := map[string]any{"resolution": resolution}
	if workflowID != "minimax_h3_image_audio_to_video" {
		if strings.TrimSpace(request.Prompt) == "" {
			return nil, fmt.Errorf("%s 需要视频生成提示词", workflow.Label)
		}
		body["prompt"] = strings.TrimSpace(request.Prompt)
		body["duration"] = request.Duration
	}
	switch workflowID {
	case "minimax_h3_lightx2v":
		body["first_frame"] = mediaValue(request.Images[0])
		body["last_frame"] = mediaValue(request.Images[1])
	case "minimax_h3_image_audio_to_video":
		if len(request.Audios) != 1 {
			return nil, fmt.Errorf("%s 需要 1 段参考音频", workflow.Label)
		}
		body["ref_image_0"] = mediaValue(request.Images[0])
		body["ref_audio_0"] = mediaValue(request.Audios[0])
		body["audio_duration"] = request.Duration
	default:
		for index, item := range request.Images {
			body["ref_image_"+strconv.Itoa(index)] = mediaValue(item)
		}
		for index, item := range request.Audios {
			body["ref_audio_"+strconv.Itoa(index)] = mediaValue(item)
		}
	}
	if seed, ok := request.Extra["seed"]; ok && seed != nil && workflowID != "minimax_h3_lightx2v_no_pic" && workflowID != "minimax_h3_lightx2v" && workflowID != "minimax_h3_image_audio_to_video" {
		body["seed"] = seed
	}
	return body, nil
}

func autoDLH3Resolution(workflow AutoDLH3Workflow, resolution, ratio string) (string, error) {
	tier := strings.ToLower(strings.TrimSpace(resolution))
	switch tier {
	case "":
		tier = "768p"
	case "480", "low":
		tier = "480p"
	case "768":
		tier = "768p"
	case "1080":
		tier = "1080p"
	}
	if !slices.Contains(workflow.Resolutions, tier) {
		return "", fmt.Errorf("%s 不支持分辨率 %q，支持 %s", workflow.Label, resolution, strings.Join(workflow.Resolutions, "/"))
	}
	aspectRatio := strings.TrimSpace(ratio)
	if aspectRatio == "" {
		aspectRatio = "16:9"
	}
	// Only omitted dimensions use defaults; explicit source dimensions must not be approximated.
	if !slices.Contains(workflow.Ratios, aspectRatio) {
		return "", fmt.Errorf("%s 不支持画幅 %q，支持 %s", workflow.Label, ratio, strings.Join(workflow.Ratios, "/"))
	}
	switch aspectRatio {
	case "1:1":
		return tier + "(1:1)", nil
	case "9:16":
		return tier + "竖", nil
	default:
		return tier + "横", nil
	}
}
