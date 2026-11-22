package database

import (
	"infinite-canvas/backend/internal/model"
	"testing"
)

func TestMembershipMigrationPreservesLegacyFunds(t *testing.T) {
	db, err := Open(Config{Driver: "sqlite", DataDir: t.TempDir()})
	if err != nil {
		t.Fatal(err)
	}
	if err := MigrateSchema(db); err != nil {
		t.Fatal(err)
	}
	for _, entity := range []any{&model.MembershipCreditAllocation{}, &model.MembershipCreditLot{}, &model.MembershipSubscription{}, &model.MembershipPlan{}} {
		if err := db.Migrator().DropTable(entity); err != nil {
			t.Fatal(err)
		}
	}
	db.Where("version = ?", 110).Delete(&schemaMigration{})
	account := model.CreditAccount{UserID: "existing", AvailableMicrocredits: 123456, ReservedMicrocredits: 789, Version: 7}
	if err := db.Create(&account).Error; err != nil {
		t.Fatal(err)
	}
	for i := 0; i < 2; i++ {
		if err := MigrateSchema(db); err != nil {
			t.Fatal(err)
		}
	}
	var after model.CreditAccount
	if err := db.First(&after, "user_id = ?", account.UserID).Error; err != nil {
		t.Fatal(err)
	}
	if after.AvailableMicrocredits != account.AvailableMicrocredits || after.ReservedMicrocredits != account.ReservedMicrocredits || after.Version != account.Version || after.HasMembershipCredits {
		t.Fatal("legacy funds changed")
	}
	status, err := ReadSchemaStatus(db)
	if err != nil || !status.Ready || status.Current != CurrentSchemaVersion {
		t.Fatalf("migration=%+v %v", status, err)
	}
}
