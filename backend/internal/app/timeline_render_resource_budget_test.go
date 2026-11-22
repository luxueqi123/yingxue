package app

import (
	"strconv"
	"testing"
)

func TestRenderFFmpegThreadLimitsRespectInputScopes(t *testing.T) {
	plan := renderPlan{Segments: []renderSegment{
		{Kind: "video", DurationMs: 100, Source: &renderSource{Path: "with-audio.mp4", HasAudio: true}},
		{Kind: "video", DurationMs: 100, Source: &renderSource{Path: "silent.mp4"}},
		{Kind: "image", DurationMs: 100, Source: &renderSource{Path: "still.png"}},
		{Kind: "gap", DurationMs: 100},
	}, AudioSegments: []renderSegment{
		{Kind: "audio", DurationMs: 100, Source: &renderSource{Path: "voice.wav", HasAudio: true}},
	}}
	args := buildRenderFFmpegArgs(plan, "output.mp4")
	inputs, scopedThreads, filterThreads := 0, 0, 0
	for i := 0; i+1 < len(args); i++ {
		switch args[i] {
		case "-threads":
			n, err := strconv.Atoi(args[i+1])
			if err != nil || n < 1 || n > 2 {
				t.Fatalf("FFmpeg codec thread limit must be explicit and bounded: %q", args[i+1])
			}
			scopedThreads = n
			i++
		case "-filter_complex_threads":
			n, err := strconv.Atoi(args[i+1])
			if err != nil || n < 1 || n > 2 {
				t.Fatalf("FFmpeg filter graph thread limit must be bounded: %q", args[i+1])
			}
			filterThreads = n
			i++
		case "-i":
			if scopedThreads == 0 {
				t.Fatalf("input %d inherits unbounded FFmpeg codec threads", inputs)
			}
			inputs++
			scopedThreads = 0
			i++
		}
	}
	if inputs != 9 || scopedThreads == 0 || filterThreads == 0 {
		t.Fatalf("missing input, output or filter graph budget: inputs=%d output=%d filters=%d", inputs, scopedThreads, filterThreads)
	}
}
