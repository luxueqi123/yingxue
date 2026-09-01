package service

import (
	_ "embed"
	"encoding/json"
	"errors"
	"fmt"
	"net/url"
	"sort"
	"strings"
	"time"
	"unicode/utf8"

	"infinite-canvas/backend/internal/model"
	"infinite-canvas/backend/internal/repository"

	"gorm.io/gorm"
)

const (
	promptStatusEnabled     = 1
	promptVisibilityPublic  = "public"
	promptVisibilityPrivate = "private"
)

var promptCategoryLabels = map[string]string{
	"cinematic":  "电影感",
	"portrait":   "人物肖像",
	"landscape":  "风光场景",
	"product":    "产品商业",
	"anime":      "动漫插画",
	"storyboard": "分镜叙事",
	"others":     "其他",
}

var promptModeLabels = map[string]string{
	"image": "图片",
	"video": "视频",
	"text":  "文本",
	"audio": "音频",
}

//go:embed seed/prompts.json
var builtinPromptsJSON []byte

type PromptItem struct {
	ID                string     `json:"id"`
	Title             string     `json:"title"`
	Prompt            string     `json:"prompt,omitempty"`
	Description       string     `json:"description"`
	CoverURL          string     `json:"coverUrl"`
	ReferenceImageURL string     `json:"referenceImageUrl,omitempty"`
	Tags              []string   `json:"tags"`
	Category          string     `json:"category"`
	Mode              string     `json:"mode"`
	ModelHint         string     `json:"modelHint"`
	SourceURL         string     `json:"sourceUrl,omitempty"`
	License           string     `json:"license,omitempty"`
	Visibility        string     `json:"visibility"`
	Status            int        `json:"status"`
	Featured          bool       `json:"featured"`
	CurationRank      int        `json:"curationRank"`
	UseCount          int64      `json:"useCount"`
	FavoriteCount     int64      `json:"favoriteCount"`
	IsFavorite        bool       `json:"isFavorite"`
	LastUsedAt        *time.Time `json:"lastUsedAt,omitempty"`
	AuthorName        string     `json:"authorName"`
	OwnerID           string     `json:"ownerId,omitempty"`
	IsOwner           bool       `json:"isOwner"`
	CreatedAt         int64      `json:"createdAt"`
	UpdatedAt         int64      `json:"updatedAt"`
}

type PromptCategory struct {
	Value string `json:"value"`
	Label string `json:"label"`
}

type PromptMode struct {
	Value string `json:"value"`
	Label string `json:"label"`
}

type PromptListRequest struct {
	Page     int
	PageSize int
	Scope    string
	Search   string
	Tag      string
	Category string
	Mode     string
	Sort     string
}

type PromptList struct {
	Prompts    []PromptItem     `json:"prompts"`
	TotalCount int64            `json:"totalCount"`
	HasMore    bool             `json:"hasMore"`
	Page       int              `json:"page"`
	PageSize   int              `json:"pageSize"`
	Categories []PromptCategory `json:"categories"`
	Modes      []PromptMode     `json:"modes"`
	Tags       []string         `json:"tags"`
}

type PromptMutationRequest struct {
	Title             string   `json:"title"`
	Prompt            string   `json:"prompt"`
	Description       string   `json:"description"`
	CoverURL          string   `json:"coverUrl"`
	ReferenceImageURL string   `json:"referenceImageUrl"`
	Tags              []string `json:"tags"`
	Category          string   `json:"category"`
	Mode              string   `json:"mode"`
	ModelHint         string   `json:"modelHint"`
	SourceURL         string   `json:"sourceUrl"`
	License           string   `json:"license"`
	Visibility        string   `json:"visibility"`
}

