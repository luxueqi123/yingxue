package repository

import (
	"crypto/sha256"
	"encoding/json"
	"errors"
	"fmt"
	"time"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"
	"infinite-canvas/backend/internal/model"
)

var ErrMembershipVersion = errors.New("会员套餐已更新，请刷新后重试")

// MembershipMonthBoundary keeps the purchase's original calendar anchor, including Jan 31 and leap years.
func MembershipMonthBoundary(anchor time.Time, months int) time.Time {
	zone := time.FixedZone("Asia/Shanghai", 8*60*60)
	a := anchor.In(zone)
	first := time.Date(a.Year(), a.Month()+time.Month(months), 1, a.Hour(), a.Minute(), a.Second(), a.Nanosecond(), zone)
	last := first.AddDate(0, 1, 0).AddDate(0, 0, -1).Day()
	return time.Date(first.Year(), first.Month(), min(a.Day(), last), a.Hour(), a.Minute(), a.Second(), a.Nanosecond(), zone).UTC()
}

func (r *Repository) MembershipPlans(all bool) ([]model.MembershipPlan, error) {
	items := []model.MembershipPlan{}
	q := r.db.Order("sort_order asc, monthly_amount_fen asc, id asc")
	if !all {
		q = q.Where("enabled = ?", true)
	}
	err := q.Find(&items).Error
	return items, err
}

func (r *Repository) SaveMembershipPlan(plan *model.MembershipPlan, expectedVersion int64, actorID string) error {
	return r.db.Transaction(func(tx *gorm.DB) error {
		var old model.MembershipPlan
		err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).First(&old, "id = ?", plan.ID).Error
		if errors.Is(err, gorm.ErrRecordNotFound) {
			if expectedVersion != 0 {
				return ErrMembershipVersion
			}
			plan.Version = 1
		} else if err != nil {
			return err
		} else {
			if expectedVersion != old.Version {
				return ErrMembershipVersion
			}
			plan.Version = old.Version + 1
			plan.CreatedAt = old.CreatedAt
		}
		if err := tx.Save(plan).Error; err != nil {
			return err
		}
		snapshot, err := json.Marshal(plan)
		if err != nil {
			return err
		}
		for _, months := range []int{1, 12} {
			id := MembershipProductID(plan.ID, months)
			amount := plan.MonthlyAmountFen
			label := " · 月会员"
			if months == 12 {
				amount = plan.AnnualAmountFen
				label = " · 年会员"
			}
			var product model.TopupProduct
			err := tx.First(&product, "id = ?", id).Error
			if err != nil && !errors.Is(err, gorm.ErrRecordNotFound) {
				return err
			}
			if product.ID == "" {
				product = model.TopupProduct{ID: id, CreatedBy: actorID}
			}
			product.Name = plan.Name + label
			product.Description = plan.Description
			product.Kind = model.TopupProductKindMembership
			product.Currency = "CNY"
			product.AmountFen = amount
			product.CreditsMicrocredits = plan.MonthlyCreditsMicrocredits
			product.MembershipPlanID = plan.ID
			product.MembershipMonths = months
			product.MembershipSnapshotJSON = string(snapshot)
			product.Enabled = plan.Enabled && amount > 0
			product.SortOrder = plan.SortOrder
			product.SaleStrategy = model.TopupSaleStrategyUnlimited
			product.UpdatedBy = actorID
			if err := tx.Save(&product).Error; err != nil {
				return err
			}
		}
		return tx.Create(&model.AdminAuditEvent{ID: newRepositoryID(), ActorUserID: actorID, Action: "membership_plan.save", TargetType: "membership_plan", TargetID: plan.ID, Summary: "保存会员套餐", MetadataJSON: string(snapshot)}).Error
	})
}

func MembershipProductID(planID string, months int) string {
	sum := sha256.Sum256([]byte(planID))
	return fmt.Sprintf("mp-%x-%d", sum[:14], months)
}

