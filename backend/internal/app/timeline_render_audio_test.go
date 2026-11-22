package app

import (
	"context"
	"encoding/binary"
	"math"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"infinite-canvas/backend/internal/model"
)

func TestTimelineIndependentAudioRendersCropDelayGainMuteAndFades(t *testing.T) {
	ffmpeg, err := exec.LookPath("ffmpeg")
	if err != nil {
		t.Skip("ffmpeg missing; audio render unverified")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 120*time.Second)
	defer cancel()
	dir := t.TempDir()
	source := filepath.Join(dir, "voice.wav")
	if output, err := exec.CommandContext(ctx, ffmpeg, "-nostdin", "-y", "-f", "lavfi", "-i", "sine=frequency=440:sample_rate=44100:duration=1", "-af", "adelay=300:all=1", source).CombinedOutput(); err != nil {
		t.Fatalf("source: %v: %s", err, output)
	}
	var baseline float64
	for _, tc := range []struct {
		name                 string
		volume               float64
		muted, fade, overlap bool
	}{
		{name: "normal", volume: 1}, {name: "amplified", volume: 3.4}, {name: "quarter", volume: 0.25}, {name: "zero", volume: 0},
		{name: "muted", volume: 1, muted: true}, {name: "fades", volume: 1, fade: true}, {name: "overlap", volume: 1, overlap: true},
	} {
		t.Run(tc.name, func(t *testing.T) {
			clip := renderClipFixture("voice", "audio", "audio", 200, 600, "resource:voice")
			clip.SourceStartMs = 300
			clip.SourceDurationMs = 1300
			clip.Volume = &tc.volume
			if tc.fade {
				clip.FadeInMs = 200
				clip.FadeOutMs = 200
			}
			project := renderProject{Version: 2, Tracks: []renderTrack{{ID: "audio", Kind: "audio", Muted: tc.muted}}, Clips: []renderClip{clip}}
			if tc.overlap {
				other := clip
				other.ID = "second"
				project.Clips = append(project.Clips, other)
			}
			if err := validateRenderAudio(project); err != nil {
				t.Fatal(err)
			}
			plan := buildRenderPlan(project)
			for i := range plan.AudioSegments {
				plan.AudioSegments[i].Source = &renderSource{Path: source, HasAudio: true}
			}
			target := filepath.Join(dir, tc.name+".mp4")
			if output, err := exec.CommandContext(ctx, ffmpeg, buildRenderFFmpegArgs(plan, target)...).CombinedOutput(); err != nil {
				t.Fatalf("render: %v: %s", err, output)
			}
			pcm, err := exec.CommandContext(ctx, ffmpeg, "-v", "error", "-i", target, "-map", "0:a:0", "-ac", "1", "-ar", "44100", "-f", "f32le", "-").Output()
			if err != nil || len(pcm) < 44100*4*75/100 {
				t.Fatalf("decode: %v, bytes=%d", err, len(pcm))
			}
			rms := func(start, end float64) float64 {
				sum := 0.0
				n := 0
				for i := int(start * 44100); i < int(end*44100) && 4*i+4 <= len(pcm); i++ {
					v := float64(math.Float32frombits(binary.LittleEndian.Uint32(pcm[4*i : 4*i+4])))
					sum += v * v
					n++
				}
				return math.Sqrt(sum / float64(n))
			}
			before, active := rms(0.03, 0.15), rms(0.42, 0.58)
			if before > 0.0001 {
				t.Fatalf("audio starts before clip: %f", before)
			}
			if tc.muted || tc.volume == 0 {
				if active > 0.0001 {
					t.Fatalf("not silent: %f", active)
				}
			} else if active < 0.01 {
				t.Fatalf("trimmed audio missing: %f", active)
			}
			if tc.name == "normal" {
				baseline = active
			}
			if tc.name == "quarter" && (active/baseline < 0.20 || active/baseline > 0.30) {
				t.Fatalf("wrong gain ratio: %f", active/baseline)
			}
			if tc.name == "amplified" && (active/baseline < 3.3 || active/baseline > 3.5) {
				t.Fatalf("amplified gain was clamped or changed: %f", active/baseline)
			}
			if tc.overlap && (active/baseline < 1.8 || active/baseline > 2.2) {
				t.Fatalf("overlap was normalized or lost: %f", active/baseline)
			}
			if tc.fade && (rms(0.21, 0.25) > active*0.4 || rms(0.75, 0.79) > active*0.4) {
				t.Fatal("fade envelope missing")
			}
			t.Logf("samples=%d pre-roll=%f active=%f", len(pcm)/4, before, active)
		})
	}
}

