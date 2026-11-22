import { expect, mock, test } from "bun:test";
let instances = 0, terminated = 0;
class FakeFFmpeg { constructor() { instances++; } async load() {} terminate() { terminated++; } }
mock.module("@ffmpeg/ffmpeg", () => ({ FFmpeg: FakeFFmpeg }));
mock.module("@ffmpeg/core?url", () => ({ default: "fixture-core" }));
mock.module("@ffmpeg/core/wasm?url", () => ({ default: "fixture-wasm" }));
mock.module("@/services/file-storage", () => ({ getMediaBlob: async () => null }));
const { withFFmpeg } = await import("../src/lib/canvas/canvas-video-merge");

test("worker lock covers full job and cleanup, and a failed job releases it", async () => {
    const events: string[] = [];
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    const first = withFFmpeg(async () => { events.push("first"); await gate; events.push("cleanup"); throw Error("failed"); }).catch(error => error.message);
    const second = withFFmpeg(async () => { events.push("second"); return 2; });
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(events).toEqual(["first"]);
    release(); expect(await first).toBe("failed"); expect(await second).toBe(2);
    expect(events).toEqual(["first", "cleanup", "second"]);
    expect(instances).toBe(1);
});

test("cancelled queued work does not run; active cancellation discards worker for next job", async () => {
    const queued = new AbortController(); queued.abort();
    let ran = false;
    await expect(withFFmpeg(async () => { ran = true; }, undefined, queued.signal)).rejects.toThrow();
    expect(ran).toBe(false);
    const active = new AbortController();
    await expect(withFFmpeg(async () => { active.abort(); return "stale success"; }, undefined, active.signal)).rejects.toThrow();
    expect(terminated).toBe(1);
    expect(await withFFmpeg(async () => "fresh")).toBe("fresh");
    expect(instances).toBe(2);
});

test("queued cancellation is responsive without interrupting someone else's encoder", async () => {
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    const running = withFFmpeg(async () => { await gate; return "kept"; });
    const controller = new AbortController();
    let ran = false;
    const queued = withFFmpeg(async () => { ran = true; }, undefined, controller.signal).catch(() => "cancelled");
    controller.abort();
    expect(await queued).toBe("cancelled"); expect(terminated).toBe(1);
    release(); expect(await running).toBe("kept");
    await withFFmpeg(async () => undefined);
    expect(ran).toBe(false);
});