func activateMembership(tx *gorm.DB, order *model.PaymentOrder, now time.Time) error {
	var plan model.MembershipPlan
	if err := json.Unmarshal([]byte(order.MembershipSnapshotJSON), &plan); err != nil {
		return errors.New("会员订单缺少有效权益快照")
	}
	if plan.ID == "" || plan.MonthlyCreditsMicrocredits <= 0 || (order.MembershipMonths != 1 && order.MembershipMonths != 12) {
		return errors.New("会员订单权益无效")
	}
	account := model.CreditAccount{UserID: order.UserID}
	if err := tx.Clauses(clause.OnConflict{DoNothing: true}).Create(&account).Error; err != nil {
		return err
	}
	if err := tx.Model(&account).Update("has_membership_credits", true).Error; err != nil {
		return err
	}
	start := now.UTC()
	// Purchases queue after existing periods; a second callback cannot create a second subscription.
	var previous model.MembershipSubscription
	err := tx.Where("user_id = ? AND ends_at > ?", order.UserID, start).Order("ends_at desc").First(&previous).Error
	if err == nil {
		start = previous.EndsAt
	} else if !errors.Is(err, gorm.ErrRecordNotFound) {
		return err
	}
	key := "membership-payment:" + order.ID
	sub := model.MembershipSubscription{ID: newRepositoryID(), UserID: order.UserID, PlanID: plan.ID, PlanName: plan.Name, PlanVersion: plan.Version, PaymentOrderID: order.ID, ReferenceKey: key, PlanSnapshotJSON: order.MembershipSnapshotJSON, StartsAt: start, EndsAt: MembershipMonthBoundary(start, order.MembershipMonths), Months: order.MembershipMonths, NextGrantAt: &start}
	result := tx.Clauses(clause.OnConflict{DoNothing: true}).Create(&sub)
	if result.Error != nil {
		return result.Error
	}
	if result.RowsAffected == 0 {
		return nil
	}
	return grantMembershipCycles(tx, &sub, now)
}

func grantMembershipCycles(tx *gorm.DB, sub *model.MembershipSubscription, now time.Time) error {
	var plan model.MembershipPlan
	if err := json.Unmarshal([]byte(sub.PlanSnapshotJSON), &plan); err != nil {
		return err
	}
	if plan.MonthlyCreditsMicrocredits <= 0 {
		return errors.New("会员周期积分配置无效")
	}
	for sub.GrantedCycles < sub.Months {
		cycle := sub.GrantedCycles
		starts := MembershipMonthBoundary(sub.StartsAt, cycle)
		if starts.After(now) {
			break
		}
		ends := MembershipMonthBoundary(sub.StartsAt, cycle+1)
		expires := ends.Add(time.Duration(plan.CreditGraceDays) * 24 * time.Hour)
		key := fmt.Sprintf("membership-cycle:%s:%d", sub.ID, cycle)
		lot := model.MembershipCreditLot{ID: newRepositoryID(), UserID: sub.UserID, SubscriptionID: sub.ID, ReferenceKey: key, Name: fmt.Sprintf("%s · 第%d期", sub.PlanName, cycle+1), GrantedMicrocredits: plan.MonthlyCreditsMicrocredits, ExpiresAt: expires}
		if expires.After(now) {
			lot.AvailableMicrocredits = lot.GrantedMicrocredits
		} else {
			lot.ExpiredMicrocredits = lot.GrantedMicrocredits
		}
		result := tx.Clauses(clause.OnConflict{DoNothing: true}).Create(&lot)
		if result.Error != nil {
			return result.Error
		}
		if result.RowsAffected == 1 {
			updated := tx.Model(&model.CreditAccount{}).Where("user_id = ? AND available_microcredits <= ?", sub.UserID, maxPaymentCreditBalance-lot.AvailableMicrocredits).Updates(map[string]any{"available_microcredits": gorm.Expr("available_microcredits + ?", lot.AvailableMicrocredits), "has_membership_credits": true, "version": gorm.Expr("version + 1"), "updated_at": now})
			if updated.Error != nil {
				return updated.Error
			}
			if updated.RowsAffected != 1 {
				return errors.New("会员积分入账超出余额上限")
			}
			var account model.CreditAccount
			if err := tx.First(&account, "user_id = ?", sub.UserID).Error; err != nil {
				return err
			}
			entry := model.CreditLedgerEntry{ID: newRepositoryID(), UserID: sub.UserID, Type: model.CreditLedgerType("membership_grant"), AmountMicrocredits: lot.AvailableMicrocredits, AvailableDeltaMicrocredits: lot.AvailableMicrocredits, AvailableAfterMicrocredits: account.AvailableMicrocredits, ReservedAfterMicrocredits: account.ReservedMicrocredits, PaymentOrderID: sub.PaymentOrderID, ReferenceKey: &key, Note: lot.Name}
			if lot.ExpiredMicrocredits > 0 {
				entry.Note += " · 补记已过期周期，不增加可用余额"
			}
			if err := tx.Create(&entry).Error; err != nil {
				return err
			}
		}
		sub.GrantedCycles++
	}
	sub.NextGrantAt = nil
	if sub.GrantedCycles < sub.Months {
		next := MembershipMonthBoundary(sub.StartsAt, sub.GrantedCycles)
		sub.NextGrantAt = &next
	}
	return tx.Model(sub).Updates(map[string]any{"granted_cycles": sub.GrantedCycles, "next_grant_at": sub.NextGrantAt, "updated_at": now}).Error
}

