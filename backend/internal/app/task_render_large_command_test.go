package app

import (
	"bytes"
	"context"
	"encoding/json"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"infinite-canvas/backend/internal/model"
)

func TestTimelineRenderLargeNativeCase(t *testing.T) {
	ffmpeg, err := exec.LookPath("ffmpeg")
	if err != nil {
		t.Skip("ffmpeg missing; large native render unverified")
	}
	t.Setenv(renderFfmpegEnv, ffmpeg)
	workRoot := filepath.Join(t.TempDir(), strings.Repeat("native-case-", 8))
	if err := os.Mkdir(workRoot, 0700); err != nil {
		t.Fatal(err)
	}
	t.Setenv("TMP", workRoot)
	t.Setenv("TEMP", workRoot)
	t.Setenv("TMPDIR", workRoot)
	ctx, cancel := context.WithTimeout(context.Background(), 120*time.Second)
	defer cancel()
	svc, db := newTimelineTaskTestService(t)
	svc.dataDir = t.TempDir()
	path := filepath.Join(svc.dataDir, "source.mp4")
	if out, err := exec.CommandContext(ctx, ffmpeg, "-nostdin", "-y", "-f", "lavfi", "-i", "color=c=red:s=64x64:r=30:d=0.1", "-f", "lavfi", "-i", "sine=frequency=440:duration=0.1", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", path).CombinedOutput(); err != nil {
		t.Fatalf("source: %v: %s", err, out)
	}
	source, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	resource, _, err := svc.storeResource("usr-render-test", "media", "source.mp4", "video/mp4", int64(len(source)), 64, 64, 100, bytes.NewReader(source), nil, true)
	if err != nil {
		t.Fatal(err)
	}
	project := renderTestProject("resource:" + resource.ID)
	base := project.Clips[0]
	project.Clips = nil
	project.DurationMs = 92 * 34
	for i := 0; i < 92; i++ {
		clip := base
		clip.ID = "clip-" + strings.Repeat("x", i+1)
		clip.StartMs = int64(i * 34)
		clip.DurationMs = 34
		clip.SourceStartMs = 0
		project.Clips = append(project.Clips, clip)
	}
	task := seedRunningRenderTask(t, db, renderInputJSON(t, project))
	if err := newTaskWorkerCoordinator(svc).processTimelineRender(task, ctx); err != nil {
		t.Fatal(err)
	}
	var stored model.Task
	if err := db.First(&stored, "id = ?", task.ID).Error; err != nil {
		t.Fatal(err)
	}
	if stored.Status != model.TaskStatusSucceeded {
		t.Fatalf("92 native clips did not render: status=%s error=%s", stored.Status, stored.Error)
	}
	var result timelineRenderResult
	if err := json.Unmarshal([]byte(stored.ResultJSON), &result); err != nil {
		t.Fatal(err)
	}
	if result.DurationMs != project.DurationMs || result.ResourceID == "" || result.Size <= 0 {
		t.Fatalf("incomplete large-case output: %+v", result)
	}
	_, reader, err := svc.OpenResource("usr-render-test", result.ResourceID)
	if err != nil {
		t.Fatal(err)
	}
	reader.Close()
}
