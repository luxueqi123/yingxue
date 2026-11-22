package repository

import (
	"errors"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
	"infinite-canvas/backend/internal/model"
	"time"
)

var ErrMonthlyCheckinLimit = errors.New("本月签到奖励已达到上限")

// Lock the account before reading the monthly sum so concurrent days cannot
// both spend the same remaining reward allowance.
func (r *Repository) GrantMonthlyCheckin(userID string, amount, limit int64, now time.Time) (*model.CreditAccount, bool, error) {
	var account *model.CreditAccount
	var granted bool
	err := r.db.Transaction(func(tx *gorm.DB) error {
		row := model.CreditAccount{UserID: userID}
		if err := tx.Clauses(clause.OnConflict{DoNothing: true}).Create(&row).Error; err != nil {
			return err
		}
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).First(&row, "user_id = ?", userID).Error; err != nil {
			return err
		}
		now = now.UTC()
		ref := "checkin:" + userID + ":" + now.Format("2006-01-02")
		var existing int64
		if err := tx.Model(&model.CreditLedgerEntry{}).Where("reference_key = ?", ref).Count(&existing).Error; err != nil {
			return err
		}
		if existing > 0 {
			account = &row
			return nil
		}
		start := time.Date(now.Year(), now.Month(), 1, 0, 0, 0, 0, time.UTC)
		var total int64
		if err := tx.Model(&model.CreditLedgerEntry{}).Where("user_id = ? AND type = ? AND created_at >= ? AND created_at < ?", userID, model.CreditLedgerCheckinBonus, start, start.AddDate(0, 1, 0)).Select("COALESCE(SUM(amount_microcredits), 0)").Scan(&total).Error; err != nil {
			return err
		}
		if total >= limit {
			return ErrMonthlyCheckinLimit
		}
		if amount > limit-total {
			amount = limit - total
		}
		var err error
		account, granted, err = New(tx).GrantCreditsOnce(userID, model.CreditLedgerCheckinBonus, amount, ref, "每日签到奖励")
		return err
	})
	return account, granted, err
}
