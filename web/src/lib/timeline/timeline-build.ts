// 从画布节点构建时间线数据：视频/音频节点自动入轨，字幕条目转成字幕片段。
// 构建是单向快照：时间线保存后用户可自由拖拽，重新构建不覆盖已有时间线。

import type { CanvasNodeData } from "@/types/canvas";
import type { SrtEntry, TimelineClip, TimelineProject } from "@/types/timeline";
import { DEFAULT_AUDIO_TRACK_ID, DEFAULT_SUBTITLE_TRACK_ID, DEFAULT_VIDEO_TRACK_ID, createDefaultTracks } from "./timeline-tracks";
import { getTimelineVisualEndMs } from "./timeline-view";

function nodeDurationMs(node: CanvasNodeData, fallbackMs = 4_000): number {
    const durationMs = node.metadata?.durationMs;
    return durationMs && durationMs > 0 ? Math.round(durationMs) : fallbackMs;
}

/** 入轨必须有可确认的源时长；既有明确时长不重复读取媒体。 */
export async function resolveTimelineSourceDurationMs(
    durationMs: number | undefined,
    measureDuration: () => Promise<number | undefined>,
): Promise<number> {
    const resolved = Number.isFinite(durationMs) && Math.round(durationMs!) > 0
        ? durationMs : await measureDuration();
    if (!Number.isFinite(resolved) || Math.round(resolved!) <= 0) {
        throw new Error("无法读取媒体时长");
    }
    return Math.round(resolved!);
}

/** 首次入轨前只补足缺失时长；源节点和已保存的剪辑始终由调用方保留。 */
export async function buildTimelineFromNodesWithDurations(
    nodes: CanvasNodeData[],
    measureDuration: (node: CanvasNodeData) => Promise<number | undefined>,
    options: { prefixReferenceTitles?: boolean } = {},
): Promise<TimelineProject> {
    const resolved = [...nodes];
    const missing = nodes.flatMap((node, index) => {
        const duration = node.metadata?.durationMs;
        return (node.type === "video" || node.type === "audio")
            && Boolean(node.metadata?.content || node.metadata?.storageKey)
            && !(Number.isFinite(duration) && Math.round(duration!) > 0) ? [index] : [];
    });
    for (let start = 0; start < missing.length; start += 3) {
        await Promise.all(missing.slice(start, start + 3).map(async index => {
            const node = nodes[index];
            const durationMs = await resolveTimelineSourceDurationMs(node.metadata?.durationMs, () => measureDuration(node));
            resolved[index] = { ...node, metadata: { ...node.metadata, durationMs } };
        }));
    }
    return buildTimelineFromNodes(resolved, options);
}

function hasTimelineMedia(node: CanvasNodeData): boolean {
    return (node.type === "video" || node.type === "audio") && Boolean(node.metadata?.content || node.metadata?.storageKey);
}

/** 时间线草稿的来源范围：触发节点 / 画布多选 / 整个画布。 */
export type TimelineBuildScope = "current" | "selection" | "canvas";

export type TimelineScopeOptions = {
    scope: TimelineBuildScope;
    triggerNodeId: string;
    selectedNodeIds?: Iterable<string>;
    /** 整个画布范围是否带上预演台产出的参考视频（白膜/深度），默认不带 */
    includeReferenceVideos?: boolean;
};

/** 预演台产出的白膜/深度参考视频：用于给生成模型做参考，不是成片素材。 */
export function isReferenceVideoNode(node: CanvasNodeData): boolean {
    return node.type === "video" && node.metadata?.workflowKind === "reference_video";
}

export function referenceVideoTitlePrefix(node: CanvasNodeData): string {
    if (!isReferenceVideoNode(node)) return "";
    const tags = node.metadata?.assetTags || [];
    if (tags.includes("预演台深度")) return "深度参考";
    if (tags.includes("预演台白膜")) return "白膜参考";
    return "参考视频";
}

function byCanvasPosition(left: CanvasNodeData, right: CanvasNodeData): number {
    return left.position.x - right.position.x || left.position.y - right.position.y;
}

/** 选中节点里可入轨的视频数量；多于 1 个时才提供「选中视频」范围。 */
export function countTimelineSelectionVideos(nodes: CanvasNodeData[], selectedNodeIds: Iterable<string> | undefined): number {
    const selected = new Set(selectedNodeIds || []);
    return nodes.filter((node) => node.type === "video" && selected.has(node.id) && hasTimelineMedia(node)).length;
}

/** 按来源范围挑出要入轨的节点（已排好顺序）。 */
export function selectTimelineScopeNodes(nodes: CanvasNodeData[], options: TimelineScopeOptions): CanvasNodeData[] {
    if (options.scope === "current") return nodes.filter((node) => node.id === options.triggerNodeId && hasTimelineMedia(node));
    if (options.scope === "selection") {
        const selected = new Set(options.selectedNodeIds || []);
        return nodes.filter((node) => selected.has(node.id) && hasTimelineMedia(node)).sort(byCanvasPosition);
    }
    return nodes.filter((node) => hasTimelineMedia(node) && (options.includeReferenceVideos || !isReferenceVideoNode(node)));
}

