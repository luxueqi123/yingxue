package model

import "time"

// Prompt 是映雪提示词中心的可运营内容。提示词正文和展示素材与上游来源解耦，
// 这样管理员可以审核、下架和替换封面，而不会把浏览器直连外部仓库作为长期依赖。
type Prompt struct {
	ID                string `json:"id" gorm:"primaryKey;size:64"`
	OwnerID           string `json:"ownerId" gorm:"index;size:36"`
	AuthorName        string `json:"authorName" gorm:"size:120;index"`
	Title             string `json:"title" gorm:"size:160;index"`
	Prompt            string `json:"prompt" gorm:"type:text"`
	Description       string `json:"description" gorm:"size:600"`
	CoverURL          string `json:"coverUrl" gorm:"size:2000"`
	ReferenceImageURL string `json:"referenceImageUrl" gorm:"size:2000"`
	TagsJSON          string `json:"-" gorm:"type:text"`
	Category          string `json:"category" gorm:"size:48;index"`
	Mode              string `json:"mode" gorm:"size:24;index"`
	ModelHint         string `json:"modelHint" gorm:"size:160"`
	SourceURL         string `json:"sourceUrl" gorm:"size:2000"`
	License           string `json:"license" gorm:"size:240"`
	Visibility        string `json:"visibility" gorm:"size:24;index"`
	Status            int    `json:"status" gorm:"index"`
	Featured          bool   `json:"featured" gorm:"index"`
	// CurationRank is a stable editorial order. Smaller positive values are
	// shown before the long-tail catalog without pretending they have real use
	// counts. Zero means the item is not in the editorial front row.
	CurationRank         int       `json:"curationRank" gorm:"index"`
	InitialUseCount      int64     `json:"initialUseCount"`
	InitialFavoriteCount int64     `json:"initialFavoriteCount"`
	CreatedAt            time.Time `json:"createdAt" gorm:"index"`
	UpdatedAt            time.Time `json:"updatedAt" gorm:"index"`
}

// UserPromptState 隔离用户行为，支持收藏、最近使用和使用次数统计，不污染提示词正文。
type UserPromptState struct {
	ID         string     `json:"id" gorm:"primaryKey;size:36"`
	UserID     string     `json:"userId" gorm:"index;size:36;uniqueIndex:idx_user_prompt_state_user_prompt,priority:1"`
	PromptID   string     `json:"promptId" gorm:"index;uniqueIndex:idx_user_prompt_state_user_prompt,priority:2"`
	Favorite   bool       `json:"favorite" gorm:"index"`
	UseCount   int64      `json:"useCount"`
	LastUsedAt *time.Time `json:"lastUsedAt,omitempty" gorm:"index"`
	CreatedAt  time.Time  `json:"createdAt"`
	UpdatedAt  time.Time  `json:"updatedAt"`
}
