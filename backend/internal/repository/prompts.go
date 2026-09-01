package repository

import (
	"errors"
	"strings"
	"time"

	"infinite-canvas/backend/internal/model"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

type PromptListFilter struct {
	UserID   string
	Scope    string
	Search   string
	Tag      string
	Category string
	Mode     string
	Sort     string
	Limit    int
	Offset   int
}

type PromptMetrics struct {
	PromptID      string
	UseCount      int64
	FavoriteCount int64
}

// PromptTagValues 返回当前可见提示词中出现过的标签原值。标签存为 JSON
// 是为了保持提示词正文和筛选字段的独立性，这里只读取标签列，由 service
// 负责解析、去重和排序。
func (r *Repository) PromptTagValues(userID string) ([]string, error) {
	var values []string
	query := r.db.Model(&model.Prompt{}).
		Where("status = ?", 1).
		Where("(visibility = ? OR owner_id = ?)", "public", userID).
		Where("tags_json <> ''")
	if err := query.Pluck("tags_json", &values).Error; err != nil {
		return nil, err
	}
	return values, nil
}

func (r *Repository) Prompts(filter PromptListFilter) ([]model.Prompt, int64, error) {
	query := r.db.Model(&model.Prompt{}).Where("prompts.status = ?", 1)
	switch filter.Scope {
	case "mine":
		query = query.Where("prompts.owner_id = ? OR (prompts.visibility = ? AND EXISTS (SELECT 1 FROM user_prompt_states WHERE user_prompt_states.prompt_id = prompts.id AND user_prompt_states.user_id = ? AND user_prompt_states.favorite = ?))", filter.UserID, "public", filter.UserID, true)
	case "created":
		query = query.Where("prompts.owner_id = ?", filter.UserID)
	case "favorites":
		query = query.Where("EXISTS (SELECT 1 FROM user_prompt_states WHERE user_prompt_states.prompt_id = prompts.id AND user_prompt_states.user_id = ? AND user_prompt_states.favorite = ?)", filter.UserID, true)
	case "history":
		query = query.Where("EXISTS (SELECT 1 FROM user_prompt_states WHERE user_prompt_states.prompt_id = prompts.id AND user_prompt_states.user_id = ? AND user_prompt_states.last_used_at IS NOT NULL)", filter.UserID)
	default:
		query = query.Where("prompts.visibility = ?", "public")
	}
	if filter.Search != "" {
		pattern := "%" + strings.ToLower(filter.Search) + "%"
		query = query.Where("lower(prompts.title) LIKE ? OR lower(prompts.description) LIKE ? OR lower(prompts.prompt) LIKE ? OR lower(prompts.tags_json) LIKE ? OR lower(prompts.author_name) LIKE ?", pattern, pattern, pattern, pattern, pattern)
	}
	if filter.Tag != "" {
		query = query.Where("lower(prompts.tags_json) LIKE ?", "%\""+strings.ToLower(filter.Tag)+"\"%")
	}
	if filter.Mode != "" {
		query = query.Where("prompts.mode = ?", filter.Mode)
	}
	if filter.Category != "" {
		query = query.Where("prompts.category = ?", filter.Category)
	}
	var total int64
	if err := query.Count(&total).Error; err != nil {
		return nil, 0, err
	}
	order := "prompts.featured desc, prompts.updated_at desc"
	switch filter.Sort {
	case "popular":
		order = "CASE WHEN prompts.curation_rank > 0 THEN 0 ELSE 1 END asc, prompts.curation_rank asc, (prompts.initial_use_count + (SELECT COALESCE(SUM(use_count), 0) FROM user_prompt_states metric_states WHERE metric_states.prompt_id = prompts.id)) desc, prompts.featured desc, prompts.updated_at desc"
	case "favorites":
		order = "CASE WHEN prompts.curation_rank > 0 THEN 0 ELSE 1 END asc, prompts.curation_rank asc, (prompts.initial_favorite_count + (SELECT COUNT(*) FROM user_prompt_states metric_states WHERE metric_states.prompt_id = prompts.id AND metric_states.favorite = true)) desc, prompts.updated_at desc"
	case "history":
		order = "(SELECT COALESCE(MAX(last_used_at), prompts.updated_at) FROM user_prompt_states history_states WHERE history_states.prompt_id = prompts.id AND history_states.user_id = ?) desc"
	}
	var prompts []model.Prompt
	query = query.Select("prompts.*")
	if filter.Sort == "history" {
		query = query.Order(gorm.Expr(order, filter.UserID))
	} else {
		query = query.Order(order)
	}
	err := query.Limit(filter.Limit).Offset(filter.Offset).Find(&prompts).Error
	return prompts, total, err
}

func (r *Repository) Prompt(id string) (*model.Prompt, error) {
	var prompt model.Prompt
	if err := r.db.First(&prompt, "id = ? AND status = ?", id, 1).Error; err != nil {
		return nil, err
	}
	return &prompt, nil
}

func (r *Repository) UpsertBuiltinPrompts(prompts []model.Prompt) error {
	if len(prompts) == 0 {
		return errors.New("builtin prompts are empty")
	}
	return r.db.Transaction(func(tx *gorm.DB) error {
		conflict := clause.OnConflict{
			Columns: []clause.Column{{Name: "id"}},
			DoUpdates: clause.AssignmentColumns([]string{
				"owner_id", "author_name", "title", "prompt", "description", "cover_url", "reference_image_url", "tags_json", "category", "mode", "model_hint", "source_url", "license", "visibility", "status", "featured", "curation_rank", "initial_use_count", "initial_favorite_count", "created_at", "updated_at",
			}),
		}
		// PostgreSQL has a practical parameter limit and SQLite builds in this
		// repository use a much smaller variable limit. Keep catalog sync in
		// bounded batches so the full public catalog can be imported safely.
		for start := 0; start < len(prompts); start += 200 {
			end := start + 200
			if end > len(prompts) {
				end = len(prompts)
			}
			batch := prompts[start:end]
			if err := tx.Clauses(conflict).Create(&batch).Error; err != nil {
				return err
			}
		}
		return nil
	})
}

func (r *Repository) BuiltinPromptCount() (int64, error) {
	var count int64
	if err := r.db.Model(&model.Prompt{}).Where("owner_id = ?", "").Count(&count).Error; err != nil {
		return 0, err
	}
	return count, nil
}

func (r *Repository) CreatePrompt(prompt *model.Prompt) error {
	return r.db.Create(prompt).Error
}

func (r *Repository) SavePrompt(prompt *model.Prompt) error {
	return r.db.Save(prompt).Error
}

func (r *Repository) DeletePrompt(id string) error {
	return r.db.Transaction(func(tx *gorm.DB) error {
		if err := tx.Delete(&model.UserPromptState{}, "prompt_id = ?", id).Error; err != nil {
			return err
		}
		return tx.Delete(&model.Prompt{}, "id = ?", id).Error
	})
}

func (r *Repository) UserPromptState(userID string, promptID string) (*model.UserPromptState, error) {
	var state model.UserPromptState
	if err := r.db.First(&state, "user_id = ? AND prompt_id = ?", userID, promptID).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, nil
		}
		return nil, err
	}
	return &state, nil
}

