package repository

// Only active public products may supply customer-facing descriptions.
func (r *Repository) ChannelModelDescriptions(channelID string) (map[string]string, error) {
	var rows []struct {
		ModelKey    string
		Description string
	}
	err := r.db.Table("logical_models AS lm").Select("cm.model_key, lm.description").
		Joins("JOIN logical_model_routes AS route ON route.logical_model_revision_id = lm.active_revision_id").
		Joins("JOIN channel_models AS cm ON cm.id = route.channel_model_id").
		Where("cm.channel_id = ? AND cm.deleted_at IS NULL AND lm.enabled = ? AND lm.archived_at IS NULL AND route.enabled = ?", channelID, true, true).
		Order("lm.sort_order DESC, lm.id DESC").Scan(&rows).Error
	if err != nil {
		return nil, err
	}
	result := make(map[string]string, len(rows))
	for _, row := range rows {
		result[row.ModelKey] = row.Description
	}
	return result, nil
}
