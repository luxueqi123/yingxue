import { App, Button, Dropdown, Input, InputNumber, Progress } from "antd";
import { AppModal } from "@/components/ui/product/app-modal";
import { Tooltip } from "@/components/ui/base/tooltip";
import { Checkbox } from "@/components/ui/base/checkbox";
import { SegmentedControl } from "@/components/ui/base/segmented-control";
import { Select } from "@/components/ui/base/select";
// 二期：多轨时间线编辑弹窗。
// 数据源是项目级 TimelineProject：视频/音频节点自动入轨，字幕条目转字幕片段。
// 交互：拖拽移动片段（吸附播放头/片段边缘）、左右边缘裁剪、删除、播放头跳转。

import { useCallback, useEffect, useMemo, useRef, useState, type MutableRefObject } from "react";

import { Captions, Clapperboard, FolderOpen, Library, Lock, LockOpen, Maximize2, MoreHorizontal, Music2, Plus, Scissors, Trash2, Upload, Video, Wand2, ZoomIn, ZoomOut } from "lucide-react";
import { saveAs } from "file-saver";

import { CanvasTimelineRuler } from "./canvas-timeline-ruler";
import { CanvasTimelinePreview } from "./canvas-timeline-preview";
import { canvasThemes } from "@/lib/canvas-theme";
import { useActiveTheme } from "@/stores/canvas/use-canvas-theme-store";
import { buildTimelineForScope, selectTimelineScopeNodes, buildTimelineFromNodes, countTimelineSelectionVideos, formatTimelineSourceSummary, isNodeInTimeline, isReferenceVideoNode, summarizeTimelineSource, syncTimelineSubtitleClips, type TimelineBuildScope, buildTimelineFromNodesWithDurations, resolveTimelineSourceDurationMs, timelineSubtitleEntries } from "@/lib/timeline/timeline-build";
import { useInterfaceTranslation } from "@/stores/use-interface-locale-store";
import { probeMediaDurationUrlMs } from "@/lib/media-metadata";
import { resolveMediaUrl } from "@/services/file-storage";
import { canPlaceAt, clampClipDurationByNeighbors, findNearestAvailablePlacement } from "@/lib/timeline/timeline-placement";
import { computeSnap } from "@/lib/timeline/timeline-snap";
import { splitTimelineClip } from "@/lib/timeline/split-timeline-clip";
import { patchTimelineClip } from "@/lib/timeline/linked-timeline-audio";
import { DEFAULT_AUDIO_TRACK_ID, DEFAULT_VIDEO_TRACK_ID, normalizeTimelineProject } from "@/lib/timeline/timeline-tracks";
import { formatTimelineTime, getTimelineTrackWidth, getFitTimelineZoom, zoomIn, zoomOut } from "@/lib/timeline/timeline-view";
import { exportTimelineToMp4, type TimelineExportResult } from "@/lib/timeline/timeline-export";
import { defaultTimelineExportPreset, resolveTimelineExportSize, summarizeTimelineFitModes, timelineExportPresetOptions, timelineFitModeLabel, type TimelineExportPreset } from "@/lib/timeline/timeline-export-spec";
import { buildSubtitleSrt, getOrderedSubtitleClips, getOrderedVideoClips, type TimelineRenderSource } from "@/lib/timeline/timeline-to-ffmpeg";
import { prepareCanvasTimelineRender } from "@/lib/timeline/canvas-timeline-render";
import { createTimelineRenderTask, type TimelineRenderResult } from "@/services/api/timeline-tasks";
import { waitForGenerationTask } from "@/services/api/task-center";
import { resourceFileUrl } from "@/services/api/resources";
import type { CanvasNodeData } from "@/types/canvas";
import type { SrtEntry, TimelineClip, TimelineDirectMedia, TimelineProject } from "@/types/timeline";

const MIN_CLIP_DURATION_MS = 100;
const TRACK_ROW_HEIGHT = 52;
const SNAP_THRESHOLD_PX = 8;
const BASE_PX_PER_SECOND = 96;
const EXPORT_FPS = 30;

type TimelineSourceKind = TimelineBuildScope | "saved";
const SOURCE_LABELS: Record<TimelineSourceKind, string> = { current: "当前视频", selection: "选中视频", canvas: "整个画布", saved: "已保存时间线" };

type CanvasTimelineDialogProps = {
    projectId?: string;
    node: CanvasNodeData;
    open: boolean;
    nodes: CanvasNodeData[];
    timeline: TimelineProject | null;
    /** 画布当前多选；选中多于 1 个视频时可切换到「选中视频」来源 */
    selectedNodeIds?: ReadonlySet<string>;
    /** 画布关联短剧时的作品画幅（如 9:16），作为默认导出规格 */
    dramaAspectRatio?: string;
    onClose: () => void;
    onOpenSubtitleDialog?: (nodeId: string) => void;
    onSave: (timeline: TimelineProject) => void;
    onSaveSubtitles: (nodeId: string, entries: SrtEntry[]) => void;
    onPersist: () => Promise<boolean>;
    /** 打开项目素材库选择器（由页面层接线） */
    onOpenAssetLibrary?: () => void;
    /** 打开项目资产库选择器（由页面层接线） */
    onOpenProjectAssets?: () => void;
    /** 上传本地音视频并返回直连媒体描述（仅时间线作用域，不创建画布节点） */
    onUploadLocalFiles?: (files: File[]) => Promise<TimelineDirectMedia[]>;
    /** 页面层持有：素材库/上传创建节点后，调用该引用把节点加入时间线草稿 */
    addNodeToTimelineRef?: MutableRefObject<((node: CanvasNodeData) => void) | null>;
    /** 页面层持有：素材库/项目资产直连媒体（不落画布）入轨通道 */
    addMediaToTimelineRef?: MutableRefObject<((media: TimelineDirectMedia) => void) | null>;
    /** 把合成结果保存为新视频节点放回画布（页面层接线） */
    onCreateAssembledNode?: (blob: Blob, title: string) => Promise<CanvasNodeData | null>;
};

type ClipDragMode = "move" | "trim-start" | "trim-end";

type DragState =
    | { mode: "move"; clipId: string; startClientX: number; originalStartMs: number }
    | { mode: "trim-start"; clipId: string; startClientX: number; originalStartMs: number; originalDurationMs: number; originalSourceStartMs: number }
    | { mode: "trim-end"; clipId: string; startClientX: number; originalStartMs: number; originalDurationMs: number }
    | null;

