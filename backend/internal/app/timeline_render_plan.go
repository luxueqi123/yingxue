package app

import (
	"encoding/json"

	// 时间线渲染：把前端 TimelineProject 快照（tracks/clips 平铺，见
	// web/src/types/timeline.ts TimelineProject v2）展开为可执行的 ffmpeg 步骤。
	// 与前端 timeline-to-ffmpeg.ts 保持同一数据流：trim（按 sourceStartMs 裁切）
	// → 空隙补黑场静音 → concat。字幕不烧录（依赖 libass），单独产出 SRT。
	//
	// 输入布局统一为「每个片段两个输入：视频源 + 音频源」，空隙展开为独立
	// 黑场片段，因此第 i 个片段的视频输入为 2i、音频输入为 2i+1。
	"strconv"
)
import (
	"fmt"
	"math"
	"sort"
	"strings"
)

type renderClip struct {
	ID               string   `json:"id"`
	Kind             string   `json:"kind"`
	TrackID          string   `json:"trackId"`
	StartMs          int64    `json:"startMs"`
	DurationMs       int64    `json:"durationMs"`
	SourceStartMs    int64    `json:"sourceStartMs"`
	SourceDurationMs int64    `json:"sourceDurationMs"`
	Volume           *float64 `json:"volume,omitempty"`
	FadeInMs         int64    `json:"fadeInMs,omitempty"`
	FadeOutMs        int64    `json:"fadeOutMs,omitempty"`
	Text             string   `json:"text"`
	DirectMedia      *struct {
		ID         string `json:"id"`
		Kind       string `json:"kind"`
		StorageKey string `json:"storageKey"`
	} `json:"directMedia"`
	FadeInColor string `json:"fadeInColor,omitempty"`

	FadeOutColor string `json:"fadeOutColor,omitempty"`
}

type renderTrack struct {
	ID      string `json:"id"`
	Kind    string `json:"kind"`
	Visible *bool  `json:"visible"`
	Muted   bool   `json:"muted"`
}

type renderProject struct {
	Version    int           `json:"version"`
	Width      int           `json:"width,omitempty"`
	Height     int           `json:"height,omitempty"`
	Tracks     []renderTrack `json:"tracks"`
	Clips      []renderClip  `json:"clips"`
	DurationMs int64         `json:"durationMs"`

	// HasAudio 由 ffprobe 探测得到；无音轨的媒体改为静音源，避免 map 失败。

	// renderSegment 是渲染序列中的一段；Kind 为 video/image 表示媒体片段，
	// gap 表示补黑场静音的空隙段（无 Source）。
	Fit string `json:"fit,omitempty"`
}

type renderSource struct {
	ResourceID string
	Clip       renderClip
	Path       string
	Ext        string

	HasAudio bool

	Width  int
	Height int

	// H.264 yuv420p requires positive, even dimensions for both axes.
	AIGC string
}

type renderSegment struct {
	Kind       string
	DurationMs int64
	GapMs      int64
	Clip       renderClip
	Source     *renderSource
}

type renderPlan struct {
	Width         int
	Height        int
	Segments      []renderSegment
	AudioSegments []renderSegment
	SubtitleSRT   string
	HasMedia      bool

	AudioOverlays []renderSegment

	Fit string

	PropagateID string
}

func validateRenderDimensions(project renderProject) error {
	if project.Width == 0 && project.Height == 0 {
		return nil
	}

	if project.Width <= 0 || project.Height <= 0 || project.Width%2 != 0 || project.Height%2 != 0 {
		return fmt.Errorf("渲染宽高必须同时指定为正偶数")
	}
	return nil
}

func (plan renderPlan) dimensions() (int, int) {
	if plan.Width == 0 && plan.Height == 0 {
		return renderWidth, renderHeight
	}
	return plan.Width, plan.Height
}

