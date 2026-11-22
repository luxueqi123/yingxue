package app

import (
	"errors"
	"strings"
	"testing"
	"time"

	"infinite-canvas/backend/internal/model"
	"infinite-canvas/backend/internal/repository"

	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

func newStorageCapacityTestService(t *testing.T) (*Service, *gorm.DB) {
	t.Helper()
	db, err := gorm.Open(sqlite.Open("file:"+t.Name()+"?mode=memory&cache=shared"), &gorm.Config{})
	if err != nil {
		t.Fatal(err)
	}
	sqlDB, err := db.DB()
	if err != nil {
		t.Fatal(err)
	}
	sqlDB.SetMaxOpenConns(1)
	if err := db.AutoMigrate(&model.CreditAccount{}); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = sqlDB.Close() })
	if err := db.AutoMigrate(&model.SystemSetting{}, &model.User{}, &model.Resource{}, &model.UserStorageGrant{}, &model.UserStorageState{}, &model.AdminAuditEvent{}, &model.UserDailyUploadUsage{}, &model.UploadReservation{}); err != nil {
		t.Fatal(err)
	}
	if err := db.AutoMigrate(&model.Asset{}, &model.CanvasProject{}, &model.Task{}, &model.TaskLog{}, &model.Result{}, &model.ApiCallLog{}, &model.TaskTextDelta{}); err != nil {
		t.Fatal(err)
	}
	return &Service{repo: repository.New(db)}, db
}

func TestActiveStorageGrantsExtendUploadChunkAndTaskAdmission(t *testing.T) {
	svc, _ := newStorageCapacityTestService(t)
	policy, err := svc.RuntimePolicy()
	if err != nil {
		t.Fatal(err)
	}
	base := gigabytes(policy.Resource.StoredFileGB)
	if err := svc.repo.Create(&model.UserStorageGrant{
		ID: "owner-grant", UserID: "owner", Source: model.UserStorageGrantSourceAdmin,
		Bytes: 2 << 30, StartsAt: time.Now().Add(-time.Hour), CreatedAt: time.Now(),
	}); err != nil {
		t.Fatal(err)
	}
	if err := svc.repo.Create(&model.Resource{
		ID: "base-resource", UserID: "owner", Provider: "local", ObjectKey: "base-object",
		Status: model.ResourceStatusReady, Size: base,
	}); err != nil {
		t.Fatal(err)
	}
	limit, err := svc.storedFileLimit("owner", policy)
	if err != nil || limit != base+(2<<30) {
		t.Fatalf("storedFileLimit() = %d, %v; want %d", limit, err, base+(2<<30))
	}
	if err := svc.requireStoredFileCapacityForTask("owner", "video_generate", policy); err != nil {
		t.Fatalf("task admission did not use the extension: %v", err)
	}
	day, err := svc.reserveUserUploadQuota("owner", 1)
	if err != nil {
		t.Fatalf("upload admission did not use the extension: %v", err)
	}
	svc.releaseUserUploadQuota("owner", day, 1)

	reservationID := "chunk-session"
	if err := svc.ReserveChunkUploadSession("owner", reservationID, 10, time.Now().Add(time.Hour), 32); err != nil {
		t.Fatalf("chunk reservation did not use the extension: %v", err)
	}
	resource := &model.Resource{
		ID: "chunk-resource", UserID: "owner", Provider: "local", ObjectKey: "chunk-object",
		Status: model.ResourceStatusReady, Size: 10,
	}
	if err := svc.saveResourceWithinStorageLimit(resource, reservationID); err != nil {
		t.Fatalf("chunk commit did not use the extension: %v", err)
	}
}

