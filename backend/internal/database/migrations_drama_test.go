package database

import (
	"testing"

	"infinite-canvas/backend/internal/model"
)

func TestDramaMigration49PreservesLegacyRowsAndReplays(t *testing.T) {
	db, err := Open(Config{Driver: "sqlite", DSN: "file:drama-migration-49?mode=memory&cache=shared"})
	if err != nil {
		t.Fatal(err)
	}
	if err := MigrateSchema(db); err != nil {
		t.Fatal(err)
	}
	for _, entity := range []any{&model.DramaProduction{}, &model.DramaCast{}, &model.DramaEpisode{}, &model.DramaShot{}, &model.DramaSegment{}, &model.DramaTake{}, &model.DramaJob{}} {
		if err := db.Migrator().DropTable(entity); err != nil {
			t.Fatal(err)
		}
	}
	if err := db.Where("version = ?", 49).Delete(&schemaMigration{}).Error; err != nil {
		t.Fatal(err)
	}
	legacy := model.Project{ID: "legacy49", UserID: "owner", Name: "保留旧项目"}
	chapter := model.ProjectUnit{ID: "chapter49", ProjectID: legacy.ID, SourceText: "原始章节"}
	shot := model.Shot{ID: "shot49", ProjectID: legacy.ID}
	for _, row := range []any{&legacy, &chapter, &shot} {
		if err := db.Create(row).Error; err != nil {
			t.Fatal(err)
		}
	}
	for i := 0; i < 2; i++ {
		if err := MigrateSchema(db); err != nil {
			t.Fatal(err)
		}
	}
	status, err := ReadSchemaStatus(db)
	if err != nil || !status.Ready || status.Current != CurrentSchemaVersion {
		t.Fatalf("schema: %+v %v", status, err)
	}
	for _, entity := range []any{&model.DramaProduction{}, &model.DramaCast{}, &model.DramaEpisode{}, &model.DramaShot{}, &model.DramaSegment{}, &model.DramaTake{}, &model.DramaJob{}} {
		if !db.Migrator().HasTable(entity) {
			t.Fatalf("drama table missing: %T", entity)
		}
	}
	var saved model.ProjectUnit
	if err := db.First(&saved, "id = ?", chapter.ID).Error; err != nil || saved.SourceText != chapter.SourceText {
		t.Fatalf("legacy content changed: %+v %v", saved, err)
	}
	if err := db.First(&legacy, "id = ?", legacy.ID).Error; err != nil {
		t.Fatal(err)
	}
	if err := db.First(&shot, "id = ?", shot.ID).Error; err != nil {
		t.Fatal(err)
	}
}
