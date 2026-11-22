package repository

import (
	"errors"
	"fmt"
	"path/filepath"
	"sync"
	"testing"

	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
	"infinite-canvas/backend/internal/database"
	"infinite-canvas/backend/internal/model"
)

func TestCanvasAgentAdmissionAcrossConnections(t *testing.T) {
	dsn := filepath.Join(t.TempDir(), "agent-admission.db") + "?_journal_mode=WAL&_busy_timeout=5000"
	open := func() *Repository {
		db, err := gorm.Open(sqlite.Open(dsn), &gorm.Config{Logger: logger.Default.LogMode(logger.Silent)})
		if err != nil {
			t.Fatal(err)
		}
		sqlDB, err := db.DB()
		if err != nil {
			t.Fatal(err)
		}
		t.Cleanup(func() { _ = sqlDB.Close() })
		return New(db)
	}
	a, b := open(), open()
	testCanvasAgentAdmissionAcrossConnections(t, a, b)
}

func testCanvasAgentAdmissionAcrossConnections(t *testing.T, a, b *Repository) {
	t.Helper()
	if err := a.db.AutoMigrate(&model.CanvasProject{}, &model.Task{}, &model.CloudAgentExecution{}, &model.CreditAccount{}, &model.AgentStorageUsage{}); err != nil {
		t.Fatal(err)
	}
	if err := a.db.Create(&model.CanvasProject{ID: "canvas", UserID: "user", Revision: 7}).Error; err != nil {
		t.Fatal(err)
	}
	start := make(chan struct{})
	results := make(chan error, 2)
	var wg sync.WaitGroup
	for i, repo := range []*Repository{a, b} {
		wg.Add(1)
		go func(i int, repo *Repository) {
			defer wg.Done()
			<-start
			results <- repo.CreateTaskWithActiveLimit(&model.Task{ID: fmt.Sprintf("run-%d", i), UserID: "user", ProjectID: "canvas", Operation: "cloud_agent", Status: model.TaskStatusTextReplay}, 100)
		}(i, repo)
	}
	close(start)
	wg.Wait()
	close(results)
	accepted, rejected := 0, 0
	for err := range results {
		switch {
		case err == nil:
			accepted++
		case errors.Is(err, ErrCanvasAgentBusy):
			rejected++
		default:
			t.Fatalf("unexpected admission error: %v", err)
		}
	}
	if accepted != 1 || rejected != 1 {
		t.Fatalf("accepted=%d rejected=%d", accepted, rejected)
	}
	var count int64
	if err := a.db.Model(&model.Task{}).Where("user_id = ? AND project_id = ?", "user", "canvas").Count(&count).Error; err != nil || count != 1 {
		t.Fatalf("root count=%d err=%v", count, err)
	}
	project, err := a.CanvasProjectMetadata("user", "canvas")
	if err != nil || project.Revision != 7 {
		t.Fatalf("admission changed canvas revision: %+v err=%v", project, err)
	}
	activity, err := b.CanvasAgentActivity("user", "canvas")
	if err != nil || activity == nil || activity.Status != "queued" {
		t.Fatalf("missing checkpoint did not reserve canvas: %+v err=%v", activity, err)
	}
	if err := b.CreateTaskWithActiveLimit(&model.Task{ID: "ordinary", UserID: "user", ProjectID: "canvas", Operation: "generate", Status: model.TaskStatusQueued}, 100); err != nil {
		t.Fatalf("ordinary generation blocked: %v", err)
	}
	if err := b.db.Create(&model.CanvasProject{ID: "other-canvas", UserID: "user"}).Error; err != nil {
		t.Fatal(err)
	}
	if err := b.CreateTaskWithActiveLimit(&model.Task{ID: "other-agent", UserID: "user", ProjectID: "other-canvas", Operation: "cloud_agent", Status: model.TaskStatusTextReplay}, 100); err != nil {
		t.Fatalf("different canvas blocked: %v", err)
	}
	if err := b.db.Create(&model.CanvasProject{ID: "foreign-canvas", UserID: "other-user"}).Error; err != nil {
		t.Fatal(err)
	}
	if err := b.CreateTaskWithActiveLimit(&model.Task{ID: "foreign-agent", UserID: "other-user", ProjectID: "foreign-canvas", Operation: "cloud_agent", Status: model.TaskStatusTextReplay}, 100); err != nil {
		t.Fatalf("different user blocked: %v", err)
	}
	if err := b.CreateTaskWithActiveLimit(&model.Task{ID: "foreign-intrusion", UserID: "other-user", ProjectID: "canvas", Operation: "cloud_agent", Status: model.TaskStatusTextReplay}, 100); !errors.Is(err, gorm.ErrRecordNotFound) {
		t.Fatalf("foreign canvas admission must fail ownership: %v", err)
	}
}

