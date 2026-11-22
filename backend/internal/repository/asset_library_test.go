package repository

import (
	"errors"
	"fmt"
	"strings"
	"testing"
	"time"

	"infinite-canvas/backend/internal/model"

	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

func newAssetLibraryTestRepository(t *testing.T) (*Repository, *gorm.DB) {
	t.Helper()
	db, err := gorm.Open(sqlite.Open(fmt.Sprintf("file:asset-library-test-%d?mode=memory&cache=shared", time.Now().UnixNano())), &gorm.Config{})
	if err != nil {
		t.Fatal(err)
	}
	if err := db.AutoMigrate(&model.Asset{}, &model.AssetFolder{}); err != nil {
		t.Fatal(err)
	}
	return New(db), db
}

func TestPersonalAssetLibraryRetainsEmptyAndNonJSONEntityPayloads(t *testing.T) {
	r, db := newAssetLibraryTestRepository(t)
	for index, payload := range []string{"", "legacy-payload", "{}", "null"} {
		asset := model.Asset{ID: fmt.Sprintf("entity-%d", index), UserID: "owner", Kind: "entity", Category: model.AssetCategoryCharacter, PayloadJSON: payload}
		if err := db.Create(&asset).Error; err != nil {
			t.Fatal(err)
		}
	}
	var count int64
	if err := personalAssetLibraryQuery(r.db.Model(&model.Asset{}).Where("user_id = ?", "owner")).Count(&count).Error; err != nil {
		t.Fatal(err)
	}
	if count != 4 {
		t.Fatalf("personal entity count = %d, want 4", count)
	}
}

func TestPersonalAssetLibraryExcludesCaseReferencesButPreservesCanvasAccess(t *testing.T) {
	repo, db := newAssetLibraryTestRepository(t)
	payloads := []string{
		`{"metadata":{"source":"canvas-upload"},"data":{"url":"https://libtv-res.liblib.art/case.mp4"}}`,
		`{"metadata":{"source":"case-import"},"data":{"storageKey":"resource:case"}}`,
		`{"metadata":{"source":"canvas-upload"},"data":{"dataUrl":"/production-library/case-media/case/image.png"}}`,
		`{"metadata":{"source":"generation-task","taskId":"task-1"}}`,
		`{"metadata":{"source":"canvas-manual"},"data":{"url":"https://libtv-res.liblib.art/case.mp4"}}`,
		`{"metadata":{"source":"canvas-upload"},"data":{"storageKey":"resource:mine"}}`,
		`{"metadata":{"source":"case-import","taskId":"task-2"}}`,
	}
	for index, payload := range payloads {
		asset := model.Asset{ID: fmt.Sprintf("origin-%d", index), UserID: "user-1", Kind: "image", Category: model.AssetCategoryMaterial, Status: model.AssetVersionStatusConfirmed, PayloadJSON: payload}
		if err := db.Create(&asset).Error; err != nil {
			t.Fatal(err)
		}
	}
	rows, total, err := repo.UserAssetsPage("user-1", 1, 2, UserAssetPageFilter{Status: "active"})
	if err != nil || total != 4 || len(rows) != 2 {
		t.Fatalf("personal page: rows=%d total=%d err=%v", len(rows), total, err)
	}
	kinds, _, _, err := repo.UserAssetFacets("user-1", "active")
	if err != nil || len(kinds) != 1 || kinds[0].Count != 4 {
		t.Fatalf("personal facets: %#v err=%v", kinds, err)
	}
	if _, err := repo.AssetForUser("user-1", "origin-0"); err != nil {
		t.Fatalf("case reference no longer accessible to its canvas: %v", err)
	}
	if _, err := repo.AssetForUser("user-2", "origin-0"); !errors.Is(err, gorm.ErrRecordNotFound) {
		t.Fatalf("cross-user case reference read: %v", err)
	}
}

func TestUserCharacterAssetsPageReturnsStablePages(t *testing.T) {
	repo, db := newAssetLibraryTestRepository(t)
	now := time.Now().UTC()
	for index, title := range []string{"甲", "乙", "丙"} {
		asset := model.Asset{ID: fmt.Sprintf("character-%d", index), UserID: "user-1", Kind: "entity", Category: model.AssetCategoryCharacter, Status: model.AssetVersionStatusConfirmed, Title: title, PayloadJSON: "{}", CreatedAt: now, UpdatedAt: now.Add(time.Duration(index) * time.Second)}
		if err := db.Create(&asset).Error; err != nil {
			t.Fatal(err)
		}
	}
	if err := db.Create(&model.Asset{ID: "image-1", UserID: "user-1", Kind: "image", Category: model.AssetCategoryMaterial, Status: model.AssetVersionStatusConfirmed, Title: "不是角色", PayloadJSON: "{}", CreatedAt: now, UpdatedAt: now}).Error; err != nil {
		t.Fatal(err)
	}
	first, total, err := repo.UserCharacterAssetsPage("user-1", "", 1, 2)
	if err != nil {
		t.Fatal(err)
	}
	second, _, err := repo.UserCharacterAssetsPage("user-1", "乙", 1, 2)
	if err != nil {
		t.Fatal(err)
	}
	if total != 3 || len(first) != 2 || first[0].ID != "character-2" || len(second) != 1 || second[0].Title != "乙" {
		t.Fatalf("page = total %d first %#v search %#v", total, first, second)
	}
}

func TestUserAssetsPagePaginatesAndIsolatesUsers(t *testing.T) {
	repo, db := newAssetLibraryTestRepository(t)
	now := time.Now().UTC()
	for _, asset := range []model.Asset{
		{ID: "asset-1", UserID: "user-1", Kind: "image", Category: model.AssetCategoryMaterial, Status: model.AssetVersionStatusConfirmed, Title: "海边", PayloadJSON: `{"id":"asset-1","title":"海边"}`, CreatedAt: now, UpdatedAt: now},
		{ID: "asset-2", UserID: "user-1", Kind: "image", Category: model.AssetCategoryMaterial, Status: model.AssetVersionStatusConfirmed, Title: "室内", PayloadJSON: `{"id":"asset-2","title":"室内"}`, CreatedAt: now, UpdatedAt: now.Add(time.Second)},
		{ID: "asset-3", UserID: "user-1", Kind: "text", Category: model.AssetCategoryOther, Status: model.AssetVersionStatusConfirmed, Title: "提示词", PayloadJSON: `{"id":"asset-3","title":"提示词"}`, CreatedAt: now, UpdatedAt: now.Add(2 * time.Second)},
		{ID: "asset-4", UserID: "user-2", Kind: "image", Category: model.AssetCategoryMaterial, Status: model.AssetVersionStatusConfirmed, Title: "他人素材", PayloadJSON: `{"id":"asset-4","title":"他人素材"}`, CreatedAt: now, UpdatedAt: now},
	} {
		if err := db.Create(&asset).Error; err != nil {
			t.Fatal(err)
		}
	}

	assets, total, err := repo.UserAssetsPage("user-1", 2, 1, UserAssetPageFilter{Kind: "image", Status: "active"})
	if err != nil {
		t.Fatal(err)
	}
	if total != 2 || len(assets) != 1 || assets[0].ID != "asset-1" {
		t.Fatalf("page result = total %d, assets %#v; want total 2 and asset-1", total, assets)
	}
}

func TestDeleteAssetFolderMovesAssetsToUncategorized(t *testing.T) {
	repo, db := newAssetLibraryTestRepository(t)
	now := time.Now().UTC()
	folder := model.AssetFolder{ID: "folder-1", UserID: "user-1", Name: "灵感", NameKey: "灵感", Position: 0, CreatedAt: now, UpdatedAt: now}
	asset := model.Asset{ID: "asset-1", UserID: "user-1", FolderID: folder.ID, Kind: "image", Category: model.AssetCategoryMaterial, Status: model.AssetVersionStatusConfirmed, Title: "海边", PayloadJSON: `{"id":"asset-1","folderId":"folder-1"}`, CreatedAt: now, UpdatedAt: now}
	if err := db.Create(&folder).Error; err != nil {
		t.Fatal(err)
	}
	if err := db.Create(&asset).Error; err != nil {
		t.Fatal(err)
	}

	if err := repo.DeleteAssetFolder("user-1", folder.ID); err != nil {
		t.Fatal(err)
	}
	var moved model.Asset
	if err := db.First(&moved, "id = ?", asset.ID).Error; err != nil {
		t.Fatal(err)
	}
	if moved.FolderID != "" || strings.Contains(moved.PayloadJSON, "folderId") {
		t.Fatalf("asset after folder deletion = %#v", moved)
	}
}

func TestMoveUserAssetsToFolderRollsBackWhenAnyAssetIsForeign(t *testing.T) {
	repo, db := newAssetLibraryTestRepository(t)
	now := time.Now().UTC()
	folder := model.AssetFolder{ID: "folder-1", UserID: "user-1", Name: "灵感", NameKey: "灵感", Position: 0, CreatedAt: now, UpdatedAt: now}
	assets := []model.Asset{
		{ID: "asset-1", UserID: "user-1", Kind: "image", Category: model.AssetCategoryMaterial, Status: model.AssetVersionStatusConfirmed, Title: "海边", PayloadJSON: `{"id":"asset-1"}`, CreatedAt: now, UpdatedAt: now},
		{ID: "asset-2", UserID: "user-2", Kind: "image", Category: model.AssetCategoryMaterial, Status: model.AssetVersionStatusConfirmed, Title: "他人素材", PayloadJSON: `{"id":"asset-2"}`, CreatedAt: now, UpdatedAt: now},
	}
	if err := db.Create(&folder).Error; err != nil {
		t.Fatal(err)
	}
	for index := range assets {
		if err := db.Create(&assets[index]).Error; err != nil {
			t.Fatal(err)
		}
	}

	if err := repo.MoveUserAssetsToFolder("user-1", []string{"asset-1", "asset-2"}, folder.ID); !errors.Is(err, gorm.ErrRecordNotFound) {
		t.Fatalf("move error = %v, want record-not-found", err)
	}
	var unchanged model.Asset
	if err := db.First(&unchanged, "id = ?", "asset-1").Error; err != nil {
		t.Fatal(err)
	}
	if unchanged.FolderID != "" {
		t.Fatalf("foreign asset caused partial move: %#v", unchanged)
	}
}
