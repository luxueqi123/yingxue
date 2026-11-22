package app

import (
	"testing"
	"time"

	"infinite-canvas/backend/internal/model"
)

func TestDramaNativeDraftOwnershipAndLegacyPreservation(t *testing.T) {
	svc, db := newTimelineTaskTestService(t)
	if err := db.Create(&model.User{ID: "owner", Username: "owner", Role: model.UserRoleUser, Status: model.UserStatusActive}).Error; err != nil {
		t.Fatal(err)
	}
	legacy := model.Project{ID: "legacy", UserID: "owner", Name: "旧项目", Status: model.ProjectStatusActive}
	chapter := model.ProjectUnit{ID: "old-chapter", ProjectID: legacy.ID, SourceText: "旧章节正文", Kind: model.ProjectUnitKindChapter}
	shot := model.Shot{ID: "old-shot", ProjectID: legacy.ID}
	for _, row := range []any{&legacy, &chapter, &shot} {
		if err := db.Create(row).Error; err != nil {
			t.Fatal(err)
		}
	}
	created, err := svc.CreateDrama("owner", CreateDramaRequest{Name: "原生逐集短剧", EpisodeMode: DramaEpisodeModeChapter, Chapters: []DramaChapterInput{{Title: "第一集", Text: "主角走进大厅。"}}})
	if err != nil {
		t.Fatal(err)
	}
	if created.Production.Status != model.DramaStatusDraft || len(created.Episodes) != 1 {
		t.Fatalf("unexpected draft: %+v", created)
	}
	if _, err := svc.DramaSummary("other", created.Project.ID); err == nil {
		t.Fatal("another user read a drama")
	}
	chapters, err := svc.repo.DramaChapters(created.Project.ID)
	if err != nil || len(chapters) != 1 {
		t.Fatalf("chapters: %+v %v", chapters, err)
	}
	if _, err := svc.UpdateDramaChapter("other", created.Project.ID, chapters[0].ID, UpdateDramaChapterRequest{}); err == nil {
		t.Fatal("another user edited a chapter")
	}
	var saved model.ProjectUnit
	if err := db.First(&saved, "id = ?", chapter.ID).Error; err != nil || saved.SourceText != chapter.SourceText {
		t.Fatalf("legacy chapter changed: %+v %v", saved, err)
	}
	var savedShot model.Shot
	if err := db.First(&savedShot, "id = ?", shot.ID).Error; err != nil {
		t.Fatalf("legacy shot lost: %v", err)
	}
	if _, err := svc.SetDramaRunning("owner", created.Project.ID, true); err == nil {
		t.Fatal("started without models")
	}
	fresh, err := svc.DramaSummary("owner", created.Project.ID)
	if err != nil || fresh.Production.Status != model.DramaStatusDraft {
		t.Fatalf("failed start changed draft: %+v %v", fresh, err)
	}
	if err := svc.DeleteProject("owner", created.Project.ID); err != nil {
		t.Fatal(err)
	}
	var count int64
	if err := db.Model(&model.DramaProduction{}).Where("project_id = ?", created.Project.ID).Count(&count).Error; err != nil || count != 0 {
		t.Fatalf("orphan drama: %d %v", count, err)
	}
	if err := db.First(&legacy, "id = ?", legacy.ID).Error; err != nil {
		t.Fatalf("legacy project lost: %v", err)
	}
}

func TestDramaNativeResourcesProtectCurrentAndHistoricalSlots(t *testing.T) {
	svc, db := newTimelineTaskTestService(t)
	production := model.DramaProduction{ProjectID: "drama", UserID: "owner", CreatedAt: time.Now()}
	for _, row := range []any{&production,
		&model.DramaCast{ID: "cast", ProjectID: "drama", ImageResourceID: "cast-image"},
		&model.DramaEpisode{ID: "episode", ProjectID: "drama", Number: 1, FinalResourceID: "final"},
		&model.DramaSegment{ID: "segment", ProjectID: "drama", EpisodeID: "episode", VideoResourceID: "video", TailFrameResourceID: "tail"},
		&model.DramaTake{ID: "take", ProjectID: "drama", ResourceID: "historical"},
	} {
		if err := db.Create(row).Error; err != nil {
			t.Fatal(err)
		}
	}
	ids := []string{"cast-image", "final", "video", "tail", "historical"}
	snapshot, err := svc.repo.ResourceReferenceSnapshot("owner", "", ids)
	if err != nil {
		t.Fatal(err)
	}
	found := map[string]bool{}
	for _, reference := range snapshot.Direct {
		found[reference.ResourceID] = true
	}
	for _, id := range ids {
		if !found[id] {
			t.Fatalf("unprotected drama resource: %s", id)
		}
	}
	other, err := svc.repo.ResourceReferenceSnapshot("other", "", ids)
	if err != nil {
		t.Fatal(err)
	}
	if len(other.Direct) != 0 {
		t.Fatalf("cross-user drama references: %+v", other.Direct)
	}
}
