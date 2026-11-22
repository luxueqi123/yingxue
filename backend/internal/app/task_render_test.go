package app

import (
	"bytes"
	"context"
	"encoding/binary"
	"encoding/json"
	"fmt"
	"io"
	"math"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"gorm.io/gorm"

	"infinite-canvas/backend/internal/model"
)

func TestTimelineRenderActualVideoAndSubtitleSidecar(t *testing.T) {
	ffmpeg, err := exec.LookPath("ffmpeg")
	if err != nil {
		t.Skip("ffmpeg missing; real render unverified")
	}
	ffprobe, err := exec.LookPath("ffprobe")
	if err != nil {
		t.Skip("ffprobe missing; real render unverified")
	}
	for _, tc := range []struct {
		name       string
		width      int
		height     int
		wantWidth  int
		wantHeight int
	}{
		{"legacy-default", 0, 0, 1920, 1080},
		{"portrait", 1080, 1920, 1080, 1920},
	} {
		t.Run(tc.name, func(t *testing.T) {
			t.Setenv(renderFfmpegEnv, ffmpeg)
			ctx, cancel := context.WithTimeout(context.Background(), 90*time.Second)
			defer cancel()
			svc, db := newTimelineTaskTestService(t)
			svc.dataDir = t.TempDir()
			sourcePath := filepath.Join(svc.dataDir, "source.mp4")
			if out, err := exec.CommandContext(ctx, ffmpeg, "-nostdin", "-y", "-f", "lavfi", "-i", "color=c=red:s=64x64:r=30:d=1", "-f", "lavfi", "-i", "sine=frequency=440:duration=1", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", sourcePath).CombinedOutput(); err != nil {
				t.Fatalf("synthetic source: %v: %s", err, out)
			}
			source, err := os.ReadFile(sourcePath)
			if err != nil {
				t.Fatal(err)
			}
			resource, _, err := svc.storeResource("usr-render-test", "media", "source.mp4", "video/mp4", int64(len(source)), 64, 64, 1000, bytes.NewReader(source), nil, true)
			if err != nil {
				t.Fatal(err)
			}
			project := renderTestProject("resource:" + resource.ID)
			project.Width, project.Height = tc.width, tc.height
			project.DurationMs = 600
			project.Clips[0].DurationMs = 600
			project.Clips[0].SourceStartMs = 200
			hidden := false
			project.Tracks = append(project.Tracks, renderTrack{ID: "sub", Kind: "subtitle"}, renderTrack{ID: "hidden", Kind: "subtitle", Visible: &hidden})
			project.Clips = append(project.Clips,
				renderClip{ID: "caption", Kind: "subtitle", TrackID: "sub", StartMs: 100, DurationMs: 300, Text: "中文 CROSS CUT & <字幕>"},
				renderClip{ID: "hidden-caption", Kind: "subtitle", TrackID: "hidden", DurationMs: 600, Text: "不得导出"})
			task := seedRunningRenderTask(t, db, renderInputJSON(t, project))
			if err := newTaskWorkerCoordinator(svc).processTimelineRender(task, ctx); err != nil {
				t.Fatal(err)
			}
			var stored model.Task
			if err := db.First(&stored, "id = ?", task.ID).Error; err != nil {
				t.Fatal(err)
			}
			if stored.Status != model.TaskStatusSucceeded {
				t.Fatalf("render status=%s error=%s", stored.Status, stored.Error)
			}
			var result timelineRenderResult
			if err := json.Unmarshal([]byte(stored.ResultJSON), &result); err != nil {
				t.Fatal(err)
			}
			wantSRT := "1\n00:00:00,100 --> 00:00:00,400\n中文 CROSS CUT & <字幕>\n\n"
			if result.SubtitleSRT != wantSRT || result.DurationMs != 600 {
				t.Fatalf("render result = %+v", result)
			}
			rendered, reader, err := svc.OpenResource("usr-render-test", result.ResourceID)
			if err != nil {
				t.Fatal(err)
			}
			if rendered.Width != tc.wantWidth || rendered.Height != tc.wantHeight {
				reader.Close()
				t.Fatalf("stored dimensions = %dx%d, want %dx%d", rendered.Width, rendered.Height, tc.wantWidth, tc.wantHeight)
			}
			output, readErr := io.ReadAll(reader)
			closeErr := reader.Close()
			if readErr != nil || closeErr != nil || int64(len(output)) != result.Size || len(output) == 0 {
				t.Fatalf("read stored video: read=%v close=%v bytes=%d expected=%d", readErr, closeErr, len(output), result.Size)
			}
			outputPath := filepath.Join(svc.dataDir, "verified.mp4")
			if err := os.WriteFile(outputPath, output, 0600); err != nil {
				t.Fatal(err)
			}
			probe, err := exec.CommandContext(ctx, ffprobe, "-v", "error", "-count_frames", "-show_entries", "stream=codec_name,codec_type,width,height,nb_read_frames", "-of", "json", outputPath).Output()
			if err != nil {
				t.Fatal(err)
			}
			var metadata struct {
				Streams []struct {
					CodecName string `json:"codec_name"`
					CodecType string `json:"codec_type"`
					Width     int    `json:"width"`
					Height    int    `json:"height"`
					Frames    string `json:"nb_read_frames"`
				} `json:"streams"`
			}
			if err := json.Unmarshal(probe, &metadata); err != nil {
				t.Fatal(err)
			}
			videoOK, audioOK := false, false
			for _, stream := range metadata.Streams {
				if stream.CodecType == "video" {
					videoOK = stream.CodecName == "h264" && stream.Width == tc.wantWidth && stream.Height == tc.wantHeight && stream.Frames == "18"
				}
				audioOK = audioOK || stream.CodecName == "aac"
			}
			if !videoOK || !audioOK {
				t.Fatalf("unexpected stored output: %s", probe)
			}
			// Decode actual content: a valid container alone would also accept black/silent fallbacks.
			pixels, err := exec.CommandContext(ctx, ffmpeg, "-v", "error", "-i", outputPath, "-vf", fmt.Sprintf("crop=2:2:%d:%d,scale=1:1", tc.wantWidth/2, tc.wantHeight/2), "-pix_fmt", "rgb24", "-f", "rawvideo", "pipe:1").Output()
			if err != nil || len(pixels) != 18*3 {
				t.Fatalf("decode video: %v, %d bytes", err, len(pixels))
			}
			for i := 0; i < len(pixels); i += 3 {
				if pixels[i] < 200 || pixels[i+1] > 40 || pixels[i+2] > 40 {
					t.Fatalf("frame %d lost red source: %v", i/3, pixels[i:i+3])
				}
			}
			pcm, err := exec.CommandContext(ctx, ffmpeg, "-v", "error", "-i", outputPath, "-vn", "-ac", "1", "-f", "f32le", "pipe:1").Output()
			if err != nil || len(pcm) < 4 {
				t.Fatalf("decode audio: %v, %d bytes", err, len(pcm))
			}
			peak := 0.0
			for i := 0; i+4 <= len(pcm); i += 4 {
				peak = math.Max(peak, math.Abs(float64(math.Float32frombits(binary.LittleEndian.Uint32(pcm[i:i+4])))))
			}
			if math.IsNaN(peak) || math.IsInf(peak, 0) || peak < 0.01 {
				t.Fatalf("source tone lost: peak=%f", peak)
			}
			if _, foreignReader, err := svc.OpenResource("another-user", result.ResourceID); err == nil || foreignReader != nil {
				if foreignReader != nil {
					foreignReader.Close()
				}
				t.Fatal("rendered video exposed to another user")
			}
			t.Logf("actual worker: stored H.264/AAC %dx%d, 18 red frames, audio peak %.4f, %d bytes; exact SRT, hidden track excluded, foreign read denied", tc.wantWidth, tc.wantHeight, peak, len(output))
		})
	}
}