export function buildTimelineForScope(nodes: CanvasNodeData[], options: TimelineScopeOptions): TimelineProject {
    return buildTimelineFromNodes(selectTimelineScopeNodes(nodes, options), { prefixReferenceTitles: options.scope !== "current" });
}

export type TimelineSourceSummary = { videoCount: number; durationMs: number; subtitleCount: number };

export function summarizeTimelineSource(timeline: TimelineProject): TimelineSourceSummary {
    return {
        videoCount: timeline.clips.filter((clip) => clip.kind === "video").length,
        durationMs: getTimelineVisualEndMs(timeline.clips),
        subtitleCount: timeline.clips.filter((clip) => clip.kind === "subtitle").length,
    };
}

/** 「来源：当前视频 · 1 段 · 3.0s · 字幕 0 条」 */
export function formatTimelineSourceSummary(sourceLabel: string, summary: TimelineSourceSummary): string {
    return `来源：${sourceLabel} · ${summary.videoCount} 段 · ${(summary.durationMs / 1000).toFixed(1)}s · 字幕 ${summary.subtitleCount} 条`;
}

/**
 * 从画布节点生成时间线片段（节点顺序即入轨顺序，范围筛选见 selectTimelineScopeNodes）。
 * - 视频节点 → 视频轨片段（顺序排布，首尾相接）；
 * - 音频节点 → 音频轨片段（顺序排布）；
 * - 视频节点的字幕条目 → 字幕轨片段（相对该视频片段起点偏移）。
 */
export function buildTimelineFromNodes(nodes: CanvasNodeData[], options: { prefixReferenceTitles?: boolean } = {}): TimelineProject {
    const videoNodes = nodes.filter((node) => node.type === "video" && hasTimelineMedia(node));
    const audioNodes = nodes.filter((node) => node.type === "audio" && hasTimelineMedia(node));
    const clips: TimelineClip[] = [];

    let videoCursorMs = 0;
    for (const node of videoNodes) {
        const durationMs = nodeDurationMs(node);
        const prefix = options.prefixReferenceTitles ? referenceVideoTitlePrefix(node) : "";
        clips.push({
            id: `clip-${node.id}`,
            kind: "video",
            nodeId: node.id,
            trackId: DEFAULT_VIDEO_TRACK_ID,
            startMs: videoCursorMs,
            durationMs,
            title: prefix ? `${prefix} · ${node.title || "视频片段"}` : node.title || "视频片段",
            sourceStartMs: 0,
            sourceDurationMs: durationMs,
        });

        const entries = node.metadata?.subtitleEntries || [];
        for (const entry of entries) {
            const startMs = videoCursorMs + Math.max(0, entry.startMs);
            const endMs = videoCursorMs + Math.max(entry.startMs, Math.min(entry.endMs, durationMs));
            clips.push({
                id: `clip-${node.id}-sub-${entry.index}`,
                kind: "subtitle",
                nodeId: node.id,
                trackId: DEFAULT_SUBTITLE_TRACK_ID,
                startMs,
                durationMs: Math.max(100, endMs - startMs),
                title: entry.text || "字幕",
                sourceStartMs: entry.startMs,
                sourceDurationMs: Math.max(0, entry.endMs - entry.startMs),
                subtitleEntryIndex: entry.index,
                text: entry.text,
            });
        }
        videoCursorMs += durationMs;
    }

    let audioCursorMs = 0;
    for (const node of audioNodes) {
        const durationMs = nodeDurationMs(node);
        clips.push({
            id: `clip-${node.id}`,
            kind: "audio",
            nodeId: node.id,
            trackId: DEFAULT_AUDIO_TRACK_ID,
            startMs: audioCursorMs,
            durationMs,
            title: node.title || "音频片段",
            sourceStartMs: 0,
            sourceDurationMs: durationMs,
            volume: 1,
            fadeInMs: 0,
            fadeOutMs: 0,
        });
        audioCursorMs += durationMs;
    }

    return {
        version: 2,
        tracks: createDefaultTracks(),
        clips,
        durationMs: getTimelineVisualEndMs(clips),
        updatedAt: new Date().toISOString(),
    };
}

/** 判断某个节点是否已经出现在时间线中（按 nodeId 去重）。 */
export function isNodeInTimeline(nodeId: string, timeline: TimelineProject | null | undefined): boolean {
    return Boolean(timeline?.clips.some((clip) => clip.nodeId === nodeId));
}

/**
 * 将节点字幕条目同步回项目时间线：按视频片段起点偏移重建该节点的字幕片段；
 * 条目为空数组时移除该节点全部字幕片段，保证字幕弹窗与时间线互通。
 */
