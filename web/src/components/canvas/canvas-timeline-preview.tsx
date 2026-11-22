import { useEffect, useMemo, useRef, useState } from "react";
import { Pause, Play } from "lucide-react";
import type { InterfaceMessageKey } from "@/lib/interface-locale";
import { useInterfaceTranslation } from "@/stores/use-interface-locale-store";

import { canvasThemes } from "@/lib/canvas-theme";
import { resolveMediaUrl } from "@/services/file-storage";
import { formatTimelineTime } from "@/lib/timeline/timeline-view";
import { timelineAudioPlayback } from "@/lib/timeline/timeline-audio";
import { timelineMediaGain } from "@/lib/timeline/timeline-media-gain";
import { createDefaultSubtitleStyle } from "@/types/timeline";
import type { TimelineClip, TimelineTrack } from "@/types/timeline";
import type { CanvasNodeData } from "@/types/canvas";
import { TimelineAudioPlayback } from "@/components/timeline/timeline-audio-playback";
import { CanvasSubtitleOverlay } from "./canvas-subtitle-overlay";

type CanvasTheme = (typeof canvasThemes)[keyof typeof canvasThemes];

type CanvasTimelinePreviewProps = {
    clips: TimelineClip[];
    tracks: TimelineTrack[];
    durationMs: number;
    nodes: CanvasNodeData[];
    playheadMs: number;
    /** Increment for an external ruler/programmatic seek; RAF writes do not change it. */
    seekRevision: number;
    playing: boolean;
    theme: CanvasTheme;
    onTogglePlay: () => void;
    onPlayheadChange: (ms: number) => void;
};

const PREVIEW_WIDTH = 300;
const PREVIEW_HEIGHT = 168;

function CanvasAudioClip({ clip, nodes, timeMs, playing, muted }: {
    clip: TimelineClip; nodes: CanvasNodeData[]; timeMs: number; playing: boolean; muted: boolean;
}) {
    const { t } = useInterfaceTranslation();
    const [source, setSource] = useState<string | null>(null);
    const [sourceError, setSourceError] = useState<InterfaceMessageKey | "">("");
    const node = nodes.find((item) => item.id === clip.nodeId);
    const storageKey = clip.directMedia?.storageKey || node?.metadata?.storageKey || "";
    const fallback = clip.directMedia?.dataUrl || clip.directMedia?.url || node?.metadata?.content || "";
    useEffect(() => {
        let cancelled = false;
        setSource(null);
        setSourceError("");
        if (!storageKey && !fallback) {
            setSourceError("timelinePreviewMissing");
            return;
        }
        void resolveMediaUrl(storageKey, fallback).then((url) => {
            if (cancelled) return;
            if (url) setSource(url);
            else setSourceError("timelinePreviewResolveFailed");
        }).catch(() => {
            if (!cancelled) setSourceError("timelinePreviewResolveFailed");
        });
        return () => { cancelled = true; };
    }, [storageKey, fallback]);
    return <TimelineAudioPlayback clip={clip} source={source} sourceError={sourceError ? t(sourceError) : ""} timeMs={timeMs} playing={playing} muted={muted} />;
}

/**
 * 时间线弹窗预览：统一时钟驱动视频、独立音轨和字幕；空隙/纯音频也推进。
 */
