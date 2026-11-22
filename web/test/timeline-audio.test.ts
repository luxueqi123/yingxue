import { expect, test } from "bun:test";
import { timelineAudioPlayback } from "../src/lib/timeline/timeline-audio";
import type { TimelineClip } from "../src/types/timeline";

const clip: TimelineClip = { id: "a", nodeId: "n", kind: "audio", trackId: "audio", startMs: 200, durationMs: 600, sourceStartMs: 300, volume: 0.5, fadeInMs: 100, fadeOutMs: 200 };
test("preview follows timeline offset, source crop, fade envelope and transport", () => {
    expect(timelineAudioPlayback(clip, 199, true, false).shouldPlay).toBe(false);
    expect(timelineAudioPlayback(clip, 200, true, false)).toEqual({ sourceSeconds: 0.3, volume: 0, muted: false, shouldPlay: true });
    expect(timelineAudioPlayback(clip, 250, true, false).volume).toBe(0.25);
    expect(timelineAudioPlayback(clip, 400, false, false)).toEqual({ sourceSeconds: 0.5, volume: 0.5, muted: false, shouldPlay: false });
    expect(timelineAudioPlayback(clip, 700, true, true)).toEqual({ sourceSeconds: 0.8, volume: 0.25, muted: true, shouldPlay: true });
    expect(timelineAudioPlayback(clip, 800, true, false).shouldPlay).toBe(false);
    expect(timelineAudioPlayback({ ...clip, volume: 0 }, 400, true, false).volume).toBe(0);
});