type builtinPromptDefinition struct {
	ID                string   `json:"id"`
	Title             string   `json:"title"`
	Prompt            string   `json:"prompt"`
	Description       string   `json:"description"`
	CoverURL          string   `json:"coverUrl"`
	ReferenceImageURL string   `json:"referenceImageUrl"`
	Tags              []string `json:"tags"`
	Category          string   `json:"category"`
	Mode              string   `json:"mode"`
	ModelHint         string   `json:"modelHint"`
	SourceURL         string   `json:"sourceUrl"`
	License           string   `json:"license"`
	Featured          bool     `json:"featured"`
	CurationRank      int      `json:"curationRank"`
	UseCount          int64    `json:"useCount"`
	FavoriteCount     int64    `json:"favoriteCount"`
	CreatedAt         int64    `json:"createdAt"`
	UpdatedAt         int64    `json:"updatedAt"`
}

func (s *Service) Prompts(userID string, req PromptListRequest) (*PromptList, error) {
	req = normalizePromptListRequest(req)
	rows, total, err := s.repo.Prompts(repository.PromptListFilter{
		UserID: userID, Scope: req.Scope, Search: req.Search, Tag: req.Tag, Category: req.Category, Mode: req.Mode,
		Sort: req.Sort, Limit: req.PageSize, Offset: (req.Page - 1) * req.PageSize,
	})
	if err != nil {
		return nil, err
	}
	items, err := s.promptItems(userID, rows, false)
	if err != nil {
		return nil, err
	}
	tags, err := s.promptFilterTags(userID)
	if err != nil {
		return nil, err
	}
	return &PromptList{
		Prompts: items, TotalCount: total, HasMore: int64(req.Page*req.PageSize) < total, Page: req.Page, PageSize: req.PageSize,
		Categories: promptCategories(), Modes: promptModes(), Tags: tags,
	}, nil
}

func (s *Service) PromptDetail(userID string, id string) (*PromptItem, error) {
	prompt, err := s.visiblePrompt(userID, id)
	if err != nil {
		return nil, err
	}
	items, err := s.promptItems(userID, []model.Prompt{*prompt}, true)
	if err != nil {
		return nil, err
	}
	return &items[0], nil
}

func (s *Service) CreatePrompt(userID string, req PromptMutationRequest) (*PromptItem, error) {
	normalized, tagsJSON, err := normalizePromptMutationRequest(req)
	if err != nil {
		return nil, err
	}
	prompt := &model.Prompt{
		ID: newID(), OwnerID: userID, Title: normalized.Title, Prompt: normalized.Prompt, Description: normalized.Description,
		CoverURL: normalized.CoverURL, ReferenceImageURL: normalized.ReferenceImageURL, TagsJSON: tagsJSON,
		Category: normalized.Category, Mode: normalized.Mode, ModelHint: normalized.ModelHint, SourceURL: normalized.SourceURL,
		License: normalized.License, Visibility: normalized.Visibility, Status: promptStatusEnabled,
		AuthorName: "映雪用户", CreatedAt: time.Now(), UpdatedAt: time.Now(),
	}
	if err := s.repo.CreatePrompt(prompt); err != nil {
		return nil, err
	}
	return s.PromptDetail(userID, prompt.ID)
}

func (s *Service) UpdatePrompt(userID string, id string, req PromptMutationRequest) (*PromptItem, error) {
	prompt, err := s.ownedPrompt(userID, id)
	if err != nil {
		return nil, err
	}
	normalized, tagsJSON, err := normalizePromptMutationRequest(req)
	if err != nil {
		return nil, err
	}
	prompt.Title, prompt.Prompt, prompt.Description = normalized.Title, normalized.Prompt, normalized.Description
	prompt.CoverURL, prompt.ReferenceImageURL, prompt.TagsJSON = normalized.CoverURL, normalized.ReferenceImageURL, tagsJSON
	prompt.Category, prompt.Mode, prompt.ModelHint = normalized.Category, normalized.Mode, normalized.ModelHint
	prompt.SourceURL, prompt.License, prompt.Visibility = normalized.SourceURL, normalized.License, normalized.Visibility
	prompt.UpdatedAt = time.Now()
	if err := s.repo.SavePrompt(prompt); err != nil {
		return nil, err
	}
	return s.PromptDetail(userID, prompt.ID)
}