export function syncNodeSubtitlesToTimeline(timeline: TimelineProject, nodeId: string, entries: SrtEntry[]): TimelineProject {
    const videoClips = timeline.clips.filter((clip) => clip.nodeId === nodeId && clip.kind === "video");
    const hasSubtitleClips = timeline.clips.some((clip) => clip.nodeId === nodeId && clip.kind === "subtitle");
    if (!videoClips.length && !hasSubtitleClips) return timeline;
    const clips = timeline.clips.filter((clip) => !(clip.nodeId === nodeId && clip.kind === "subtitle"));
    for (const videoClip of videoClips) for (const [entryPosition, entry] of entries.entries()) {
        const text = (entry.text || "").trim();
        if (!text) continue;
        const sourceStart = videoClip.sourceStartMs ?? 0;
        const start = Math.max(sourceStart, entry.startMs);
        const end = Math.min(sourceStart + videoClip.durationMs, entry.endMs);
        if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) continue;
        // 一个源节点可被裁成多个片段；字幕只映射各片段实际使用的源区间。
        const baseId = `clip-${nodeId}-sub-${entry.index}-${videoClip.id}-${entryPosition}`;
        let id = baseId;
        for (let suffix = 1; clips.some(clip => clip.id === id); suffix++) id = `${baseId}-${suffix}`;
        clips.push({
            id,
            kind: "subtitle",
            nodeId,
            trackId: DEFAULT_SUBTITLE_TRACK_ID,
            startMs: videoClip.startMs + start - sourceStart,
            durationMs: end - start,
            title: text,
            sourceStartMs: start,
            sourceDurationMs: end - start,
            subtitleEntryIndex: entry.index,
            text,
        });
    }
    return {
        ...timeline,
        clips,
        durationMs: getTimelineVisualEndMs(clips),
        updatedAt: new Date().toISOString(),
    };
}

/**
 * 打开时间线弹窗时的兜底同步：以时间线内已有视频片段为锚点，按节点
 * subtitleEntries 重建该节点的字幕片段（删除旧片段、补齐新增条目）。
 * 仅处理已入轨的节点，避免把未入轨节点的字幕凭空加进时间线。
 */
export function syncTimelineSubtitleClips(timeline: TimelineProject, nodes: CanvasNodeData[]): TimelineProject {
    let result = timeline;
    const nodeIds = new Set(timeline.clips.filter(clip => clip.kind === "video").map(clip => clip.nodeId));
    for (const nodeId of nodeIds) {
        const node = nodes.find(item => item.id === nodeId);
        if (node) result = syncNodeSubtitlesToTimeline(result, nodeId, node.metadata?.subtitleEntries || []);
    }
    return result;
}

/** 将时间线字幕映射回源视频坐标，避免保存后再次打开时重复叠加裁切偏移。 */
export function timelineSubtitleEntries(timeline: TimelineProject, nodeId: string): SrtEntry[] {
    const videos = timeline.clips.filter(clip => clip.nodeId === nodeId && clip.kind === "video");
    const mapped: Array<SrtEntry & { originalIndex?: number }> = [];
    for (const clip of timeline.clips) {
        if (clip.nodeId !== nodeId || clip.kind !== "subtitle" || !clip.text?.trim()) continue;
        // 既有纯字幕轨没有视频锚点时保留原时间，不在保存时静默清空。
        if (!videos.length) {
            mapped.push({ index: 0, originalIndex: clip.subtitleEntryIndex, startMs: Math.max(0, Math.round(clip.startMs)),
                endMs: Math.max(0, Math.round(clip.startMs + clip.durationMs)), text: clip.text.trim() });
            continue;
        }
        for (const video of videos) {
            const start = Math.max(clip.startMs, video.startMs);
            const end = Math.min(clip.startMs + clip.durationMs, video.startMs + video.durationMs);
            if (end <= start) continue;
            mapped.push({ index: 0, originalIndex: clip.subtitleEntryIndex, startMs: Math.round(start - video.startMs + (video.sourceStartMs ?? 0)),
                endMs: Math.round(end - video.startMs + (video.sourceStartMs ?? 0)), text: clip.text.trim() });
        }
    }
    mapped.sort((a, b) => a.startMs - b.startMs || a.endMs - b.endMs);
    const merged: typeof mapped = [];
    for (const entry of mapped) {
        const previous = merged.find(item => item.text === entry.text && item.originalIndex === entry.originalIndex && item.endMs >= entry.startMs && item.startMs <= entry.endMs);
        if (previous) { previous.startMs = Math.min(previous.startMs, entry.startMs); previous.endMs = Math.max(previous.endMs, entry.endMs); }
        else merged.push({ ...entry });
    }
    return merged.sort((a, b) => a.startMs - b.startMs).map(({ originalIndex: _originalIndex, ...entry }, index) => ({ ...entry, index: index + 1 }));
}