func TestRenderAudioValidationAndHiddenTrack(t *testing.T) {
	base := renderClipFixture("voice", "audio", "a", 0, 500, "resource:voice")
	for _, mutate := range []func(*renderClip){
		func(c *renderClip) { c.StartMs = -1 }, func(c *renderClip) { c.SourceStartMs = -1 },
		func(c *renderClip) { c.DurationMs = 0 }, func(c *renderClip) { c.FadeInMs = -1 },
		func(c *renderClip) { c.SourceDurationMs = 499 }, func(c *renderClip) { c.DirectMedia = nil },
		func(c *renderClip) { c.TrackID = "missing" }, func(c *renderClip) { v := math.Inf(1); c.Volume = &v },
	} {
		clip := base
		mutate(&clip)
		if validateRenderAudio(renderProject{Tracks: []renderTrack{{ID: "a", Kind: "audio"}}, Clips: []renderClip{clip}}) == nil {
			t.Fatalf("invalid audio accepted: %+v", clip)
		}
	}
	visible := false
	plan := buildRenderPlan(renderProject{Tracks: []renderTrack{{ID: "a", Kind: "audio", Visible: &visible}}, Clips: []renderClip{base}})
	if plan.HasMedia || len(plan.AudioSegments) > 0 {
		t.Fatal("hidden audio entered render")
	}
}

func TestIndependentAudioMaterializationRejectsMissingResource(t *testing.T) {
	s, _ := newTimelineTaskTestService(t)
	plan := buildRenderPlan(renderProject{Tracks: []renderTrack{{ID: "a", Kind: "audio"}}, Clips: []renderClip{renderClipFixture("audio", "audio", "a", 0, 500, "resource:missing")}})
	_, cleanup, err := materializeRenderSources(context.Background(), s, "usr-render-test", &plan)
	if cleanup != nil {
		defer cleanup()
	}
	if err == nil || !strings.Contains(err.Error(), "时间线引用的媒体") {
		t.Fatalf("missing audio silently ignored: %v", err)
	}
}

func TestIndependentAudioMaterializationEnforcesOwner(t *testing.T) {
	s, db := newTimelineTaskTestService(t)
	if err := db.Create(&model.Resource{ID: "private-voice", UserID: "other", Kind: "audio", Status: "ready", MimeType: "audio/wav"}).Error; err != nil {
		t.Fatal(err)
	}
	plan := buildRenderPlan(renderProject{Tracks: []renderTrack{{ID: "a", Kind: "audio"}}, Clips: []renderClip{renderClipFixture("audio", "audio", "a", 0, 500, "resource:private-voice")}})
	_, cleanup, err := materializeRenderSources(context.Background(), s, "usr-render-test", &plan)
	if cleanup != nil {
		defer cleanup()
	}
	if err == nil || plan.AudioSegments[0].Source != nil {
		t.Fatal("cross-account audio was materialized")
	}
}

func TestCreateTimelineRenderTaskValidatesIndependentAudio(t *testing.T) {
	s, db := newTimelineTaskTestService(t)
	project := renderProject{Version: 2, Tracks: []renderTrack{{ID: "a", Kind: "audio"}}, Clips: []renderClip{renderClipFixture("voice", "audio", "a", 0, 500, "")}}
	if _, err := s.CreateTimelineRenderTask("usr-render-test", TimelineRenderCreateRequest{Timeline: project}); err == nil {
		t.Fatal("missing audio reference accepted")
	}
	var count int64
	if err := db.Model(&model.Task{}).Count(&count).Error; err != nil || count != 0 {
		t.Fatalf("invalid request queued: %d %v", count, err)
	}
	project.Clips[0] = renderClipFixture("voice", "audio", "a", 0, 500, "resource:voice")
	task, err := s.CreateTimelineRenderTask("usr-render-test", TimelineRenderCreateRequest{Timeline: project})
	if err != nil || task.Status != model.TaskStatusQueued {
		t.Fatalf("audio-only task not queued: %v", err)
	}
}
