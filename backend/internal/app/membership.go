package app

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"strings"
	"time"

	"infinite-canvas/backend/internal/model"
	"infinite-canvas/backend/internal/repository"
)

type MembershipPlanView struct {
	model.MembershipPlan
	MonthlyProductID string `json:"monthlyProductId"`
	AnnualProductID  string `json:"annualProductId"`
}

type MembershipView struct {
	Plans         []MembershipPlanView           `json:"plans"`
	Active        *model.MembershipPlan          `json:"active"`
	Subscriptions []model.MembershipSubscription `json:"subscriptions"`
	Lots          []model.MembershipCreditLot    `json:"lots"`
}

type MembershipPlanRequest struct {
	Name                       string `json:"name"`
	Description                string `json:"description"`
	Version                    int64  `json:"version"`
	Enabled                    bool   `json:"enabled"`
	SortOrder                  int    `json:"sortOrder"`
	MonthlyAmountFen           int64  `json:"monthlyAmountFen"`
	AnnualAmountFen            int64  `json:"annualAmountFen"`
	MonthlyCreditsMicrocredits int64  `json:"monthlyCreditsMicrocredits"`
	ConcurrentTasks            int    `json:"concurrentTasks"`
	StorageBytes               int64  `json:"storageBytes"`
	CreditGraceDays            int    `json:"creditGraceDays"`
}

func membershipPlanView(plan model.MembershipPlan) MembershipPlanView {
	return MembershipPlanView{MembershipPlan: plan, MonthlyProductID: repository.MembershipProductID(plan.ID, 1), AnnualProductID: repository.MembershipProductID(plan.ID, 12)}
}

func (s *Service) Membership(actor *model.User) (*MembershipView, error) {
	if actor == nil || actor.ID == "" {
		return nil, Unauthorized("请先登录")
	}
	if err := s.RequireFeature(FeatureCredits); err != nil {
		return nil, err
	}
	if err := s.repo.SyncMembership(actor.ID, time.Now().UTC()); err != nil {
		return nil, err
	}
	plans, err := s.repo.MembershipPlans(false)
	if err != nil {
		return nil, err
	}
	view := &MembershipView{Plans: []MembershipPlanView{}}
	for _, plan := range plans {
		view.Plans = append(view.Plans, membershipPlanView(plan))
	}
	view.Active, err = s.repo.MembershipBenefits(actor.ID, time.Now().UTC())
	if err != nil {
		return nil, err
	}
	view.Subscriptions, err = s.repo.MembershipSubscriptions(actor.ID)
	if err != nil {
		return nil, err
	}
	view.Lots, err = s.repo.MembershipLots(actor.ID)
	if err != nil {
		return nil, err
	}
	return view, nil
}

func (s *Service) AdminMembershipPlans(actor *model.User) ([]MembershipPlanView, error) {
	if err := s.RequireAdmin(actor); err != nil {
		return nil, err
	}
	plans, err := s.repo.MembershipPlans(true)
	if err != nil {
		return nil, err
	}
	views := []MembershipPlanView{}
	for _, plan := range plans {
		views = append(views, membershipPlanView(plan))
	}
	return views, nil
}

func validateMembershipPlan(req MembershipPlanRequest) error {
	if strings.TrimSpace(req.Name) == "" || len([]rune(req.Name)) > 80 || len([]rune(req.Description)) > 500 {
		return BadAuthRequest("请填写80字以内的套餐名和500字以内的介绍")
	}
	if req.Version < 0 || req.MonthlyAmountFen < 0 || req.MonthlyAmountFen > 100_000_000 || req.AnnualAmountFen < 0 || req.AnnualAmountFen > 100_000_000 {
		return BadAuthRequest("套餐价格或版本无效")
	}
	if req.Enabled && req.MonthlyAmountFen == 0 {
		return BadAuthRequest("上架套餐必须设置月付价格")
	}
	if req.MonthlyCreditsMicrocredits <= 0 || req.MonthlyCreditsMicrocredits > maxTopupCreditsMicrocredits {
		return BadAuthRequest("请设置有效的每月积分")
	}
	if req.ConcurrentTasks < 1 || req.ConcurrentTasks > 100 || req.StorageBytes < 0 || req.StorageBytes > maxStorageGrantBytes || req.CreditGraceDays < 0 || req.CreditGraceDays > 31 {
		return BadAuthRequest("任务额度、容量或积分宽限期无效")
	}
	// Keep the effective credit price within the existing maximum 25% top-up bonus.
	// Model prices are not discounted again. This also checks annual gifts over all 12 cycles.
	if req.Enabled && (req.MonthlyCreditsMicrocredits > req.MonthlyAmountFen*CreditScale*125/100 || (req.AnnualAmountFen > 0 && req.MonthlyCreditsMicrocredits*12 > req.AnnualAmountFen*CreditScale*125/100)) {
		return BadAuthRequest("套餐赠分超过25%上限，请调整价格或积分，避免叠加优惠侵蚀模型利润")
	}
	return nil
}

func (s *Service) SaveMembershipPlan(actor *model.User, id string, req MembershipPlanRequest) (*MembershipPlanView, error) {
	if err := s.RequireAdmin(actor); err != nil {
		return nil, err
	}
	if err := validateMembershipPlan(req); err != nil {
		return nil, err
	}
	id = strings.TrimSpace(id)
	if id == "" {
		if req.Version != 0 {
			return nil, BadAuthRequest("新套餐版本必须为0")
		}
		id = newID()
	}
	plan := model.MembershipPlan{ID: id, Name: strings.TrimSpace(req.Name), Description: strings.TrimSpace(req.Description), Enabled: req.Enabled, SortOrder: req.SortOrder, MonthlyAmountFen: req.MonthlyAmountFen, AnnualAmountFen: req.AnnualAmountFen, MonthlyCreditsMicrocredits: req.MonthlyCreditsMicrocredits, ConcurrentTasks: req.ConcurrentTasks, StorageBytes: req.StorageBytes, CreditGraceDays: req.CreditGraceDays}
	if err := s.repo.SaveMembershipPlan(&plan, req.Version, actor.ID); err != nil {
		if errors.Is(err, repository.ErrMembershipVersion) {
			return nil, NewAppError(http.StatusConflict, err.Error())
		}
		return nil, err
	}
	view := membershipPlanView(plan)
	return &view, nil
}

func (s *Service) RunMembershipWorker(ctx context.Context) {
	timer := time.NewTicker(time.Minute)
	defer timer.Stop()
	for {
		after := ""
		for {
			users, err := s.repo.DueMembershipUsers(time.Now().UTC(), after, 500)
			if err != nil {
				slog.Error("membership scan failed", "error", err)
				break
			} else {
				for _, id := range users {
					if ctx.Err() != nil {
						return
					}
					if err := s.repo.SyncMembership(id, time.Now().UTC()); err != nil {
						slog.Error("membership synchronization failed", "userId", id, "error", err)
					}
				}
			}
			if len(users) < 500 {
				break
			}
			after = users[len(users)-1]
		}
		select {
		case <-ctx.Done():
			return
		case <-timer.C:
		}
	}
}
