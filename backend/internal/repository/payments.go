package repository

import (
	"errors"
	"time"

	"infinite-canvas/backend/internal/model"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

// Migrated rows remain in payment_orders as immutable source evidence. Only
// payment_topup_orders may drive their checkout, callbacks and credit ledger.
func unmigratedEPayOrders(tx *gorm.DB) *gorm.DB {
	return tx.Where("NOT EXISTS (SELECT 1 FROM payment_topup_orders migrated WHERE migrated.id = payment_orders.id)")
}

func (r *Repository) CreateOrGetEPayPaymentOrder(order *model.EPayPaymentOrder) (*model.EPayPaymentOrder, bool, error) {
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
	var existing model.EPayPaymentOrder
	if err := r.db.Scopes(unmigratedEPayOrders).Where("user_id = ? AND idempotency_key = ?", order.UserID, order.IdempotencyKey).First(&existing).Error; err != nil {
		return nil, false, err
	}
	return &existing, false, nil
}

func (r *Repository) EPayPaymentOrder(id string) (*model.EPayPaymentOrder, error) {
	var order model.EPayPaymentOrder
	if err := r.db.Scopes(unmigratedEPayOrders).First(&order, "id = ?", id).Error; err != nil {
		return nil, err
	}
	return &order, nil
}

func (r *Repository) EPayPaymentOrderForUser(userID string, id string) (*model.EPayPaymentOrder, error) {
	var order model.EPayPaymentOrder
	if err := r.db.Scopes(unmigratedEPayOrders).Where("user_id = ? AND id = ?", userID, id).First(&order).Error; err != nil {
		return nil, err
	}
	return &order, nil
}

func (r *Repository) EPayPaymentOrdersForUser(userID string, limit int) ([]model.EPayPaymentOrder, error) {
	if limit <= 0 || limit > 100 {
		limit = 20
	}
	var orders []model.EPayPaymentOrder
	return orders, r.db.Scopes(unmigratedEPayOrders).Where("user_id = ?", userID).Order("created_at desc").Limit(limit).Find(&orders).Error
}

func (r *Repository) EPayPaymentOrders(limit int) ([]model.EPayPaymentOrder, error) {
	if limit <= 0 || limit > 100 {
		limit = 20
	}
	var orders []model.EPayPaymentOrder
	return orders, r.db.Scopes(unmigratedEPayOrders).Order("created_at desc").Limit(limit).Find(&orders).Error
}

func (r *Repository) MarkEPayPaymentOrderFailed(id string, message string) error {
	return r.db.Model(&model.EPayPaymentOrder{}).Scopes(unmigratedEPayOrders).
		Where("id = ? AND status = ?", id, model.EPayPaymentOrderPending).
		Updates(map[string]any{"status": model.EPayPaymentOrderFailed, "provider_error": message, "updated_at": time.Now()}).Error
}

func (r *Repository) SavePaymentCheckout(id string, providerTradeNo string, checkoutURL string, qrCode string, qrCodeImage string, urlScheme string) error {
	return r.db.Model(&model.EPayPaymentOrder{}).Scopes(unmigratedEPayOrders).
		Where("id = ? AND status = ?", id, model.EPayPaymentOrderPending).
		Updates(map[string]any{
			"provider_trade_no": providerTradeNo,
			"checkout_url":      checkoutURL,
			"qr_code":           qrCode,
			"qr_code_image":     qrCodeImage,
			"url_scheme":        urlScheme,
			"updated_at":        time.Now(),
		}).Error
}

// CompleteEPayPaymentOrder 将订单终态和积分入账放在同一事务内。重复回调只读回账户，不重复赠送。
func (r *Repository) CompleteEPayPaymentOrder(id string, providerTradeNo string) (*model.CreditAccount, bool, error) {
	var account model.CreditAccount
	granted := false
	err := r.db.Transaction(func(tx *gorm.DB) error {
		var order model.EPayPaymentOrder
		if err := tx.Scopes(unmigratedEPayOrders).Clauses(clause.Locking{Strength: "UPDATE"}).First(&order, "id = ?", id).Error; err != nil {
			return err
		}
		if order.Status == model.EPayPaymentOrderPaid {
			return tx.FirstOrCreate(&account, model.CreditAccount{UserID: order.UserID}).Error
		}
		if order.Status != model.EPayPaymentOrderPending && order.Status != model.EPayPaymentOrderFailed {
			return errors.New("payment order is not payable")
		}
		now := time.Now()
		updated := tx.Model(&model.EPayPaymentOrder{}).
			Where("id = ? AND status <> ?", order.ID, model.EPayPaymentOrderPaid).
			Updates(map[string]any{"status": model.EPayPaymentOrderPaid, "provider_trade_no": providerTradeNo, "provider_error": "", "paid_at": now, "updated_at": now})
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
