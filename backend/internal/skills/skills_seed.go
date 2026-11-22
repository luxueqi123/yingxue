package skills

import (
	_ "embed"
	"encoding/json"
	"fmt"
	"strings"
	"sync"
	"time"

	"infinite-canvas/backend/internal/model"
)

//go:embed seed/production-skills.json
var productionSkillsJSON []byte

type seedShowcaseMedia struct {
	Type        string `json:"type"`
	ShowcaseURI string `json:"showcase_uri"`
	ShowcaseURL string `json:"showcase_url"`
}

type seedEffectiveUser struct {
	Name      string `json:"name"`
	AvatarURL string `json:"avatar_url"`
	UID       string `json:"uid"`
}

type builtinSkillDefinition struct {
	SkillID       string              `json:"skill_id"`
	SkillName     string              `json:"skill_name"`
	Description   string              `json:"description"`
	Instruction   string              `json:"instruction"`
	Status        int                 `json:"status"`
	MarkdownURL   string              `json:"markdown_url"`
	CreateTime    int64               `json:"create_time"`
	UpdateTime    int64               `json:"update_time"`
	Source        int                 `json:"source"`
	Tag           string              `json:"tag"`
	SortWeight    int                 `json:"sort_weight"`
	IsPrivate     bool                `json:"is_private"`
	LikeCount     int64               `json:"like_count"`
	OwnerUID      string              `json:"owner_uid"`
	EffectiveUser seedEffectiveUser   `json:"effective_user"`
	ShowcaseMedia []seedShowcaseMedia `json:"showcase_media"`
	AddedCount    int64               `json:"added_count"`
	ExtraInfo     string              `json:"extra_info"`
	Files         []SkillResourceFile `json:"files,omitempty"`
}

var productionSkillFiles = sync.OnceValue(func() map[string][]SkillResourceFile {
	var definitions []builtinSkillDefinition
	if json.Unmarshal(productionSkillsJSON, &definitions) != nil {
		return nil
	}
	files := make(map[string][]SkillResourceFile, len(definitions))
	for _, definition := range definitions {
		files[definition.SkillID] = definition.Files
	}
	return files
})

// Production packages use the same archive/version owner as upstream Markdown skills.
func loadProductionSkillPackages() ([]builtinSkillPackage, error) {
	var definitions []builtinSkillDefinition
	if err := json.Unmarshal(productionSkillsJSON, &definitions); err != nil {
		return nil, fmt.Errorf("解析制作技能库失败: %w", err)
	}
	seen := make(map[string]struct{}, len(definitions))
	skills := make([]model.Skill, 0, len(definitions))
	for _, definition := range definitions {
		id := strings.TrimSpace(definition.SkillID)
		ownerID := strings.TrimSpace(definition.OwnerUID)
		if id == "" || len(id) > 36 || ownerID == "" || len(ownerID) > 36 {
			return nil, fmt.Errorf("内置技能 ID 或作者 ID 无效: %q", definition.SkillID)
		}
		if _, exists := seen[id]; exists {
			return nil, fmt.Errorf("内置技能 ID 重复: %s", id)
		}
		seen[id] = struct{}{}
		if definition.Status != skillStatusEnabled || definition.IsPrivate {
			return nil, fmt.Errorf("内置技能必须为公开启用状态: %s", id)
		}
		if definition.CreateTime <= 0 || definition.UpdateTime <= 0 || definition.LikeCount < 0 || definition.AddedCount < 0 {
			return nil, fmt.Errorf("内置技能时间或计数无效: %s", id)
		}
		authorName := strings.TrimSpace(definition.EffectiveUser.Name)
		authorAvatarURL := strings.TrimSpace(definition.EffectiveUser.AvatarURL)
		if authorName == "" || (authorAvatarURL != "" && !validSkillURL(authorAvatarURL)) {
			return nil, fmt.Errorf("内置技能作者信息无效: %s", id)
		}
		media := make([]SkillShowcaseMedia, 0, len(definition.ShowcaseMedia))
		for _, item := range definition.ShowcaseMedia {
			media = append(media, SkillShowcaseMedia{Type: item.Type, ShowcaseURI: item.ShowcaseURI, ShowcaseURL: item.ShowcaseURL})
		}
		normalized, mediaJSON, err := normalizeSkillMutationRequest(SkillMutationRequest{
			SkillName: definition.SkillName, Description: definition.Description, Instruction: definition.Instruction,
			Tag: definition.Tag, IsPrivate: definition.IsPrivate, MarkdownURL: definition.MarkdownURL,
			ShowcaseMedia: media, ExtraInfo: definition.ExtraInfo,
		}, true)
		if err != nil {
			return nil, fmt.Errorf("内置技能 %s 数据无效: %w", id, err)
		}
		skills = append(skills, model.Skill{
			ID: id, OwnerID: ownerID, AuthorName: authorName, AuthorAvatarURL: authorAvatarURL,
			Name: normalized.SkillName, Description: normalized.Description, Instruction: normalized.Instruction,
			Status: skillStatusEnabled, Source: definition.Source, Tag: normalized.Tag, SortWeight: definition.SortWeight,
			IsPrivate: false, MarkdownURL: normalized.MarkdownURL, ShowcaseMediaJSON: mediaJSON, ExtraInfo: normalized.ExtraInfo,
			InitialLikeCount: definition.LikeCount, InitialAddedCount: definition.AddedCount,
			CreatedAt: time.UnixMilli(definition.CreateTime), UpdatedAt: time.UnixMilli(definition.UpdateTime),
		})
	}
	packages := make([]builtinSkillPackage, 0, len(skills))
	for _, skill := range skills {
		archive, err := productionSkillArchive(&skill)
		if err != nil {
			return nil, fmt.Errorf("制作技能 %s 文件包无效: %w", skill.ID, err)
		}
		skill.SourceType = "builtin"
		packages = append(packages, builtinSkillPackage{skill: skill, archive: archive})
	}
	return packages, nil
}

func productionSkillArchive(skill *model.Skill) (skillPackageArchive, error) {
	archive, err := archiveFromMarkdown([]byte(skill.Instruction), truncateSkillMetadata(skill.Name, 80), truncateSkillMetadata(skill.Description, 500))
	if err != nil {
		return archive, err
	}
	if skill.Source != skillSourceUser {
		for _, resource := range productionSkillFiles()[skill.ID] {
			filePath, err := normalizeSkillPath(resource.Path)
			if err != nil {
				return archive, err
			}
			if _, exists := archive.Files[filePath]; exists {
				return archive, fmt.Errorf("配套文件重复: %s", filePath)
			}
			archive.Files[filePath] = []byte(resource.Content)
		}
	}
	return finalizeSkillArchive(archive.Files, archive.Metadata)
}