// renderTestProject 构造一个可渲染的 v2 快照：一条可见视频轨 + 一个
// 经 directMedia.storageKey（resource:<id>）引用后端资源的片段。
func renderTestProject(storageKey string) renderProject {
	visible := true
	volume := 1.0
	return renderProject{
		Version:    2,
		DurationMs: 2000,
		Tracks:     []renderTrack{{ID: "track-v1", Kind: "video", Visible: &visible}},
		Clips: []renderClip{{
			ID:            "clip-v1",
			Kind:          "video",
			TrackID:       "track-v1",
			StartMs:       0,
			DurationMs:    2000,
			SourceStartMs: 0,
			Volume:        &volume,
			DirectMedia: &struct {
				ID         string `json:"id"`
				Kind       string `json:"kind"`
				StorageKey string `json:"storageKey"`
			}{ID: "asset-v1", Kind: "video", StorageKey: storageKey},
		}},
	}
}

func renderInputJSON(t *testing.T, project renderProject) string {
	t.Helper()
	raw, err := json.Marshal(timelineRenderInput{ProjectID: "prj-render", Timeline: project})
	if err != nil {
		t.Fatalf("marshal render input: %v", err)
	}
	return string(raw)
}

func seedRunningRenderTask(t *testing.T, db *gorm.DB, inputJSON string) *model.Task {
	t.Helper()
	task := &model.Task{
		ID:        fmt.Sprintf("tsk-render-%d", time.Now().UnixNano()),
		UserID:    "usr-render-test",
		Type:      model.TaskTypeTimelineRender,
		Status:    model.TaskStatusRunning,
		Stage:     "已领取",
		InputJSON: inputJSON,
	}
	if err := db.Create(task).Error; err != nil {
		t.Fatalf("seed task: %v", err)
	}
	return task
}

