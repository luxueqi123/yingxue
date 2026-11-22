package model

import "time"

type CaseLike struct {
	UserID    string    `json:"-" gorm:"primaryKey;size:36"`
	CaseID    string    `json:"caseId" gorm:"primaryKey;size:80;index"`
	CreatedAt time.Time `json:"createdAt"`
}
