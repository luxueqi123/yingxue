package app

import (
	"encoding/json"
	"fmt"
	"strings"
)

type storyboardExecutionOptions struct {
	maxShots          int
	preserveDurations bool
}

type storyboardVideoReference struct {
	VideoIndex int     `json:"videoIndex"`
	StartTime  float64 `json:"startTime"`
	EndTime    float64 `json:"endTime"`
}

type storyboardDetectedCharacter struct {
	Name                string `json:"name"`
	Description         string `json:"description"`
	ReferenceImageIndex *int   `json:"referenceImageIndex"`
}

func importedStoryboardCharacters(shot agentStoryboardShot, input agentStoryboardInput) []map[string]any {
	characters := storyboardRowCharacters(shot, input.Characters)
	byName := make(map[string]map[string]any, len(characters))
	for _, character := range characters {
		byName[normalizeStoryboardCharacterName(fmt.Sprint(character["characterName"]))] = character
	}
	for _, detected := range shot.DetectedCharacters {
		key := normalizeStoryboardCharacterName(detected.Name)
		character, exists := byName[key]
		if !exists {
			character = map[string]any{"characterName": detected.Name}
			characters = append(characters, character)
			byName[key] = character
		}
		character["characterDescription"] = detected.Description
		if detected.ReferenceImageIndex != nil {
			character["characterImageNodeId"] = input.ReferenceImages[*detected.ReferenceImageIndex].ID
		}
	}
	return characters
}

func requiresStoryboardVideoReference(input agentStoryboardInput) bool {
	if !input.ImportedStoryboard || len(input.ReferenceVideos) == 0 {
		return false
	}
	for _, column := range input.SourceColumns {
		if column.Field == "video_reference" {
			return true
		}
	}
	return false
}

func storyboardOptions(input agentStoryboardInput) (storyboardExecutionOptions, error) {
	options := storyboardExecutionOptions{maxShots: maxStoryboardShots}
	if !input.ImportedStoryboard {
		if input.ShotLimit != 0 || len(input.SourceColumns) != 0 {
			return options, fmt.Errorf("分镜扩展参数需要导入工程合同")
		}
		return options, nil
	}
	if input.ShotLimit < 1 || input.ShotLimit > 512 {
		return options, fmt.Errorf("导入分镜的镜头上限必须为1到512")
	}
	options.maxShots = input.ShotLimit
	options.preserveDurations = true
	return options, nil
}

func storyboardTaskOutputTokenLimit(input agentStoryboardInput, shotCount int) int {
	if !input.ImportedStoryboard {
		return storyboardOutputTokenLimit(shotCount)
	}
	count := input.ShotLimit
	if shotCount > 0 {
		count = shotCount
	}
	return min(64000, 2000+count*800)
}

func importedStoryboardRequirements(input agentStoryboardInput) (string, error) {
	if !input.ImportedStoryboard {
		return input.Requirements, nil
	}
	fields := map[string]string{
		"shot_number": "shots数组顺序", "duration_seconds": "durationSeconds", "plot_description": "description",
		"shot_size": "shotSize", "character_action": "performanceBlocking", "emotion": "emotion", "scene_tags": "sceneTags",
		"prop_tags": "propTags", "lighting_and_atmosphere": "lightingAndAtmosphere", "audio_effects": "audioEffects",
		"dialogue": "dialogue", "image_generation_prompt": "visualPrompt", "video_motion_prompt": "videoPrompt",
		"characters": "characters人物信息与characterIds已有角色版本", "video_reference": "根据实际输入参考理解镜头，不编造参考帧地址",
	}
	if len(input.SourceColumns) > len(fields) {
		return "", fmt.Errorf("导入分镜列数量不合法")
	}
	lines := []string{input.Requirements, "保留导入工程的分镜字段语义；每个shot额外返回字符串sceneTags和propTags，无对应内容时为空字符串。"}
	lines = append(lines, fmt.Sprintf("每个shot还必须返回characters数组，无人物时为[]。每个人物为{name,description,referenceImageIndex}，名称及外观描述应来自剧情或实际参考；不能编造资产ID或图片URL。已有角色仍通过characterIds引用其真实版本。referenceImageIndex只在确有对应输入图片时填入从0开始的图片序号（本次%d张图片），否则明确填null。人物预览图本身不自动成为生成引用。", len(input.ReferenceImages)))
	if requiresStoryboardVideoReference(input) {
		lines = append(lines, fmt.Sprintf("每个shot必须返回videoReference：有原片对应片段时返回{videoIndex,startTime,endTime}，无法对应时明确返回null。videoIndex按输入视频顺序从0开始，范围0到%d；时间单位为秒，允许小数，0<=startTime<=endTime，必须来自实际视频。不要返回图片地址，参考帧将从原视频实际提取。", len(input.ReferenceVideos)-1))
	}
	seen := map[string]bool{}
	for _, column := range input.SourceColumns {
		target, ok := fields[column.Field]
		if !ok || seen[column.Field] || len(column.Label) > 300 || len(column.Description) > 6000 {
			return "", fmt.Errorf("导入分镜列未完整映射：%s", column.Field)
		}
		seen[column.Field] = true
		lines = append(lines, fmt.Sprintf("%s -> %s：%s", column.Label, target, column.Description))
	}
	return strings.Join(lines, "\n"), nil
}