export function CanvasTimelineDialog({
    projectId,
    node,
    open,
    nodes,
    timeline,
    selectedNodeIds,
    dramaAspectRatio,
    onClose,
    onOpenSubtitleDialog,
    onSave,
    onSaveSubtitles,
    onPersist,
    onOpenAssetLibrary,
    onOpenProjectAssets,
    onUploadLocalFiles,
    addNodeToTimelineRef,
    addMediaToTimelineRef,
    onCreateAssembledNode,
}: CanvasTimelineDialogProps) {
    const { message, modal } = App.useApp();
    const { locale, t } = useInterfaceTranslation();
    const theme = canvasThemes[useActiveTheme()];
    const [draft, setDraft] = useState<TimelineProject>(() => buildTimelineFromNodes([]));
    const [source, setSource] = useState<TimelineSourceKind>("current");
    const [includeReferenceVideos, setIncludeReferenceVideos] = useState(false);
    const [exportPreset, setExportPreset] = useState<TimelineExportPreset>(() => defaultTimelineExportPreset(dramaAspectRatio));
    // 草稿自上次按来源构建后是否被编辑过；切换来源前据此确认，避免静默丢弃编辑。
    const draftDirtyRef = useRef(false);
    const [playheadMs, setPlayheadMs] = useState(0);
    const [previewSeekRevision, setPreviewSeekRevision] = useState(0);
    const [zoomLevel, setZoomLevel] = useState(1);
    const [selectedClipId, setSelectedClipId] = useState<string | null>(null);
    const [snapEnabled, setSnapEnabled] = useState(true);
    const [previewPlaying, setPreviewPlaying] = useState(false);
    const [exporting, setExporting] = useState(false);
    const [saving, setSaving] = useState(false);
    const savingRef = useRef(false);
    const [exportPercent, setExportPercent] = useState(0);
    const [exportDetail, setExportDetail] = useState("");
    const [remoteResult, setRemoteResult] = useState<TimelineRenderResult | null>(null);
    const exportBusyRef = useRef(false);
    const dragRef = useRef<DragState>(null);
    const scrollRef = useRef<HTMLDivElement>(null);
    const trackAreaRef = useRef<HTMLDivElement>(null);
    const uploadInputRef = useRef<HTMLInputElement>(null);
    const toolbarRef = useRef<HTMLDivElement>(null);
    const addGroupProbeRef = useRef<HTMLDivElement>(null);
    const moreBtnRef = useRef<HTMLSpanElement>(null);

    const initializedRef = useRef(false);
    const initializationRef = useRef<AbortController | null>(null);
    const [initializing, setInitializing] = useState(false);
    const [initializationError, setInitializationError] = useState("");
    const [addingMedia, setAddingMedia] = useState(false);
    const mediaAdditionRef = useRef<{ controller: AbortController; queue: Promise<void>; pending: number } | null>(null);
    useEffect(
        () => () => {
            initializationRef.current?.abort();
            initializationRef.current = null;
            initializedRef.current = false;
        },
        [],
    );

    // 打开弹窗：优先复用项目时间线，否则只用触发节点新建（不再默认收集整张画布的视频）；播放头定位到触发节点片段。
    // 仅首次打开时构建草稿：素材上传/素材库插入会触发 nodes 变化，不能因此重建草稿丢弃编辑。
    useEffect(() => {
        if (!open) {
            initializationRef.current?.abort();
            initializationRef.current = null;
            initializedRef.current = false;
            return;
        }
        if (initializedRef.current) return;
        initializedRef.current = true;
        const controller = new AbortController();
        initializationRef.current = controller;
        mediaAdditionRef.current = { controller, queue: Promise.resolve(), pending: 0 };
        setAddingMedia(false);
        setInitializationError("");
        setInitializing(!timeline);
        setDraft(buildTimelineFromNodes([]));
        draftDirtyRef.current = false;
        setSource(timeline ? "saved" : "current");
        setIncludeReferenceVideos(false);
        setExportPreset(defaultTimelineExportPreset(dramaAspectRatio));
        setPlayheadMs(0);
        setPreviewSeekRevision((value) => value + 1);
        setZoomLevel(1);
        setSelectedClipId(null);
        setPreviewPlaying(false);
        const apply = (base: TimelineProject) => {
            if (controller.signal.aborted) return;
            const next = timeline && !node.metadata?.timelineComposition ? syncTimelineSubtitleClips(base, nodes) : base;
            setDraft(next);
            const triggerClip = next.clips.find((clip) => clip.nodeId === node.id);
            if (triggerClip) setPlayheadMs(triggerClip.startMs);
            setInitializing(false);
        };
        if (timeline) {
            apply(normalizeTimelineProject(timeline));
        } else {
            void buildTimelineFromNodesWithDurations(selectTimelineScopeNodes(nodes, { scope: "current", triggerNodeId: node.id }), async (source) => {
                const url = await resolveMediaUrl(source.metadata?.storageKey, source.metadata?.content || "");
                return probeMediaDurationUrlMs(url, source.type === "audio" ? "audio" : "video", controller.signal);
            })
                .then(apply)
                .catch((error) => {
                    if (controller.signal.aborted) return;
                    setInitializationError(error instanceof Error ? error.message : t("timelineDurationFailed"));
                    setInitializing(false);
                });
        }
    }, [open, node.id, nodes, timeline, node.metadata?.timelineComposition, dramaAspectRatio, t]);

    const replaceDraft = (next: TimelineProject) => {
        draftDirtyRef.current = false;
        setDraft(next);
        setZoomLevel(1);
        setSelectedClipId(null);
        setPreviewPlaying(false);
        setPreviewSeekRevision((value) => value + 1);
        setPlayheadMs(next.clips.find((clip) => clip.nodeId === node.id)?.startMs ?? 0);
    };

    const applyScope = async (scope: TimelineBuildScope, includeReferences: boolean) => {
        if (initializing || addingMedia || exporting || savingRef.current) return;
        const controller = new AbortController();
        initializationRef.current?.abort();
        initializationRef.current = controller;
        mediaAdditionRef.current = { controller, queue: Promise.resolve(), pending: 0 };
        setInitializing(true);
        setInitializationError("");
        try {
            const selected = selectTimelineScopeNodes(nodes, { scope, triggerNodeId: node.id, selectedNodeIds, includeReferenceVideos: includeReferences });
            const next = await buildTimelineFromNodesWithDurations(selected, async (sourceNode) => {
                const url = await resolveMediaUrl(sourceNode.metadata?.storageKey, sourceNode.metadata?.content || "");
                return probeMediaDurationUrlMs(url, sourceNode.type === "audio" ? "audio" : "video", controller.signal);
            }, { prefixReferenceTitles: scope !== "current" });
            if (controller.signal.aborted) return;
            setSource(scope);
            setIncludeReferenceVideos(includeReferences);
            replaceDraft(next);
        } catch (error) {
            if (!controller.signal.aborted) setInitializationError(error instanceof Error ? error.message : t("timelineDurationFailed"));
        } finally {
            if (!controller.signal.aborted) setInitializing(false);
        }
    };

    const rebuildFromScope = async (scope: TimelineBuildScope, includeReferences: boolean) => {
        if (draftDirtyRef.current) {
            const confirmed = await modal.confirm({ title: "放弃当前时间线的修改？", content: "切换来源会按新范围重新排列片段，当前未保存的编辑不会保留。", okText: "放弃并切换", cancelText: "继续编辑" });
            if (!confirmed) return;
        }
        await applyScope(scope, includeReferences);
    };

    const startFromCurrentVideo = async () => {
        const confirmed = await modal.confirm({ title: "从当前视频新建时间线？", content: "当前草稿将替换为当前视频，保存后才会更新项目时间线。", okText: "新建", cancelText: "保留现有时间线" });
        if (confirmed) await applyScope("current", false);
    };

    const pxPerMs = (BASE_PX_PER_SECOND / 1_000) * zoomLevel;
    const durationMs = Math.max(1_000, draft.durationMs);
    const [viewportWidth, setViewportWidth] = useState(900);
    const trackWidth = useMemo(() => getTimelineTrackWidth(durationMs, zoomLevel, viewportWidth), [durationMs, zoomLevel, viewportWidth]);

    useEffect(() => {
        if (!open) return;
        const measure = () => {
            setViewportWidth(trackAreaRef.current?.clientWidth || 900);
        };
        measure();
        const observer = new ResizeObserver(measure);
        if (trackAreaRef.current) observer.observe(trackAreaRef.current);
        return () => observer.disconnect();
    }, [open]);

    // 工具栏自适应：按钮总数过多或容器变窄时，把「添加素材/上传本地/素材库/项目资产」收进「更多」菜单，
    // 主要操作允许换行，不能用横向裁切隐藏保存／取消；容器变宽后恢复内联展示。
    // 素材组用隐藏探针测量自然宽度，展开/收起两种形态下算出的核心区宽度一致，判定不随当前状态震荡。
    const [addGroupCollapsed, setAddGroupCollapsed] = useState(false);
    const toolbarObserverRef = useRef<ResizeObserver | null>(null);
    const measureToolbar = useCallback(() => {
        const el = toolbarRef.current;
        const probe = addGroupProbeRef.current;
        if (!el || !probe) return;
        const addGroupWidth = probe.offsetWidth;
        const shownAddWidth = addGroupCollapsed ? (moreBtnRef.current?.offsetWidth ?? 56) : addGroupWidth;
        const expandedWidth = el.scrollWidth - shownAddWidth + addGroupWidth;
        setAddGroupCollapsed(expandedWidth > el.clientWidth + 2);
    }, [addGroupCollapsed]);
    const ensureToolbarObserved = useCallback(() => {
        const el = toolbarRef.current;
        if (!el || toolbarObserverRef.current) return;
        const observer = new ResizeObserver(measureToolbar);
        toolbarObserverRef.current = observer;
        observer.observe(el);
        measureToolbar();
    }, [measureToolbar]);
    useEffect(() => {
        if (!open) return;
        // AntD Modal 内容经门户延迟挂载，首次 effect 时 toolbarRef 可能为空；
        // afterOpenChange 兜底确保动画结束后一定完成测量与观察。
        ensureToolbarObserved();
        return () => {
            toolbarObserverRef.current?.disconnect();
            toolbarObserverRef.current = null;
        };
    }, [open, ensureToolbarObserved]);

    const applyDraft = (updater: (current: TimelineProject) => TimelineProject) => {
        draftDirtyRef.current = true;
        setDraft((current) => {
            const next = updater(current);
            const endMs = next.clips.reduce((max, clip) => Math.max(max, clip.startMs + clip.durationMs), 0);
            return { ...next, durationMs: Math.max(endMs, 1_000) };
        });
    };

    const updateClip = (clipId: string, patch: Partial<TimelineClip>) => {
        applyDraft((current) => ({
            ...current,
            clips: current.clips.map((clip) => (clip.id === clipId ? patchTimelineClip(clip, patch) : clip)),
        }));
    };

    const updateSelectedMediaNumbers = (patch: Partial<TimelineClip>) => {
        if (!selectedClipId) return;
        updateClip(selectedClipId, patch);
    };

    const moveClip = (clipId: string, candidateStartMs: number) => {
        const clip = draft.clips.find((item) => item.id === clipId);
        if (!clip) return;
        const snapped = snapEnabled
            ? computeSnap({
                  candidateMs: candidateStartMs,
                  playheadMs,
                  clips: draft.clips,
                  excludeClipId: clipId,
                  pxPerMs,
                  thresholdPx: SNAP_THRESHOLD_PX,
                  enabled: true,
              })
            : { snappedMs: candidateStartMs, targets: [] };
        const nextStartMs = Math.max(0, Math.round(snapped.snappedMs));
        const result = canPlaceAt({
            trackId: clip.trackId,
            startMs: nextStartMs,
            durationMs: clip.durationMs,
            excludeClipId: clipId,
            clips: draft.clips,
        });
        if (!result.ok) return;
        updateClip(clipId, { startMs: nextStartMs });
    };

    // 裁剪统一基于拖动起点快照计算，避免“当前值 + 累计 delta”造成的漂移与越界。
    const trimClipStart = (clipId: string, deltaMs: number, original: { startMs: number; durationMs: number; sourceStartMs: number }) => {
        const clip = draft.clips.find((item) => item.id === clipId);
        if (!clip) return;
        const rightEdgeMs = original.startMs + original.durationMs;
        // 向左延长最多到源文件起点：时间轴起点不能早于 original.start - sourceStart。
        const minStartMs = clip.sourceStartMs === undefined ? 0 : Math.max(0, original.startMs - original.sourceStartMs);
        const newStartMs = Math.max(minStartMs, Math.min(rightEdgeMs - MIN_CLIP_DURATION_MS, original.startMs + deltaMs));
        const newDurationMs = rightEdgeMs - newStartMs;
        // 源内裁剪：sourceStart 必须落在 [0, sourceDuration - newDuration]，右缘不越源。
        const sourceDurationMs = clip.sourceDurationMs;
        let sourceStartMs = original.sourceStartMs + (newStartMs - original.startMs);
        if (sourceDurationMs !== undefined) {
            sourceStartMs = Math.max(0, Math.min(Math.max(0, sourceDurationMs - newDurationMs), sourceStartMs));
        }
        const collision = canPlaceAt({
            trackId: clip.trackId,
            startMs: newStartMs,
            durationMs: newDurationMs,
            excludeClipId: clipId,
            clips: draft.clips,
        });
        if (!collision.ok) return;
        updateClip(clipId, {
            startMs: Math.round(newStartMs),
            durationMs: Math.round(newDurationMs),
            ...(clip.sourceStartMs !== undefined ? { sourceStartMs: Math.round(sourceStartMs) } : {}),
        });
    };

    const trimClipEnd = (clipId: string, deltaMs: number, original: { startMs: number; durationMs: number }) => {
        const clip = draft.clips.find((item) => item.id === clipId);
        if (!clip) return;
        const maxDurationMs = clip.sourceDurationMs !== undefined && clip.sourceStartMs !== undefined ? Math.max(0, clip.sourceDurationMs - clip.sourceStartMs) : undefined;
        const maxDuration = clampClipDurationByNeighbors({
            clipId,
            startMs: original.startMs,
            requestedDurationMs: original.durationMs + deltaMs,
            trackId: clip.trackId,
            clips: draft.clips,
            maxDurationMs,
        });
        const newDurationMs = Math.max(MIN_CLIP_DURATION_MS, maxDuration);
        updateClip(clipId, { durationMs: Math.round(newDurationMs) });
    };

    const handleClipPointerDown = (event: React.PointerEvent<HTMLDivElement>, clipId: string, mode: ClipDragMode) => {
        const clip = draft.clips.find((item) => item.id === clipId);
        if (!clip) return;
        event.preventDefault();
        event.stopPropagation();
        (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
        setSelectedClipId(clipId);
        if (mode === "move") {
            dragRef.current = { mode, clipId, startClientX: event.clientX, originalStartMs: clip.startMs };
        } else if (mode === "trim-start") {
            dragRef.current = {
                mode,
                clipId,
                startClientX: event.clientX,
                originalStartMs: clip.startMs,
                originalDurationMs: clip.durationMs,
                originalSourceStartMs: clip.sourceStartMs || 0,
            };
        } else {
            dragRef.current = { mode, clipId, startClientX: event.clientX, originalStartMs: clip.startMs, originalDurationMs: clip.durationMs };
        }
    };

    const handleClipPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
        const drag = dragRef.current;
        if (!drag) return;
        if (!event.isPrimary) return;
        const deltaMs = Math.round((event.clientX - drag.startClientX) / Math.max(pxPerMs, 1e-6));
        if (drag.mode === "move") {
            moveClip(drag.clipId, drag.originalStartMs + deltaMs);
        } else if (drag.mode === "trim-start") {
            trimClipStart(drag.clipId, deltaMs, {
                startMs: drag.originalStartMs,
                durationMs: drag.originalDurationMs,
                sourceStartMs: drag.originalSourceStartMs,
            });
        } else {
            trimClipEnd(drag.clipId, deltaMs, {
                startMs: drag.originalStartMs,
                durationMs: drag.originalDurationMs,
            });
        }
    };

    const handleClipPointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
        dragRef.current = null;
        try {
            (event.currentTarget as HTMLElement).releasePointerCapture(event.pointerId);
        } catch {
            // 指针已释放或未捕获时忽略
        }
    };

    const deleteSelectedClip = () => {
        if (!selectedClipId) {
            message.info(t("timelineSelectClip"));
            return;
        }
        applyDraft((current) => ({
            ...current,
            clips: current.clips.filter((clip) => clip.id !== selectedClipId),
        }));
        setSelectedClipId(null);
    };

    const removeClip = (clipId: string) => {
        applyDraft((current) => ({
            ...current,
            clips: current.clips.filter((clip) => clip.id !== clipId),
        }));
        if (selectedClipId === clipId) setSelectedClipId(null);
    };

    // 素材库可一次插入多份媒体：按选择顺序读取并放置，关闭弹窗取消整批未完成读取。
    const enqueueMediaAddition = (name: string, insert: (signal: AbortSignal) => Promise<void>) => {
        const batch = mediaAdditionRef.current;
        if (!batch || batch.controller.signal.aborted || savingRef.current || exportBusyRef.current || initializing || initializationError) return;
        batch.pending++;
        setAddingMedia(true);
        batch.queue = batch.queue
            .then(async () => {
                if (!batch.controller.signal.aborted) await insert(batch.controller.signal);
            })
            .catch(() => {
                if (!batch.controller.signal.aborted) message.error(t("timelineAddDurationFailed", { name }));
            })
            .finally(() => {
                batch.pending--;
                if (mediaAdditionRef.current === batch && !batch.controller.signal.aborted && !batch.pending) setAddingMedia(false);
            });
    };

    const addNodeToTimeline = (targetNode: CanvasNodeData) => {
        const kind = targetNode.type === "video" ? "video" : targetNode.type === "audio" ? "audio" : null;
        if (!kind) return;
        const trackId = kind === "video" ? DEFAULT_VIDEO_TRACK_ID : DEFAULT_AUDIO_TRACK_ID;
        const targetTrack = draft.tracks.find((track) => track.id === trackId);
        if (!targetTrack || targetTrack.locked) {
            message.warning(kind === "video" ? t("timelineVideoLocked") : t("timelineAudioLocked"));
            return;
        }
        enqueueMediaAddition(targetNode.title || t("timelineUnnamedMedia"), async (signal) => {
            const durationMs = await resolveTimelineSourceDurationMs(targetNode.metadata?.durationMs, async () => {
                const url = await resolveMediaUrl(targetNode.metadata?.storageKey, targetNode.metadata?.content || "");
                return probeMediaDurationUrlMs(url, kind, signal);
            });
            signal.throwIfAborted();
            const clip: TimelineClip = {
                id: `clip-${targetNode.id}-${Date.now()}`,
                kind,
                nodeId: targetNode.id,
                trackId,
                startMs: 0,
                durationMs,
                title: targetNode.title || (kind === "video" ? "视频片段" : "音频片段"),
                sourceStartMs: 0,
                sourceDurationMs: durationMs,
                ...(kind === "audio" ? { volume: 1, fadeInMs: 0, fadeOutMs: 0 } : {}),
            };
            applyDraft((current) => {
                const placement = findNearestAvailablePlacement({ targetStartMs: playheadMs, durationMs, trackId, clips: current.clips });
                const startMs = placement.fits ? placement.startMs : current.clips.filter((item) => item.trackId === trackId).reduce((max, item) => Math.max(max, item.startMs + item.durationMs), 0);
                return { ...current, clips: [...current.clips, { ...clip, startMs }] };
            });
            setSelectedClipId(clip.id);
            message.success(t("timelineAdded", { name: clip.title || t("timelineUnnamedMedia") }));
        });
    };

    // 把“添加节点”能力暴露给页面层（素材库/本地上传创建节点后回填到草稿）。
    useEffect(() => {
        if (!addNodeToTimelineRef) return;
        addNodeToTimelineRef.current = addNodeToTimeline;
        return () => {
            addNodeToTimelineRef.current = null;
        };
    }, [addNodeToTimeline, addNodeToTimelineRef]);

    // 直连媒体（仅时间线作用域，不落画布）：素材库/项目资产/本地上传直接入轨。
    const addDirectMediaToTimeline = (media: TimelineDirectMedia) => {
        const kind = media.kind === "video" ? "video" : media.kind === "audio" ? "audio" : null;
        if (!kind) {
            message.info(t("timelineDirectUnsupported"));
            return;
        }
        const trackId = kind === "video" ? DEFAULT_VIDEO_TRACK_ID : DEFAULT_AUDIO_TRACK_ID;
        const targetTrack = draft.tracks.find((track) => track.id === trackId);
        if (!targetTrack || targetTrack.locked) {
            message.warning(kind === "video" ? t("timelineVideoLocked") : t("timelineAudioLocked"));
            return;
        }
        enqueueMediaAddition(media.title || t("timelineUnnamedMedia"), async (signal) => {
            const durationMs = await resolveTimelineSourceDurationMs(media.durationMs, async () => {
                const url = await resolveMediaUrl(media.storageKey, media.dataUrl || media.url || media.content || "");
                return probeMediaDurationUrlMs(url, kind, signal);
            });
            signal.throwIfAborted();
            const clip: TimelineClip = {
                id: `clip-media-${media.id}-${Date.now()}`,
                kind,
                nodeId: `timeline-media-${media.id}-${Date.now()}`,
                trackId,
                startMs: 0,
                durationMs,
                title: media.title || (kind === "video" ? "视频片段" : "音频片段"),
                sourceStartMs: 0,
                sourceDurationMs: durationMs,
                directMedia: { ...media, durationMs },
                ...(kind === "audio" ? { volume: 1, fadeInMs: 0, fadeOutMs: 0 } : {}),
            };
            applyDraft((current) => {
                const placement = findNearestAvailablePlacement({ targetStartMs: playheadMs, durationMs, trackId, clips: current.clips });
                return { ...current, clips: [...current.clips, { ...clip, startMs: placement.startMs }] };
            });
            setSelectedClipId(clip.id);
            message.success(t("timelineAdded", { name: clip.title || t("timelineUnnamedMedia") }));
        });
    };

    // 把“直连媒体入轨”能力暴露给页面层（时间线作用域插入不重复落画布）。
    useEffect(() => {
        if (!addMediaToTimelineRef) return;
        addMediaToTimelineRef.current = addDirectMediaToTimeline;
        return () => {
            addMediaToTimelineRef.current = null;
        };
    }, [addDirectMediaToTimeline, addMediaToTimelineRef]);

    // 播放头处分割：把视频/音频片段切成两段，右段源内起点整体后移，保持源文件内容连续。
    const splitClipAtPlayhead = () => {
        const clip = draft.clips.find((item) => (item.kind === "video" || item.kind === "audio") && playheadMs > item.startMs && playheadMs < item.startMs + item.durationMs);
        if (!clip) {
            message.info(t("timelineSeekInside"));
            return;
        }
        const cutMs = playheadMs - clip.startMs;
        if (cutMs < MIN_CLIP_DURATION_MS || clip.durationMs - cutMs < MIN_CLIP_DURATION_MS) {
            message.warning(t("timelineSplitTooClose"));
            return;
        }
        const splitId = Date.now();
        const [left, right] = splitTimelineClip(clip, playheadMs, {
            left: `${clip.id}-left-${splitId}`,
            right: `${clip.id}-right-${splitId}`,
        });
        applyDraft((current) => ({ ...current, clips: [...current.clips.filter((item) => item.id !== clip.id), left, right] }));
        setSelectedClipId(left.id);
        message.success(t("timelineSplitDone"));
    };

    const handleLocalUpload = async (files: FileList | null) => {
        const list = files ? Array.from(files) : [];
        if (!list.length) return;
        if (!onUploadLocalFiles) {
            message.warning(t("timelineUploadUnavailable"));
            return;
        }
        const medias = await onUploadLocalFiles(list);
        for (const media of medias) addDirectMediaToTimeline(media);
    };

    const applySavedDraft = () => {
        if (node.metadata?.timelineComposition) {
            onSave(normalizeTimelineProject({ ...draft, updatedAt: new Date().toISOString() }));
            return;
        }
        // 互通修复：时间线草稿只在打开时初始化，期间节点字幕可能在字幕弹窗中被清空（或节点数据被外部更新）。
        // 保存前以节点当前字幕为准做定向校准：节点字幕已为空时，剔除草稿残留的旧字幕片段并回写空数组，
        // 避免「清空后重开视频节点旧字幕复活」；节点仍有字幕时保留草稿内用户的时间线编辑（拖动/删减/文本）。
        const clearedSubtitleNodeIds = new Set(nodes.filter((item) => (item.metadata?.subtitleEntries?.length ?? 0) === 0).map((item) => item.id));
        const base = normalizeTimelineProject({ ...draft, updatedAt: new Date().toISOString() });
        const reconciledClips = clearedSubtitleNodeIds.size ? base.clips.filter((clip) => !(clip.kind === "subtitle" && clearedSubtitleNodeIds.has(clip.nodeId))) : base.clips;
        const normalized = normalizeTimelineProject({ ...base, clips: reconciledClips });
        onSave(normalized);
        // 整合方向：时间线字幕片段与节点字幕互通。保存时按视频节点回写 subtitleEntries（含空数组）。
        // 回写集合 = 项目时间线原有字幕节点 ∪ 校准后仍有字幕片段的节点 ∪ 节点当前仍有字幕数据的节点：
        // 覆盖“首次打开时间线（项目尚无 timeline）时删除字幕片段”这类 timeline 为空导致的漏回写，
        // 保证删除全部字幕片段后节点字幕被同步清空，重开视频节点不再显示旧字幕。
        const previousSubtitleNodeIds = new Set((timeline?.clips || []).filter((clip) => clip.kind === "subtitle").map((clip) => clip.nodeId));
        const nextSubtitleNodeIds = new Set(normalized.clips.filter((clip) => clip.kind === "subtitle").map((clip) => clip.nodeId));
        const nodeSubtitleNodeIds = new Set(nodes.filter((item) => (item.metadata?.subtitleEntries?.length ?? 0) > 0).map((item) => item.id));
        const subtitleNodeIds = new Set([...previousSubtitleNodeIds, ...nextSubtitleNodeIds, ...nodeSubtitleNodeIds]);
        subtitleNodeIds.forEach((subNodeId) => {
            onSaveSubtitles(subNodeId, buildSubtitleEntriesForNode(subNodeId, normalized));
        });
    };

    const handleSave = async () => {
        if (savingRef.current || mediaAdditionRef.current?.pending) return;
        savingRef.current = true;
        setSaving(true);
        setPreviewPlaying(false);
        try {
            // 时间线和节点字幕先一起写入画布，再等待同一画布的持久化结果。
            applySavedDraft();
            if (await onPersist()) onClose();
        } catch (error) {
            message.error(error instanceof Error ? error.message : t("timelineSaveFailed"));
        } finally {
            savingRef.current = false;
            setSaving(false);
        }
    };

    // 片段源画面尺寸：画布节点记录的 naturalWidth/Height，直连媒体用上传时读取的宽高；未知时导出按补黑边处理。
    const clipFrameSize = (clip: TimelineClip) => {
        const sourceNode = nodes.find((item) => item.id === clip.nodeId);
        return { width: sourceNode?.metadata?.naturalWidth || clip.directMedia?.width, height: sourceNode?.metadata?.naturalHeight || clip.directMedia?.height };
    };
    const orderedVideoClips = getOrderedVideoClips(draft);
    const firstClipSize = orderedVideoClips[0] ? clipFrameSize(orderedVideoClips[0]) : null;
    const exportPresetOptions = timelineExportPresetOptions({ firstClipSize, dramaAspectRatio });
    const exportSize = resolveTimelineExportSize(exportPreset, { firstClipSize, dramaAspectRatio });
    const exportFitLabel = timelineFitModeLabel(summarizeTimelineFitModes(orderedVideoClips.map(clipFrameSize), exportSize));

    // 组装导出：把当前草稿按片段顺序合成一个 MP4（导出下载与生成新片段共用），所有片段统一到所选导出规格。
    const runExport = async (): Promise<TimelineExportResult> => {
        const hiddenTracks = new Set(draft.tracks.filter((track) => track.visible === false).map((track) => track.id));
        const mediaClips = draft.clips.filter((clip) => (clip.kind === "video" || clip.kind === "audio") && !hiddenTracks.has(clip.trackId));
        if (!mediaClips.length) throw new Error(t("exportEmpty"));
        const sources: TimelineRenderSource[] = [];
        for (const clip of mediaClips) {
            if (sources.some((source) => source.nodeId === clip.nodeId)) continue;
            const sourceNode = nodes.find((item) => item.id === clip.nodeId);
            const media = clip.directMedia;
            if (!sourceNode && !media) {
                if (node.metadata?.timelineComposition) throw new Error(t("timelineSourceMissing", { name: clip.title || clip.nodeId }));
                continue;
            }
            sources.push({
                nodeId: clip.nodeId,
                fileName: "input-" + sources.length + ".mp4",
                durationMs: clip.sourceDurationMs || clip.durationMs,
                storageKey: media?.storageKey || sourceNode?.metadata?.storageKey,
                url: media?.dataUrl || media?.url || sourceNode?.metadata?.content || undefined,
                ...clipFrameSize(clip),
            });
        }
        if (!sources.length) throw new Error(t("timelineNoExportSources"));
        setExporting(true);
        setExportPercent(0);
        setExportDetail(t("exportPreparing"));
        try {
            return await exportTimelineToMp4(normalizeTimelineProject(draft), sources, {
                context: { width: exportSize.width, height: exportSize.height, fps: EXPORT_FPS },
                locale,
                onProgress: ({ percent, detail }) => {
                    setExportPercent(percent);
                    setExportDetail(detail);
                },
            });
        } finally {
            setExporting(false);
            setExportPercent(0);
            setExportDetail("");
        }
    };

    // 降级导出（字幕未烧录、元数据未写入）必须明确告知；字幕未烧录时提供 SRT 单独下载。
    const reportExportResult = (result: TimelineExportResult, srt: string, baseName: string, successText: string) => {
        const subtitlesMissing = Boolean(srt) && !result.subtitlesBurned;
        if (!result.warnings.length && !subtitlesMissing) {
            message.success(successText);
            return;
        }
        const details = result.warnings.length ? result.warnings.join("；") : "成片未包含字幕";
        message.warning({
            duration: 10,
            content: (
                <span className="inline-flex flex-wrap items-center gap-x-2">
                    <span>
                        {successText}。{details}
                    </span>
                    {subtitlesMissing ? (
                        <Button size="small" type="link" onClick={() => saveAs(new Blob([srt], { type: "application/x-subrip;charset=utf-8" }), baseName + ".srt")}>
                            下载 SRT
                        </Button>
                    ) : null}
                </span>
            ),
        });
    };

    const handleExport = async () => {
        try {
            const srt = buildSubtitleSrt(getOrderedSubtitleClips(draft));
            const baseName = node.title || "成片";
            const result = await runExport();
            saveAs(result.blob, baseName + ".mp4");
            reportExportResult(result, srt, baseName, "成片导出完成");
        } catch (error) {
            message.error(error instanceof Error ? error.message : t("exportFailed"));
        }
    };

    const handleRemoteExport = async () => {
        if (!projectId || exporting || exportBusyRef.current || mediaAdditionRef.current?.pending) return;
        exportBusyRef.current = true;
        setExporting(true);
        setRemoteResult(null);
        setExportPercent(0);
        setExportDetail(t("exportSubmitting"));
        try {
            const timeline = prepareCanvasTimelineRender(normalizeTimelineProject(draft), nodes, locale);
            const task = await createTimelineRenderTask({ projectId, timeline });
            const done = await waitForGenerationTask(task.id, {
                timeoutMs: 62 * 60 * 1000,
                intervalMs: 3000,
                onTaskUpdate: (task) => {
                    setExportPercent(task.progress ?? 0);
                    setExportDetail(task.stage || t("exportRendering"));
                },
            });
            const result = JSON.parse(done.resultJson ?? "{}") as TimelineRenderResult;
            if (!result.resourceId) throw new Error(t("exportNoResult"));
            setRemoteResult(result);
            message.success(t("exportRemoteComplete", { name: result.fileName ?? "timeline.mp4" }));
        } catch (error) {
            message.error(error instanceof Error ? error.message : t("exportRemoteFailed"));
        } finally {
            exportBusyRef.current = false;
            setExporting(false);
        }
    };

    // 组装能力闭环：合成结果不落地下载，而是作为新视频节点放回画布，可继续编辑字幕与样式。
    const handleCreateAssembledNode = async () => {
        if (!onCreateAssembledNode) {
            message.warning(t("timelineCanvasSaveUnavailable"));
            return;
        }
        try {
            const srt = buildSubtitleSrt(getOrderedSubtitleClips(draft));
            const baseName = node.title || "成片";
            const result = await runExport();
            const subtitlesMissing = Boolean(srt) && !result.subtitlesBurned;
            const created = await onCreateAssembledNode(result.blob, baseName + "-新片段" + (subtitlesMissing ? "（无字幕）" : ""));
            if (created) reportExportResult(result, srt, baseName, "已生成新视频片段并放到画布，可继续编辑字幕与样式");
        } catch (error) {
            message.error(error instanceof Error ? error.message : t("timelineAssembleFailed"));
        }
    };

    const addableNodes = nodes.filter((item) => (item.type === "video" || item.type === "audio") && Boolean(item.metadata?.content || item.metadata?.storageKey) && !isNodeInTimeline(item.id, draft));

    const selectedSubtitleClip = selectedClipId ? draft.clips.find((clip) => clip.id === selectedClipId && clip.kind === "subtitle") || null : null;
    const selectedMediaClip = selectedClipId ? draft.clips.find((clip) => clip.id === selectedClipId && (clip.kind === "video" || clip.kind === "audio")) || null : null;
    const selectedMediaRightEdgeMs = selectedMediaClip ? selectedMediaClip.startMs + selectedMediaClip.durationMs : 0;
    const selectedMediaMinStartMs = selectedMediaClip ? (selectedMediaClip.sourceStartMs ? Math.max(0, selectedMediaClip.startMs - selectedMediaClip.sourceStartMs) : 0) : 0;
    const selectedMediaMaxStartMs = selectedMediaClip ? Math.max(selectedMediaMinStartMs, selectedMediaRightEdgeMs - MIN_CLIP_DURATION_MS) : 0;
    const selectedMediaSourceDurationMs = selectedMediaClip?.sourceDurationMs;
    const selectedMediaMaxDurationMs = selectedMediaSourceDurationMs !== undefined ? Math.max(MIN_CLIP_DURATION_MS, selectedMediaSourceDurationMs) : 3_600_000;
    const selectedMediaMaxSourceStartMs = selectedMediaSourceDurationMs !== undefined ? Math.max(0, selectedMediaSourceDurationMs - (selectedMediaClip?.durationMs || 0)) : 3_600_000;
    const hasMediaClips = draft.clips.some((clip) => (clip.kind === "video" || clip.kind === "audio") && draft.tracks.some((track) => track.id === clip.trackId && track.visible !== false));

    // 时间线全局时间 → 视频节点本地时间：以该节点视频片段起点为 0 基准重建 SrtEntry。
    // source 传保存时校准后的时间线（normalized）：节点字幕已清空时直接回写空数组，
    // 避免草稿残留的旧字幕片段把节点上已清空的字幕重新写回。
    const buildSubtitleEntriesForNode = (subNodeId: string, source: TimelineProject = draft): SrtEntry[] => {
        const currentNode = nodes.find((item) => item.id === subNodeId);
        if ((currentNode?.metadata?.subtitleEntries?.length ?? 0) === 0) return [];
        return timelineSubtitleEntries(source, subNodeId);
    };

    const trackLabel = (trackId: string) => draft.tracks.find((track) => track.id === trackId)?.label || trackId;
    const renderTrackRow = (trackId: string, label: string) => {
        const clips = draft.clips.filter((clip) => clip.trackId === trackId).sort((a, b) => a.startMs - b.startMs);
        return (
            <div key={trackId} className="relative border-b" style={{ height: TRACK_ROW_HEIGHT, borderColor: theme.timeline.trackBorder, background: theme.timeline.trackFill }}>
                {clips.map((clip) => {
                    const isSelected = clip.id === selectedClipId;
                    const left = Math.round(clip.startMs * pxPerMs);
                    const width = Math.max(8, Math.round(clip.durationMs * pxPerMs));
                    const isSubtitle = clip.kind === "subtitle";
                    const clipFill = isSubtitle ? theme.timeline.clipSubtitle : clip.kind === "audio" ? theme.timeline.clipAudio : theme.timeline.clipVideo;
                    return (
                        <div
                            key={clip.id}
                            className={`absolute top-1 flex h-[calc(100%-8px)] cursor-grab touch-none select-none items-center overflow-hidden rounded-md border text-xs leading-none active:cursor-grabbing`}
                            style={{
                                left,
                                width,
                                background: isSelected ? theme.accent.primary : clipFill,
                                borderColor: isSelected ? theme.timeline.clipSelectedBorder : theme.timeline.trackBorder,
                                color: isSelected ? theme.accent.onPrimary : theme.node.text,
                            }}
                            onPointerDown={(event) => handleClipPointerDown(event, clip.id, "move")}
                            onPointerMove={handleClipPointerMove}
                            onPointerUp={handleClipPointerUp}
                            onPointerCancel={handleClipPointerUp}
                            onClick={(event) => event.stopPropagation()}
                            title={`${clip.title || label} · ${formatTimelineTime(clip.startMs)}~${formatTimelineTime(clip.startMs + clip.durationMs)}`}
                        >
                            {!isSubtitle ? (
                                <div
                                    className="absolute bottom-0 left-0 top-0 w-2 cursor-ew-resize opacity-0 hover:opacity-100"
                                    style={{ background: theme.timeline.handle }}
                                    onPointerDown={(event) => handleClipPointerDown(event, clip.id, "trim-start")}
                                />
                            ) : null}
                            <span className="pointer-events-none min-w-0 flex-1 truncate px-2">{clip.title || trackLabel(clip.trackId)}</span>
                            {!isSubtitle ? (
                                <div className="absolute bottom-0 right-0 top-0 w-2 cursor-ew-resize opacity-0 hover:opacity-100" style={{ background: theme.timeline.handle }} onPointerDown={(event) => handleClipPointerDown(event, clip.id, "trim-end")} />
                            ) : null}
                        </div>
                    );
                })}
                <div className="pointer-events-none absolute inset-y-0" style={{ left: Math.round(playheadMs * pxPerMs), width: 2, background: theme.timeline.playhead }} />
            </div>
        );
    };

    const triggerHasMedia = (node.type === "video" || node.type === "audio") && Boolean(node.metadata?.content || node.metadata?.storageKey);
    const triggerHasVideo = triggerHasMedia && node.type === "video";
    const selectionVideoCount = countTimelineSelectionVideos(nodes, selectedNodeIds);
    const referenceVideoCount = nodes.filter((item) => isReferenceVideoNode(item) && Boolean(item.metadata?.content || item.metadata?.storageKey)).length;
    const scopeOptions = [
        { value: "current" as const, label: "当前视频", disabled: !triggerHasMedia },
        ...(selectionVideoCount > 1 ? [{ value: "selection" as const, label: `选中视频（${selectionVideoCount}）` }] : []),
        { value: "canvas" as const, label: "整个画布", title: referenceVideoCount ? "默认不含预演台白膜/深度参考视频" : undefined },
    ];
    const sourceSummary = formatTimelineSourceSummary(SOURCE_LABELS[source], summarizeTimelineSource(draft));

    const title = (
        <div className="flex min-w-0 items-center gap-3 pr-10">
            <span className="grid size-8 shrink-0 place-items-center rounded-lg" style={{ background: theme.accent.primarySoft, color: theme.accent.primary }}>
                <Clapperboard className="size-4" />
            </span>
            <div className="min-w-0 flex-1">
                <div className="truncate text-[var(--fs-heading-lg)] font-semibold leading-6 tracking-[-0.02em]">{t("timelineTitle")}</div>
                <div className="truncate text-xs tabular-nums opacity-55">{sourceSummary}</div>
            </div>
            {source !== "saved" ? (
                <div className="flex shrink-0 items-center gap-3 text-xs font-normal">
                    {source === "canvas" && referenceVideoCount ? (
                        <Checkbox size="sm" checked={includeReferenceVideos} onChange={(event) => void rebuildFromScope("canvas", event.target.checked)}>
                            含白膜/深度参考（{referenceVideoCount}）
                        </Checkbox>
                    ) : null}
                    <SegmentedControl
                        size="sm"
                        ariaLabel="时间线来源"
                        value={source}
                        options={scopeOptions}
                        onChange={(value) => {
                            if (value !== source) void rebuildFromScope(value, value === "canvas" ? includeReferenceVideos : false);
                        }}
                    />
                </div>
            ) : null}
        </div>
    );

    return (
        <AppModal
            className="canvas-timeline-dialog"
            title={title}
            open={open}
            centered
            footer={null}
            width={1160}
            destroyOnHidden
            onCancel={() => {
                if (!savingRef.current && !exporting) onClose();
            }}
            closable={!saving}
            keyboard={!saving}
            afterOpenChange={(visible) => {
                if (visible) ensureToolbarObserved();
            }}
            flush
        >
            {initializing || addingMedia ? (
                <p role="status" className="px-4 py-2">
                    {t("timelineReadingDurations")}
                </p>
            ) : null}
            {initializationError ? (
                <p role="alert" className="px-4 py-2">
                    {t("timelineDurationFailed")} {initializationError}
                </p>
            ) : null}
            <div inert={saving || initializing || addingMedia} aria-busy={saving || initializing || addingMedia} className="flex h-[min(76vh,760px)] min-h-[420px] flex-col text-sm" style={{ color: theme.node.text }}>
                <div ref={toolbarRef} className="relative flex shrink-0 flex-wrap items-center gap-2 border-b px-4 py-3" style={{ borderColor: theme.toolbar.border, background: theme.toolbar.panel }}>
                    <span className="min-w-24 rounded-md border px-2 py-1 text-xs font-semibold tabular-nums" style={{ borderColor: theme.toolbar.border, background: theme.node.fill, color: theme.accent.primary }}>
                        {formatTimelineTime(playheadMs)}
                    </span>
                    <Tooltip title={t(snapEnabled ? "timelineDisableSnap" : "timelineEnableSnap")}>
                        <Button size="small" aria-pressed={snapEnabled} icon={<Scissors className="size-3.5" />} onClick={() => setSnapEnabled((value) => !value)}>
                            {t(snapEnabled ? "timelineSnapOn" : "timelineSnapOff")}
                        </Button>
                    </Tooltip>
                    <Button size="small" aria-label={t("timelineZoomOut")} icon={<ZoomOut className="size-3.5" />} onClick={() => setZoomLevel((value) => zoomOut(value))} />
                    <Button size="small" aria-label={t("timelineZoomIn")} icon={<ZoomIn className="size-3.5" />} onClick={() => setZoomLevel((value) => zoomIn(value))} />
                    <Button size="small" icon={<Maximize2 className="size-3.5" />} onClick={() => setZoomLevel(getFitTimelineZoom(durationMs, viewportWidth))}>
                        {t("timelineFit")}
                    </Button>
                    {addGroupCollapsed ? (
                        <Dropdown
                            trigger={["click"]}
                            placement="bottomLeft"
                            menu={{
                                items: [
                                    ...(addableNodes.length
                                        ? [
                                              {
                                                  key: "add",
                                                  label: t("timelineAddMedia"),
                                                  icon: <Plus className="size-3.5" />,
                                                  children: addableNodes.map((item) => ({
                                                      key: item.id,
                                                      label: (
                                                          <span className="inline-flex max-w-56 items-center gap-2 truncate">
                                                              {item.type === "video" ? <Video className="size-3.5" /> : <Music2 className="size-3.5" />}
                                                              {item.title || t("timelineUnnamedMedia")}
                                                          </span>
                                                      ),
                                                      onClick: () => addNodeToTimeline(item),
                                                  })),
                                              },
                                          ]
                                        : []),
                                    { key: "upload", label: t("timelineUpload"), icon: <Upload className="size-3.5" />, onClick: () => uploadInputRef.current?.click() },
                                    { key: "library", label: t("timelineLibrary"), icon: <Library className="size-3.5" />, disabled: !onOpenAssetLibrary, onClick: () => onOpenAssetLibrary?.() },
                                    { key: "assets", label: t("timelineProjectAssets"), icon: <FolderOpen className="size-3.5" />, disabled: !onOpenProjectAssets, onClick: () => onOpenProjectAssets?.() },
                                ],
                            }}
                        >
                            <span ref={moreBtnRef}>
                                <Button size="small" icon={<MoreHorizontal className="size-3.5" />}>
                                    {t("timelineMore")}
                                </Button>
                            </span>
                        </Dropdown>
                    ) : (
                        <>
                            <Dropdown
                                trigger={["click"]}
                                placement="bottomLeft"
                                disabled={!addableNodes.length}
                                menu={{
                                    items: addableNodes.map((item) => ({
                                        key: item.id,
                                        label: (
                                            <span className="inline-flex max-w-56 items-center gap-2 truncate">
                                                {item.type === "video" ? <Video className="size-3.5" /> : <Music2 className="size-3.5" />}
                                                {item.title || t("timelineUnnamedMedia")}
                                            </span>
                                        ),
                                        onClick: () => addNodeToTimeline(item),
                                    })),
                                }}
                            >
                                <Button size="small" icon={<Plus className="size-3.5" />} disabled={!addableNodes.length}>
                                    {t("timelineAddMedia")}
                                </Button>
                            </Dropdown>
                            <Button size="small" icon={<Upload className="size-3.5" />} onClick={() => uploadInputRef.current?.click()}>
                                {t("timelineUpload")}
                            </Button>
                            <Button size="small" icon={<Library className="size-3.5" />} disabled={!onOpenAssetLibrary} onClick={() => onOpenAssetLibrary?.()}>
                                {t("timelineLibrary")}
                            </Button>
                            <Button size="small" icon={<FolderOpen className="size-3.5" />} disabled={!onOpenProjectAssets} onClick={() => onOpenProjectAssets?.()}>
                                {t("timelineProjectAssets")}
                            </Button>
                        </>
                    )}
                    <div ref={addGroupProbeRef} aria-hidden="true" className="invisible pointer-events-none absolute left-0 top-0 flex items-center gap-2">
                        <Dropdown trigger={["click"]} placement="bottomLeft" disabled={!addableNodes.length} menu={{ items: [] }}>
                            <Button size="small" icon={<Plus className="size-3.5" />}>
                                {t("timelineAddMedia")}
                            </Button>
                        </Dropdown>
                        <Button size="small" icon={<Upload className="size-3.5" />}>
                            {t("timelineUpload")}
                        </Button>
                        <Button size="small" icon={<Library className="size-3.5" />}>
                            {t("timelineLibrary")}
                        </Button>
                        <Button size="small" icon={<FolderOpen className="size-3.5" />}>
                            {t("timelineProjectAssets")}
                        </Button>
                    </div>
                    <input
                        ref={uploadInputRef}
                        type="file"
                        accept="video/*,audio/mpeg,audio/wav,audio/x-wav,.mp3,.wav"
                        multiple
                        className="hidden"
                        onChange={(event) => {
                            void handleLocalUpload(event.target.files);
                            event.target.value = "";
                        }}
                    />
                    <Button size="small" icon={<Scissors className="size-3.5" />} onClick={splitClipAtPlayhead}>
                        {t("timelineSplit")}
                    </Button>
                    <div className="ml-auto flex flex-wrap items-center gap-2">
                        {projectId ? (
                            <Button size="small" disabled={!hasMediaClips || exporting || saving || addingMedia} onClick={() => void handleRemoteExport()}>
                                {t("exportServerButton")}
                            </Button>
                        ) : null}
                        <Button size="small" type="primary" icon={<Clapperboard className="size-3.5" />} loading={exporting} disabled={!hasMediaClips || exporting || addingMedia} onClick={() => void handleExport()}>
                            {t("timelineExport")}
                        </Button>
                        <Button size="small" icon={<Wand2 className="size-3.5" />} loading={exporting} disabled={!hasMediaClips || exporting || addingMedia} onClick={() => void handleCreateAssembledNode()}>
                            {t("timelineAssemble")}
                        </Button>
                        <Button size="small" danger icon={<Trash2 className="size-3.5" />} disabled={!selectedClipId} onClick={deleteSelectedClip}>
                            {t("timelineDeleteClip")}
                        </Button>
                        <Button size="small" disabled={!draft.clips.length || exporting} onClick={onClose}>
                            {t("timelineCancel")}
                        </Button>
                        <Button size="small" type="primary" loading={saving} disabled={exporting || initializing || addingMedia || Boolean(initializationError)} onClick={handleSave}>
                            {t("timelineSave")}
                        </Button>
                    </div>
                </div>

                {source === "saved" ? (
                    <div className="flex items-center gap-3 border-b px-4 py-2 text-xs" style={{ borderColor: theme.toolbar.border, background: theme.accent.primarySoft }}>
                        <span className="min-w-0 flex-1 truncate">正在编辑项目里已保存的时间线，画布上新增的视频不会自动加入。</span>
                        {triggerHasVideo ? (
                            <Button size="small" icon={<Video className="size-3.5" />} onClick={() => void startFromCurrentVideo()}>
                                从当前视频新建时间线
                            </Button>
                        ) : null}
                    </div>
                ) : null}

                <CanvasTimelinePreview
                    clips={draft.clips}
                    tracks={draft.tracks}
                    durationMs={durationMs}
                    nodes={nodes}
                    playheadMs={playheadMs}
                    seekRevision={previewSeekRevision}
                    playing={previewPlaying}
                    theme={theme}
                    onTogglePlay={() => setPreviewPlaying((value) => !value)}
                    onPlayheadChange={setPlayheadMs}
                />

                <div className="flex min-h-0 flex-1">
                    <div className="flex w-44 shrink-0 flex-col border-r" style={{ borderColor: theme.toolbar.border, background: theme.toolbar.panel }}>
                        <div className="shrink-0 border-b" style={{ height: 32, borderColor: theme.toolbar.border }} />
                        {draft.tracks
                            .slice()
                            .sort((a, b) => a.order - b.order)
                            .map((track) => (
                                <div key={track.id} className="flex items-center gap-2 border-b px-3" style={{ height: TRACK_ROW_HEIGHT, borderColor: theme.toolbar.border }}>
                                    <span className="grid size-6 shrink-0 place-items-center rounded-md text-xs font-semibold" style={{ background: theme.accent.primarySoft, color: theme.accent.primary }}>
                                        {track.kind === "video" ? "V" : track.kind === "audio" ? "A" : "S"}
                                    </span>
                                    <span className="min-w-0 flex-1 truncate text-xs">{track.label}</span>
                                    {track.locked ? <Lock className="size-3 opacity-40" /> : <LockOpen className="size-3 opacity-40" />}
                                </div>
                            ))}
                    </div>

                    <div ref={trackAreaRef} className="thin-scrollbar min-w-0 flex-1 overflow-auto" data-canvas-no-zoom>
                        <div ref={scrollRef} style={{ width: trackWidth }} className="min-h-full">
                            <CanvasTimelineRuler
                                pxPerMs={pxPerMs}
                                durationMs={durationMs}
                                playheadMs={playheadMs}
                                width={trackWidth}
                                theme={theme}
                                onSeek={(ms) => {
                                    setPreviewPlaying(false);
                                    setPlayheadMs(ms);
                                    setPreviewSeekRevision((value) => value + 1);
                                }}
                            />
                            {draft.tracks
                                .slice()
                                .sort((a, b) => a.order - b.order)
                                .map((track) => renderTrackRow(track.id, track.label))}
                        </div>
                    </div>
                </div>

                {exporting ? (
                    <div className="border-t px-4 py-2" style={{ borderColor: theme.toolbar.border, background: theme.toolbar.panel }}>
                        <Progress percent={exportPercent} size="small" format={() => exportDetail} />
                    </div>
                ) : null}

                {remoteResult ? (
                    <div className="border-t px-4 py-2 text-xs" style={{ borderColor: theme.toolbar.border, background: theme.toolbar.panel }}>
                        {remoteResult.subtitleSrt ? <p>{t("exportSubtitleSidecar")}</p> : null}
                        <a href={resourceFileUrl(remoteResult.resourceId)} download={remoteResult.fileName ?? "timeline.mp4"}>
                            {t("exportDownload")} MP4
                        </a>
                        {remoteResult.subtitleSrt ? (
                            <a className="ml-4" href={`data:application/x-subrip;charset=utf-8,${encodeURIComponent(remoteResult.subtitleSrt)}`} download={`${(remoteResult.fileName ?? "timeline.mp4").replace(/\.[^.]+$/, "")}.srt`}>
                                {t("exportDownloadSubtitles")}
                            </a>
                        ) : null}
                    </div>
                ) : null}

                {selectedSubtitleClip ? (
                    <div className="border-t px-4 py-2.5" style={{ borderColor: theme.toolbar.border, background: theme.toolbar.panel }}>
                        <div className="mb-1.5 flex items-center gap-2 text-xs">
                            <span className="font-semibold" style={{ color: theme.accent.primary }}>
                                {t("timelineSubtitleEdit")}
                            </span>
                            <span className="opacity-45">{t("timelineSubtitleSync")}</span>
                            {onOpenSubtitleDialog ? (
                                <Button size="small" className="ml-auto" icon={<Captions className="size-3.5" />} onClick={() => onOpenSubtitleDialog(selectedSubtitleClip.nodeId)}>
                                    {t("timelineSubtitleDetails")}
                                </Button>
                            ) : null}
                        </div>
                        <div className="flex items-start gap-3">
                            <Input.TextArea
                                autoSize={{ minRows: 1, maxRows: 3 }}
                                value={selectedSubtitleClip.text || ""}
                                placeholder={t("timelineSubtitleText")}
                                className="flex-1"
                                onChange={(event) => updateClip(selectedSubtitleClip.id, { text: event.target.value })}
                            />
                            <div className="flex shrink-0 items-center gap-1.5 text-xs">
                                <InputNumber size="small" min={0} step={100} value={selectedSubtitleClip.startMs} onChange={(startMs) => updateClip(selectedSubtitleClip.id, { startMs: startMs ?? 0 })} className="w-28" />
                                <span className="opacity-40">→</span>
                                <InputNumber
                                    size="small"
                                    min={0}
                                    step={100}
                                    value={selectedSubtitleClip.startMs + selectedSubtitleClip.durationMs}
                                    onChange={(endMs) => updateClip(selectedSubtitleClip.id, { durationMs: Math.max(MIN_CLIP_DURATION_MS, (endMs ?? 0) - selectedSubtitleClip.startMs) })}
                                    className="w-28"
                                />
                                <span className="opacity-40">{t("timelineMilliseconds")}</span>
                            </div>
                        </div>
                    </div>
                ) : null}

                {selectedMediaClip ? (
                    <div className="border-t px-4 py-2.5" style={{ borderColor: theme.toolbar.border, background: theme.toolbar.panel }}>
                        <div className="mb-1.5 flex items-center gap-2 text-xs">
                            <span className="font-semibold" style={{ color: theme.accent.primary }}>
                                {t("timelineClipEdit")}
                            </span>
                            <span className="min-w-0 flex-1 truncate opacity-45">{selectedMediaClip.title || trackLabel(selectedMediaClip.trackId)}</span>
                            <Button size="small" icon={<Scissors className="size-3.5" />} onClick={splitClipAtPlayhead}>
                                {t("timelineSplitAtPlayhead")}
                            </Button>
                        </div>
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-xs">
                            <span className="opacity-50">{t("timelineStart")}</span>
                            <InputNumber
                                size="small"
                                min={selectedMediaMinStartMs}
                                max={selectedMediaMaxStartMs}
                                step={100}
                                className="w-28"
                                value={selectedMediaClip.startMs}
                                onChange={(value) => updateSelectedMediaNumbers({ startMs: Math.max(selectedMediaMinStartMs, Math.min(selectedMediaMaxStartMs, value ?? selectedMediaClip.startMs)) })}
                            />
                            <span className="opacity-50">{t("timelineDuration")}</span>
                            <InputNumber
                                size="small"
                                min={MIN_CLIP_DURATION_MS}
                                max={selectedMediaMaxDurationMs}
                                step={100}
                                className="w-28"
                                value={selectedMediaClip.durationMs}
                                onChange={(value) => updateSelectedMediaNumbers({ durationMs: Math.max(MIN_CLIP_DURATION_MS, Math.min(selectedMediaMaxDurationMs, value ?? selectedMediaClip.durationMs)) })}
                            />
                            <span className="opacity-50">{t("timelineSourceStart")}</span>
                            <InputNumber
                                size="small"
                                min={0}
                                max={selectedMediaMaxSourceStartMs}
                                step={100}
                                className="w-28"
                                value={selectedMediaClip.sourceStartMs ?? 0}
                                onChange={(value) => updateSelectedMediaNumbers({ sourceStartMs: Math.max(0, Math.min(selectedMediaMaxSourceStartMs, value ?? (selectedMediaClip.sourceStartMs || 0))) })}
                            />
                            <span className="opacity-50">{t("timelineSourceEnd")}</span>
                            <span className="tabular-nums" style={{ color: theme.accent.primary }}>
                                {formatTimelineTime((selectedMediaClip.sourceStartMs || 0) + selectedMediaClip.durationMs)}
                            </span>
                            <span className="ml-auto hidden opacity-45 sm:inline">{t("timelineTrimHint")}</span>
                        </div>
                    </div>
                ) : null}

                <div className="flex items-center gap-3 border-t px-4 py-2" style={{ borderColor: theme.toolbar.border, background: theme.toolbar.panel }}>
                    <span className="shrink-0 text-xs opacity-60">
                        总时长 {formatTimelineTime(durationMs)} · {draft.clips.length} 个片段 · {draft.tracks.length} 条轨道
                    </span>
                    <span className="shrink-0 text-xs opacity-60">导出规格</span>
                    <Select
                        size="sm"
                        className="w-60 shrink-0"
                        ariaLabel="导出规格"
                        value={exportPreset}
                        disabled={exporting}
                        options={exportPresetOptions.map((option) => ({ value: option.value, label: option.label }))}
                        onChange={(value: TimelineExportPreset) => setExportPreset(value)}
                    />
                    {exportFitLabel ? (
                        <Tooltip title="画面比例与导出规格相差不超过 3% 时裁切填满，否则等比缩放并补黑边">
                            <span className="shrink-0 text-xs opacity-60">{exportFitLabel}</span>
                        </Tooltip>
                    ) : null}
                    <span className="ml-auto min-w-0 truncate text-xs opacity-45">拖拽片段移动，左右边缘裁剪，字幕片段来自视频节点的字幕数据</span>
                </div>
            </div>
        </AppModal>
    );
}