func (s *Service) DeletePrompt(userID string, id string) error {
	prompt, err := s.ownedPrompt(userID, id)
	if err != nil {
		return err
	}
	return s.repo.DeletePrompt(prompt.ID)
}

func (s *Service) SetPromptFavorite(userID string, id string, favorite bool) (*PromptItem, error) {
	if _, err := s.visiblePrompt(userID, id); err != nil {
		return nil, err
	}
	state, err := s.promptState(userID, id)
	if err != nil {
		return nil, err
	}
	state.Favorite = favorite
	if err := s.repo.SetUserPromptFavorite(state); err != nil {
		return nil, err
	}
	return s.PromptDetail(userID, id)
}

func (s *Service) UsePrompt(userID string, id string) (*PromptItem, error) {
	if _, err := s.visiblePrompt(userID, id); err != nil {
		return nil, err
	}
	if err := s.repo.RecordPromptUse(userID, id, time.Now()); err != nil {
		return nil, err
	}
	return s.PromptDetail(userID, id)
}

func (s *Service) promptItems(userID string, prompts []model.Prompt, includePrompt bool) ([]PromptItem, error) {
	ids := make([]string, 0, len(prompts))
	ownerIDs := make([]string, 0, len(prompts))
	for _, prompt := range prompts {
		ids = append(ids, prompt.ID)
		ownerIDs = append(ownerIDs, prompt.OwnerID)
	}
	states, err := s.repo.UserPromptStatesByPromptIDs(userID, ids)
	if err != nil {
		return nil, err
	}
	metrics, err := s.repo.PromptMetrics(ids)
	if err != nil {
		return nil, err
	}
	owners, err := s.repo.PromptOwners(ownerIDs)
	if err != nil {
		return nil, err
	}
	stateByID := make(map[string]model.UserPromptState, len(states))
	for _, state := range states {
		stateByID[state.PromptID] = state
	}
	items := make([]PromptItem, 0, len(prompts))
	for _, prompt := range prompts {
		var tags []string
		if prompt.TagsJSON != "" {
			if err := json.Unmarshal([]byte(prompt.TagsJSON), &tags); err != nil {
				return nil, errors.New("提示词标签数据格式错误")
			}
		}
		owner := owners[prompt.OwnerID]
		authorName := strings.TrimSpace(prompt.AuthorName)
		if strings.TrimSpace(owner.DisplayName) != "" {
			authorName = strings.TrimSpace(owner.DisplayName)
		} else if strings.TrimSpace(owner.Username) != "" {
			authorName = strings.TrimSpace(owner.Username)
		}
		state := stateByID[prompt.ID]
		metric := metrics[prompt.ID]
		items = append(items, PromptItem{
			ID: prompt.ID, Title: prompt.Title, Prompt: func() string {
				if includePrompt {
					return prompt.Prompt
				}
				return ""
			}(),
			Description: prompt.Description, CoverURL: prompt.CoverURL, ReferenceImageURL: prompt.ReferenceImageURL,
			Tags: tags, Category: prompt.Category, Mode: prompt.Mode, ModelHint: prompt.ModelHint, SourceURL: prompt.SourceURL,
			License: prompt.License, Visibility: prompt.Visibility, Status: prompt.Status, Featured: prompt.Featured, CurationRank: prompt.CurationRank,
			UseCount: prompt.InitialUseCount + metric.UseCount, FavoriteCount: prompt.InitialFavoriteCount + metric.FavoriteCount,
			IsFavorite: state.Favorite, LastUsedAt: state.LastUsedAt, AuthorName: firstNonEmpty(authorName, "映雪精选"), OwnerID: prompt.OwnerID,
			IsOwner: prompt.OwnerID != "" && prompt.OwnerID == userID, CreatedAt: prompt.CreatedAt.UnixMilli(), UpdatedAt: prompt.UpdatedAt.UnixMilli(),
		})
	}
	return items, nil
}

