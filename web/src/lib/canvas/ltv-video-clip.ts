import type { TimelineClip, TimelineProject, TimelineTrack } from '../../types/timeline';
import { restoreLinkedTimelineAudio } from '../timeline/linked-timeline-audio';

type ObjectValue = Record<string, unknown>;
export type LtvTimelineCandidate = {
    ownerNodeId: string;
    timeline?: TimelineProject;
    issues: { code: string; detail: string }[];
};
const object = (value: unknown): ObjectValue => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as ObjectValue : {};
const number = (value: unknown, name: string): number => {
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) throw new Error(`${name} 必须为非负有限数值`);
    return value;
};
const rootKeys = new Set(['videoSourceNodeIds', 'audioSourceNodeIds', 'clips', 'totalDuration', 'currentTime', 'scale', 'scrollX',
    'videoAudioMuted', 'videoAudioVolume', 'audioTrackMuted', 'audioTrackVolume', 'videoTrackCount',
    'videoAudioMutedPerTrack', 'audioTrackMutedPerTrack', 'clipsAuthoritative', '_agentWroteAtMs', 'cropRange']);
const clipKeys = new Set(['id', 'sourceNodeId', 'type', 'startTime', 'duration', 'sourceOffset', 'sourceDuration',
    'width', 'height', 'zIndex', 'audioTrack', 'decibel', 'embedAudioMuted', 'transform', 'role', 'speed', 'linkedVideoClipId']);

function assertKnownFields(value: ObjectValue, keys: Set<string>) {
    const unknown = Object.keys(value).filter(key => !keys.has(key));
    if (unknown.length) throw new Error(`待映射时间线字段：${unknown.join(', ')}`);
}

function muted(value: unknown): boolean {
    if (value !== undefined && typeof value !== 'boolean') throw new Error('轨道或片段静音值无效');
    return value === true;
}

function gain(clip: ObjectValue, trackVolume: unknown): number {
    const volume = trackVolume === undefined ? 1 : Math.min(1, number(trackVolume, '轨道音量'));
    const db = clip.decibel;
    if (db === undefined) return volume;
    if (typeof db !== 'number' || !Number.isFinite(db)) throw new Error('片段分贝值无效');
    // Verified source preview: 1ufi8v8afcnfs.js constants and 3ynelx_m_i-cu.js L/P/R/O.
    // -60 dB is the mute zone, not a residual 0.001 gain. Native amplified playback is implemented;
    // source export consumption still needs verification before admitting positive-dB source clips.
    if (db > 0) throw new Error('正分贝增益仍需原站导出消费合同核对');
    return db <= -60 ? 0 : volume * 10 ** (db / 20);
}

