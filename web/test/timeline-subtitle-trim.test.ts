import { expect, test } from "bun:test";
import { syncNodeSubtitlesToTimeline, syncTimelineSubtitleClips, timelineSubtitleEntries } from "../src/lib/timeline/timeline-build";
import type { TimelineProject, SrtEntry } from "../src/types/timeline";
import { CanvasNodeType } from "../src/types/canvas";

const entries: SrtEntry[] = [
    { index: 1, startMs: 0, endMs: 500, text: "已裁掉" },
    { index: 2, startMs: 1500, endMs: 2500, text: "跨切点" },
    { index: 3, startMs: 2500, endMs: 3000, text: "后半段" },
];
const timeline = (): TimelineProject => ({
    version: 2, durationMs: 7000,
    tracks: [{ id: "video-1", kind: "video", label: "视频", order: 0 }, { id: "subtitle-1", kind: "subtitle", label: "字幕", order: 1 }],
    clips: [
        { id: "left", nodeId: "source", kind: "video", trackId: "video-1", startMs: 0, durationMs: 1000, sourceStartMs: 1000, sourceDurationMs: 4000 },
        { id: "right", nodeId: "source", kind: "video", trackId: "video-1", startMs: 5000, durationMs: 1000, sourceStartMs: 2000, sourceDurationMs: 4000 },
    ],
});
const projected = (value: TimelineProject) => value.clips.filter(c => c.kind === "subtitle").map(c => ({ startMs: c.startMs, durationMs: c.durationMs, text: c.text }));

test("source subtitles intersect every trimmed occurrence without resurrecting removed footage", () => {
    const result = syncNodeSubtitlesToTimeline(timeline(), "source", entries);
    expect(projected(result)).toEqual([
        { startMs: 500, durationMs: 500, text: "跨切点" },
        { startMs: 5000, durationMs: 500, text: "跨切点" },
        { startMs: 5500, durationMs: 500, text: "后半段" },
    ]);
    expect(new Set(result.clips.map(c => c.id)).size).toBe(result.clips.length);
});

test("reopening split source retains all subtitle occurrences and remains idempotent", () => {
    const nodes = [{ id: "source", type: CanvasNodeType.Video, position: { x: 0, y: 0 }, width: 100, height: 100, metadata: { subtitleEntries: entries } }];
    const once = syncTimelineSubtitleClips(timeline(), nodes);
    expect(projected(once).map(c => c.startMs)).toEqual([500, 5000, 5500]);
    expect(syncTimelineSubtitleClips(once, nodes).clips).toEqual(once.clips);
    expect(syncNodeSubtitlesToTimeline(once, "source", []).clips.every(c => c.kind !== "subtitle")).toBe(true);
});

test("saving maps source offsets back once and reunites a subtitle crossing a split", () => {
    const synced = syncNodeSubtitlesToTimeline(timeline(), "source", entries);
    const saved = timelineSubtitleEntries(synced, "source");
    expect(saved).toEqual([
        { index: 1, startMs: 1500, endMs: 2500, text: "跨切点" },
        { index: 2, startMs: 2500, endMs: 3000, text: "后半段" },
    ]);
    expect(projected(syncNodeSubtitlesToTimeline(synced, "source", saved))).toEqual(projected(synced));
});

test("short boundary subtitles are not padded beyond the video and duplicate indices stay unique", () => {
    const value = syncNodeSubtitlesToTimeline(timeline(), "source", [
        { index: 1, startMs: 1990, endMs: 2020, text: "短" },
        { index: 1, startMs: 2020, endMs: 2030, text: "另一个" },
    ]);
    expect(projected(value).map(c => c.durationMs)).toEqual([10, 20, 10]);
    expect(new Set(value.clips.map(c => c.id)).size).toBe(value.clips.length);
});

test("no video anchor does not create captions from invisible source footage", () => {
    expect(syncNodeSubtitlesToTimeline({ ...timeline(), clips: [] }, "source", entries).clips).toEqual([]);
});

test("saving an existing subtitle-only track preserves its text and time", () => {
    const only: TimelineProject = { ...timeline(), clips: [{ id: "sub", kind: "subtitle", nodeId: "source", trackId: "subtitle-1", startMs: 500, durationMs: 700, text: "保留字幕" }] };
    expect(timelineSubtitleEntries(only, "source")).toEqual([{ index: 1, startMs: 500, endMs: 1200, text: "保留字幕" }]);
});