func (r *Repository) UserPromptStatesByPromptIDs(userID string, promptIDs []string) ([]model.UserPromptState, error) {
	if len(promptIDs) == 0 {
		return nil, nil
	}
	var states []model.UserPromptState
	err := r.db.Find(&states, "user_id = ? AND prompt_id IN ?", userID, promptIDs).Error
	return states, err
}

func (r *Repository) SetUserPromptFavorite(state *model.UserPromptState) error {
	return r.db.Clauses(clause.OnConflict{
		Columns:   []clause.Column{{Name: "user_id"}, {Name: "prompt_id"}},
		DoUpdates: clause.AssignmentColumns([]string{"favorite", "updated_at"}),
	}).Create(state).Error
}

func (r *Repository) RecordPromptUse(userID string, promptID string, now time.Time) error {
	return r.db.Transaction(func(tx *gorm.DB) error {
		var state model.UserPromptState
		err := tx.First(&state, "user_id = ? AND prompt_id = ?", userID, promptID).Error
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return tx.Create(&model.UserPromptState{ID: newRepositoryID(), UserID: userID, PromptID: promptID, UseCount: 1, LastUsedAt: &now, CreatedAt: now, UpdatedAt: now}).Error
		}
		if err != nil {
			return err
		}
		return tx.Model(&model.UserPromptState{}).Where("id = ?", state.ID).Updates(map[string]any{"use_count": gorm.Expr("use_count + ?", 1), "last_used_at": now, "updated_at": now}).Error
	})
}

func (r *Repository) PromptMetrics(promptIDs []string) (map[string]PromptMetrics, error) {
	metrics := make(map[string]PromptMetrics, len(promptIDs))
	if len(promptIDs) == 0 {
		return metrics, nil
	}
	var rows []PromptMetrics
	err := r.db.Model(&model.UserPromptState{}).
		Select("prompt_id, COALESCE(SUM(use_count), 0) AS use_count, SUM(CASE WHEN favorite = true THEN 1 ELSE 0 END) AS favorite_count").
		Where("prompt_id IN ?", promptIDs).
		Group("prompt_id").
		Scan(&rows).Error
	if err != nil {
		return nil, err
	}
	for _, item := range rows {
		metrics[item.PromptID] = item
	}
	return metrics, nil
}

func (r *Repository) PromptOwners(ownerIDs []string) (map[string]model.User, error) {
	owners := make(map[string]model.User, len(ownerIDs))
	filtered := make([]string, 0, len(ownerIDs))
	seen := make(map[string]struct{}, len(ownerIDs))
	for _, id := range ownerIDs {
		id = strings.TrimSpace(id)
		if id == "" {
			continue
		}
		if _, ok := seen[id]; ok {
			continue
		}
		seen[id] = struct{}{}
		filtered = append(filtered, id)
	}
	if len(filtered) == 0 {
		return owners, nil
	}
	var users []model.User
	if err := r.db.Find(&users, "id IN ?", filtered).Error; err != nil {
		return nil, err
	}
	for _, user := range users {
		owners[user.ID] = user
	}
	return owners, nil
}
