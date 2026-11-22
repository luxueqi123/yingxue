package database

import (
	"testing"

	"infinite-canvas/backend/internal/model"
)

func TestMigrateWorkbenchSchemaFromVersion47(t *testing.T) {
	db := mainMigrationDatabaseAt(t, 47)
	if err := db.Migrator().DropTable(&model.WorkbenchPreset{}, &model.WorkbenchTool{}); err != nil {
		t.Fatal(err)
	}
	if db.Migrator().HasColumn(&model.Task{}, "WorkbenchKind") {
		if err := db.Migrator().DropColumn(&model.Task{}, "WorkbenchKind"); err != nil {
			t.Fatal(err)
		}
	}
	if db.Migrator().HasTable(&model.WorkbenchTool{}) || db.Migrator().HasTable(&model.WorkbenchPreset{}) || db.Migrator().HasColumn(&model.Task{}, "WorkbenchKind") {
		t.Fatal("version 47 fixture still contains schema 48 workbench objects")
	}

	if err := MigrateSchema(db); err != nil {
		t.Fatal(err)
	}
	if !db.Migrator().HasTable(&model.WorkbenchTool{}) || !db.Migrator().HasTable(&model.WorkbenchPreset{}) || !db.Migrator().HasColumn(&model.Task{}, "WorkbenchKind") {
		t.Fatal("schema 48 did not create workbench tables and task kind")
	}
	var migrationRecord schemaMigration
	if err := db.First(&migrationRecord, "version = ?", int64(48)).Error; err != nil {
		t.Fatal(err)
	}
	if migrationRecord.Name != "workbench_tools_and_presets" || migrationRecord.Checksum != "sha256:yingxue-workbench-tools-presets-v48-20261028" {
		t.Fatalf("unexpected schema 48 record: %+v", migrationRecord)
	}

	tool := model.WorkbenchTool{ID: "migrated-tool", Kind: model.WorkbenchKindImage, Name: "Migrated tool"}
	preset := model.WorkbenchPreset{ID: "migrated-preset", ToolID: tool.ID, Name: "Migrated preset"}
	task := model.Task{ID: "migrated-task", UserID: "migrated-user", Type: "canvas_image", WorkbenchKind: model.WorkbenchKindImage}
	for _, record := range []any{&tool, &preset, &task} {
		if err := db.Create(record).Error; err != nil {
			t.Fatal(err)
		}
	}
	if err := MigrateSchema(db); err != nil {
		t.Fatal(err)
	}
	for _, check := range []struct {
		model any
		id    string
	}{{&model.WorkbenchTool{}, tool.ID}, {&model.WorkbenchPreset{}, preset.ID}, {&model.Task{}, task.ID}} {
		var count int64
		if err := db.Model(check.model).Where("id = ?", check.id).Count(&count).Error; err != nil || count != 1 {
			t.Fatalf("migration lost %T %q: count=%d error=%v", check.model, check.id, count, err)
		}
	}
}
