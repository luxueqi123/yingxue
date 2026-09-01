package service

import (
	"errors"
	"testing"

	"infinite-canvas/backend/internal/model"
	"infinite-canvas/backend/internal/repository"

	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

func newPromptTestService(t *testing.T) (*Service, *gorm.DB) {
	t.Helper()
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	if err != nil {
		t.Fatal(err)
	}
	sqlDB, err := db.DB()
	if err != nil {
		t.Fatal(err)
	}
	// SQLite :memory: databases are connection-local; keeping one connection
	// also makes the tests deterministic when GORM runs subqueries.
	sqlDB.SetMaxOpenConns(1)
	if err := db.AutoMigrate(&model.User{}, &model.Prompt{}, &model.UserPromptState{}); err != nil {
		t.Fatal(err)
	}
	return &Service{repo: repository.New(db)}, db
}

func promptTestUsers(t *testing.T, db *gorm.DB) (model.User, model.User) {
	t.Helper()
	owner := model.User{ID: "prompt-owner", Username: "prompt-owner", DisplayName: "提示词作者", Role: model.UserRoleUser, Status: model.UserStatusActive}
	viewer := model.User{ID: "prompt-viewer", Username: "prompt-viewer", DisplayName: "提示词访客", Role: model.UserRoleUser, Status: model.UserStatusActive}
	if err := db.Create(&owner).Error; err != nil {
		t.Fatal(err)
	}
	if err := db.Create(&viewer).Error; err != nil {
		t.Fatal(err)
	}
	return owner, viewer
}

func promptTestInput(title, visibility string, tags ...string) PromptMutationRequest {
	return PromptMutationRequest{
		Title: title, Prompt: "主体、动作、镜头和光线的完整提示词。", Description: "用于提示词库权限和行为测试。",
		Tags: tags, Category: "cinematic", Mode: "image", ModelHint: "图片模型", Visibility: visibility,
	}
}

func promptErrorStatus(err error) int {
	var appErr *AppError
	if errors.As(err, &appErr) {
		return appErr.Status
	}
	return 0
}

func TestPromptVisibilityAndOwnershipBoundaries(t *testing.T) {
	svc, db := newPromptTestService(t)
	owner, viewer := promptTestUsers(t, db)

	private, err := svc.CreatePrompt(owner.ID, promptTestInput("作者私有提示词", promptVisibilityPrivate, "私有标签"))
	if err != nil {
		t.Fatal(err)
	}
	public, err := svc.CreatePrompt(owner.ID, promptTestInput("公开提示词", promptVisibilityPublic, "公开标签"))
	if err != nil {
		t.Fatal(err)
	}

	if _, err := svc.PromptDetail(viewer.ID, private.ID); promptErrorStatus(err) != 403 {
		t.Fatalf("private detail status = %d, want 403", promptErrorStatus(err))
	}
	detail, err := svc.PromptDetail(viewer.ID, public.ID)
	if err != nil {
		t.Fatal(err)
	}
	if detail.Prompt == "" || detail.AuthorName != owner.DisplayName {
		t.Fatalf("public detail = %+v, want body and owner display name", detail)
	}

	publicList, err := svc.Prompts(viewer.ID, PromptListRequest{Scope: "public", PageSize: 80})
	if err != nil {
		t.Fatal(err)
	}
	for _, item := range publicList.Prompts {
		if item.ID == private.ID {
			t.Fatalf("private prompt leaked into public list: %+v", item)
		}
		if item.Prompt != "" {
			t.Fatalf("list prompt body leaked for %s", item.ID)
		}
	}
	createdList, err := svc.Prompts(owner.ID, PromptListRequest{Scope: "created", PageSize: 80})
	if err != nil {
		t.Fatal(err)
	}
	if !containsPrompt(createdList.Prompts, private.ID) || !containsPrompt(createdList.Prompts, public.ID) {
		t.Fatalf("created list = %+v, want both owner prompts", createdList.Prompts)
	}
	viewerCreated, err := svc.Prompts(viewer.ID, PromptListRequest{Scope: "created", PageSize: 80})
	if err != nil {
		t.Fatal(err)
	}
	if containsPrompt(viewerCreated.Prompts, private.ID) || containsPrompt(viewerCreated.Prompts, public.ID) {
		t.Fatalf("viewer can see another user's created prompts: %+v", viewerCreated.Prompts)
	}

	if _, err := svc.UpdatePrompt(viewer.ID, public.ID, promptTestInput("越权修改", promptVisibilityPublic)); promptErrorStatus(err) != 403 {
		t.Fatalf("update by another user status = %d, want 403", promptErrorStatus(err))
	}
	if err := svc.DeletePrompt(viewer.ID, public.ID); promptErrorStatus(err) != 403 {
		t.Fatalf("delete by another user status = %d, want 403", promptErrorStatus(err))
	}
	updated, err := svc.UpdatePrompt(owner.ID, public.ID, promptTestInput("公开提示词已更新", promptVisibilityPublic, "新标签"))
	if err != nil {
		t.Fatal(err)
	}
	if updated.Title != "公开提示词已更新" {
		t.Fatalf("updated title = %q", updated.Title)
	}
	if err := svc.DeletePrompt(owner.ID, public.ID); err != nil {
		t.Fatal(err)
	}
	if _, err := svc.PromptDetail(viewer.ID, public.ID); promptErrorStatus(err) != 404 {
		t.Fatalf("deleted detail status = %d, want 404", promptErrorStatus(err))
	}

	if err := db.Model(&model.Prompt{}).Where("id = ?", private.ID).Update("status", 0).Error; err != nil {
		t.Fatal(err)
	}
	if _, err := svc.PromptDetail(owner.ID, private.ID); promptErrorStatus(err) != 404 {
		t.Fatalf("disabled detail status = %d, want 404", promptErrorStatus(err))
	}
}

func TestPromptFavoriteHistorySearchAndCustomTags(t *testing.T) {
	svc, db := newPromptTestService(t)
	owner, viewer := promptTestUsers(t, db)
	prompt, err := svc.CreatePrompt(owner.ID, promptTestInput("城市夜景收藏", promptVisibilityPublic, "霓虹自定义", "镜头语言"))
	if err != nil {
		t.Fatal(err)
	}

	favorited, err := svc.SetPromptFavorite(viewer.ID, prompt.ID, true)
	if err != nil {
		t.Fatal(err)
	}
	if !favorited.IsFavorite || favorited.FavoriteCount != 1 {
		t.Fatalf("favorited = %+v, want favorite and count 1", favorited)
	}
	if _, err := svc.UsePrompt(viewer.ID, prompt.ID); err != nil {
		t.Fatal(err)
	}
	used, err := svc.UsePrompt(viewer.ID, prompt.ID)
	if err != nil {
		t.Fatal(err)
	}
	if used.UseCount != 2 || used.LastUsedAt == nil {
		t.Fatalf("used = %+v, want two uses and last-used time", used)
	}

	favorites, err := svc.Prompts(viewer.ID, PromptListRequest{Scope: "favorites", PageSize: 80})
	if err != nil {
		t.Fatal(err)
	}
	if favorites.TotalCount != 1 || !containsPrompt(favorites.Prompts, prompt.ID) {
		t.Fatalf("favorites = %+v, want one prompt", favorites)
	}
	history, err := svc.Prompts(viewer.ID, PromptListRequest{Scope: "history", PageSize: 80})
	if err != nil {
		t.Fatal(err)
	}
	if history.TotalCount != 1 || !containsPrompt(history.Prompts, prompt.ID) {
		t.Fatalf("history = %+v, want one prompt", history)
	}
	mine, err := svc.Prompts(viewer.ID, PromptListRequest{Scope: "mine", PageSize: 80})
	if err != nil {
		t.Fatal(err)
	}
	if !containsPrompt(mine.Prompts, prompt.ID) {
		t.Fatalf("mine = %+v, want favorited public prompt", mine.Prompts)
	}

	search, err := svc.Prompts(viewer.ID, PromptListRequest{Scope: "public", Search: "霓虹自定义", Tag: "霓虹自定义", Category: "cinematic", Mode: "image", PageSize: 80})
	if err != nil {
		t.Fatal(err)
	}
	if search.TotalCount != 1 || !containsPrompt(search.Prompts, prompt.ID) {
		t.Fatalf("filtered search = %+v, want custom-tag match", search)
	}
	if !promptContainsString(search.Tags, "霓虹自定义") || !promptContainsString(search.Tags, "镜头语言") {
		t.Fatalf("filter tags = %v, want built-in and custom tags", search.Tags)
	}

	if _, err := svc.SetPromptFavorite(viewer.ID, prompt.ID, false); err != nil {
		t.Fatal(err)
	}
	favorites, err = svc.Prompts(viewer.ID, PromptListRequest{Scope: "favorites", PageSize: 80})
	if err != nil {
		t.Fatal(err)
	}
	if favorites.TotalCount != 0 {
		t.Fatalf("favorites after unfavorite = %+v, want empty", favorites)
	}
}

func TestPromptValidationAndBuiltinSeedAreDeterministic(t *testing.T) {
	svc, db := newPromptTestService(t)
	owner, viewer := promptTestUsers(t, db)

	invalid := promptTestInput("无效", promptVisibilityPublic)
	invalid.Category = "missing"
	if _, err := svc.CreatePrompt(owner.ID, invalid); promptErrorStatus(err) != 400 {
		t.Fatalf("invalid category status = %d, want 400", promptErrorStatus(err))
	}
	invalid = promptTestInput("无效", promptVisibilityPublic)
	invalid.CoverURL = "javascript:alert(1)"
	if _, err := svc.CreatePrompt(owner.ID, invalid); promptErrorStatus(err) != 400 {
		t.Fatalf("invalid cover status = %d, want 400", promptErrorStatus(err))
	}
	invalid = promptTestInput("无效", promptVisibilityPublic)
	invalid.Tags = []string{"1", "2", "3", "4", "5", "6", "7", "8", "9"}
	if _, err := svc.CreatePrompt(owner.ID, invalid); promptErrorStatus(err) != 400 {
		t.Fatalf("too many tags status = %d, want 400", promptErrorStatus(err))
	}

	if err := svc.EnsureBuiltinPrompts(); err != nil {
		t.Fatal(err)
	}
	var count int64
	if err := db.Model(&model.Prompt{}).Where("owner_id = ''").Count(&count).Error; err != nil {
		t.Fatal(err)
	}
	if count < 10 {
		t.Fatalf("builtin prompt count = %d, want at least 10", count)
	}
	var builtin model.Prompt
	if err := db.Where("owner_id = ''").First(&builtin).Error; err != nil {
		t.Fatal(err)
	}
	if _, err := svc.SetPromptFavorite(viewer.ID, builtin.ID, true); err != nil {
		t.Fatal(err)
	}
	if err := svc.EnsureBuiltinPrompts(); err != nil {
		t.Fatal(err)
	}
	detail, err := svc.PromptDetail(viewer.ID, builtin.ID)
	if err != nil {
		t.Fatal(err)
	}
	if !detail.IsFavorite {
		t.Fatal("builtin re-seed removed user's favorite state")
	}
}

func containsPrompt(items []PromptItem, id string) bool {
	for _, item := range items {
		if item.ID == id {
			return true
		}
	}
	return false
}

func promptContainsString(items []string, value string) bool {
	for _, item := range items {
		if item == value {
			return true
		}
	}
	return false
}