export function CanvasTimelinePreview({ clips, tracks, durationMs, nodes, playheadMs, seekRevision, playing, theme, onTogglePlay, onPlayheadChange }: CanvasTimelinePreviewProps) {
    const videoRef = useRef<HTMLVideoElement>(null);
    const { t } = useInterfaceTranslation();
    const [videoUrl, setVideoUrl] = useState("");
    const [gainError, setGainError] = useState<InterfaceMessageKey | "">("");
    const [videoSize, setVideoSize] = useState<{ width: number; height: number } | null>(null);
    // 源内定位目标（秒）；视频换源后 metadata 尚未加载时先记录，loadedmetadata 后再应用。
    const targetSeekSecRef = useRef<number | null>(null);

    const hiddenTrackIds = useMemo(() => new Set(tracks.filter((track) => track.visible === false).map((track) => track.id)), [tracks]);
    const videoClips = useMemo(() => clips.filter((clip) => clip.kind === "video" && !hiddenTrackIds.has(clip.trackId)).sort((a, b) => a.startMs - b.startMs), [clips, hiddenTrackIds]);
    const activeVideoClip = useMemo(() => videoClips.find((clip) => playheadMs >= clip.startMs && playheadMs < clip.startMs + clip.durationMs) || null, [playheadMs, videoClips]);
    const activeAudioClips = useMemo(() => clips.filter((clip) => clip.kind === "audio" && !hiddenTrackIds.has(clip.trackId) && playheadMs >= clip.startMs && playheadMs < clip.startMs + clip.durationMs), [clips, hiddenTrackIds, playheadMs]);
    const activeSubtitleClip = useMemo(() => clips.find((clip) => clip.kind === "subtitle" && !hiddenTrackIds.has(clip.trackId) && playheadMs >= clip.startMs && playheadMs < clip.startMs + clip.durationMs && Boolean(clip.text?.trim())) || null, [clips, hiddenTrackIds, playheadMs]);
    const activeNode = useMemo(() => (activeVideoClip ? nodes.find((node) => node.id === activeVideoClip.nodeId) || null : null), [activeVideoClip, nodes]);
    const subtitleStyle = activeNode?.metadata?.subtitleStyle || createDefaultSubtitleStyle();
    const activeHighlight = useMemo(() => {
        if (!activeSubtitleClip || activeSubtitleClip.subtitleEntryIndex === undefined || activeSubtitleClip.subtitleEntryIndex < 0 || !activeNode) return undefined;
        // subtitleEntryIndex 与字幕条目 index 同为 1 基，直接匹配，不再 +1（此前高亮永远匹配不上）。
        return (activeNode.metadata?.subtitleHighlights || []).find((item) => item.entryIndex === activeSubtitleClip.subtitleEntryIndex);
    }, [activeNode, activeSubtitleClip]);

    // Transport uses wall time rather than video time: gaps and audio-only tails must advance too.
    const playheadRef = useRef(playheadMs);
    const onPlayheadChangeRef = useRef(onPlayheadChange);
    const onTogglePlayRef = useRef(onTogglePlay);
    const seenSeekRevisionRef = useRef(seekRevision);
    if (!playing || seenSeekRevisionRef.current !== seekRevision) playheadRef.current = playheadMs;
    seenSeekRevisionRef.current = seekRevision;
    onPlayheadChangeRef.current = onPlayheadChange;
    onTogglePlayRef.current = onTogglePlay;
    useEffect(() => {
        if (!playing) return;
        if (playheadRef.current >= durationMs) onPlayheadChangeRef.current(0);
        if (playheadRef.current >= durationMs) playheadRef.current = 0;
        let lastTick: number | null = null;
        let frame = 0;
        const tick = (now: number) => {
            if (lastTick === null) lastTick = now;
            const next = Math.min(durationMs, playheadRef.current + now - lastTick);
            lastTick = now;
            playheadRef.current = next;
            onPlayheadChangeRef.current(Math.round(next));
            if (next >= durationMs) {
                onTogglePlayRef.current();
                return;
            }
            frame = requestAnimationFrame(tick);
        };
        frame = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(frame);
    }, [playing, durationMs]);

    // 解析当前片段视频地址（与字幕弹窗同一套缓存/回退策略）。
    useEffect(() => {
        const node = activeNode;
        const media = activeVideoClip?.directMedia;
        setVideoUrl("");
        setVideoSize(null);
        if (!node && !media) return;
        let cancelled = false;
        // 直连媒体片段（directMedia，不落画布）与画布节点走同一套稳定资源地址解析策略。
        const storageKey = media?.storageKey || node?.metadata?.storageKey || "";
        const fallback = media?.dataUrl || media?.url || node?.metadata?.content || "";
        void resolveMediaUrl(storageKey, fallback).then((url) => {
            if (!cancelled) setVideoUrl(url);
        });
        return () => {
            cancelled = true;
        };
    }, [activeNode?.id, activeNode?.metadata?.storageKey, activeNode?.metadata?.content,
        activeVideoClip?.id, activeVideoClip?.directMedia?.storageKey, activeVideoClip?.directMedia?.dataUrl, activeVideoClip?.directMedia?.url]);

    useEffect(() => {
        setGainError("");
        const video = videoRef.current;
        return () => { if (video) timelineMediaGain.release(video); };
    }, [videoUrl]);

    // Video follows the shared transport; only drift beyond tolerance triggers a seek.
    useEffect(() => {
        const video = videoRef.current;
        if (!video || !activeVideoClip || !videoUrl) return;
        const sourceStartSec = (activeVideoClip.sourceStartMs || 0) / 1000;
        const sourceDurationSec = (activeVideoClip.sourceDurationMs || activeVideoClip.durationMs) / 1000;
        const targetSec = sourceStartSec + Math.max(0, playheadMs - activeVideoClip.startMs) / 1000;
        const clampedTargetSec = Math.min(targetSec, sourceStartSec + Math.max(0, sourceDurationSec - 0.05));
        targetSeekSecRef.current = clampedTargetSec;
        if (!video.seeking && video.readyState >= 1 && Math.abs(video.currentTime - clampedTargetSec) > (playing ? 0.35 : 0.05)) {
            video.currentTime = clampedTargetSec;
        }
        const audioState = timelineAudioPlayback(activeVideoClip, playheadMs, playing, false);
        try {
            timelineMediaGain.apply(video, audioState.volume);
            if (playing) void timelineMediaGain.resume(video).catch(() => { video.pause(); setGainError("timelineGainStartFailed"); });
        } catch { video.pause(); setGainError("timelineGainInitFailed"); }
    }, [activeVideoClip, playheadMs, playing, videoUrl]);

    useEffect(() => {
        const video = videoRef.current;
        if (!video || !activeVideoClip || !videoUrl) return;
        let cancelled = false;
        if (playing) {
            void (async () => {
                timelineMediaGain.apply(video, timelineAudioPlayback(activeVideoClip, playheadMs, playing, false).volume);
                await timelineMediaGain.resume(video);
                if (!cancelled) await video.play();
            })().catch(() => { if (!cancelled) setGainError("timelinePreviewPlayFailed"); });
        } else {
            video.pause();
        }
        return () => { cancelled = true; video.pause(); };
    }, [activeVideoClip?.id, playing, videoUrl]);

    // 视频换源后元数据加载完成，应用之前记录的源内定位目标。
    const handleVideoLoadedMetadata = (video: HTMLVideoElement) => {
        if (video.videoWidth > 0 && video.videoHeight > 0) setVideoSize({ width: video.videoWidth, height: video.videoHeight });
        if (targetSeekSecRef.current != null && video.readyState >= 1) {
            const target = Math.min(targetSeekSecRef.current, Math.max(0, (video.duration || 0) - 0.05));
            if (Math.abs(video.currentTime - target) > 0.05) video.currentTime = target;
        }
    };

    const previewDisplay = useMemo(() => {
        if (!videoSize || videoSize.height <= 0) return null;
        const ratio = videoSize.width / videoSize.height;
        let width = PREVIEW_WIDTH;
        let height = width / ratio;
        if (height > PREVIEW_HEIGHT) {
            height = PREVIEW_HEIGHT;
            width = Math.round(height * ratio);
        }
        return { width: Math.round(width), height: Math.round(height) };
    }, [videoSize]);

    return (
        <div className="flex items-center gap-3 border-b px-4 py-2.5" style={{ borderColor: theme.toolbar.border, background: theme.toolbar.panel }}>
            <div className="relative grid shrink-0 place-items-center overflow-hidden rounded-lg bg-black" style={{ width: PREVIEW_WIDTH, height: PREVIEW_HEIGHT }} data-canvas-no-zoom>
                {videoUrl && activeVideoClip ? (
                    <>
                        <div className="relative" style={previewDisplay ? { width: previewDisplay.width, height: previewDisplay.height } : { width: "100%", height: "100%" }}>
                            <video ref={videoRef} className="block h-full w-full" src={videoUrl} crossOrigin="anonymous" playsInline preload="metadata" muted={tracks.find((track) => track.id === activeVideoClip.trackId)?.muted === true} onError={() => setGainError("timelinePreviewDecodeFailed")} onLoadedMetadata={(event) => handleVideoLoadedMetadata(event.currentTarget)} />
                            {activeSubtitleClip ? <CanvasSubtitleOverlay text={activeSubtitleClip.text || ""} highlight={activeHighlight} style={subtitleStyle} /> : null}
                        </div>
                    </>
                ) : (
                    <div className="px-4 text-center text-xs opacity-55">{t("canvasC.timelinePreview.noClipHere")}</div>
                )}
                {clips.some((clip) => (clip.kind === "video" || clip.kind === "audio") && !hiddenTrackIds.has(clip.trackId)) ? (
                    <button type="button" className="absolute inset-0 z-10 grid place-items-center" aria-label={t(playing ? "timelinePausePreview" : "timelinePlayPreview")} onClick={(event) => { event.stopPropagation(); onTogglePlay(); }}>
                        <span className="grid size-10 place-items-center rounded-full bg-black/45 text-white backdrop-blur transition hover:scale-105 hover:bg-black/60">
                            {playing ? <Pause className="size-4 fill-current" /> : <Play className="size-4 fill-current" />}
                        </span>
                    </button>
                ) : null}
            </div>
            {gainError && <span role="alert" className="text-xs text-[var(--director-danger)]">{t(gainError)}</span>}
            <div className="min-w-0 text-xs" aria-live="polite">{activeAudioClips.map((clip) => <CanvasAudioClip key={clip.id} clip={clip} nodes={nodes} timeMs={playheadMs} playing={playing} muted={tracks.find((track) => track.id === clip.trackId)?.muted === true} />)}</div>
            <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 text-xs">
                    <span className="truncate font-semibold" style={{ color: theme.accent.primary }}>
                        {activeVideoClip?.title || t("canvasC.timelinePreview.noClip")}
                    </span>
                    <span className="opacity-45 tabular-nums">{activeVideoClip ? `${formatTimelineTime(activeVideoClip.startMs)} ~ ${formatTimelineTime(activeVideoClip.startMs + activeVideoClip.durationMs)}` : ""}</span>
                </div>
                <div className="mt-2 max-h-16 min-h-10 overflow-y-auto rounded-lg border px-2 py-2 text-xs leading-5" style={{ borderColor: theme.toolbar.border, background: theme.node.fill }}>
                    {activeSubtitleClip ? activeSubtitleClip.text : <span className="opacity-40">{t("canvasC.timelinePreview.noSubtitle")}</span>}
                </div>
            </div>
        </div>
    );
}
