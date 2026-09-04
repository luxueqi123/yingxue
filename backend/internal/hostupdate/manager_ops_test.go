package hostupdate

import (
	"archive/zip"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
	"time"
)

type recordingRunner struct {
	calls      [][]string
	inputCalls [][]string
	output     string
	runErr     error
}

func (r *recordingRunner) Run(_ context.Context, _ string, args, _ []string, stdout, _ io.Writer) error {
	r.calls = append(r.calls, append([]string(nil), args...))
	if stdout != nil {
		value := r.output
		if value == "" {
			value = "backup-fixture"
		}
		_, _ = io.WriteString(stdout, value)
	}
	return r.runErr
}

func (r *recordingRunner) RunWithInput(_ context.Context, _ string, args, _ []string, input io.Reader, stdout, _ io.Writer) error {
	r.inputCalls = append(r.inputCalls, append([]string(nil), args...))
	_, _ = io.Copy(io.Discard, input)
	if stdout != nil {
		_, _ = io.WriteString(stdout, r.output)
	}
	return nil
}

func TestSetEnvValuePreservesOtherSettings(t *testing.T) {
	directory := t.TempDir()
	path := filepath.Join(directory, ".env")
	if err := os.WriteFile(path, []byte("# keep\nCANVAS_IMAGE_TAG=1.0.0\nPOSTGRES_DB=canvas\n"), 0o640); err != nil {
		t.Fatal(err)
	}
	if err := setEnvValue(path, "CANVAS_IMAGE_TAG", "1.2.2-preview.1"); err != nil {
		t.Fatal(err)
	}
	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	value := string(data)
	if !strings.Contains(value, "# keep\n") || !strings.Contains(value, "POSTGRES_DB=canvas\n") || !strings.Contains(value, "CANVAS_IMAGE_TAG=1.2.2-preview.1\n") {
		t.Fatalf("unexpected env contents: %q", value)
	}
	stat, err := os.Stat(path)
	if err != nil {
		t.Fatal(err)
	}
	if runtime.GOOS != "windows" && stat.Mode().Perm() != 0o640 {
		t.Fatalf("mode=%o, want 640", stat.Mode().Perm())
	}
}