function convertTimeline(ownerId: string, data: ObjectValue, sourceNodes: Map<string, ObjectValue>): TimelineProject {
    if (!data.clipTimelineData || typeof data.clipTimelineData !== 'object') throw new Error('缺少保存的 clipTimelineData，不按参数列表猜造剪辑');
    const source = object(data.clipTimelineData);
    assertKnownFields(source, rootKeys);
    // The inspected source editor restores saved clips with applySavedClipLayout(..., {cropRange:null}).
    // cropRange is a transient selection, not a saved trim or composition export interval. Keep the
    // clips' sourceOffset/duration unchanged, including when that stale selection exceeds the timeline.
    if (!Array.isArray(source.clips) || source.clips.length === 0) throw new Error('缺少已保存片段');
    const tracks = new Map<string, TimelineTrack>();
    let clips: TimelineClip[] = [];
    const ids = new Set<string>();
    const videoCount = source.videoTrackCount === undefined ? 1 : number(source.videoTrackCount, '视频轨道数');
    if (!Number.isInteger(videoCount) || videoCount < 1) throw new Error('视频轨道数无效');
    for (const value of source.clips) {
        const clip = object(value);
        assertKnownFields(clip, clipKeys);
        const nodeId = clip.sourceNodeId;
        const node = typeof nodeId === 'string' ? sourceNodes.get(nodeId) : undefined;
        if (!node || typeof nodeId !== 'string') throw new Error('时间线引用的源节点缺失');
        const kind = clip.type === undefined ? 'video' : clip.type;
        if ((kind !== 'video' && kind !== 'audio') || node.type !== kind) throw new Error('时间线片段类型与源节点不匹配');
        const link = clip.linkedVideoClipId;
        if (link !== undefined && (kind !== 'audio' || typeof link !== 'string' || !link.trim())) throw new Error('关联视频片段 ID 无效');
        if (clip.speed !== undefined && clip.speed !== 1) throw new Error('变速时间线仍需等价接入');
        if (clip.role !== undefined && clip.role !== 'main') throw new Error('未映射片段角色');
        if (clip.transform !== undefined && JSON.stringify(clip.transform) !== '[[1,0,0],[0,1,0]]') throw new Error('非单位画面变换仍需等价接入');
        const zIndex = clip.zIndex === undefined ? 0 : number(clip.zIndex, '轨道层级');
        const trackIndex = kind === 'video' ? zIndex : clip.zIndex !== undefined
            ? Math.max(0, zIndex - videoCount) : clip.audioTrack === undefined ? 0 : number(clip.audioTrack, '音轨索引');
        if (!Number.isInteger(trackIndex) || !Number.isInteger(zIndex)) throw new Error('轨道索引无效');
        if (kind === 'video' && trackIndex >= videoCount) throw new Error('视频轨道超出已保存轨道数');
        const trackId = `${ownerId}::${kind}::${trackIndex}`;
        const perTrack = source[kind === 'video' ? 'videoAudioMutedPerTrack' : 'audioTrackMutedPerTrack'];
        if (perTrack !== undefined && (!Array.isArray(perTrack) || perTrack.some(item => typeof item !== 'boolean'))) throw new Error('逐轨静音数组无效');
        const legacyMuted = muted(source[kind === 'video' ? 'videoAudioMuted' : 'audioTrackMuted']);
        const trackMuted = Array.isArray(perTrack) && perTrack.length > 0 ? muted(perTrack[trackIndex]) : legacyMuted;
        if (!tracks.has(trackId)) tracks.set(trackId, { id: trackId, kind, label: `${kind === 'video' ? '视频' : '音频'} ${trackIndex + 1}`,
            order: kind === 'video' ? trackIndex : videoCount + trackIndex, muted: trackMuted });
        const start = number(clip.startTime, '片段起点');
        const duration = number(clip.duration, '片段时长');
        const sourceStart = number(clip.sourceOffset, '源裁切起点');
        const sourceDuration = number(clip.sourceDuration, '源时长');
        if (duration <= 0 || sourceStart + duration > sourceDuration + 0.000001) throw new Error('片段裁切越界或时长无效');
        // The backend wire format is int64 milliseconds. Round absolute boundaries rather than
        // each duration independently, avoiding artificial gaps from recurring source fractions.
        const startMs = Math.round(start * 1000);
        const durationMs = Math.round((start + duration) * 1000) - startMs;
        const sourceDurationMs = Math.ceil(sourceDuration * 1000);
        // Independent rounding can push a valid tail trim one millisecond past EOF.
        // Keep the timeline boundaries; use the adjacent source millisecond only when
        // it remains within one millisecond of the already validated original offset.
        const sourceStartMs = Math.min(Math.round(sourceStart * 1000), sourceDurationMs - durationMs);
        if (![startMs, durationMs, sourceStartMs, sourceDurationMs].every(Number.isSafeInteger)
            || durationMs <= 0 || sourceStartMs < 0 || Math.abs(sourceStartMs - sourceStart * 1000) >= 1
            || sourceStartMs + durationMs > sourceDurationMs) throw new Error('毫秒量化后的裁切边界无效');
        if (clip.id !== undefined && (typeof clip.id !== 'string' || !clip.id.trim())) throw new Error('片段 ID 无效');
        const id = `${ownerId}::clip::${clip.id ?? clips.length}`;
        if (ids.has(id)) throw new Error('片段 ID 重复');
        ids.add(id);
        clips.push({ id, nodeId, kind, trackId, startMs, durationMs, sourceStartMs, sourceDurationMs,
            ...(typeof link === 'string' ? { linkedVideoClipId: `${ownerId}::clip::${link}` } : {}),
            title: typeof object(node.data).name === 'string' ? object(node.data).name as string : undefined,
            volume: muted(clip.embedAudioMuted) ? 0 : gain(clip, source[kind === 'video' ? 'videoAudioVolume' : 'audioTrackVolume']) });
    }
    clips = restoreLinkedTimelineAudio(clips);
    // Native export currently concatenates visual clips. Do not silently flatten compositing layers.
    const video = clips.filter(clip => clip.kind === 'video').sort((a, b) => a.startMs - b.startMs);
    for (let index = 1; index < video.length; index++) {
        if (video[index].startMs < video[index - 1].startMs + video[index - 1].durationMs - 0.001) throw new Error('重叠视频仍需合成图层接入');
    }
    for (const track of tracks.values()) {
        if (track.kind !== 'audio') continue;
        const audio = clips.filter(clip => clip.trackId === track.id).sort((a, b) => a.startMs - b.startMs);
        for (let index = 1; index < audio.length; index++) {
            if (audio[index].startMs < audio[index - 1].startMs + audio[index - 1].durationMs - 0.001) throw new Error('同音轨重叠片段仍需选择语义核对');
        }
    }
    const durationMs = Math.max(...clips.map(clip => clip.startMs + clip.durationMs));
    // Source applySavedClipLayout expands a stale short duration to eS(clips).
    // A longer saved extent can retain trailing space; do not silently discard it.
    if (number(source.totalDuration, '时间线总时长') * 1000 - durationMs > 1) throw new Error('保存总时长包含尚未映射的尾部空白');
    return { version: 2, tracks: [...tracks.values()].sort((a, b) => a.order - b.order), clips, durationMs };
}

/** Each source composition remains independently identified; this does not choose a project-wide timeline. */
export function extractLtvVideoClipTimelines(snapshot: unknown): LtvTimelineCandidate[] {
    const nodes = object(snapshot).nodes;
    if (!Array.isArray(nodes)) return [];
    const sourceNodes = new Map(nodes.map(node => { const value = object(node); return [String(value.id), value]; }));
    const duplicates = sourceNodes.size !== nodes.length;
    return nodes.filter(node => object(node).type === 'video-clip').map(value => {
        const node = object(value);
        const ownerNodeId = String(node.id ?? '');
        try {
            if (!ownerNodeId || duplicates) throw new Error('源节点 ID 缺失或重复');
            return { ownerNodeId, timeline: convertTimeline(ownerNodeId, object(node.data), sourceNodes), issues: [] };
        } catch (error) {
            return { ownerNodeId, issues: [{ code: 'timeline-adaptation-required', detail: error instanceof Error ? error.message : '时间线格式无效' }] };
        }
    });
}
