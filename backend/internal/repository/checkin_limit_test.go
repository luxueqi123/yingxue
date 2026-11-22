package repository

import (
	"errors"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
	"infinite-canvas/backend/internal/model"
	"testing"
	"time"
)

func TestMonthlyCheckinCapAndIdempotency(t *testing.T) {
	db, err := gorm.Open(sqlite.Open("file:checkin-limit?mode=memory&cache=shared"), &gorm.Config{})
	if err != nil {
		t.Fatal(err)
	}
	if err = db.AutoMigrate(&model.CreditAccount{}, &model.CreditLedgerEntry{}); err != nil {
		t.Fatal(err)
	}
	r := New(db)
	now := time.Now().UTC()
	key := "checkin:cap-user:prior"
	if err = db.Create(&model.CreditLedgerEntry{ID: "prior", UserID: "cap-user", Type: model.CreditLedgerCheckinBonus, AmountMicrocredits: 295, ReferenceKey: &key, CreatedAt: now}).Error; err != nil {
		t.Fatal(err)
	}
	a, granted, err := r.GrantMonthlyCheckin("cap-user", 10, 300, now)
	if err != nil || !granted || a.AvailableMicrocredits != 5 {
		t.Fatalf("cap: %#v %v %v", a, granted, err)
	}
	_, granted, err = r.GrantMonthlyCheckin("cap-user", 10, 300, now)
	if err != nil || granted {
		t.Fatalf("duplicate: %v %v", granted, err)
	}
	day := now.AddDate(0, 0, -1)
	if day.Month() != now.Month() {
		day = now.AddDate(0, 0, 1)
	}
	_, _, err = r.GrantMonthlyCheckin("cap-user", 10, 300, day)
	if !errors.Is(err, ErrMonthlyCheckinLimit) {
		t.Fatalf("expected monthly limit: %v", err)
	}
}
