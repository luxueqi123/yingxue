package repository

import (
	"errors"
	"fmt"
	"time"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"
	"infinite-canvas/backend/internal/model"
)

// All reservation, consumption and return paths use this accounting boundary.
// It joins the existing transaction: a lot failure rolls back both the account and its billing state.
func createCreditLedger(tx *gorm.DB, entry *model.CreditLedgerEntry) *gorm.DB {
	if err := applyMembershipLedger(tx, entry); err != nil {
		return &gorm.DB{Error: err}
	}
	return tx.Create(entry)
}

func applyMembershipLedger(tx *gorm.DB, entry *model.CreditLedgerEntry) error {
	if entry.TeamID != "" {
		return nil
	}
	var account model.CreditAccount
	if err := tx.First(&account, "user_id = ?", entry.UserID).Error; err != nil {
		return err
	}
	if !account.HasMembershipCredits {
		return nil
	}
	now := time.Now().UTC()
	switch {
	case entry.Type == model.CreditLedgerReserve && entry.ReservedDeltaMicrocredits > 0:
		if err := reserveMembershipLots(tx, entry.UserID, entry.BillingOrderID, entry.ReservedDeltaMicrocredits, now, false); err != nil {
			return err
		}
	case entry.Type == model.CreditLedgerConsume && entry.ReservedDeltaMicrocredits < 0:
		if err := settleMembershipLots(tx, entry.UserID, entry.BillingOrderID, -entry.AmountMicrocredits, now); err != nil {
			return err
		}
	case entry.ReservedDeltaMicrocredits < 0 && entry.AvailableDeltaMicrocredits > 0:
		if err := returnMembershipLots(tx, entry.UserID, entry.BillingOrderID, -entry.ReservedDeltaMicrocredits, now); err != nil {
			return err
		}
	case entry.AvailableDeltaMicrocredits < 0 && entry.ReservedDeltaMicrocredits == 0:
		orderID := entry.BillingOrderID
		if orderID == "" {
			orderID = entry.ID
		}
		if err := reserveMembershipLots(tx, entry.UserID, orderID, -entry.AvailableDeltaMicrocredits, now, true); err != nil {
			return err
		}
	}
	return nil
}

// Lock and expire before the account mutation, so expired funds cannot finance a new operation.
func prepareMembershipCredits(tx *gorm.DB, userID string) error {
	return syncMembershipCredits(tx, userID, time.Now().UTC())
}

func prepareBillingMembershipCredits(tx *gorm.DB, userID, teamID string) error {
	if teamID != "" {
		return nil
	}
	return prepareMembershipCredits(tx, userID)
}

func syncMembershipCredits(tx *gorm.DB, userID string, now time.Time) error {
	var account model.CreditAccount
	err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).First(&account, "user_id = ?", userID).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil
	}
	if err != nil {
		return err
	}
	if !account.HasMembershipCredits {
		return nil
	}
	if err := expireMembershipLots(tx, userID, now); err != nil {
		return err
	}
	var subs []model.MembershipSubscription
	if err := tx.Where("user_id = ? AND next_grant_at <= ?", userID, now).Order("starts_at asc").Find(&subs).Error; err != nil {
		return err
	}
	for index := range subs {
		if err := grantMembershipCycles(tx, &subs[index], now); err != nil {
			return err
		}
	}
	return nil
}

func reserveMembershipLots(tx *gorm.DB, userID, orderID string, amount int64, now time.Time, direct bool) error {
	if amount <= 0 {
		return nil
	}
	if orderID == "" {
		return errors.New("会员积分扣减缺少业务编号")
	}
	var lots []model.MembershipCreditLot
	if err := tx.Where("user_id = ? AND available_microcredits > 0 AND expires_at > ?", userID, now).Order("expires_at asc, created_at asc, id asc").Find(&lots).Error; err != nil {
		return err
	}
	remaining := amount
	for _, lot := range lots {
		take := min(remaining, lot.AvailableMicrocredits)
		if take == 0 {
			break
		}
		allocation := model.MembershipCreditAllocation{ID: newRepositoryID(), UserID: userID, BillingOrderID: orderID, LotID: lot.ID, SpendExpiresAt: lot.ExpiresAt}
		if err := tx.Clauses(clause.OnConflict{DoNothing: true}).Create(&allocation).Error; err != nil {
			return err
		}
		field := "reserved_microcredits"
		if direct {
			field = "consumed_microcredits"
		}
		if err := tx.Model(&model.MembershipCreditAllocation{}).Where("billing_order_id = ? AND lot_id = ? AND user_id = ?", orderID, lot.ID, userID).Update(field, gorm.Expr(field+" + ?", take)).Error; err != nil {
			return err
		}
		result := tx.Model(&model.MembershipCreditLot{}).Where("id = ? AND user_id = ? AND available_microcredits >= ?", lot.ID, userID, take).Updates(map[string]any{"available_microcredits": gorm.Expr("available_microcredits - ?", take), field: gorm.Expr(field+" + ?", take), "updated_at": now})
		if result.Error != nil {
			return result.Error
		}
		if result.RowsAffected != 1 {
			return ErrBillingStateConflict
		}
		remaining -= take
	}
	// The remainder uses existing permanent funds, already guarded by the account update.
	if remaining > 0 {
		allocation := model.MembershipCreditAllocation{ID: newRepositoryID(), UserID: userID, BillingOrderID: orderID, LotID: "permanent", SpendExpiresAt: time.Date(9999, 1, 1, 0, 0, 0, 0, time.UTC)}
		if err := tx.Clauses(clause.OnConflict{DoNothing: true}).Create(&allocation).Error; err != nil {
			return err
		}
		field := "reserved_microcredits"
		if direct {
			field = "consumed_microcredits"
		}
		if err := tx.Model(&model.MembershipCreditAllocation{}).Where("billing_order_id = ? AND lot_id = ? AND user_id = ?", orderID, "permanent", userID).Update(field, gorm.Expr(field+" + ?", remaining)).Error; err != nil {
			return err
		}
	}
	return nil
}