func TestCreateTimelineRenderTaskQueues(t *testing.T) {
	svc, db := newTimelineTaskTestService(t)
	timeline := renderTestProject("resource:res-1")
	timeline.Width, timeline.Height = 1080, 1920

	task, err := svc.CreateTimelineRenderTask("usr-render-test", TimelineRenderCreateRequest{
		ProjectID: "prj-render",
		Timeline:  timeline,
	})
	if err != nil {
		t.Fatalf("create: %v", err)
	}
	if task.Type != model.TaskTypeTimelineRender || task.Status != model.TaskStatusQueued {
		t.Fatalf("task = %s/%s, want %s/queued", task.Type, task.Status, model.TaskTypeTimelineRender)
	}
	if task.Provider != "local" || task.Model != "ffmpeg" {
		t.Fatalf("provider/model = %s/%s, want local/ffmpeg", task.Provider, task.Model)
	}

	var stored model.Task
	if err := db.First(&stored, "id = ?", task.ID).Error; err != nil {
		t.Fatalf("load task: %v", err)
	}
	if stored.ProjectID != "prj-render" || stored.UserID != "usr-render-test" {
		t.Fatalf("stored owner/project mismatch: %s/%s", stored.UserID, stored.ProjectID)
	}
	var input timelineRenderInput
	if err := json.Unmarshal([]byte(stored.InputJSON), &input); err != nil {
		t.Fatal(err)
	}
	if input.Timeline.Width != 1080 || input.Timeline.Height != 1920 {
		t.Fatalf("queued dimensions lost: %+v", input.Timeline)
	}
}

func TestCreateTimelineRenderTaskRejectsInvalidDimensions(t *testing.T) {
	svc, db := newTimelineTaskTestService(t)
	for _, tc := range []struct{ width, height int }{{1080, 0}, {0, 1920}, {-2, 1920}, {1081, 1920}, {1080, 1919}} {
		timeline := renderTestProject("resource:res-1")
		timeline.Width, timeline.Height = tc.width, tc.height
		if _, err := svc.CreateTimelineRenderTask("usr-render-test", TimelineRenderCreateRequest{Timeline: timeline}); err == nil {
			t.Fatalf("accepted invalid dimensions %dx%d", tc.width, tc.height)
		}
	}
	var count int64
	if err := db.Model(&model.Task{}).Count(&count).Error; err != nil || count != 0 {
		t.Fatalf("invalid dimensions queued tasks: count=%d error=%v", count, err)
	}
}

func TestCreateTimelineRenderTaskRejectsNoMedia(t *testing.T) {
	svc, _ := newTimelineTaskTestService(t)

	visible := true
	textOnly := renderProject{
		Version:    2,
		DurationMs: 1000,
		Tracks:     []renderTrack{{ID: "track-t1", Kind: "text", Visible: &visible}},
		Clips: []renderClip{{
			ID: "clip-t1", Kind: "text", TrackID: "track-t1", StartMs: 0,
			DurationMs: 1000, Text: "字幕",
		}},
	}
	_, err := svc.CreateTimelineRenderTask("usr-render-test", TimelineRenderCreateRequest{Timeline: textOnly})
	if err == nil || !strings.Contains(err.Error(), "可渲染") {
		t.Fatalf("err = %v, want mention of 没有可渲染的媒体片段", err)
	}
}

