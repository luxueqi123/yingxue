package repository

import (
	"testing"

	"infinite-canvas/backend/internal/model"
)

func TestPersonalAssetQuotaExcludesCaseReferencesAndKeepsTheirStorage(t *testing.T) {
	repo, db := newAssetLibraryTestRepository(t)
	if err := db.AutoMigrate(&model.AgentStorageUsage{}, &model.MCPStorageUsage{}); err != nil {
		t.Fatal(err)
	}
	if err := db.Create(&model.AgentStorageUsage{UserID: "owner"}).Error; err != nil {
		t.Fatal(err)
	}
	if err := db.Create(&model.MCPStorageUsage{UserID: "owner"}).Error; err != nil {
		t.Fatal(err)
	}
	// These empty tables exercise the actual cross-dialect storage aggregate.
	for _, sql := range []string{
		`CREATE TABLE canvas_projects (user_id TEXT, payload_json TEXT)`,
		`CREATE TABLE tasks (user_id TEXT, prompt TEXT, input_json TEXT, result_json TEXT, media_recovery_json TEXT, text_draft TEXT, error TEXT)`,
		`CREATE TABLE task_logs (user_id TEXT, message TEXT, payload TEXT)`,
		`CREATE TABLE results (user_id TEXT, url TEXT, payload TEXT)`,
		`CREATE TABLE task_text_delta (user_id TEXT, byte_count INTEGER)`,
		`CREATE TABLE api_call_logs (user_id TEXT, path TEXT, model TEXT, provider_request_id TEXT, error_code TEXT, error TEXT, upstream_url TEXT, request_body TEXT, response_body TEXT, generation_content_json TEXT)`,
	} {
		if err := db.Exec(sql).Error; err != nil {
			t.Fatal(err)
		}
	}
	rows := []model.Asset{
		{ID: "case", UserID: "owner", Kind: "image", PayloadJSON: `{"metadata":{"source":"case-import"},"data":{"storageKey":"resource:case"}}`},
		{ID: "old-case", UserID: "owner", Kind: "image", PayloadJSON: `{"metadata":{"source":"canvas-upload"},"data":{"dataUrl":"https://libtv-res.liblib.art/image.png"}}`},
		{ID: "personal", UserID: "owner", Kind: "image", PayloadJSON: `{"metadata":{"source":"generation-task","taskId":"real-task"}}`},
		{ID: "draft", UserID: "owner", Kind: "text", PayloadJSON: `{"metadata":{"source":"creative-studio"}}`},
		{ID: "other-user", UserID: "another", Kind: "image", PayloadJSON: `{}`},
	}
	if err := db.Create(&rows).Error; err != nil {
		t.Fatal(err)
	}
	var bytes int64
	for _, row := range rows[:4] {
		bytes += int64(len(row.PayloadJSON))
	}
	for name, read := range map[string]func(string) (UserStorageUsage, error){
		"full":       repo.UserStorageUsage,
		"structured": repo.UserStructuredStorageUsage,
	} {
		t.Run(name, func(t *testing.T) {
			usage, err := read("owner")
			if err != nil {
				t.Fatal(err)
			}
			if usage.AssetCount != 2 {
				t.Fatalf("personal quota count = %d, want 2", usage.AssetCount)
			}
			if usage.AssetBytes != bytes {
				t.Fatalf("stored bytes = %d, want %d including retained case references", usage.AssetBytes, bytes)
			}
		})
	}
	if _, err := repo.AssetForUser("owner", "case"); err != nil {
		t.Fatalf("case reference lost: %v", err)
	}
}