func (s *Service) visiblePrompt(userID string, id string) (*model.Prompt, error) {
	id = strings.TrimSpace(id)
	if id == "" {
		return nil, BadAuthRequest("提示词 ID 不能为空")
	}
	prompt, err := s.repo.Prompt(id)
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, NotFound("提示词不存在或已下架")
	}
	if err != nil {
		return nil, err
	}
	if prompt.Visibility != promptVisibilityPublic && prompt.OwnerID != userID {
		return nil, Forbidden("该提示词未公开")
	}
	return prompt, nil
}

func (s *Service) ownedPrompt(userID string, id string) (*model.Prompt, error) {
	prompt, err := s.visiblePrompt(userID, id)
	if err != nil {
		return nil, err
	}
	if prompt.OwnerID != userID {
		return nil, Forbidden("只有作者可以修改或删除该提示词")
	}
	return prompt, nil
}

func (s *Service) promptState(userID string, promptID string) (*model.UserPromptState, error) {
	state, err := s.repo.UserPromptState(userID, promptID)
	if err != nil {
		return nil, err
	}
	if state != nil {
		return state, nil
	}
	now := time.Now()
	return &model.UserPromptState{ID: newID(), UserID: userID, PromptID: promptID, CreatedAt: now, UpdatedAt: now}, nil
}

func normalizePromptListRequest(req PromptListRequest) PromptListRequest {
	if req.Page <= 0 {
		req.Page = 1
	}
	if req.PageSize <= 0 {
		req.PageSize = 24
	}
	if req.PageSize > 80 {
		req.PageSize = 80
	}
	switch req.Scope {
	case "public", "mine", "created", "favorites", "history":
	default:
		req.Scope = "public"
	}
	switch req.Sort {
	case "popular", "new", "favorites", "history":
	default:
		req.Sort = "popular"
	}
	if req.Scope == "history" && req.Sort == "popular" {
		req.Sort = "history"
	}
	req.Search = strings.TrimSpace(req.Search)
	req.Tag = strings.TrimSpace(req.Tag)
	req.Category = strings.TrimSpace(req.Category)
	if _, ok := promptCategoryLabels[req.Category]; !ok {
		req.Category = ""
	}
	req.Mode = strings.TrimSpace(req.Mode)
	if _, ok := promptModeLabels[req.Mode]; !ok {
		req.Mode = ""
	}
	return req
}

