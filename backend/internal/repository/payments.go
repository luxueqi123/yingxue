package repository

import (
	"errors"
	"time"

	"infinite-canvas/backend/internal/model"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

func (r *Repository) CreateOrGetPaymentOrder(order *model.PaymentOrder) (*model.PaymentOrder, bool, error) {
	result := r.db.Clauses(clause.OnConflict{
		Columns:   []clause.Column{{Name: "user_id"}, {Name: "idempotency_key"}},
		DoNothing: true,
	}).Create(order)
	if result.Error != nil {
		return nil, false, result.Error
	}
	if result.RowsAffected == 1 {
		return order, true, nil
	}
	var existing model.PaymentOrder
	if err := r.db.Where("user_id = ? AND idempotency_key = ?", order.UserID, order.IdempotencyKey).First(&existing).Error; err != nil {
		return nil, false, err
	}
	return &existing, false, nil
}

func (r *Repository) PaymentOrder(id string) (*model.PaymentOrder, error) {
	var order model.PaymentOrder
	if err := r.db.First(&order, "id = ?", id).Error; err != nil {
		return nil, err
	}
	return &order, nil
}

func (r *Repository) PaymentOrderForUser(userID string, id string) (*model.PaymentOrder, error) {
	var order model.PaymentOrder
	if err := r.db.Where("user_id = ? AND id = ?", userID, id).First(&order).Error; err != nil {
		return nil, err
	}
	return &order, nil
}

func (r *Repository) PaymentOrdersForUser(userID string, limit int) ([]model.PaymentOrder, error) {
	if limit <= 0 || limit > 100 {
		limit = 20
	}
	var orders []model.PaymentOrder
	return orders, r.db.Where("user_id = ?", userID).Order("created_at desc").Limit(limit).Find(&orders).Error
}

func (r *Repository) PaymentOrders(limit int) ([]model.PaymentOrder, error) {
	if limit <= 0 || limit > 100 {
		limit = 20
	}
	var orders []model.PaymentOrder
	return orders, r.db.Order("created_at desc").Limit(limit).Find(&orders).Error
}

func (r *Repository) MarkPaymentOrderFailed(id string, message string) error {
	return r.db.Model(&model.PaymentOrder{}).
		Where("id = ? AND status = ?", id, model.PaymentOrderPending).
		Updates(map[string]any{"status": model.PaymentOrderFailed, "provider_error": message, "updated_at": time.Now()}).Error
}

func (r *Repository) SavePaymentCheckout(id string, providerTradeNo string, checkoutURL string, qrCode string, qrCodeImage string, urlScheme string) error {
	return r.db.Model(&model.PaymentOrder{}).
		Where("id = ? AND status = ?", id, model.PaymentOrderPending).
		Updates(map[string]any{
			"provider_trade_no": providerTradeNo,
			"checkout_url":      checkoutURL,
			"qr_code":           qrCode,
			"qr_code_image":     qrCodeImage,
			"url_scheme":        urlScheme,
			"updated_at":        time.Now(),
		}).Error
}

// CompletePaymentOrder 将订单终态和积分入账放在同一事务内。重复回调只读回账户，不重复赠送。
func (r *Repository) CompletePaymentOrder(id string, providerTradeNo string) (*model.CreditAccount, bool, error) {
	var account model.CreditAccount
	granted := false
	err := r.db.Transaction(func(tx *gorm.DB) error {
		var order model.PaymentOrder
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).First(&order, "id = ?", id).Error; err != nil {
			return err
		}
		if order.Status == model.PaymentOrderPaid {
			return tx.FirstOrCreate(&account, model.CreditAccount{UserID: order.UserID}).Error
		}
		if order.Status != model.PaymentOrderPending && order.Status != model.PaymentOrderFailed {
			return errors.New("payment order is not payable")
		}
		now := time.Now()
		updated := tx.Model(&model.PaymentOrder{}).
			Where("id = ? AND status <> ?", order.ID, model.PaymentOrderPaid).
			Updates(map[string]any{"status": model.PaymentOrderPaid, "provider_trade_no": providerTradeNo, "provider_error": "", "paid_at": now, "updated_at": now})
		if updated.Error != nil {
			return updated.Error
		}
		if updated.RowsAffected != 1 {
			return errors.New("payment order changed concurrently")
		}
		if err := tx.Clauses(clause.OnConflict{DoNothing: true}).Create(&model.CreditAccount{UserID: order.UserID}).Error; err != nil {
			return err
		}
		if err := tx.Model(&model.CreditAccount{}).Where("user_id = ?", order.UserID).Updates(map[string]any{
			"available_microcredits": gorm.Expr("available_microcredits + ?", order.CreditsMicrocredits),
			"version":                gorm.Expr("version + 1"),
			"updated_at":             now,
		}).Error; err != nil {
			return err
		}
		if err := tx.First(&account, "user_id = ?", order.UserID).Error; err != nil {
			return err
		}
		reference := "payment:" + order.ID
		entry := model.CreditLedgerEntry{
			ID:                         "p" + order.ID,
			UserID:                     order.UserID,
			Type:                       model.CreditLedgerRecharge,
			AmountMicrocredits:         order.CreditsMicrocredits,
			AvailableDeltaMicrocredits: order.CreditsMicrocredits,
			AvailableAfterMicrocredits: account.AvailableMicrocredits,
			ReservedAfterMicrocredits:  account.ReservedMicrocredits,
			Note:                       order.PlanName + "在线充值",
			ReferenceKey:               &reference,
			CreatedAt:                  now,
		}
		if err := tx.Create(&entry).Error; err != nil {
			return err
		}
		granted = true
		return nil
	})
	return &account, granted, err
}
