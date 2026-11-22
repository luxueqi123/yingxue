import type { TimelineClip } from '../../types/timeline';
import { unlinkTimelineAudio } from './linked-timeline-audio';

/** Splitting changes the trim window, never the length of the underlying media. */
export function splitTimelineClip(
    clip: TimelineClip,
    splitAtMs: number,
    ids: { left: string; right: string },
): [TimelineClip, TimelineClip] {
    const endMs = clip.startMs + clip.durationMs;
    if (!Number.isFinite(splitAtMs) || splitAtMs <= clip.startMs || splitAtMs >= endMs) {
        throw new Error('分割点必须位于片段内部');
    }
    if (!ids.left.trim() || !ids.right.trim() || ids.left === ids.right) throw new Error('分割片段 ID 必须非空且不同');
    const leftDuration = splitAtMs - clip.startMs;
    const independent = unlinkTimelineAudio(clip);
    return [
        { ...independent, id: ids.left, durationMs: leftDuration },
        { ...independent, id: ids.right, startMs: splitAtMs, durationMs: endMs - splitAtMs,
            sourceStartMs: (clip.sourceStartMs ?? 0) + leftDuration },
    ];
}
