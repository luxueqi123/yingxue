package database

import (
	"gorm.io/gorm"
	"infinite-canvas/backend/internal/model"
)

func migrateCanvasCollaboration(tx *gorm.DB) error {
	if err := tx.AutoMigrate(&model.CanvasEditLease{}); err != nil {
		return err
	}
	return migrateCanvasAgentActivityIndexes(tx)
}
