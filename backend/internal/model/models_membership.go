package model

import "time"

// MembershipPlan versions are copied into purchases; editing a plan never changes an existing contract.
type MembershipPlan struct {
	ID                         string    `json:"id" gorm:"primaryKey;size:36"`
	Name                       string    `json:"name" gorm:"size:80"`
	Description                string    `json:"description" gorm:"size:500"`
	Version                    int64     `json:"version"`
	Enabled                    bool      `json:"enabled" gorm:"index"`
	SortOrder                  int       `json:"sortOrder"`
	MonthlyAmountFen           int64     `json:"monthlyAmountFen"`
	AnnualAmountFen            int64     `json:"annualAmountFen"`
	MonthlyCreditsMicrocredits int64     `json:"monthlyCreditsMicrocredits"`
	ConcurrentTasks            int       `json:"concurrentTasks"`
	StorageBytes               int64     `json:"storageBytes"`
	CreditGraceDays            int       `json:"creditGraceDays"`
	CreatedAt                  time.Time `json:"createdAt"`
	UpdatedAt                  time.Time `json:"updatedAt"`
}

type MembershipSubscription struct {
	ID               string     `json:"id" gorm:"primaryKey;size:36"`
	UserID           string     `json:"userId" gorm:"size:36;index:idx_membership_user_period,priority:1"`
	PlanID           string     `json:"planId" gorm:"size:36;index"`
	PlanName         string     `json:"planName" gorm:"size:80"`
	PlanVersion      int64      `json:"planVersion"`
	PaymentOrderID   string     `json:"paymentOrderId" gorm:"size:36;index"`
	ReferenceKey     string     `json:"-" gorm:"size:180;uniqueIndex"`
	PlanSnapshotJSON string     `json:"-" gorm:"type:text"`
	StartsAt         time.Time  `json:"startsAt"`
	EndsAt           time.Time  `json:"endsAt" gorm:"index:idx_membership_user_period,priority:2"`
	Months           int        `json:"months"`
	GrantedCycles    int        `json:"grantedCycles"`
	NextGrantAt      *time.Time `json:"nextGrantAt" gorm:"index"`
	CreatedAt        time.Time  `json:"createdAt"`
	UpdatedAt        time.Time  `json:"updatedAt"`
}

// MembershipCreditLot tracks only membership grants. Existing permanent funds keep their original account and ledger.
type MembershipCreditLot struct {
	ID                      string     `json:"id" gorm:"primaryKey;size:36"`
	UserID                  string     `json:"userId" gorm:"size:36;index:idx_member_lot_user_expiry,priority:1"`
	SubscriptionID          string     `json:"subscriptionId" gorm:"size:36;index"`
	ReferenceKey            string     `json:"-" gorm:"size:180;uniqueIndex"`
	Name                    string     `json:"name" gorm:"size:120"`
	GrantedMicrocredits     int64      `json:"grantedMicrocredits"`
	AvailableMicrocredits   int64      `json:"availableMicrocredits"`
	ReservedMicrocredits    int64      `json:"reservedMicrocredits"`
	ConsumedMicrocredits    int64      `json:"consumedMicrocredits"`
	ExpiredMicrocredits     int64      `json:"expiredMicrocredits"`
	TransferredMicrocredits int64      `json:"transferredMicrocredits"`
	ExpiresAt               time.Time  `json:"expiresAt" gorm:"index:idx_member_lot_user_expiry,priority:2"`
	RefundOriginID          string     `json:"refundOriginId,omitempty" gorm:"size:36;index"`
	RefundGraceUntil        *time.Time `json:"-"`
	CreatedAt               time.Time  `json:"createdAt"`
	UpdatedAt               time.Time  `json:"updatedAt"`
}

type MembershipCreditAllocation struct {
	ID                   string    `json:"id" gorm:"primaryKey;size:36"`
	UserID               string    `json:"userId" gorm:"size:36;index"`
	BillingOrderID       string    `json:"billingOrderId" gorm:"size:36;uniqueIndex:idx_member_allocation_order_lot,priority:1"`
	LotID                string    `json:"lotId" gorm:"size:36;uniqueIndex:idx_member_allocation_order_lot,priority:2"`
	SpendExpiresAt       time.Time `json:"-"`
	ReservedMicrocredits int64     `json:"reservedMicrocredits"`
	ConsumedMicrocredits int64     `json:"consumedMicrocredits"`
	ReturnedMicrocredits int64     `json:"returnedMicrocredits"`
	CreatedAt            time.Time `json:"createdAt"`
	UpdatedAt            time.Time `json:"updatedAt"`
}
