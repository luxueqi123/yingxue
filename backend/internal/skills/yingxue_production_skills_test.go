package skills

import (
	"encoding/json"
	"os"
	"strings"
	"testing"

	"infinite-canvas/backend/internal/model"
	"infinite-canvas/backend/internal/repository"

	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

func TestProductionSkillsSeedAndUserState(t *testing.T) {
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{Logger: logger.Default.LogMode(logger.Silent)})
	if err != nil {
		if strings.Contains(err.Error(), "CGO_ENABLED=0") {
			t.Skip("当前 Go 环境未启用 CGO，SQLite 集成检查需要带 C 编译器的运行环境")
		}
		t.Fatal(err)
	}
	connection, err := db.DB()
	if err != nil {
		t.Fatal(err)
	}
	connection.SetMaxOpenConns(1)
	t.Cleanup(func() { _ = connection.Close() })
	if err = db.AutoMigrate(&model.User{}, &model.UserIdentity{}, &model.Skill{}, &model.UserSkillState{}, &model.SkillVersion{}, &model.SkillFile{}, &model.BuiltinSkillTombstone{}); err != nil {
		t.Fatal(err)
	}
	createSkillTestUser(t, db, "viewer", model.UserRoleUser, model.UserStatusActive)
	createSkillTestUser(t, db, "another-user", model.UserRoleUser, model.UserStatusActive)
	svc := New(repository.New(db), t.TempDir(), nil)
	if err = svc.EnsureBuiltinSkills(); err != nil {
		t.Fatal(err)
	}
	var definitions []builtinSkillDefinition
	if err = json.Unmarshal(productionSkillsJSON, &definitions); err != nil {
		t.Fatal(err)
	}
	packages, err := loadBuiltinSkillPackages(nil)
	if err != nil {
		t.Fatal(err)
	}
	var total int64
	if err = db.Model(&model.Skill{}).Count(&total).Error; err != nil {
		t.Fatal(err)
	}
	// 种子是内置库、制作技能库与图片编辑技能的并集，避免上游新增技能时基数写死。
	expected := len(packages)
	if total != int64(expected) {
		t.Fatalf("seeded %d skills, want %d", total, expected)
	}
	var selected builtinSkillDefinition
	for _, item := range definitions {
		if len(item.Files) > len(selected.Files) {
			selected = item
		}
	}
	if len(selected.Files) < 30 {
		t.Fatal("missing the long multi-file production skill")
	}
	if _, err = svc.SetSkillAdded("viewer", selected.SkillID, true); err != nil {
		t.Fatal(err)
	}
	if _, err = svc.SetSkillLiked("viewer", selected.SkillID, true); err != nil {
		t.Fatal(err)
	}
	if err = svc.EnsureBuiltinSkills(); err != nil {
		t.Fatal(err)
	}
	detail, err := svc.SkillDetail("viewer", selected.SkillID)
	if err != nil {
		t.Fatal(err)
	}
	if !detail.IsAdded || !detail.IsLike {
		t.Fatal("re-seeding lost user relationships")
	}
	if detail.Instruction != selected.Instruction || len(detail.Files) != len(selected.Files) {
		t.Fatal("skill content lost in detail API")
	}
	for i, file := range selected.Files {
		if detail.Files[i] != file {
			t.Fatalf("resource truncated: %s", file.Path)
		}
	}
	other, err := svc.SkillDetail("another-user", selected.SkillID)
	if err != nil {
		t.Fatal(err)
	}
	if other.IsAdded || other.IsLike {
		t.Fatal("skill relationships leaked between users")
	}
	list, err := svc.Skills("viewer", SkillListRequest{Page: 1, PageSize: 10, Scope: "public", Search: selected.SkillName})
	if err != nil {
		t.Fatal(err)
	}
	if list.TotalCount == 0 {
		t.Fatal("production skill not searchable")
	}
	for _, item := range list.Skills {
		if item.Instruction != "" || len(item.Files) != 0 {
			t.Fatal("list eagerly includes full skill resources")
		}
	}
}