func parseStoryboardPlanForInput(raw string, input agentStoryboardInput, options storyboardExecutionOptions) (agentStoryboardPlan, error) {
	if !input.ImportedStoryboard {
		return parseAgentStoryboardPlan(raw)
	}
	plan, err := parseAgentStoryboardPlanWithLimit(raw, options.maxShots)
	if err != nil || !input.ImportedStoryboard {
		return plan, err
	}
	text, err := extractJSONText(raw)
	if err != nil {
		return plan, err
	}
	var root struct {
		Shots []map[string]json.RawMessage `json:"shots"`
	}
	if err := json.Unmarshal([]byte(normalizeStoryboardRootJSON(text)), &root); err != nil {
		return plan, err
	}
	for index, shot := range root.Shots {
		plan.Shots[index].PreserveSourceDetail = true
		if len(shot["characters"]) == 0 || string(shot["characters"]) == "null" {
			return plan, fmt.Errorf("镜头%d缺少characters数组", index+1)
		}
		if len(plan.Shots[index].DetectedCharacters) > 32 {
			return plan, fmt.Errorf("镜头%d人物数量超出单镜容量", index+1)
		}
		var rawCharacters []map[string]json.RawMessage
		if err := json.Unmarshal(shot["characters"], &rawCharacters); err != nil {
			return plan, err
		}
		seenCharacters := map[string]bool{}
		for ci, character := range plan.Shots[index].DetectedCharacters {
			key := normalizeStoryboardCharacterName(character.Name)
			fields := rawCharacters[ci]
			if key == "" || len(character.Name) > 300 || len(character.Description) > 6000 || seenCharacters[key] || len(fields) != 3 || len(fields["description"]) == 0 || string(fields["description"]) == "null" || len(fields["referenceImageIndex"]) == 0 {
				return plan, fmt.Errorf("镜头%d人物信息缺失、重复或含未知字段", index+1)
			}
			seenCharacters[key] = true
			if ref := character.ReferenceImageIndex; ref != nil && (*ref < 0 || *ref >= len(input.ReferenceImages) || strings.TrimSpace(input.ReferenceImages[*ref].ID) == "") {
				return plan, fmt.Errorf("镜头%d人物预览没有对应的实际图片引用", index+1)
			}
		}
		if requiresStoryboardVideoReference(input) && len(shot["videoReference"]) == 0 {
			return plan, fmt.Errorf("镜头%d缺少videoReference或显式null", index+1)
		}
		if ref := plan.Shots[index].VideoReference; ref != nil {
			var fields map[string]json.RawMessage
			if err := json.Unmarshal(shot["videoReference"], &fields); err != nil {
				return plan, err
			}
			if len(fields) != 3 || len(fields["videoIndex"]) == 0 || len(fields["startTime"]) == 0 || len(fields["endTime"]) == 0 || string(fields["videoIndex"]) == "null" || string(fields["startTime"]) == "null" || string(fields["endTime"]) == "null" {
				return plan, fmt.Errorf("镜头%d原片参考字段不完整", index+1)
			}
			if ref.VideoIndex < 0 || ref.VideoIndex >= len(input.ReferenceVideos) || ref.StartTime < 0 || ref.EndTime < ref.StartTime {
				return plan, fmt.Errorf("镜头%d原片编号或时间范围无效", index+1)
			}
		}
		for _, field := range []string{"sceneTags", "propTags"} {
			var value string
			if len(shot[field]) == 0 || string(shot[field]) == "null" || json.Unmarshal(shot[field], &value) != nil {
				return plan, fmt.Errorf("镜头%d缺少字符串字段%s", index+1, field)
			}
		}
	}
	return plan, nil
}