func normalizePromptMutationRequest(req PromptMutationRequest) (PromptMutationRequest, string, error) {
	req.Title = strings.TrimSpace(req.Title)
	req.Prompt = strings.TrimSpace(req.Prompt)
	req.Description = strings.TrimSpace(req.Description)
	req.CoverURL = strings.TrimSpace(req.CoverURL)
	req.ReferenceImageURL = strings.TrimSpace(req.ReferenceImageURL)
	req.Category = strings.TrimSpace(req.Category)
	req.Mode = strings.TrimSpace(req.Mode)
	req.ModelHint = strings.TrimSpace(req.ModelHint)
	req.SourceURL = strings.TrimSpace(req.SourceURL)
	req.License = strings.TrimSpace(req.License)
	req.Visibility = strings.TrimSpace(req.Visibility)
	if req.Title == "" || utf8.RuneCountInString(req.Title) > 160 {
		return req, "", BadAuthRequest("提示词标题必须为 1-160 个字符")
	}
	if req.Prompt == "" || utf8.RuneCountInString(req.Prompt) > 100000 {
		return req, "", BadAuthRequest("提示词正文必须为 1-100000 个字符")
	}
	if utf8.RuneCountInString(req.Description) > 600 {
		return req, "", BadAuthRequest("提示词简介不能超过 600 个字符")
	}
	if req.CoverURL != "" && !validPromptURL(req.CoverURL) {
		return req, "", BadAuthRequest("封面地址必须是有效的 HTTP(S) 链接或站内路径")
	}
	if req.ReferenceImageURL != "" && !validPromptURL(req.ReferenceImageURL) {
		return req, "", BadAuthRequest("参考图地址必须是有效的 HTTP(S) 链接或站内路径")
	}
	if _, ok := promptCategoryLabels[req.Category]; !ok {
		return req, "", BadAuthRequest("请选择有效的提示词分类")
	}
	if _, ok := promptModeLabels[req.Mode]; !ok {
		return req, "", BadAuthRequest("请选择有效的生成模式")
	}
	if req.SourceURL != "" && !validHTTPURL(req.SourceURL) {
		return req, "", BadAuthRequest("来源地址必须是有效的 HTTP(S) 链接")
	}
	if utf8.RuneCountInString(req.ModelHint) > 160 || utf8.RuneCountInString(req.License) > 240 {
		return req, "", BadAuthRequest("模型或版权说明过长")
	}
	if req.Visibility == "" {
		req.Visibility = promptVisibilityPublic
	}
	if req.Visibility != promptVisibilityPublic && req.Visibility != promptVisibilityPrivate {
		return req, "", BadAuthRequest("可见范围仅支持公开或仅自己")
	}
	if len(req.Tags) > 8 {
		return req, "", BadAuthRequest("标签最多添加 8 个")
	}
	seen := make(map[string]struct{}, len(req.Tags))
	tags := make([]string, 0, len(req.Tags))
	for _, tag := range req.Tags {
		tag = strings.TrimSpace(tag)
		if tag == "" {
			continue
		}
		if utf8.RuneCountInString(tag) > 32 {
			return req, "", BadAuthRequest("单个标签不能超过 32 个字符")
		}
		if _, ok := seen[tag]; ok {
			continue
		}
		seen[tag] = struct{}{}
		tags = append(tags, tag)
	}
	req.Tags = tags
	tagsJSON, err := json.Marshal(tags)
	if err != nil {
		return req, "", err
	}
	return req, string(tagsJSON), nil
}

func validPromptURL(value string) bool {
	if strings.HasPrefix(value, "/") && !strings.HasPrefix(value, "//") {
		return true
	}
	return validHTTPURL(value)
}

func validHTTPURL(value string) bool {
	target, err := url.ParseRequestURI(value)
	return err == nil && (target.Scheme == "http" || target.Scheme == "https") && target.Host != ""
}

func promptCategories() []PromptCategory {
	return []PromptCategory{{Value: "cinematic", Label: promptCategoryLabels["cinematic"]}, {Value: "portrait", Label: promptCategoryLabels["portrait"]}, {Value: "landscape", Label: promptCategoryLabels["landscape"]}, {Value: "product", Label: promptCategoryLabels["product"]}, {Value: "anime", Label: promptCategoryLabels["anime"]}, {Value: "storyboard", Label: promptCategoryLabels["storyboard"]}, {Value: "others", Label: promptCategoryLabels["others"]}}
}

func promptModes() []PromptMode {
	return []PromptMode{{Value: "image", Label: promptModeLabels["image"]}, {Value: "video", Label: promptModeLabels["video"]}, {Value: "text", Label: promptModeLabels["text"]}, {Value: "audio", Label: promptModeLabels["audio"]}}
}

func promptTags() []string {
	return []string{"镜头语言", "光影", "氛围", "人物", "场景", "电商", "国风", "动漫", "分镜", "短剧"}
}

