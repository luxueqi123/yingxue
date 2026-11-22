import type { TimelineClip } from "@/types/timeline";

export function timelineAudioPlayback(clip: TimelineClip, timeMs: number, playing: boolean, muted: boolean) {
    const offset = timeMs - clip.startMs;
    const fadeIn = Math.min(clip.fadeInMs ?? 0, clip.durationMs);
    const fadeOut = Math.min(clip.fadeOutMs ?? 0, clip.durationMs);
    const envelope = (fadeIn > 0 ? Math.min(1, Math.max(0, offset / fadeIn)) : 1)
        * (fadeOut > 0 ? Math.min(1, Math.max(0, (clip.durationMs - offset) / fadeOut)) : 1);
    return {
        sourceSeconds: Math.max(0, offset + (clip.sourceStartMs ?? 0)) / 1000,
        volume: Math.max(0, (clip.volume ?? 1) * envelope),
        muted,
        shouldPlay: playing && offset >= 0 && offset < clip.durationMs,
    };
}
