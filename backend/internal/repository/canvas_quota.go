package repository

import (
	"strings"

	"infinite-canvas/backend/internal/model"
)

// UserStructuredStorageUsage reads only the counters and payload bytes used by
// asset/canvas structured-data quotas. Keeping task and API-log accounting out of
// this path avoids scanning unrelated large history rows on every canvas write.
func (r *Repository) UserStructuredStorageUsage(userID string) (UserStorageUsage, error) {
	var usage UserStorageUsage
	assetCount := personalAssetLibraryQuery(r.db.Model(&model.Asset{}).Select("COUNT(*)").Where("user_id = ?", userID))
	query := `
		SELECT
			(?) AS asset_count,
			(SELECT COALESCE(SUM(length(CAST(COALESCE(payload_json, '') AS BLOB))), 0) FROM assets WHERE user_id = ?) AS asset_bytes,
			(SELECT COUNT(*) FROM canvas_projects WHERE user_id = ?) AS canvas_count,
			(SELECT COALESCE(SUM(length(CAST(COALESCE(payload_json, '') AS BLOB))), 0) FROM canvas_projects WHERE user_id = ?) AS canvas_bytes
	`
	if r.Dialect() == "postgres" {
		query = strings.ReplaceAll(query, "length(CAST(COALESCE(", "octet_length(COALESCE(")
		query = strings.ReplaceAll(query, ", '') AS BLOB))", ", ''))")
	}
	err := r.db.Raw(query, assetCount, userID, userID, userID).Scan(&usage).Error
	return usage, err
}