func settleMembershipLots(tx *gorm.DB, userID, orderID string, actual int64, now time.Time) error {
	if actual < 0 {
		return errors.New("会员积分实际费用无效")
	}
	var allocations []model.MembershipCreditAllocation
	if err := tx.Where("user_id = ? AND billing_order_id = ? AND reserved_microcredits > 0", userID, orderID).Order("spend_expires_at asc, created_at asc, id asc").Find(&allocations).Error; err != nil {
		return err
	}
	remaining := actual
	for _, allocation := range allocations {
		consume := min(remaining, allocation.ReservedMicrocredits)
		release := allocation.ReservedMicrocredits - consume
		if allocation.LotID == "permanent" {
			if err := tx.Model(&allocation).Updates(map[string]any{"reserved_microcredits": 0, "consumed_microcredits": gorm.Expr("consumed_microcredits + ?", consume), "returned_microcredits": gorm.Expr("returned_microcredits + ?", release), "updated_at": now}).Error; err != nil {
				return err
			}
			remaining -= consume
			continue
		}
		var lot model.MembershipCreditLot
		if err := tx.First(&lot, "id = ? AND user_id = ?", allocation.LotID, userID).Error; err != nil {
			return err
		}
		result := tx.Model(&lot).Where("reserved_microcredits >= ?", allocation.ReservedMicrocredits).Updates(map[string]any{"reserved_microcredits": gorm.Expr("reserved_microcredits - ?", allocation.ReservedMicrocredits), "consumed_microcredits": gorm.Expr("consumed_microcredits + ?", consume), "updated_at": now})
		if result.Error != nil {
			return result.Error
		}
		if result.RowsAffected != 1 {
			return ErrBillingStateConflict
		}
		if err := restoreMembershipLot(tx, &lot, release, now); err != nil {
			return err
		}
		if err := tx.Model(&allocation).Updates(map[string]any{"reserved_microcredits": 0, "consumed_microcredits": gorm.Expr("consumed_microcredits + ?", consume), "returned_microcredits": gorm.Expr("returned_microcredits + ?", release), "updated_at": now}).Error; err != nil {
			return err
		}
		remaining -= consume
	}
	// Permanent funds reserved on the same order are consumed before a supplement.
	var order model.BillingOrder
	if err := tx.First(&order, "id = ?", orderID).Error; err != nil {
		return err
	}
	reserved := order.ReservedAmountMicrocredits
	if reserved <= 0 {
		reserved = order.AmountMicrocredits
	}
	supplement := max(actual-reserved, int64(0))
	return reserveMembershipLots(tx, userID, orderID, supplement, now, true)
}

func returnMembershipLots(tx *gorm.DB, userID, orderID string, amount int64, now time.Time) error {
	var allocations []model.MembershipCreditAllocation
	// Release the last allocated lots first so earlier expiry remains first to spend.
	if err := tx.Where("user_id = ? AND billing_order_id = ? AND reserved_microcredits > 0", userID, orderID).Order("spend_expires_at desc, created_at desc, id desc").Find(&allocations).Error; err != nil {
		return err
	}
	for _, allocation := range allocations {
		release := min(amount, allocation.ReservedMicrocredits)
		if release <= 0 {
			break
		}
		if allocation.LotID == "permanent" {
			if err := tx.Model(&allocation).Updates(map[string]any{"reserved_microcredits": gorm.Expr("reserved_microcredits - ?", release), "returned_microcredits": gorm.Expr("returned_microcredits + ?", release), "updated_at": now}).Error; err != nil {
				return err
			}
			amount -= release
			continue
		}
		var lot model.MembershipCreditLot
		if err := tx.First(&lot, "id = ? AND user_id = ?", allocation.LotID, userID).Error; err != nil {
			return err
		}
		if err := tx.Model(&lot).Update("reserved_microcredits", gorm.Expr("reserved_microcredits - ?", release)).Error; err != nil {
			return err
		}
		if err := restoreMembershipLot(tx, &lot, release, now); err != nil {
			return err
		}
		if err := tx.Model(&allocation).Updates(map[string]any{"reserved_microcredits": gorm.Expr("reserved_microcredits - ?", release), "returned_microcredits": gorm.Expr("returned_microcredits + ?", release), "updated_at": now}).Error; err != nil {
			return err
		}
		amount -= release
	}
	return nil
}

