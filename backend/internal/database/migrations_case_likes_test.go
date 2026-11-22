package database

import (
	"infinite-canvas/backend/internal/model"
	"testing"
)

func TestCaseLikesMigrationPreservesExistingData(t *testing.T) {
	db, err := Open(Config{Driver: "sqlite", DSN: "file:case-like-migration?mode=memory&cache=shared"})
	if err != nil {
		t.Fatal(err)
	}
	if err := MigrateSchema(db); err != nil {
		t.Fatal(err)
	}
	if err := db.Migrator().DropTable(&model.CaseLike{}); err != nil {
		t.Fatal(err)
	}
	if err := db.Where("version = ?", 50).Delete(&schemaMigration{}).Error; err != nil {
		t.Fatal(err)
	}
	old := model.Project{ID: "case-like-existing-project", UserID: "owner", Name: "原有项目"}
	if err := db.Create(&old).Error; err != nil {
		t.Fatal(err)
	}
	for i := 0; i < 2; i++ {
		if err := MigrateSchema(db); err != nil {
			t.Fatal(err)
		}
	}
	var saved model.Project
	if err := db.First(&saved, "id = ?", old.ID).Error; err != nil {
		t.Fatal(err)
	}
	if saved.UserID != old.UserID || saved.Name != old.Name {
		t.Fatal("existing project changed")
	}
	if !db.Migrator().HasTable(&model.CaseLike{}) {
		t.Fatal("case likes table missing")
	}
	status, err := ReadSchemaStatus(db)
	if err != nil || !status.Ready || status.Current != CurrentSchemaVersion {
		t.Fatalf("schema: %+v %v", status, err)
	}
}