func validateRenderAudio(project renderProject) error {
	tracks := make(map[string]string, len(project.Tracks))
	for _, track := range project.Tracks {
		tracks[track.ID] = track.Kind
	}
	for _, clip := range project.Clips {
		if clip.Kind != "audio" {
			continue
		}
		if tracks[clip.TrackID] != "audio" || clip.DurationMs <= 0 || clip.StartMs < 0 || clip.SourceStartMs < 0 ||
			clip.StartMs > math.MaxInt64-clip.DurationMs || clip.SourceStartMs > math.MaxInt64-clip.DurationMs ||
			clip.FadeInMs < 0 || clip.FadeOutMs < 0 {
			return fmt.Errorf("独立音频片段的轨道或时间参数无效")
		}
		if clip.SourceDurationMs > 0 && clip.SourceStartMs+clip.DurationMs > clip.SourceDurationMs {
			return fmt.Errorf("独立音频片段裁切超出源素材时长")
		}
		if clip.Volume != nil && (math.IsNaN(*clip.Volume) || math.IsInf(*clip.Volume, 0) || *clip.Volume < 0) {
			return fmt.Errorf("独立音频片段音量无效")
		}
		if _, ok := mediaResourceID(clip); !ok {
			return fmt.Errorf("独立音频片段缺少有效资源引用")
		}
	}
	return nil
}

// buildRenderPlan 挑选可见视频/图片轨片段按 startMs 排序，并把片段之间的
// 空隙展开为黑场段，使渲染序列在时间轴上连续。
func buildRenderPlan(project renderProject) renderPlan {
	visible := map[string]bool{}
	muted := map[string]bool{}
	for _, track := range project.Tracks {
		visible[track.ID] = track.Visible == nil || *track.Visible
		muted[track.ID] = track.Muted
	}
	clips := make([]renderClip, 0, len(project.Clips))
	audio := make([]renderSegment, 0)
	timelineEnd := int64(0)
	for _, clip := range project.Clips {
		if !visible[clip.TrackID] {
			continue
		}
		if clip.Kind != "video" && clip.Kind != "image" && clip.Kind != "audio" {
			continue
		}
		if clip.DurationMs <= 0 {
			continue
		}
		timelineEnd = max(timelineEnd, clip.StartMs+clip.DurationMs)
		if muted[clip.TrackID] {
			volume := 0.0
			clip.Volume = &volume
		}
		if clip.Kind == "audio" {
			if muted[clip.TrackID] {
				continue
			}
			audio = append(audio, renderSegment{Kind: "audio", DurationMs: clip.DurationMs, Clip: clip})
			continue
		}
		clips = append(clips, clip)
	}
	sort.SliceStable(clips, func(i, j int) bool {
		if clips[i].StartMs == clips[j].StartMs {
			return clips[i].ID < clips[j].ID
		}
		return clips[i].StartMs < clips[j].StartMs
	})

	sort.SliceStable(audio, func(i, j int) bool { return audio[i].Clip.StartMs < audio[j].Clip.StartMs })
	plan := renderPlan{Width: project.Width, Height: project.Height, Fit: normalizeRenderFit(project.Fit), SubtitleSRT: buildRenderSubtitleSRT(project), AudioSegments: audio}
	cursor := int64(0)
	for _, clip := range clips {
		if gap := clip.StartMs - cursor; gap > 0 {
			plan.Segments = append(plan.Segments, renderSegment{Kind: "gap", DurationMs: gap, GapMs: gap})
		}
		plan.Segments = append(plan.Segments, renderSegment{Kind: clip.Kind, DurationMs: clip.DurationMs, Clip: clip})
		cursor = clip.StartMs + clip.DurationMs
	}
	end := max(cursor, timelineEnd)
	for _, seg := range audio {
		if audioEnd := seg.Clip.StartMs + seg.DurationMs; audioEnd > end {
			end = audioEnd
		}
	}
	if end > cursor {
		plan.Segments = append(plan.Segments, renderSegment{Kind: "gap", DurationMs: end - cursor, GapMs: end - cursor})
	}
	for _, seg := range plan.mediaSegments() {
		if _, ok := mediaResourceID(seg.Clip); ok {
			plan.HasMedia = true
			break
		}
	}
	return plan
}

// Both visual and independent audio media use the same ownership-checked resolver.
func (plan *renderPlan) mediaSegments() []*renderSegment {
	segments := make([]*renderSegment, 0, len(plan.Segments)+len(plan.AudioSegments))
	for i := range plan.Segments {
		segments = append(segments, &plan.Segments[i])
	}
	for i := range plan.AudioSegments {
		segments = append(segments, &plan.AudioSegments[i])
	}
	return segments
}