func TestCanvasAgentAdmissionBillingAndCommitNotifications(t *testing.T) {
	for _, paid := range []bool{false, true} {
		t.Run(fmt.Sprintf("paid-%t", paid), func(t *testing.T) {
			db, err := gorm.Open(sqlite.Open(filepath.Join(t.TempDir(), "admission-billing.db")+"?_journal_mode=WAL&_busy_timeout=5000"), &gorm.Config{Logger: logger.Default.LogMode(logger.Silent)})
			if err != nil {
				t.Fatal(err)
			}
			conn, err := db.DB()
			if err != nil {
				t.Fatal(err)
			}
			t.Cleanup(func() { _ = conn.Close() })
			if err := database.MigrateSchema(db); err != nil {
				t.Fatal(err)
			}
			for _, item := range []any{
				&model.CanvasProject{ID: "canvas", UserID: "user", Revision: 7},
				&model.CreditAccount{UserID: "user", AvailableMicrocredits: 1000},
				&model.Task{ID: "cleanup-root", UserID: "user", ProjectID: "canvas", Operation: "cloud_agent", Status: model.TaskStatusTextReplay},
				&model.CloudAgentExecution{ID: "cleanup-root", UserID: "user", Status: "cancelled", CleanupPending: true},
			} {
				if err := db.Create(item).Error; err != nil {
					t.Fatal(err)
				}
			}
			notifications := 0
			pendingID := ""
			repo := New(db).WithCanvasChangeNotifier(func(user, canvas string) {
				notifications++
				var count int64
				if user != "user" || canvas != "canvas" {
					t.Errorf("wrong invalidation scope: %s/%s", user, canvas)
				}
				if err := db.Model(&model.Task{}).Where("id = ?", pendingID).Count(&count).Error; err != nil || count != 1 {
					t.Errorf("notified before committed task visible: %d %v", count, err)
				}
			})
			create := func(target *Repository, id string) error {
				pendingID = id
				task := &model.Task{ID: id, UserID: "user", ProjectID: "canvas", Operation: "cloud_agent", Status: model.TaskStatusTextReplay}
				if paid {
					return target.CreateTaskWithCreditReservation(task, &model.BillingOrder{ID: id + "-order", UserID: "user", TaskID: id, IdempotencyKey: id, AmountMicrocredits: 100, Status: model.BillingStatusReserved}, 100)
				}
				return target.CreateTaskWithActiveLimit(task, 100)
			}
			if err := create(repo, "blocked"); !errors.Is(err, ErrCanvasAgentBusy) {
				t.Fatalf("cleanup admitted a second root: %v", err)
			}
			if notifications != 0 {
				t.Fatal("busy admission broadcast")
			}
			if err := db.Model(&model.CloudAgentExecution{}).Where("id = ?", "cleanup-root").Update("cleanup_pending", false).Error; err != nil {
				t.Fatal(err)
			}
			if err := create(repo, "accepted"); err != nil {
				t.Fatal(err)
			}
			if notifications != 1 {
				t.Fatalf("successful admission notifications=%d", notifications)
			}
			if err := repo.EnsureCloudAgent(&model.CloudAgentExecution{ID: "accepted", UserID: "user", Status: "completed"}); err != nil {
				t.Fatal(err)
			}
			injected := errors.New("task insert failed after reservation")
			if err := db.Callback().Create().Before("gorm:create").Register("test:admission-insert-failure", func(tx *gorm.DB) {
				if tx.Statement.Table == "tasks" {
					tx.AddError(injected)
				}
			}); err != nil {
				t.Fatal(err)
			}
			if err := create(repo, "failed"); !errors.Is(err, injected) {
				t.Fatalf("missing insert failure: %v", err)
			}
			if err := db.Callback().Create().Remove("test:admission-insert-failure"); err != nil {
				t.Fatal(err)
			}
			if err := repo.Transaction(func(tx *Repository) error {
				if err := create(tx, "outer-rollback"); err != nil {
					return err
				}
				if notifications != 1 {
					t.Error("nested admission broadcast before outer commit")
				}
				return injected
			}); !errors.Is(err, injected) {
				t.Fatalf("missing outer rollback: %v", err)
			}
			if notifications != 1 {
				t.Fatalf("rollback broadcast: %d", notifications)
			}
			var account model.CreditAccount
			if err := db.First(&account, "user_id = ?", "user").Error; err != nil {
				t.Fatal(err)
			}
			wantReserved := int64(0)
			if paid {
				wantReserved = 100
			}
			if account.AvailableMicrocredits != 1000-wantReserved || account.ReservedMicrocredits != wantReserved {
				t.Fatalf("failed admission changed credits: %+v", account)
			}
			for _, item := range []struct {
				model any
				want  int64
			}{{&model.Task{}, 2}, {&model.BillingOrder{}, wantReserved / 100}, {&model.CreditLedgerEntry{}, wantReserved / 100}} {
				var count int64
				if err := db.Model(item.model).Count(&count).Error; err != nil || count != item.want {
					t.Fatalf("rollback left %T rows=%d want=%d err=%v", item.model, count, item.want, err)
				}
			}
			activity, err := repo.CanvasAgentActivity("user", "canvas")
			if err != nil || activity != nil {
				t.Fatalf("completed/rollback roots still reserve canvas: %+v %v", activity, err)
			}
			project, err := repo.CanvasProjectMetadata("user", "canvas")
			if err != nil || project.Revision != 7 {
				t.Fatalf("admission changed canvas: %+v %v", project, err)
			}
		})
	}
}
