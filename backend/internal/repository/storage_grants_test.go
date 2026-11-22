package repository

import (
	"errors"
	"testing"
	"time"

	"infinite-canvas/backend/internal/model"

	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

func TestUserStorageGrantSummaryIncludesOnlyActiveGrants(t *testing.T) {
	db, err := gorm.Open(sqlite.Open("file:"+t.Name()+"?mode=memory&cache=shared"), &gorm.Config{})
	if err != nil {
		t.Fatal(err)
	}
	if err := db.AutoMigrate(&model.UserStorageGrant{}); err != nil {
		t.Fatal(err)
	}
	now := time.Date(2026, 10, 29, 12, 0, 0, 0, time.UTC)
	expires := now.Add(24 * time.Hour)
	oldExpiry := now.Add(-time.Hour)
	futureStart := now.Add(time.Hour)
	revoked := now.Add(-time.Minute)
	rows := []model.UserStorageGrant{
		{ID: "permanent", UserID: "owner", Bytes: 1 << 30, StartsAt: now.Add(-time.Hour)},
		{ID: "active-expiring", UserID: "owner", Bytes: 2 << 30, StartsAt: now.Add(-time.Hour), ExpiresAt: &expires},
		{ID: "expired", UserID: "owner", Bytes: 4 << 30, StartsAt: now.Add(-48 * time.Hour), ExpiresAt: &oldExpiry},
		{ID: "future", UserID: "owner", Bytes: 8 << 30, StartsAt: futureStart},
		{ID: "revoked", UserID: "owner", Bytes: 16 << 30, StartsAt: now.Add(-time.Hour), RevokedAt: &revoked},
		{ID: "other-user", UserID: "other", Bytes: 32 << 30, StartsAt: now.Add(-time.Hour)},
	}
	if err := db.Create(&rows).Error; err != nil {
		t.Fatal(err)
	}

	bytes, nextExpiry, err := New(db).UserStorageGrantSummary("owner", now)
	if err != nil {
		t.Fatal(err)
	}
	if bytes != 3<<30 || nextExpiry == nil || !nextExpiry.Equal(expires) {
		t.Fatalf("UserStorageGrantSummary() = %d, %v", bytes, nextExpiry)
	}
}

func TestRevokeUserStorageGrantIsIdempotentAndScoped(t *testing.T) {
	db, err := gorm.Open(sqlite.Open("file:"+t.Name()+"?mode=memory&cache=shared"), &gorm.Config{})
	if err != nil {
		t.Fatal(err)
	}
	if err := db.AutoMigrate(&model.UserStorageGrant{}); err != nil {
		t.Fatal(err)
	}
	if err := db.Create(&model.UserStorageGrant{ID: "grant", UserID: "owner", Bytes: 1 << 30, StartsAt: time.Now()}).Error; err != nil {
		t.Fatal(err)
	}
	repo := New(db)
	first, err := repo.RevokeUserStorageGrant("grant", "admin", "support request", time.Now())
	if err != nil {
		t.Fatal(err)
	}
	second, err := repo.RevokeUserStorageGrant("grant", "other-admin", "duplicate retry", time.Now().Add(time.Minute))
	if err != nil {
		t.Fatal(err)
	}
	if first.RevokedAt == nil || second.RevokedAt == nil || !second.RevokedAt.Equal(*first.RevokedAt) || second.RevokedBy != "admin" || second.RevokeReason != "support request" {
		t.Fatalf("repeated revoke changed its audit data: first=%+v second=%+v", first, second)
	}
	if _, err := repo.RevokeUserStorageGrant("missing", "admin", "reason", time.Now()); !errors.Is(err, ErrStorageGrantNotFound) {
		t.Fatalf("missing grant error = %v", err)
	}
}

func TestStorageOverLimitStateKeepsFirstObservationAndCanReset(t *testing.T) {
	db, err := gorm.Open(sqlite.Open("file:"+t.Name()+"?mode=memory&cache=shared"), &gorm.Config{})
	if err != nil {
		t.Fatal(err)
	}
	if err := db.AutoMigrate(&model.UserStorageState{}); err != nil {
		t.Fatal(err)
	}
	repo := New(db)
	first := time.Date(2026, 10, 20, 12, 0, 0, 0, time.UTC)
	later := first.Add(48 * time.Hour)
	state, err := repo.MarkUserStorageOverLimit("owner", first)
	if err != nil {
		t.Fatal(err)
	}
	state, err = repo.MarkUserStorageOverLimit("owner", later)
	if err != nil {
		t.Fatal(err)
	}
	if state.OverLimitSince == nil || !state.OverLimitSince.Equal(first) {
		t.Fatalf("first over-limit timestamp moved: %#v", state)
	}
	if err := repo.ClearUserStorageOverLimit("owner", later); err != nil {
		t.Fatal(err)
	}
	state, err = repo.UserStorageState("owner")
	if err != nil || state == nil || state.OverLimitSince != nil {
		t.Fatalf("cleared over-limit state = %#v, %v", state, err)
	}
}
