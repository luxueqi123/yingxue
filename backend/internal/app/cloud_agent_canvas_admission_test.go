package app

import (
	"errors"
	"testing"

	"infinite-canvas/backend/internal/model"
	"infinite-canvas/backend/internal/repository"
)

func TestCreateCloudAgentRunCanvasBusyIsStructuredAndPreservesReservation(t *testing.T) {
	for _, legacy := range []bool{false, true} {
		name := "pi-carrier"
		if legacy {
			name = "legacy-root"
		}
		t.Run(name, func(t *testing.T) {
			s, db, _, _ := creationTestService(t)
			s.legacyCloudAgentRootTask = legacy
			for _, item := range []any{
				&model.CanvasProject{ID: "agent-canvas", UserID: "user", PayloadJSON: `{"nodes":[],"connections":[],"chatSessions":[]}`},
				&model.Task{ID: "occupied", UserID: "user", ProjectID: "agent-canvas", Operation: "cloud_agent", Status: model.TaskStatusTextReplay},
				&model.CloudAgentExecution{ID: "occupied", UserID: "user", Status: "cancelled", CleanupPending: true},
			} {
				if err := db.Create(item).Error; err != nil {
					t.Fatal(err)
				}
			}
			var accountBefore model.CreditAccount
			if err := db.First(&accountBefore, "user_id = ?", "user").Error; err != nil {
				t.Fatal(err)
			}
			_, err := s.CreateCloudAgentRun("user", agentTestRequest(), "")
			var appErr *AppError
			if !errors.As(err, &appErr) || appErr.Status != 409 || appErr.Reason != "canvas_agent_busy" {
				t.Fatalf("busy creation must be structured 409: %v", err)
			}
			activity, ok := appErr.Details["agent"].(repository.CanvasAgentActivity)
			if appErr.Details["canvasId"] != "agent-canvas" || !ok || activity.RunID != "occupied" || !activity.CleanupPending || activity.Status != "cancelled" {
				t.Fatalf("lost transaction admission state: %+v", appErr)
			}
			var accountAfter model.CreditAccount
			if err := db.First(&accountAfter, "user_id = ?", "user").Error; err != nil {
				t.Fatal(err)
			}
			if accountAfter.AvailableMicrocredits != accountBefore.AvailableMicrocredits || accountAfter.ReservedMicrocredits != accountBefore.ReservedMicrocredits {
				t.Fatal("busy admission reserved credits")
			}
			for _, table := range []struct {
				model any
				want  int64
			}{{&model.Task{}, 1}, {&model.BillingOrder{}, 0}, {&model.CreditLedgerEntry{}, 0}} {
				var count int64
				if err := db.Model(table.model).Count(&count).Error; err != nil || count != table.want {
					t.Fatalf("busy admission left rows: %T %d %v", table.model, count, err)
				}
			}
		})
	}
}