func TestProductionCatalogDoesNotInventSourceUsage(t *testing.T) {
	var definitions []builtinSkillDefinition
	if err := json.Unmarshal(productionSkillsJSON, &definitions); err != nil {
		t.Fatal(err)
	}
	// 595 份既有技能与 16 份依赖完整的社区技能；缺依赖的 4 份不进入种子。
	if len(definitions) != 611 {
		t.Fatalf("got %d imported skills", len(definitions))
	}
	for _, item := range definitions {
		media := make([]SkillShowcaseMedia, 0, len(item.ShowcaseMedia))
		for _, source := range item.ShowcaseMedia {
			media = append(media, SkillShowcaseMedia{Type: source.Type, ShowcaseURI: source.ShowcaseURI, ShowcaseURL: source.ShowcaseURL})
		}
		if _, _, err := normalizeSkillMutationRequest(SkillMutationRequest{SkillName: item.SkillName, Description: item.Description, Instruction: item.Instruction, Tag: item.Tag, MarkdownURL: item.MarkdownURL, ShowcaseMedia: media, ExtraInfo: item.ExtraInfo}, true); err != nil {
			t.Fatalf("imported skill %s rejected by native contract: %v", item.SkillName, err)
		}
		if item.LikeCount != 0 || item.AddedCount != 0 {
			t.Fatal("source-platform usage must not become Yingxue usage")
		}
		if !strings.Contains(item.Instruction, "映雪运行约定") && !strings.Contains(item.Instruction, "映雪原生创作技能") {
			t.Fatalf("missing compatibility context: %s", item.SkillID)
		}
		seen := map[string]bool{}
		for _, file := range item.Files {
			if seen[file.Path] || file.Path == "SKILL.md" || strings.Contains(file.Path, "..") || strings.Contains(file.Path, ":") || strings.HasPrefix(file.Path, "/") {
				t.Fatalf("unsafe or duplicate resource %q", file.Path)
			}
			seen[file.Path] = true
		}
	}
}

func TestCommunitySkillsPersistThroughReseed(t *testing.T) {
	registryJSON, err := os.ReadFile("../../../web/src/lib/community-skill-support.json")
	if err != nil {
		t.Fatal(err)
	}
	var registry []struct {
		ID     string `json:"id"`
		Author string `json:"author"`
	}
	if err = json.Unmarshal(registryJSON, &registry); err != nil {
		t.Fatal(err)
	}
	if len(registry) != 16 {
		t.Fatalf("community intake count: %d", len(registry))
	}
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{Logger: logger.Default.LogMode(logger.Silent)})
	if err != nil {
		t.Fatal(err)
	}
	connection, err := db.DB()
	if err != nil {
		t.Fatal(err)
	}
	connection.SetMaxOpenConns(1)
	t.Cleanup(func() { _ = connection.Close() })
	if err = db.AutoMigrate(&model.User{}, &model.UserIdentity{}, &model.Skill{}, &model.UserSkillState{}, &model.SkillVersion{}, &model.SkillFile{}, &model.BuiltinSkillTombstone{}); err != nil {
		t.Fatal(err)
	}
	createSkillTestUser(t, db, "community-viewer", model.UserRoleUser, model.UserStatusActive)
	createSkillTestUser(t, db, "community-other", model.UserRoleUser, model.UserStatusActive)
	svc := New(repository.New(db), t.TempDir(), nil)
	if err = svc.EnsureBuiltinSkills(); err != nil {
		t.Fatal(err)
	}
	var definitions []builtinSkillDefinition
	if err = json.Unmarshal(productionSkillsJSON, &definitions); err != nil {
		t.Fatal(err)
	}
	instructions := map[string]string{}
	for _, definition := range definitions {
		instructions[definition.SkillID] = definition.Instruction
	}
	for _, item := range registry {
		if instructions[item.ID] == "" {
			t.Fatalf("missing seed %s", item.ID)
		}
		if _, err = svc.SetSkillAdded("community-viewer", item.ID, true); err != nil {
			t.Fatal(err)
		}
	}
	if err = svc.EnsureBuiltinSkills(); err != nil {
		t.Fatal(err)
	}
	for _, item := range registry {
		detail, err := svc.SkillDetail("community-viewer", item.ID)
		if err != nil {
			t.Fatal(err)
		}
		if !detail.IsAdded || detail.Instruction != instructions[item.ID] {
			t.Fatalf("lost content or relationship: %s", item.ID)
		}
		other, err := svc.SkillDetail("community-other", item.ID)
		if err != nil {
			t.Fatal(err)
		}
		if other.IsAdded {
			t.Fatalf("cross-user relationship: %s", item.ID)
		}
	}
}