// mediaResourceID 从片段的 directMedia.storageKey（resource:<id>）还原资源 ID。
func mediaResourceID(clip renderClip) (string, bool) {
	if clip.DirectMedia == nil {
		return "", false
	}
	key := strings.TrimSpace(clip.DirectMedia.StorageKey)
	if !strings.HasPrefix(key, "resource:") {
		return "", false
	}
	id := strings.TrimSpace(strings.TrimPrefix(key, "resource:"))
	return id, id != ""
}

func buildRenderSubtitleSRT(project renderProject) string {
	hidden := make(map[string]bool, len(project.Tracks))
	for _, track := range project.Tracks {
		hidden[track.ID] = track.Visible != nil && !*track.Visible
	}
	subtitle := make([]renderClip, 0, len(project.Clips))
	for _, clip := range project.Clips {
		if hidden[clip.TrackID] || clip.Kind != "subtitle" || strings.TrimSpace(clip.Text) == "" || clip.DurationMs <= 0 {
			continue
		}
		subtitle = append(subtitle, clip)
	}
	sort.SliceStable(subtitle, func(i, j int) bool {
		if subtitle[i].StartMs == subtitle[j].StartMs {
			return subtitle[i].ID < subtitle[j].ID
		}
		return subtitle[i].StartMs < subtitle[j].StartMs
	})
	if len(subtitle) == 0 {
		return ""
	}
	var out strings.Builder
	for i, clip := range subtitle {
		fmt.Fprintf(&out, "%d\n%s --> %s\n%s\n\n",
			i+1,
			formatSRTTimestamp(clip.StartMs),
			formatSRTTimestamp(clip.StartMs+clip.DurationMs),
			strings.TrimSpace(clip.Text))
	}
	return out.String()
}

const (
	renderWidth      = 1920
	renderHeight     = 1080
	renderFPS        = 30
	renderSampleRate = 44100
)