func (s *Service) promptFilterTags(userID string) ([]string, error) {
	values, err := s.repo.PromptTagValues(userID)
	if err != nil {
		return nil, err
	}
	seen := make(map[string]struct{})
	tags := make([]string, 0, len(values))
	add := func(value string) {
		value = strings.TrimSpace(value)
		if value == "" {
			return
		}
		if _, ok := seen[value]; ok {
			return
		}
		seen[value] = struct{}{}
		tags = append(tags, value)
	}
	// 运营默认标签保持稳定顺序，新建提示词的自定义标签按字典序追加。
	for _, value := range promptTags() {
		add(value)
	}
	custom := make([]string, 0)
	for _, raw := range values {
		var parsed []string
		if err := json.Unmarshal([]byte(raw), &parsed); err != nil {
			return nil, errors.New("提示词标签数据格式错误")
		}
		custom = append(custom, parsed...)
	}
	sort.Slice(custom, func(i, j int) bool {
		return strings.ToLower(strings.TrimSpace(custom[i])) < strings.ToLower(strings.TrimSpace(custom[j]))
	})
	for _, value := range custom {
		add(value)
	}
	return tags, nil
}

// EnsureBuiltinPrompts 幂等同步映雪精选提示词；用户收藏、使用记录独立保存。
func (s *Service) EnsureBuiltinPrompts() error {
	var definitions []builtinPromptDefinition
	if err := json.Unmarshal(builtinPromptsJSON, &definitions); err != nil {
		return fmt.Errorf("解析内置提示词失败: %w", err)
	}
	if len(definitions) == 0 {
		return errors.New("内置提示词不能为空")
	}
	// The catalog is embedded in the backend image and can contain tens of
	// thousands of rows. A count check keeps normal restarts fast while still
	// importing a newly expanded catalog or repairing a partial first import.
	if count, err := s.repo.BuiltinPromptCount(); err != nil {
		return fmt.Errorf("检查内置提示词数量失败: %w", err)
	} else if count == int64(len(definitions)) {
		return nil
	}
	seen := make(map[string]struct{}, len(definitions))
	items := make([]model.Prompt, 0, len(definitions))
	for _, definition := range definitions {
		id := strings.TrimSpace(definition.ID)
		if id == "" || len(id) > 64 {
			return fmt.Errorf("内置提示词 ID 无效: %q", definition.ID)
		}
		if _, ok := seen[id]; ok {
			return fmt.Errorf("内置提示词 ID 重复: %s", id)
		}
		seen[id] = struct{}{}
		normalized, tagsJSON, err := normalizePromptMutationRequest(PromptMutationRequest{
			Title: definition.Title, Prompt: definition.Prompt, Description: definition.Description, CoverURL: definition.CoverURL,
			ReferenceImageURL: definition.ReferenceImageURL, Tags: definition.Tags, Category: definition.Category, Mode: definition.Mode,
			ModelHint: definition.ModelHint, SourceURL: definition.SourceURL, License: definition.License, Visibility: promptVisibilityPublic,
		})
		if err != nil {
			return fmt.Errorf("内置提示词 %s 数据无效: %w", id, err)
		}
		now := time.Now()
		created, updated := time.UnixMilli(definition.CreatedAt), time.UnixMilli(definition.UpdatedAt)
		if definition.CreatedAt <= 0 {
			created = now
		}
		if definition.UpdatedAt <= 0 {
			updated = created
		}
		items = append(items, model.Prompt{
			ID: id, AuthorName: "映雪精选", Title: normalized.Title, Prompt: normalized.Prompt, Description: normalized.Description,
			CoverURL: normalized.CoverURL, ReferenceImageURL: normalized.ReferenceImageURL, TagsJSON: tagsJSON, Category: normalized.Category,
			Mode: normalized.Mode, ModelHint: normalized.ModelHint, SourceURL: normalized.SourceURL, License: normalized.License,
			Visibility: promptVisibilityPublic, Status: promptStatusEnabled, Featured: definition.Featured, CurationRank: definition.CurationRank,
			InitialUseCount: maxInt64(definition.UseCount), InitialFavoriteCount: maxInt64(definition.FavoriteCount), CreatedAt: created, UpdatedAt: updated,
		})
	}
	if err := s.repo.UpsertBuiltinPrompts(items); err != nil {
		return fmt.Errorf("同步内置提示词失败: %w", err)
	}
	return nil
}

func maxInt64(value int64) int64 {
	if value < 0 {
		return 0
	}
	return value
}
