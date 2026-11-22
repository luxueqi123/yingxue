import { afterAll, beforeEach, expect, mock, test } from "bun:test";
import type { TimelineProject } from "../src/types/timeline";

let failure: "exit" | "throw" | undefined;
let commands: string[][];
let deleted: string[];
let reads: string[];
let fontStatus = 200;
let fontBody = "OTTO-test-font";
let fontRequests: string[];
let writes: Map<string, Uint8Array>;
const originalFetch = globalThis.fetch;
const encoder = new TextEncoder();
const ffmpeg = {
    on: () => {},
    off: () => {},
    writeFile: async (name: string, bytes: Uint8Array) => { writes.set(name, bytes); },
    deleteFile: async (path: string) => { deleted.push(path); },
    ffprobe: async () => 0,
    readFile: async (path: string) => {
        reads.push(path);
        return path.startsWith("probe-") ? encoder.encode(JSON.stringify({ streams: [{ index: 0, codec_type: "video" }], format: { format_name: "mp4", nb_streams: 1 } })) : new Uint8Array([1, 2, 3]);
    },
    exec: async (args: string[]) => {
        commands.push(args);
        if (args.some(arg => arg.startsWith("subtitles="))) {
            if (failure === "throw") throw new Error("libass unavailable");
            if (failure === "exit") return 1;
        }
        return 0;
    },
};
mock.module("../src/lib/canvas/canvas-video-merge", () => ({ withFFmpeg: async (run: (value: typeof ffmpeg) => unknown) => run(ffmpeg) }));
mock.module("../src/services/file-storage", () => ({ getMediaBlob: async () => new Blob(["fixture"]) }));
mock.module("@ffmpeg/util", () => ({ fetchFile: async () => new Uint8Array([0]) }));
const { exportTimelineToMp4 } = await import("../src/lib/timeline/timeline-export");

beforeEach(() => {
    failure = undefined; commands = []; deleted = []; reads = []; writes = new Map(); fontRequests = []; fontStatus = 200; fontBody = "OTTO-test-font";
    globalThis.fetch = (async (url: unknown) => { fontRequests.push(String(url)); return new Response(fontBody, { status: fontStatus }); }) as typeof fetch;
});
afterAll(() => { globalThis.fetch = originalFetch; });
function timeline(hidden = false): TimelineProject {
    return { version: 2, durationMs: 1000, tracks: [
        { id: "video", kind: "video", label: "视频", order: 0 },
        { id: "sub", kind: "subtitle", label: "字幕", order: 1, visible: !hidden },
    ], clips: [
        { id: "video", kind: "video", nodeId: "source", trackId: "video", startMs: 0, durationMs: 1000, sourceStartMs: 0, sourceDurationMs: 1000 },
        { id: "sub", kind: "subtitle", nodeId: "source", trackId: "sub", startMs: 0, durationMs: 1000, text: "保留字幕" },
    ] };
}
const sources = [{ nodeId: "source", fileName: "source.mp4", durationMs: 1000, storageKey: "fixture" }];

for (const mode of ["exit", "throw"] as const) test(`subtitle burn ${mode} rejects instead of exporting a silent downgrade`, async () => {
    failure = mode;
    const progress: string[] = [];
    await expect(exportTimelineToMp4(timeline(), sources, { context: { outputName: "result.mp4" }, onProgress: value => progress.push(value.detail) })).rejects.toThrow("字幕烧录失败");
    expect(reads).not.toContain("result.mp4");
    expect(progress).not.toContain("导出完成");
    const outputAttempts = commands.filter(args => args.at(-1) === "result.mp4");
    expect(outputAttempts).toHaveLength(mode === "exit" ? 2 : 1);
    expect(outputAttempts.every(args => args.some(arg => arg.startsWith("subtitles=")))).toBe(true);
    expect(deleted).toContain("result.mp4");
    expect(deleted).toContain("timeline.srt");
});

test("successful burn returns video bytes", async () => {
    expect((await exportTimelineToMp4(timeline(), sources)).blob.size).toBe(3);
    expect(commands.some(args => args.some(arg => arg.startsWith("subtitles=")))).toBe(true);
    expect(fontRequests).toEqual(["/fonts/subtitles/NotoSansCJKsc-Regular.otf"]);
    expect(deleted).toContain("NotoSansCJKsc-Regular.otf");
});

test("explicitly hidden subtitle track is omitted from the render plan", async () => {
    expect((await exportTimelineToMp4(timeline(true), sources)).blob.size).toBe(3);
    expect(commands.some(args => args.some(arg => arg.startsWith("subtitles=")))).toBe(false);
    expect(fontRequests).toHaveLength(0);
});

test("missing font stops before encoding", async () => {
    fontStatus = 404;
    await expect(exportTimelineToMp4(timeline(), sources)).rejects.toThrow("字幕字体加载失败");
    expect(commands).toHaveLength(0);
});

test("SPA fallback HTML is not accepted as a font", async () => {
    fontBody = "<html>not a font</html>";
    await expect(exportTimelineToMp4(timeline(), sources)).rejects.toThrow("字幕字体文件无效");
    expect(commands).toHaveLength(0);
});

test("English export progress preserves media names and Chinese subtitle content", async () => {
    const project = timeline();
    const before = JSON.stringify(project);
    const progress: string[] = [];
    await exportTimelineToMp4(project, [{ ...sources[0], fileName: "原片 {name}.mp4" }], { locale: "en-US", onProgress: value => progress.push(value.detail) });
    expect(progress).toContain("Loading subtitle font");
    expect(progress).toContain("Reading media 原片 {name}.mp4");
    expect(progress).toContain("Rendering subtitles");
    expect(progress.at(-1)).toBe("Export complete");
    expect(new TextDecoder().decode(writes.get("timeline.srt"))).toContain("保留字幕");
    expect(JSON.stringify(project)).toBe(before);
});

test("English failures keep the no-subtitle-downgrade boundary", async () => {
    failure = "exit";
    await expect(exportTimelineToMp4(timeline(), sources, { locale: "en-US" })).rejects.toThrow("export stopped without producing a video missing subtitles");
    failure = undefined;
    fontStatus = 404;
    await expect(exportTimelineToMp4(timeline(), sources, { locale: "en-US" })).rejects.toThrow("Subtitle font failed to load (404); export stopped");
});