// buildRenderFFmpegArgs 依据渲染计划生成 ffmpeg 参数（工作目录内相对路径）。
// 每段固定两个输入：视频源与音频源，末尾 concat 为单路输出。
func buildRenderFFmpegArgs(plan renderPlan, target string) []string {
	if len(plan.Segments) == 0 {
		return nil
	}
	width, height := plan.dimensions()
	// 多段时间线会同时打开所有输入，默认解码线程数会随 CPU 核数倍增。
	args := []string{"-nostdin", "-y", "-filter_complex_threads", "2"}
	for _, seg := range plan.Segments {
		seconds := fmt.Sprintf("%.3f", float64(seg.DurationMs)/1000)
		switch seg.Kind {
		case "gap":
			args = append(args,
				"-f", "lavfi", "-t", seconds,
				"-threads", "1", "-i", fmt.Sprintf("color=c=black:s=%dx%d:r=%d", width, height, renderFPS),
				"-f", "lavfi", "-t", seconds,
				"-threads", "1", "-i", fmt.Sprintf("anullsrc=r=%d:cl=stereo", renderSampleRate),
			)
		case "image":
			if seg.Source == nil {
				args = append(args,
					"-f", "lavfi", "-t", seconds,
					"-threads", "1", "-i", fmt.Sprintf("color=c=black:s=%dx%d:r=%d", width, height, renderFPS),
					"-f", "lavfi", "-t", seconds,
					"-threads", "1", "-i", fmt.Sprintf("anullsrc=r=%d:cl=stereo", renderSampleRate),
				)
				continue
			}
			args = append(args,
				"-loop", "1", "-t", seconds, "-threads", "1", "-i", seg.Source.Path,
				"-f", "lavfi", "-t", seconds,
				"-threads", "1", "-i", fmt.Sprintf("anullsrc=r=%d:cl=stereo", renderSampleRate),
			)
		default:
			if seg.Source == nil {
				args = append(args,
					"-f", "lavfi", "-t", seconds,
					"-threads", "1", "-i", fmt.Sprintf("color=c=black:s=%dx%d:r=%d", width, height, renderFPS),
					"-f", "lavfi", "-t", seconds,
					"-threads", "1", "-i", fmt.Sprintf("anullsrc=r=%d:cl=stereo", renderSampleRate),
				)
				continue
			}
			if seg.Clip.SourceStartMs > 0 {
				args = append(args, "-ss", fmt.Sprintf("%.3f", float64(seg.Clip.SourceStartMs)/1000))
			}
			args = append(args, "-t", seconds, "-threads", "1", "-i", seg.Source.Path)
			// 音频输入复用同一媒体文件；无音轨时 ffmpeg 会因 map 失败，
			// 由调用方探测后回退为静音源（见 renderAudioFallback）。
			if seg.Clip.SourceStartMs > 0 {
				args = append(args, "-ss", fmt.Sprintf("%.3f", float64(seg.Clip.SourceStartMs)/1000))
			}
			args = append(args, "-t", seconds, "-threads", "1", "-i", seg.Source.Path)
		}
	}

	for _, seg := range plan.AudioSegments {
		if seg.Source == nil || !seg.Source.HasAudio {
			return nil
		}
		args = append(args, "-ss", fmt.Sprintf("%.3f", float64(seg.Clip.SourceStartMs)/1000),
			"-t", fmt.Sprintf("%.3f", float64(seg.DurationMs)/1000), "-threads", "1", "-i", seg.Source.Path)
	}
	filters := make([]string, 0, len(plan.Segments)*2+1)
	labels := make([]string, 0, len(plan.Segments)*2)
	for i, seg := range plan.Segments {
		videoIn := 2 * i
		audioIn := 2*i + 1
		videoLabel := fmt.Sprintf("v%d", i)
		audioLabel := fmt.Sprintf("a%d", i)
		duration := float64(seg.DurationMs) / 1000
		scale := renderFitFilter(renderSegmentFit(plan.Fit, seg.Source, width, height), width, height)
		filters = append(filters, fmt.Sprintf("[%d:v]fps=%d,%s,setsar=1,tpad=stop_mode=clone:stop_duration=%.3f,trim=duration=%.3f,setpts=PTS-STARTPTS%s[%s]", videoIn, renderFPS, scale, duration, duration, renderFadeFilters(seg.Clip, duration), videoLabel))
		if seg.Source != nil && seg.Kind != "image" && !seg.Source.HasAudio {
			// 无音轨媒体：改用静音源，避免 map 失败。
			audioIn = videoIn
			silentLabel := fmt.Sprintf("silent%d", i)
			filters = append(filters,
				fmt.Sprintf("anullsrc=r=%d:cl=stereo[%s]", renderSampleRate, silentLabel))
			filters = append(filters,
				fmt.Sprintf("[%s]atrim=0:%.3f,asetpts=N/SR/TB[%s]", silentLabel, float64(seg.DurationMs)/1000, audioLabel))
		} else {
			volume := 1.0
			if seg.Clip.Volume != nil {
				volume = *seg.Clip.Volume
			}
			filters = append(filters,
				fmt.Sprintf("[%d:a]aformat=sample_fmts=fltp:sample_rates=%d:channel_layouts=stereo,volume=%.3f,apad,atrim=duration=%.3f,asetpts=N/SR/TB[%s]",
					audioIn, renderSampleRate, volume, float64(seg.DurationMs)/1000, audioLabel))
		}
		labels = append(labels, videoLabel, audioLabel)
	}
	var concatInputs strings.Builder
	for _, label := range labels {
		fmt.Fprintf(&concatInputs, "[%s]", label)
	}
	filters = append(filters, fmt.Sprintf("%sconcat=n=%d:v=1:a=1[vout][aout]", concatInputs.String(), len(plan.Segments)))
	audioOutput := "[aout]"
	if len(plan.AudioSegments) > 0 {
		mixInputs := "[aout]"
		for i, seg := range plan.AudioSegments {
			volume := 1.0
			if seg.Clip.Volume != nil {
				volume = *seg.Clip.Volume
			}
			chain := fmt.Sprintf("[%d:a]aformat=sample_fmts=fltp:sample_rates=%d:channel_layouts=stereo,atrim=duration=%.3f,asetpts=N/SR/TB,volume=%.3f",
				2*len(plan.Segments)+i, renderSampleRate, float64(seg.DurationMs)/1000, volume)
			if fade := min(seg.Clip.FadeInMs, seg.DurationMs); fade > 0 {
				chain += fmt.Sprintf(",afade=t=in:st=0:d=%.3f", float64(fade)/1000)
			}
			if fade := min(seg.Clip.FadeOutMs, seg.DurationMs); fade > 0 {
				chain += fmt.Sprintf(",afade=t=out:st=%.3f:d=%.3f", float64(seg.DurationMs-fade)/1000, float64(fade)/1000)
			}
			label := fmt.Sprintf("mix%d", i)
			filters = append(filters, chain+fmt.Sprintf(",adelay=%d:all=1[%s]", seg.Clip.StartMs, label))
			mixInputs += "[" + label + "]"
		}
		filters = append(filters, fmt.Sprintf("%samix=inputs=%d:duration=first:dropout_transition=0:normalize=0[amixed]", mixInputs, len(plan.AudioSegments)+1))
		audioOutput = "[amixed]"
	}

	args = append(args,
		"-filter_complex", strings.Join(filters, ";"),
		"-map", "[vout]", "-map", audioOutput,
		"-c:v", "libx264", "-preset", "veryfast", "-crf", "23", "-pix_fmt", "yuv420p",
		"-c:a", "aac", "-b:a", "128k",
		"-map_metadata", "-1",
		"-metadata", "AIGC="+renderAIGCJSON(plan),
		"-metadata", "comment="+renderAIGCComment,
		"-movflags", "+faststart+use_metadata_tags",
		"-threads", "2",
		"-t", fmt.Sprintf("%.3f", planTotalSeconds(plan)),
		target,
	)
	return args
}