func TestTimelineRenderFailsFastWhenSourceUnreadable(t *testing.T) {
	svc, db := newTimelineTaskTestService(t)
	// 指向不存在的资源；ffmpeg 路径设为无效值不影响断言——本测试在
	// 素材落盘（materialize）阶段即失败，且该失败早于任何外部命令执行。
	task := seedRunningRenderTask(t, db, renderInputJSON(t, renderTestProject("resource:res-missing")))

	t.Setenv(renderFfmpegEnv, "/no/such/ffmpeg")
	w := newTaskWorkerCoordinator(svc)
	if err := w.processTimelineRender(task, context.Background()); err != nil {
		t.Fatalf("process: want nil (task terminal handled internally), got %v", err)
	}

	var stored model.Task
	if err := db.First(&stored, "id = ?", task.ID).Error; err != nil {
		t.Fatalf("load task: %v", err)
	}
	if stored.Status != model.TaskStatusFailed {
		t.Fatalf("status = %q, want failed", stored.Status)
	}
	if stored.Stage != "准备合成素材失败" {
		t.Fatalf("stage = %q, want source preparation failure", stored.Stage)
	}
	if !strings.Contains(stored.Error, "时间线引用的媒体") {
		t.Fatalf("error = %q, want mention of 无法读取时间线引用的媒体", stored.Error)
	}
}

// 真实 ffmpeg 端到端：近似画幅的来源裁切铺满，成片写入 AIGC 隐式标识，结果记录尺寸、适配方式与来源标识。
func TestTimelineRenderCropsNearAspectAndWritesProvenance(t *testing.T) {
	requireFFmpegTools(t)
	svc, db := newTimelineTaskTestService(t)
	svc.dataDir = t.TempDir()
	sourceTag := `{"Label":"1","ContentProducer":"upstream-co","ProduceID":"p-1"}`
	source := seedLocalVideoResource(t, svc, "usr-render-test", 768, 1344, map[string]string{"AIGC": sourceTag, "comment": "upstream comment"})
	project := renderTestProject("resource:" + source.ID)
	project.Width, project.Height, project.DurationMs = 1080, 1920, 1000
	project.Clips[0].DurationMs = 1000
	task := seedRunningRenderTask(t, db, renderInputJSON(t, project))

	if err := newTaskWorkerCoordinator(svc).processTimelineRender(task, context.Background()); err != nil {
		t.Fatalf("process: %v", err)
	}
	var stored model.Task
	if err := db.First(&stored, "id = ?", task.ID).Error; err != nil {
		t.Fatal(err)
	}
	if stored.Status != model.TaskStatusSucceeded {
		t.Fatalf("status = %s, error = %s", stored.Status, stored.Error)
	}
	var result timelineRenderOutput
	if err := json.Unmarshal([]byte(stored.ResultJSON), &result); err != nil {
		t.Fatal(err)
	}
	if result.Width != 1080 || result.Height != 1920 || result.Fit != renderFitAuto || len(result.Sources) != 1 {
		t.Fatalf("result = %+v", result)
	}
	if record := result.Sources[0]; record.ResourceID != source.ID || record.Fit != renderFitCrop || record.Width != 768 || record.Height != 1344 || record.AIGC != sourceTag {
		t.Fatalf("source record = %+v", record)
	}
	var label aigcImplicitLabel
	if err := json.Unmarshal([]byte(result.AIGC), &label); err != nil {
		t.Fatalf("result aigc: %v", err)
	}
	if label.Label != "1" || label.ContentProducer != "upstream-co" || label.ProduceID != "p-1" || label.PropagateID != task.ID || label.ContentPropagator != AIGCPlatformPropagator {
		t.Fatalf("label = %+v", label)
	}

	output, err := svc.repo.ResourceForUser("usr-render-test", result.ResourceID)
	if err != nil {
		t.Fatal(err)
	}
	info, err := probeMediaFile(context.Background(), filepath.Join(svc.dataDir, "resources", filepath.FromSlash(output.ObjectKey)))
	if err != nil {
		t.Fatal(err)
	}
	if info.Width != 1080 || info.Height != 1920 {
		t.Fatalf("output size = %dx%d", info.Width, info.Height)
	}
	if got := mediaProbeTag(info.Tags, "AIGC"); got != result.AIGC {
		t.Fatalf("output AIGC tag = %q, want %q", got, result.AIGC)
	}
	if got := mediaProbeTag(info.Tags, "comment"); got != renderAIGCComment {
		t.Fatalf("output comment = %q: source metadata leaked or label missing", got)
	}
}
