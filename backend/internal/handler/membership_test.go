package handler

import (
	"context"
	"errors"
	"net"
	"net/http"
	"os"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	"infinite-canvas/backend/internal/model"
	"infinite-canvas/backend/internal/repository"
	"infinite-canvas/backend/internal/service"
)

func TestMembershipHTTPPermissionsPurchaseAndIsolation(t *testing.T) {
	f := newCommunityHTTPFixture(t, "")
	communityHTTPData(t, f.request(t, "GET", "/api/membership", nil, "", nil), http.StatusUnauthorized, nil)
	communityHTTPData(t, f.request(t, "GET", "/api/admin/membership/plans", nil, "author", nil), http.StatusForbidden, nil)
	req := service.MembershipPlanRequest{Name: "低门槛会员", MonthlyAmountFen: 2900, MonthlyCreditsMicrocredits: 3480_000_000, ConcurrentTasks: 3, StorageBytes: 20 << 30}
	var created struct {
		Plan struct {
			model.MembershipPlan
			MonthlyProductID string `json:"monthlyProductId"`
		}
	}
	communityHTTPData(t, f.request(t, "POST", "/api/admin/membership/plans", req, "admin", nil), http.StatusOK, &created)
	if created.Plan.Enabled || created.Plan.Version != 1 {
		t.Fatal("new plan not a versioned draft")
	}
	var empty struct{ Plans []model.MembershipPlan }
	communityHTTPData(t, f.request(t, "GET", "/api/membership", nil, "author", nil), http.StatusOK, &empty)
	if len(empty.Plans) != 0 {
		t.Fatal("draft leaked")
	}
	req.Version = 1
	req.Enabled = true
	communityHTTPData(t, f.request(t, "PATCH", "/api/admin/membership/plans/"+created.Plan.ID, req, "admin", nil), http.StatusOK, nil)
	communityHTTPData(t, f.request(t, "PATCH", "/api/admin/membership/plans/"+created.Plan.ID, req, "admin", nil), http.StatusConflict, nil)
	repo := repository.New(f.db)
	product, err := repo.TopupProduct(created.Plan.MonthlyProductID)
	if err != nil {
		t.Fatal(err)
	}
	order := model.PaymentOrder{ID: "member-local", UserID: "community-author", IdempotencyKey: "member-local", MerchantOrderNo: "member-local", ProductID: product.ID, ProductKind: model.TopupProductKindMembership, ProviderID: "isolated", AmountFen: product.AmountFen, Currency: "CNY", ChargeAmountFen: product.AmountFen, ChargeCurrency: "CNY", CreditsMicrocredits: product.CreditsMicrocredits, Status: model.PaymentOrderPending, ExpiresAt: time.Now().Add(time.Hour)}
	if _, _, err := repo.CreatePaymentOrderWithProductReservation(&order); err != nil {
		t.Fatal(err)
	}
	if order.MembershipSnapshotJSON == "" || order.MembershipMonths != 1 {
		t.Fatal("order has no server snapshot")
	}
	evidence := repository.PaymentEvidence{ProviderTradeNo: "isolated-only", AmountFen: 2900, Currency: "CNY"}
	for i := 0; i < 2; i++ {
		if _, _, err := repo.CompletePaymentOrder("isolated", "member-local", evidence); err != nil {
			t.Fatal(err)
		}
	}
	var state struct {
		Subscriptions []model.MembershipSubscription
		Lots          []model.MembershipCreditLot
		Active        *model.MembershipPlan
	}
	communityHTTPData(t, f.request(t, "GET", "/api/membership", nil, "author", nil), http.StatusOK, &state)
	if state.Active == nil || len(state.Subscriptions) != 1 || len(state.Lots) != 1 || state.Lots[0].AvailableMicrocredits != req.MonthlyCreditsMicrocredits {
		t.Fatalf("member state: %+v", state)
	}
	communityHTTPData(t, f.request(t, "GET", "/api/membership", nil, "viewer", nil), http.StatusOK, &state)
	if state.Active != nil || len(state.Subscriptions) != 0 || len(state.Lots) != 0 {
		t.Fatal("another user's membership leaked")
	}
}

// This fixture exposes only loopback and has no real provider credentials or live payments.
func TestMembershipBrowserServer(t *testing.T) {
	if os.Getenv("CANVAS_MEMBERSHIP_BROWSER_TEST") != "1" {
		t.Skip("isolated browser fixture disabled")
	}
	f := newCommunityHTTPFixture(t, "")
	listener, err := net.Listen("tcp", "127.0.0.1:18180")
	if err != nil {
		t.Fatal(err)
	}
	server := &http.Server{Handler: f.router, ReadHeaderTimeout: 10 * time.Second}
	f.router.POST("/__membership_fixture/stop", func(c *gin.Context) { c.Status(204); go func() { _ = server.Shutdown(context.Background()) }() })
	if err := server.Serve(listener); err != nil && !errors.Is(err, http.ErrServerClosed) {
		t.Fatal(err)
	}
}