func planTotalSeconds(plan renderPlan) float64 {
	var total int64
	for _, seg := range plan.Segments {
		total += seg.DurationMs
	}
	return float64(total) / 1000
}
func (plan renderPlan) size() (int, int) {
	if plan.Width > 0 && plan.Height > 0 {
		return plan.Width, plan.Height
	}
	return renderWidth, renderHeight
}

const (
	renderFitAuto = "auto"
	renderFitPad  = "pad"
	renderFitCrop = "crop"

	renderCropAspectTolerance = 0.03
)

func normalizeRenderFit(value string) string {
	switch strings.ToLower(strings.TrimSpace(value)) {
	case renderFitPad:
		return renderFitPad
	case renderFitCrop:
		return renderFitCrop
	default:
		return renderFitAuto
	}
}

func renderSegmentFit(mode string, source *renderSource, width int, height int) string {
	switch mode {
	case renderFitPad, renderFitCrop:
		return mode
	}
	if source == nil || source.Width <= 0 || source.Height <= 0 || width <= 0 || height <= 0 {
		return renderFitPad
	}
	ratio := (float64(source.Width) / float64(source.Height)) / (float64(width) / float64(height))
	if math.Abs(ratio-1) <= renderCropAspectTolerance {
		return renderFitCrop
	}
	return renderFitPad
}

func renderFitFilter(fit string, width int, height int) string {
	if fit == renderFitCrop {
		return fmt.Sprintf("scale=%d:%d:force_original_aspect_ratio=increase,crop=%d:%d", width, height, width, height)
	}
	return fmt.Sprintf("scale=%d:%d:force_original_aspect_ratio=decrease,pad=%d:%d:(ow-iw)/2:(oh-ih)/2", width, height, width, height)
}

type renderSourceRecord struct {
	ClipID     string `json:"clipId"`
	ResourceID string `json:"resourceId"`
	Kind       string `json:"kind"`
	Width      int    `json:"width,omitempty"`
	Height     int    `json:"height,omitempty"`

	Fit  string `json:"fit,omitempty"`
	AIGC string `json:"aigc,omitempty"`
}

