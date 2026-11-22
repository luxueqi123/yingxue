package repository

import (
	"gorm.io/gorm/clause"
	"infinite-canvas/backend/internal/model"
)

func (r *Repository) CaseReaction(userID, caseID string) (int64, bool, error) {
	var result struct {
		Count int64
		Liked int64
	}
	err := r.db.Model(&model.CaseLike{}).Where("case_id = ?", caseID).
		Select("COUNT(*) AS count, COALESCE(MAX(CASE WHEN user_id = ? THEN 1 ELSE 0 END), 0) AS liked", userID).Scan(&result).Error
	return result.Count, result.Liked == 1, err
}

func (r *Repository) SetCaseLiked(userID, caseID string, liked bool) error {
	if !liked {
		return r.db.Where("user_id = ? AND case_id = ?", userID, caseID).Delete(&model.CaseLike{}).Error
	}
	return r.db.Clauses(clause.OnConflict{DoNothing: true}).Create(&model.CaseLike{UserID: userID, CaseID: caseID}).Error
}
