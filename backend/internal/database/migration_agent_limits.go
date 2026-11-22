package database

import (
	"gorm.io/gorm"
	"infinite-canvas/backend/internal/model"
)

func migrateAgentStorageLimits(tx *gorm.DB) error {
	return tx.AutoMigrate(&model.AgentStorageUsage{})
}
