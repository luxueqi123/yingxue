package app

import (
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
	"infinite-canvas/backend/internal/model"
	"infinite-canvas/backend/internal/repository"
	"path/filepath"
	"strings"
	"testing"
)

func TestCaseReactionPersistsAndIsolatesVotes(t *testing.T) {
	path := filepath.Join(t.TempDir(), "likes.db")
	db, err := gorm.Open(sqlite.Open(path), &gorm.Config{})
	if err != nil {
		t.Fatal(err)
	}
	if err := db.AutoMigrate(&model.CaseLike{}); err != nil {
		t.Fatal(err)
	}
	svc := &Service{repo: repository.New(db)}
	ids := strings.Fields(publishedCaseIDs)
	if len(ids) != 200 {
		t.Fatalf("publication count: %d", len(ids))
	}
	a := &model.User{ID: "alice", Status: model.UserStatusActive}
	b := &model.User{ID: "bob", Status: model.UserStatusActive}
	for i := 0; i < 3; i++ {
		result, err := svc.SetCaseLiked(a, ids[0], true)
		if err != nil || result.Count != 1 || !result.Liked {
			t.Fatalf("idempotent like: %+v %v", result, err)
		}
	}
	result, err := svc.CaseReaction(b, ids[0])
	if err != nil || result.Liked || result.Count != 1 {
		t.Fatalf("account isolation: %+v %v", result, err)
	}
	if _, err := svc.SetCaseLiked(b, ids[0], true); err != nil {
		t.Fatal(err)
	}
	for i := 0; i < 2; i++ {
		result, err = svc.SetCaseLiked(a, ids[0], false)
		if err != nil || result.Count != 1 || result.Liked {
			t.Fatalf("idempotent unlike: %+v %v", result, err)
		}
	}
	sqlDB, _ := db.DB()
	if err := sqlDB.Close(); err != nil {
		t.Fatal(err)
	}
	reopened, err := gorm.Open(sqlite.Open(path), &gorm.Config{})
	if err != nil {
		t.Fatal(err)
	}
	reopenedSQL, err := reopened.DB()
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = reopenedSQL.Close() })
	svc.repo = repository.New(reopened)
	result, err = svc.CaseReaction(b, ids[0])
	if err != nil || result.Count != 1 || !result.Liked {
		t.Fatalf("persistent vote: %+v %v", result, err)
	}
	result, err = svc.CaseReaction(nil, ids[0])
	if err != nil || result.Count != 1 || result.Liked {
		t.Fatalf("public count: %+v %v", result, err)
	}
	result, err = svc.CaseReaction(b, ids[1])
	if err != nil || result.Count != 0 || result.Liked {
		t.Fatalf("case isolation: %+v %v", result, err)
	}
	if _, err := svc.SetCaseLiked(nil, ids[0], true); err == nil {
		t.Fatal("anonymous write accepted")
	}
	if _, err := svc.SetCaseLiked(&model.User{ID: "disabled", Status: model.UserStatusDisabled}, ids[0], true); err == nil {
		t.Fatal("disabled write accepted")
	}
	if _, err := svc.SetCaseLiked(a, "case-unpublished", true); err == nil {
		t.Fatal("unpublished write accepted")
	}
	if _, err := svc.CaseReaction(nil, ids[0]+"\n"+ids[1]); err == nil {
		t.Fatal("multiple identifiers accepted")
	}
}