func restoreMembershipLot(tx *gorm.DB, lot *model.MembershipCreditLot, amount int64, now time.Time) error {
	if amount <= 0 {
		return nil
	}
	if now.Before(lot.ExpiresAt) {
		return tx.Model(lot).Update("available_microcredits", gorm.Expr("available_microcredits + ?", amount)).Error
	}
	// The same compensation lot is reused on repeated failures. Its lifetime never extends.
	if lot.RefundOriginID != "" {
		return tx.Model(lot).Update("available_microcredits", gorm.Expr("available_microcredits + ?", amount)).Error
	}
	if err := tx.Model(lot).Update("transferred_microcredits", gorm.Expr("transferred_microcredits + ?", amount)).Error; err != nil {
		return err
	}
	origin := *lot
	if origin.RefundOriginID != "" {
		if err := tx.First(&origin, "id = ? AND user_id = ?", origin.RefundOriginID, lot.UserID).Error; err != nil {
			return err
		}
	}
	if origin.RefundGraceUntil == nil {
		deadline := now.Add(24 * time.Hour)
		origin.RefundGraceUntil = &deadline
		if err := tx.Model(&origin).Update("refund_grace_until", deadline).Error; err != nil {
			return err
		}
	}
	key := "membership-return:" + origin.ID
	compensation := model.MembershipCreditLot{ID: newRepositoryID(), UserID: lot.UserID, SubscriptionID: lot.SubscriptionID, ReferenceKey: key, Name: lot.Name + " · 原路返还", RefundOriginID: origin.ID, ExpiresAt: *origin.RefundGraceUntil}
	if err := tx.Clauses(clause.OnConflict{DoNothing: true}).Create(&compensation).Error; err != nil {
		return err
	}
	return tx.Model(&model.MembershipCreditLot{}).Where("reference_key = ? AND user_id = ?", key, lot.UserID).Updates(map[string]any{"granted_microcredits": gorm.Expr("granted_microcredits + ?", amount), "available_microcredits": gorm.Expr("available_microcredits + ?", amount), "updated_at": now}).Error
}

func expireMembershipLots(tx *gorm.DB, userID string, now time.Time) error {
	var lots []model.MembershipCreditLot
	if err := tx.Where("user_id = ? AND expires_at <= ? AND available_microcredits > 0", userID, now).Find(&lots).Error; err != nil {
		return err
	}
	for _, lot := range lots {
		amount := lot.AvailableMicrocredits
		if err := tx.Model(&lot).Updates(map[string]any{"available_microcredits": 0, "expired_microcredits": gorm.Expr("expired_microcredits + ?", amount), "updated_at": now}).Error; err != nil {
			return err
		}
		if err := tx.Model(&model.CreditAccount{}).Where("user_id = ?", userID).Updates(map[string]any{"available_microcredits": gorm.Expr("available_microcredits - ?", amount), "version": gorm.Expr("version + 1"), "updated_at": now}).Error; err != nil {
			return err
		}
		var account model.CreditAccount
		if err := tx.First(&account, "user_id = ?", userID).Error; err != nil {
			return err
		}
		key := "membership-expire:" + lot.ID + ":" + fmt.Sprint(lot.ExpiredMicrocredits+amount)
		entry := model.CreditLedgerEntry{ID: newRepositoryID(), UserID: userID, Type: model.CreditLedgerType("membership_expire"), AmountMicrocredits: -amount, AvailableDeltaMicrocredits: -amount, AvailableAfterMicrocredits: account.AvailableMicrocredits, ReservedAfterMicrocredits: account.ReservedMicrocredits, ReferenceKey: &key, Note: lot.Name + " · 积分到期"}
		if err := tx.Create(&entry).Error; err != nil {
			return err
		}
	}
	return nil
}

func (r *Repository) ExpireMembershipCredits(userID string, now time.Time) error {
	return r.db.Transaction(func(tx *gorm.DB) error {
		var account model.CreditAccount
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).First(&account, "user_id = ?", userID).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return nil
			}
			return err
		}
		if !account.HasMembershipCredits {
			return nil
		}
		return expireMembershipLots(tx, userID, now)
	})
}
