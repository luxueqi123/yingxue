package app

import (
	"encoding/json"
	"strings"
	"testing"
	"time"

	"infinite-canvas/backend/internal/model"
)

func TestProviderUploadCheckpointPersistsPrivatelyAndRequiresLease(t *testing.T) {
	svc, db := newTimelineTaskTestService(t)
	svc.dataDir = t.TempDir()
	expires := time.Now().Add(time.Minute)
	task := &model.Task{ID: newID(), UserID: "owner", Status: model.TaskStatusRunning, LeaseOwner: "worker-1", LeaseExpiresAt: &expires}
	if err := db.Create(task).Error; err != nil {
		t.Fatal(err)
	}
	state := providerUploadCheckpoint{TaskID: task.ID, UserID: task.UserID, ProviderID: "provider-job", InterfaceType: "video-upload", InputDigest: "input-hash", Targets: []providerUploadTarget{{URL: "https://storage.example/video?signature=private", VideoIndex: 0}}}
	stale := *task
	if err := svc.saveProviderUploadCheckpoint(task, state); err != nil {
		t.Fatal(err)
	}
	load := func() *model.Task {
		value, err := svc.repo.Task(task.ID)
		if err != nil {
			t.Fatal(err)
		}
		return value
	}
	saved := load()
	if strings.Contains(saved.ProviderUploadState, "signature") || !strings.HasPrefix(saved.ProviderUploadState, encryptedSettingPrefix) {
		t.Fatal("checkpoint not encrypted")
	}
	public, _ := json.Marshal(saved)
	if strings.Contains(string(public), "providerUploadState") || strings.Contains(string(public), "signature") || strings.Contains(string(public), encryptedSettingPrefix) {
		t.Fatal("private state exposed")
	}
	// A new service using the same key and DB represents a fresh process.
	restarted := &Service{repo: svc.repo, dataDir: svc.dataDir}
	resumed, err := restarted.loadProviderUploadCheckpoint(saved, state.InterfaceType, state.InputDigest)
	if err != nil || resumed == nil || resumed.Next != 0 || resumed.Targets[0].URL != state.Targets[0].URL {
		t.Fatalf("resume lost state: %v", err)
	}
	if err := svc.saveProviderUploadCheckpoint(&stale, state); err == nil {
		t.Fatal("stale writer accepted")
	}
	wrongOwner := *saved
	wrongOwner.LeaseOwner = "worker-2"
	if err := svc.saveProviderUploadCheckpoint(&wrongOwner, state); err == nil {
		t.Fatal("wrong lease accepted")
	}
	wrongUser := *saved
	wrongUser.UserID = "another-user"
	if _, err := restarted.loadProviderUploadCheckpoint(&wrongUser, state.InterfaceType, state.InputDigest); err == nil {
		t.Fatal("cross-user state accepted")
	}
	if _, err := restarted.loadProviderUploadCheckpoint(saved, state.InterfaceType, "changed-input"); err == nil {
		t.Fatal("changed input accepted")
	}
	state.Next = 1
	if err := restarted.saveProviderUploadCheckpoint(saved, state); err != nil {
		t.Fatal(err)
	}
	completed, err := restarted.loadProviderUploadCheckpoint(load(), state.InterfaceType, state.InputDigest)
	if err != nil || completed.Next != 1 || completed.Targets[0].URL != "" || load().PollStage != "poll" {
		t.Fatal("completed upload not cleared or poll not persisted")
	}
	if state.Targets[0].URL == "" {
		t.Fatal("caller state mutated")
	}
	if err := db.Model(&model.Task{}).Where("id = ?", task.ID).Update("lease_expires_at", time.Now().Add(-time.Minute)).Error; err != nil {
		t.Fatal(err)
	}
	if err := restarted.saveProviderUploadCheckpoint(load(), state); err == nil {
		t.Fatal("expired lease accepted")
	}
}