func renderSourceRecords(plan renderPlan) []renderSourceRecord {
	width, height := plan.size()
	records := make([]renderSourceRecord, 0, len(plan.Segments)+len(plan.AudioOverlays))
	for _, seg := range plan.Segments {
		if seg.Source == nil {
			continue
		}
		records = append(records, renderSourceRecord{
			ClipID: seg.Clip.ID, ResourceID: seg.Source.ResourceID, Kind: seg.Kind,
			Width: seg.Source.Width, Height: seg.Source.Height,
			Fit: renderSegmentFit(plan.Fit, seg.Source, width, height), AIGC: seg.Source.AIGC,
		})
	}
	for _, overlay := range append(append([]renderSegment(nil), plan.AudioSegments...), plan.AudioOverlays...) {
		if overlay.Source == nil {
			continue
		}
		records = append(records, renderSourceRecord{ClipID: overlay.Clip.ID, ResourceID: overlay.Source.ResourceID, Kind: overlay.Kind, AIGC: overlay.Source.AIGC})
	}
	return records
}

type aigcImplicitLabel struct {
	Label             string `json:"Label"`
	ContentProducer   string `json:"ContentProducer"`
	ProduceID         string `json:"ProduceID"`
	ReservedCode1     string `json:"ReservedCode1"`
	ContentPropagator string `json:"ContentPropagator"`
	PropagateID       string `json:"PropagateID"`
	ReservedCode2     string `json:"ReservedCode2"`
}

const AIGCPlatformPropagator = "yingxue"

const (
	aigcLabelGenerated = "1"

	renderAIGCComment = "AI生成合成内容"

	aigcFieldMaxRunes = 256
)

func renderAIGCLabel(plan renderPlan) aigcImplicitLabel {
	label := aigcImplicitLabel{ContentPropagator: AIGCPlatformPropagator, PropagateID: plan.PropagateID}
	sources := make([]*renderSource, 0, len(plan.Segments)+len(plan.AudioOverlays))
	for _, seg := range plan.Segments {
		sources = append(sources, seg.Source)
	}
	for _, overlay := range append(append([]renderSegment(nil), plan.AudioSegments...), plan.AudioOverlays...) {
		sources = append(sources, overlay.Source)
	}
	for _, source := range sources {
		if source == nil {
			continue
		}
		fields, ok := parseAIGCTag(source.AIGC)
		if !ok {
			continue
		}
		if label.Label == "" {
			label.Label = aigcField(fields, "Label")
		}
		if label.ContentProducer == "" && label.ProduceID == "" {
			label.ContentProducer, label.ProduceID = aigcField(fields, "ContentProducer"), aigcField(fields, "ProduceID")
		}
	}
	if label.Label == "" {
		label.Label = aigcLabelGenerated
	}
	return label
}

func renderAIGCJSON(plan renderPlan) string {
	encoded, err := json.Marshal(renderAIGCLabel(plan))
	if err != nil {
		return ""
	}
	return string(encoded)
}

func parseAIGCTag(raw string) (map[string]any, bool) {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return nil, false
	}
	var fields map[string]any
	if err := json.Unmarshal([]byte(raw), &fields); err != nil || fields == nil {
		return nil, false
	}
	return fields, true
}

func aigcField(fields map[string]any, key string) string {
	value, ok := fields[key]
	if !ok {
		for name, candidate := range fields {
			if strings.EqualFold(name, key) {
				value, ok = candidate, true
				break
			}
		}
	}
	if !ok {
		return ""
	}
	switch typed := value.(type) {
	case string:
		return truncateRunes(strings.TrimSpace(typed), aigcFieldMaxRunes)
	case float64:
		return strconv.FormatFloat(typed, 'f', -1, 64)
	default:
		return ""
	}
}

func renderFadeFilters(clip renderClip, duration float64) string {
	color := func(value string) string {
		if value == "white" {
			return "white"
		}
		return "black"
	}
	var b strings.Builder
	if clip.FadeInMs > 0 {
		fmt.Fprintf(&b, ",fade=t=in:st=0:d=%.3f:color=%s", min(float64(clip.FadeInMs)/1000, duration/2), color(clip.FadeInColor))
	}
	if clip.FadeOutMs > 0 {
		fade := min(float64(clip.FadeOutMs)/1000, duration/2)
		fmt.Fprintf(&b, ",fade=t=out:st=%.3f:d=%.3f:color=%s", duration-fade, fade, color(clip.FadeOutColor))
	}
	return b.String()
}
