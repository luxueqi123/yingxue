import { describe, expect, test } from "bun:test";
import { createDefaultTracks, normalizeTimelineProject } from "../src/lib/timeline/timeline-tracks";

describe("时间线保存状态规范化", () => {
    test("重开保留默认轨的静音、隐藏、锁定、名称及顺序", () => {
        const tracks = createDefaultTracks().map((track, index) => ({
            ...track, label: `自定义 ${index}`, order: 9 - index,
            muted: true, visible: false, locked: true,
        }));
        const source = { version: 2 as const, tracks, clips: [], durationMs: 0 };
        const normalized = normalizeTimelineProject(source);
        expect(normalized.tracks).toEqual(tracks);
        expect(normalizeTimelineProject(normalized)).toEqual(normalized);
        expect(source.tracks).toEqual(tracks);
    });

    test("仅补缺失默认轨，自建轨保留，重复标识沿用首份", () => {
        const video = { id: "video-1", kind: "video" as const, label: "原片", order: 4, muted: true };
        const custom = { id: "music-2", kind: "audio" as const, label: "配乐", order: 5, locked: true };
        const result = normalizeTimelineProject({ tracks: [video, custom, { ...video, label: "重复" }] });
        expect(result.tracks).toEqual([video, ...createDefaultTracks().slice(1), custom]);
        expect(normalizeTimelineProject().tracks).toEqual(createDefaultTracks());
    });
});