func TestVerifyImagesUsesConfiguredImageRepository(t *testing.T) {
	installDir := t.TempDir()
	if err := os.WriteFile(filepath.Join(installDir, ".env"), []byte("CANVAS_IMAGE_REPOSITORY=ghcr.io/luxueqi123\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	runner := &recordingRunner{output: `["ghcr.io/luxueqi123/open-ai-canvas@sha256:abc"]`}
	manager := &Manager{config: Config{InstallDir: installDir, EnvFile: ".env", Repository: "another/project"}, runner: runner}
	if err := manager.verifyImages("v1.2.5-yingxue.1"); err != nil {
		t.Fatal(err)
	}
	if len(runner.calls) != 2 {
		t.Fatalf("image inspect calls = %d", len(runner.calls))
	}
	for _, call := range runner.calls {
		if !strings.Contains(strings.Join(call, " "), "ghcr.io/luxueqi123/open-ai-canvas-") {
			t.Fatalf("unexpected image inspection: %#v", call)
		}
	}
}

func TestVerifyZipBackupRejectsCorruption(t *testing.T) {
	path := filepath.Join(t.TempDir(), "backup.zip")
	file, err := os.Create(path)
	if err != nil {
		t.Fatal(err)
	}
	archive := zip.NewWriter(file)
	for name, content := range map[string]string{
		"metadata.json":    "{}",
		"database.dump":    "database",
		"backend-data.tar": "data",
	} {
		entry, createErr := archive.Create(name)
		if createErr != nil {
			t.Fatal(createErr)
		}
		if _, writeErr := io.WriteString(entry, content); writeErr != nil {
			t.Fatal(writeErr)
		}
	}
	if err := archive.Close(); err != nil {
		t.Fatal(err)
	}
	if err := file.Close(); err != nil {
		t.Fatal(err)
	}
	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	hash := sha256.Sum256(data)
	checksum := "sha256:" + hex.EncodeToString(hash[:])
	if err := verifyZipBackup(path, checksum); err != nil {
		t.Fatalf("valid backup rejected: %v", err)
	}
	if err := os.WriteFile(path, append(data, byte(1)), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := verifyZipBackup(path, checksum); err == nil {
		t.Fatal("corrupted backup was accepted")
	}
}

func TestCurrentVersionRejectsLatest(t *testing.T) {
	installDir := t.TempDir()
	if err := os.WriteFile(filepath.Join(installDir, ".env"), []byte("CANVAS_IMAGE_TAG=latest\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	manager := &Manager{config: Config{InstallDir: installDir, EnvFile: ".env"}}
	if _, err := manager.currentVersion(); err == nil {
		t.Fatal("latest tag was accepted")
	}
}

func TestStartRollbackRejectsAlreadyRestoredVersion(t *testing.T) {
	installDir := t.TempDir()
	if err := os.WriteFile(filepath.Join(installDir, ".env"), []byte("CANVAS_IMAGE_TAG=1.2.4-yingxue.1\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	manager := &Manager{
		config: Config{InstallDir: installDir, EnvFile: ".env", StateDir: installDir, StepTimeout: time.Second},
		runner: &recordingRunner{runErr: errors.New("stop")},
		state: persistedState{
			LastBackup:      &Backup{ID: "backup-1", Version: "v1.2.4-yingxue.1"},
			RollbackVersion: "v1.2.4-yingxue.1",
			Operation:       Operation{Phase: PhaseRolledBack},
		},
	}

	status, err := manager.StartRollback("repeat")
	if err == nil {
		deadline := time.Now().Add(time.Second)
		for time.Now().Before(deadline) {
			manager.mu.Lock()
			active := manager.state.Operation.Phase.Active()
			manager.mu.Unlock()
			if !active {
				break
			}
			time.Sleep(time.Millisecond)
		}
	}
	if err == nil || !strings.Contains(err.Error(), "当前已是回退版本") {
		t.Fatalf("repeat rollback error = %v", err)
	}
	if status.Operation.Phase != PhaseRolledBack {
		t.Fatalf("operation phase = %s, want %s", status.Operation.Phase, PhaseRolledBack)
	}
}

func TestStartRollbackRejectsTargetNewerThanCurrentVersion(t *testing.T) {
	installDir := t.TempDir()
	if err := os.WriteFile(filepath.Join(installDir, ".env"), []byte("CANVAS_IMAGE_TAG=1.2.3-yingxue.1\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	manager := &Manager{
		config: Config{InstallDir: installDir, EnvFile: ".env", StateDir: installDir, StepTimeout: time.Second},
		runner: &recordingRunner{runErr: errors.New("stop")},
		state: persistedState{
			LastBackup:      &Backup{ID: "backup-newer", Version: "v1.2.4-yingxue.1"},
			RollbackVersion: "v1.2.4-yingxue.1",
			Operation:       Operation{Phase: PhaseRolledBack},
		},
	}

	_, err := manager.StartRollback("invalid direction")
	if err == nil || !strings.Contains(err.Error(), "必须低于当前版本") {
		t.Fatalf("newer rollback target error = %v", err)
	}
}

func TestSuccessfulRollbackConsumesRollbackSnapshot(t *testing.T) {
	installDir := t.TempDir()
	stateDir := filepath.Join(installDir, "state")
	if err := os.MkdirAll(stateDir, 0o700); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(installDir, ".env"), []byte("CANVAS_IMAGE_TAG=1.2.5-yingxue.1\nPOSTGRES_USER=canvas\nPOSTGRES_DB=canvas\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	backup := writeRollbackTestBackup(t, installDir, "v1.2.4-yingxue.1")
	server := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, _ *http.Request) {
		writer.Header().Set("Content-Type", "application/json")
		_, _ = io.WriteString(writer, `{"code":0,"data":{"build":{"version":"v1.2.4-yingxue.1"}}}`)
	}))
	defer server.Close()
	manager := &Manager{
		config: Config{
			InstallDir:   installDir,
			ComposeFile:  "docker-compose.deploy.yml",
			EnvFile:      ".env",
			StateDir:     stateDir,
			HealthURL:    server.URL,
			StableWindow: time.Nanosecond,
			StepTimeout:  time.Second,
		},
		runner:     &recordingRunner{},
		httpClient: server.Client(),
		state: persistedState{
			LastBackup:      &backup,
			RollbackVersion: backup.Version,
			Operation:       Operation{Phase: PhaseRollingBack},
		},
	}

	manager.runRollback(backup.Version, backup, false)

	if manager.state.Operation.Phase != PhaseRolledBack {
		t.Fatalf("operation phase = %s, want %s", manager.state.Operation.Phase, PhaseRolledBack)
	}
	if manager.state.RollbackVersion != "" || manager.state.LastBackup != nil {
		t.Fatalf("rollback snapshot remains available: version=%q backup=%#v", manager.state.RollbackVersion, manager.state.LastBackup)
	}
}

func TestFailedRollbackKeepsRollbackSnapshotForManualRecovery(t *testing.T) {
	installDir := t.TempDir()
	stateDir := filepath.Join(installDir, "state")
	if err := os.MkdirAll(stateDir, 0o700); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(installDir, ".env"), []byte("CANVAS_IMAGE_TAG=1.2.5-yingxue.1\nPOSTGRES_USER=canvas\nPOSTGRES_DB=canvas\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	backup := Backup{ID: "backup-manual", Path: filepath.Join(installDir, "missing.zip"), Checksum: "sha256:missing", Version: "v1.2.4-yingxue.1"}
	manager := &Manager{
		config: Config{
			InstallDir:  installDir,
			ComposeFile: "docker-compose.deploy.yml",
			EnvFile:     ".env",
			StateDir:    stateDir,
			StepTimeout: time.Second,
		},
		runner: &recordingRunner{runErr: errors.New("docker unavailable")},
		state: persistedState{
			LastBackup:      &backup,
			RollbackVersion: backup.Version,
			Operation:       Operation{Phase: PhaseRollingBack},
		},
	}

	manager.runRollback(backup.Version, backup, false)

	if manager.state.Operation.Phase != PhaseManualIntervention {
		t.Fatalf("operation phase = %s, want %s", manager.state.Operation.Phase, PhaseManualIntervention)
	}
	if manager.state.RollbackVersion != backup.Version || manager.state.LastBackup == nil || manager.state.LastBackup.ID != backup.ID {
		t.Fatalf("manual recovery snapshot was lost: version=%q backup=%#v", manager.state.RollbackVersion, manager.state.LastBackup)
	}
}

func writeRollbackTestBackup(t *testing.T, directory, version string) Backup {
	t.Helper()
	path := filepath.Join(directory, "rollback-test.zip")
	file, err := os.Create(path)
	if err != nil {
		t.Fatal(err)
	}
	archive := zip.NewWriter(file)
	for name, content := range map[string]string{"metadata.json": "{}", "database.dump": "db", "backend-data.tar": "data"} {
		entry, createErr := archive.Create(name)
		if createErr != nil {
			t.Fatal(createErr)
		}
		if _, writeErr := io.WriteString(entry, content); writeErr != nil {
			t.Fatal(writeErr)
		}
	}
	if err := archive.Close(); err != nil {
		t.Fatal(err)
	}
	if err := file.Close(); err != nil {
		t.Fatal(err)
	}
	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	hash := sha256.Sum256(data)
	return Backup{ID: "backup-rollback", Path: path, Checksum: "sha256:" + hex.EncodeToString(hash[:]), Version: version}
}

func TestCreateBackupReadsBackendDataAsRoot(t *testing.T) {
	installDir := t.TempDir()
	backupDir := filepath.Join(installDir, "backups")
	if err := os.MkdirAll(backupDir, 0o700); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(installDir, ".env"), []byte("POSTGRES_USER=canvas\nPOSTGRES_DB=canvas\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	runner := &recordingRunner{}
	manager := &Manager{
		config: Config{InstallDir: installDir, ComposeFile: "docker-compose.deploy.yml", EnvFile: ".env", BackupDir: backupDir},
		runner: runner,
	}
	if _, err := manager.createBackup("v1.2.2-preview.2"); err != nil {
		t.Fatal(err)
	}
	for _, call := range runner.calls {
		joined := strings.Join(call, " ")
		if strings.Contains(joined, "exec -T --user root backend tar -C /data -cf - .") {
			return
		}
	}
	t.Fatalf("backend data backup did not use root: %#v", runner.calls)
}

func TestRestoreBackendDataClearsAndExtractsTheVerifiedArchive(t *testing.T) {
	directory := t.TempDir()
	backupPath := filepath.Join(directory, "backup.zip")
	file, err := os.Create(backupPath)
	if err != nil {
		t.Fatal(err)
	}
	archive := zip.NewWriter(file)
	for name, content := range map[string]string{"metadata.json": "{}", "database.dump": "db", "backend-data.tar": "tar-data"} {
		entry, createErr := archive.Create(name)
		if createErr != nil {
			t.Fatal(createErr)
		}
		if _, writeErr := io.WriteString(entry, content); writeErr != nil {
			t.Fatal(writeErr)
		}
	}
	if err := archive.Close(); err != nil {
		t.Fatal(err)
	}
	if err := file.Close(); err != nil {
		t.Fatal(err)
	}
	data, err := os.ReadFile(backupPath)
	if err != nil {
		t.Fatal(err)
	}
	hash := sha256.Sum256(data)
	runner := &recordingRunner{}
	manager := &Manager{config: Config{InstallDir: directory, EnvFile: ".env", ComposeFile: "docker-compose.deploy.yml", StepTimeout: time.Minute}, runner: runner}
	backup := Backup{Path: backupPath, Checksum: "sha256:" + hex.EncodeToString(hash[:]), Version: "v1.2.4-yingxue.1"}
	if err := manager.restoreBackendData(backup); err != nil {
		t.Fatal(err)
	}
	if len(runner.inputCalls) != 1 {
		t.Fatalf("restore input calls = %d", len(runner.inputCalls))
	}
	joined := strings.Join(runner.inputCalls[0], " ")
	if !strings.Contains(joined, "run --rm --no-deps -T --user root --entrypoint sh backend") || !strings.Contains(joined, "find /data -mindepth 1 -maxdepth 1") || !strings.Contains(joined, "tar -C /data -xf -") {
		t.Fatalf("unexpected restore command: %s", joined)
	}
}

func TestCheckWritableDirectory(t *testing.T) {
	directory := t.TempDir()
	if err := checkWritableDirectory(directory); err != nil {
		t.Fatalf("writable directory rejected: %v", err)
	}
	entries, err := os.ReadDir(directory)
	if err != nil {
		t.Fatal(err)
	}
	if len(entries) != 0 {
		t.Fatalf("write probe was not cleaned up: %v", entries)
	}
	if err := checkWritableDirectory(filepath.Join(directory, "missing")); err == nil {
		t.Fatal("missing directory was accepted")
	}
}
