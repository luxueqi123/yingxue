package database

import (
	"fmt"

	"gorm.io/gorm"
	"infinite-canvas/backend/internal/model"
)

const canvasSyncPersistenceChecksum = "sha256:yingxue-canvas-sync-v53-20261029"

func migrateCanvasSyncPersistence(tx *gorm.DB) error {
	if err := tx.AutoMigrate(&model.CanvasMutationReceipt{}, &model.CanvasEditLease{}); err != nil {
		return fmt.Errorf("创建画布同步回执与编辑租约表：%w", err)
	}
	return nil
}