func TestStorageOverLimitStartsSevenDayGraceAndRecoversAfterCleanup(t *testing.T) {
	svc, _ := newStorageCapacityTestService(t)
	policy, err := svc.RuntimePolicy()
	if err != nil {
		t.Fatal(err)
	}
	base := gigabytes(policy.Resource.StoredFileGB)
	resource := &model.Resource{
		ID: "over-limit-resource", UserID: "owner", Provider: "local", ObjectKey: "over-limit-object",
		Status: model.ResourceStatusReady, Size: base + 1,
	}
	if err := svc.repo.Create(resource); err != nil {
		t.Fatal(err)
	}
	usage, err := svc.AccountFileStorageUsage("owner")
	if err != nil {
		t.Fatal(err)
	}
	if !usage.OverLimit || usage.ReadOnly || usage.OverLimitSince == nil || usage.ReadOnlyAt == nil || !usage.ReadOnlyAt.Equal(usage.OverLimitSince.Add(7*24*time.Hour)) {
		t.Fatalf("new over-limit status = %#v", usage)
	}

	old := time.Now().Add(-8 * 24 * time.Hour)
	if err := svc.repo.Save(&model.UserStorageState{UserID: "owner", OverLimitSince: &old, UpdatedAt: time.Now()}); err != nil {
		t.Fatal(err)
	}
	svc.invalidateStorageStatus("owner")
	err = svc.RequireStorageWritable("owner")
	var appErr *AppError
	if !errors.As(err, &appErr) || appErr.Code != CodeStorageReadOnly || appErr.Reason != ReasonStorageReadOnly || appErr.Details["readOnlyAt"] == nil {
		t.Fatalf("expired grace error = %#v (%v)", appErr, err)
	}

	resource.Size = base - 1
	if err := svc.repo.Save(resource); err != nil {
		t.Fatal(err)
	}
	usage, err = svc.AccountFileStorageUsage("owner")
	if err != nil || usage.OverLimit || usage.ReadOnly || usage.OverLimitSince != nil {
		t.Fatalf("post-cleanup status = %#v, %v", usage, err)
	}
	if err := svc.RequireStorageWritable("owner"); err != nil {
		t.Fatalf("cleanup did not restore writes: %v", err)
	}
	state, err := svc.repo.UserStorageState("owner")
	if err != nil || state == nil || state.OverLimitSince != nil {
		t.Fatalf("post-cleanup state = %#v, %v", state, err)
	}
}

func TestAdminStorageGrantAndRevokeAudit(t *testing.T) {
	svc, db := newStorageCapacityTestService(t)
	admin := model.User{ID: "admin", Username: "admin", Role: model.UserRoleAdmin, Status: model.UserStatusActive}
	user := model.User{ID: "owner", Username: "owner", Role: model.UserRoleUser, Status: model.UserStatusActive}
	if err := db.Create(&admin).Error; err != nil {
		t.Fatal(err)
	}
	if err := db.Create(&user).Error; err != nil {
		t.Fatal(err)
	}
	if _, err := svc.AdminGrantUserStorage(&user, user.ID, AdminStorageGrantRequest{Bytes: 1 << 30}); err == nil {
		t.Fatal("non-admin storage grant was accepted")
	}
	grant, err := svc.AdminGrantUserStorage(&admin, user.ID, AdminStorageGrantRequest{Bytes: 3 << 30, DurationDays: 30, Note: "support"})
	if err != nil {
		t.Fatal(err)
	}
	if grant.Source != model.UserStorageGrantSourceAdmin || grant.ExpiresAt == nil || grant.CreatedBy != admin.ID {
		t.Fatalf("admin grant = %#v", grant)
	}
	usage, err := svc.AccountFileStorageUsage(user.ID)
	if err != nil || usage.PurchasedBytes != 3<<30 {
		t.Fatalf("granted storage usage = %#v, %v", usage, err)
	}
	if _, err := svc.AdminRevokeUserStorageGrant(&admin, grant.ID, RevokeStorageGrantRequest{Reason: "  "}); err == nil {
		t.Fatal("empty revoke reason was accepted")
	}
	revoked, err := svc.AdminRevokeUserStorageGrant(&admin, grant.ID, RevokeStorageGrantRequest{Reason: "owner request"})
	if err != nil {
		t.Fatal(err)
	}
	if revoked.RevokedAt == nil || revoked.RevokedBy != admin.ID || revoked.RevokeReason != "owner request" {
		t.Fatalf("revoked grant = %#v", revoked)
	}
	usage, err = svc.AccountFileStorageUsage(user.ID)
	if err != nil || usage.PurchasedBytes != 0 {
		t.Fatalf("revoked storage usage = %#v, %v", usage, err)
	}
	var audits int64
	if err := db.Model(&model.AdminAuditEvent{}).Where("action IN ?", []string{"storage_grant.create", "storage_grant.revoke"}).Count(&audits).Error; err != nil {
		t.Fatal(err)
	}
	if audits != 2 {
		t.Fatalf("storage grant audit entries = %d", audits)
	}
}

func TestStorageGrantValidationRejectsInvalidByteAndDurationValues(t *testing.T) {
	for _, value := range []struct {
		bytes int64
		days  int
	}{
		{bytes: 0}, {bytes: (1 << 30) + 1}, {bytes: (100001 << 30)}, {bytes: 1 << 30, days: -1}, {bytes: 1 << 30, days: 3651},
	} {
		if err := validStorageGrantSize(value.bytes, value.days); err == nil || !strings.Contains(err.Error(), "扩容") {
			t.Errorf("validStorageGrantSize(%d,%d) = %v", value.bytes, value.days, err)
		}
	}
	if err := validStorageGrantSize(1<<30, 0); err != nil {
		t.Fatalf("permanent 1GB grant rejected: %v", err)
	}
}
