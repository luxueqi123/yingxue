package app

import (
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
	"infinite-canvas/backend/internal/model"
	"infinite-canvas/backend/internal/repository"
	"testing"
)

func TestMembershipPriceGuardAndPermissions(t *testing.T) {
	req := MembershipPlanRequest{Name: "轻创", MonthlyAmountFen: 2900, MonthlyCreditsMicrocredits: 3480 * CreditScale, ConcurrentTasks: 3, StorageBytes: 20 << 30, Enabled: true}
	if err := validateMembershipPlan(req); err != nil {
		t.Fatal(err)
	}
	req.MonthlyCreditsMicrocredits = 4000 * CreditScale
	if err := validateMembershipPlan(req); err == nil {
		t.Fatal("excess bonus accepted")
	}
	req.MonthlyCreditsMicrocredits = 3480 * CreditScale
	req.AnnualAmountFen = 10000
	if err := validateMembershipPlan(req); err == nil {
		t.Fatal("annual bonus not checked over 12 cycles")
	}
	req.Enabled = false
	if err := validateMembershipPlan(req); err != nil {
		t.Fatal("draft should allow price review:", err)
	}
	svc := &Service{}
	if _, err := svc.SaveMembershipPlan(nil, "", req); err == nil {
		t.Fatal("anonymous saved plan")
	}
	if _, err := svc.SaveMembershipPlan(&model.User{ID: "user", Role: model.UserRoleUser}, "", req); err == nil {
		t.Fatal("user saved plan")
	}
	if _, err := svc.AdminMembershipPlans(&model.User{ID: "user", Role: model.UserRoleUser}); err == nil {
		t.Fatal("user read drafts")
	}
}
func TestMembershipPlanSaveAtomicAndVersioned(t *testing.T) {
	db, err := gorm.Open(sqlite.Open("file:"+t.Name()+"?mode=memory&cache=shared"), &gorm.Config{})
	if err != nil {
		t.Fatal(err)
	}
	if err := db.AutoMigrate(&model.MembershipPlan{}, &model.TopupProduct{}, &model.AdminAuditEvent{}); err != nil {
		t.Fatal(err)
	}
	svc := &Service{repo: repository.New(db)}
	actor := &model.User{ID: "admin", Role: model.UserRoleAdmin, Status: model.UserStatusActive}
	req := MembershipPlanRequest{Name: "轻创", MonthlyAmountFen: 2900, MonthlyCreditsMicrocredits: 3480 * CreditScale, ConcurrentTasks: 3, StorageBytes: 20 << 30}
	view, err := svc.SaveMembershipPlan(actor, "", req)
	if err != nil {
		t.Fatal(err)
	}
	plans, err := svc.AdminMembershipPlans(actor)
	if err != nil || len(plans) != 1 || plans[0].Enabled {
		t.Fatalf("drafts=%v %v", plans, err)
	}
	var product model.TopupProduct
	db.First(&product, "id = ?", view.MonthlyProductID)
	if product.Enabled {
		t.Fatal("draft can be purchased")
	}
	req.Version = view.Version
	req.Enabled = true
	if _, err := svc.SaveMembershipPlan(actor, view.ID, req); err != nil {
		t.Fatal(err)
	}
	db.First(&product, "id = ?", view.MonthlyProductID)
	if !product.Enabled || product.Kind != model.TopupProductKindMembership {
		t.Fatal("monthly product not published")
	}
	if _, err := svc.SaveMembershipPlan(actor, view.ID, req); err == nil {
		t.Fatal("stale version accepted")
	}
	// A missing audit table must roll back the plan and both products.
	db.Migrator().DropTable(&model.AdminAuditEvent{})
	req.Version = 2
	req.Name = "must roll back"
	if _, err := svc.SaveMembershipPlan(actor, view.ID, req); err == nil {
		t.Fatal("audit failure was swallowed")
	}
	db.First(&product, "id = ?", view.MonthlyProductID)
	if product.Name == "must roll back · 月会员" {
		t.Fatal("product update escaped transaction")
	}
}
