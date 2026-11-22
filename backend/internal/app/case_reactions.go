package app

import (
	_ "embed"
	"infinite-canvas/backend/internal/kernel"
	"infinite-canvas/backend/internal/model"
	"strings"
)

// The published selection is shared with the frontend; source-site likes are not local votes.
//
//go:embed published_case_ids.txt
var publishedCaseIDs string

var publishedCases = func() map[string]struct{} {
	cases := make(map[string]struct{})
	for _, id := range strings.Fields(publishedCaseIDs) {
		cases[id] = struct{}{}
	}
	return cases
}()

type CaseReaction struct {
	Count int64 `json:"count"`
	Liked bool  `json:"liked"`
}

func (s *Service) CaseReaction(actor *model.User, caseID string) (*CaseReaction, error) {
	if _, exists := publishedCases[caseID]; !exists {
		if !strings.HasPrefix(caseID, "work-") {
			return nil, kernel.NotFound("案例未发布")
		}
		if _, err := s.accessibleCommunityWork(nil, caseID, true); err != nil {
			return nil, err
		}
	}
	userID := ""
	if actor != nil {
		if actor.ID == "" || actor.Status != model.UserStatusActive {
			return nil, kernel.Unauthorized("请先登录")
		}
		userID = actor.ID
	}
	count, liked, err := s.repo.CaseReaction(userID, caseID)
	if err != nil {
		return nil, err
	}
	return &CaseReaction{Count: count, Liked: liked}, nil
}

func (s *Service) SetCaseLiked(actor *model.User, caseID string, liked bool) (*CaseReaction, error) {
	if actor == nil || actor.ID == "" || actor.Status != model.UserStatusActive {
		return nil, kernel.Unauthorized("请先登录")
	}
	if _, err := s.CaseReaction(actor, caseID); err != nil {
		return nil, err
	}
	if err := s.repo.SetCaseLiked(actor.ID, caseID, liked); err != nil {
		return nil, err
	}
	return s.CaseReaction(actor, caseID)
}
