package model

import "time"

type UserStorageGrantSource string

const (
	UserStorageGrantSourcePayment UserStorageGrantSource = "payment"
	UserStorageGrantSourceAdmin   UserStorageGrantSource = "admin"
)

// UserStorageGrant records one independent capacity extension. Expiration is
// evaluated at read time, so no background expiry job is required.
type UserStorageGrant struct {
	ID             string                 `json:"id" gorm:"primaryKey;size:36"`
	UserID         string                 `json:"userId" gorm:"size:36;not null;index:idx_user_storage_grant_active,priority:1"`
	Source         UserStorageGrantSource `json:"source" gorm:"size:24;not null;index"`
	PaymentOrderID string                 `json:"paymentOrderId,omitempty" gorm:"size:36;index"`
	ProductID      string                 `json:"productId,omitempty" gorm:"size:36;index"`
	ProductName    string                 `json:"productName,omitempty" gorm:"size:120"`
	Bytes          int64                  `json:"bytes" gorm:"not null"`
	DurationDays   int                    `json:"durationDays" gorm:"not null;default:0"`
	StartsAt       time.Time              `json:"startsAt"`
	ExpiresAt      *time.Time             `json:"expiresAt,omitempty" gorm:"index:idx_user_storage_grant_active,priority:2"`
	RevokedAt      *time.Time             `json:"revokedAt,omitempty" gorm:"index"`
	RevokedBy      string                 `json:"revokedBy,omitempty" gorm:"size:36"`
	RevokeReason   string                 `json:"revokeReason,omitempty" gorm:"size:500"`
	ReferenceKey   *string                `json:"-" gorm:"size:200;uniqueIndex"`
	Note           string                 `json:"note,omitempty" gorm:"size:500"`
	CreatedBy      string                 `json:"createdBy,omitempty" gorm:"size:36;index"`
	CreatedAt      time.Time              `json:"createdAt" gorm:"index"`
}

// UserStorageState tracks when the account was first observed over capacity.
type UserStorageState struct {
	UserID         string     `json:"userId" gorm:"primaryKey;size:36"`
	OverLimitSince *time.Time `json:"overLimitSince,omitempty" gorm:"index"`
	UpdatedAt      time.Time  `json:"updatedAt"`
}
