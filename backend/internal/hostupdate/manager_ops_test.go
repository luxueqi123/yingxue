package hostupdate

import (
	"archive/zip"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"io"
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
	return nil
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