func (r *Repository) SyncMembership(userID string, now time.Time) error {
	return r.db.Transaction(func(tx *gorm.DB) error {
		return syncMembershipCredits(tx, userID, now)
	})
}

func (r *Repository) MembershipSubscriptions(userID string) ([]model.MembershipSubscription, error) {
	items := []model.MembershipSubscription{}
	err := r.db.Where("user_id = ?", userID).Order("starts_at desc").Find(&items).Error
	return items, err
}

func (r *Repository) MembershipLots(userID string) ([]model.MembershipCreditLot, error) {
	items := []model.MembershipCreditLot{}
	err := r.db.Where("user_id = ? AND (available_microcredits > 0 OR reserved_microcredits > 0 OR expires_at > ?)", userID, time.Now().UTC()).Order("expires_at asc").Find(&items).Error
	return items, err
}

func (r *Repository) DueMembershipUsers(now time.Time, after string, limit int) ([]string, error) {
	items := []string{}
	err := r.db.Raw("SELECT user_id FROM (SELECT user_id FROM membership_subscriptions WHERE next_grant_at <= ? UNION SELECT user_id FROM membership_credit_lots WHERE expires_at <= ? AND available_microcredits > 0) due WHERE user_id > ? ORDER BY user_id LIMIT ?", now, now, after, limit).Scan(&items).Error
	return items, err
}

func membershipBenefits(tx *gorm.DB, userID string, now time.Time) (*model.MembershipPlan, error) {
	var account model.CreditAccount
	err := tx.Select("user_id", "has_membership_credits").First(&account, "user_id = ?", userID).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	if !account.HasMembershipCredits {
		return nil, nil
	}
	var sub model.MembershipSubscription
	err = tx.Where("user_id = ? AND starts_at <= ? AND ends_at > ?", userID, now, now).Order("starts_at desc").First(&sub).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	var plan model.MembershipPlan
	if err := json.Unmarshal([]byte(sub.PlanSnapshotJSON), &plan); err != nil {
		return nil, err
	}
	return &plan, nil
}

func (r *Repository) MembershipBenefits(userID string, now time.Time) (*model.MembershipPlan, error) {
	return membershipBenefits(r.db, userID, now)
}
