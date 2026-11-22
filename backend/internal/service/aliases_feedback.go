package service

import (
	"infinite-canvas/backend/internal/app"
	"infinite-canvas/backend/internal/model"
	"infinite-canvas/backend/internal/repository"
)

type UserFeedback = model.UserFeedback
type FeedbackType = model.FeedbackType
type FeedbackStatus = model.FeedbackStatus
type FeedbackAttachment = model.FeedbackAttachment

type SubmitFeedbackRequest = app.SubmitFeedbackRequest
type AdminUpdateFeedbackRequest = app.AdminUpdateFeedbackRequest
type FeedbackListResult = app.FeedbackListResult
type FeedbackFilter = repository.FeedbackFilter
