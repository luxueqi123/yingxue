import type { TimelineClip } from '../../types/timeline';

export function unlinkTimelineAudio(clip: TimelineClip): TimelineClip {
    const { linkedVideoClipId: _link, ...rest } = clip;
    return rest;
}

/** Source applySavedClipLayout aligns linked audio without changing its trim or duration. */
export function restoreLinkedTimelineAudio(clips: TimelineClip[]): TimelineClip[] {
    const videos = new Map(clips.filter(clip => clip.kind === 'video').map(clip => [clip.id, clip]));
    return clips.map(clip => {
        const video = clip.kind === 'audio' && clip.linkedVideoClipId ? videos.get(clip.linkedVideoClipId) : undefined;
        return video && clip.startMs !== video.startMs ? { ...clip, startMs: video.startMs } : clip;
    });
}

export function patchTimelineClip(clip: TimelineClip, patch: Partial<TimelineClip>): TimelineClip {
    const trimming = patch.durationMs !== undefined || patch.sourceStartMs !== undefined;
    return { ...(trimming ? unlinkTimelineAudio(clip) : clip), ...patch };
}
