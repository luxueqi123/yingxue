import { expect, mock, test } from "bun:test";
const calls: string[][] = [], deleted: string[] = [];
let encodingFails = false;
class FakeFFmpeg {
    probeFile = "";
    async load() {} terminate() {} async writeFile() {}
    async exec(args: string[]) { calls.push(args); return encodingFails ? 1 : 0; }
    async ffprobe(args: string[]) { this.probeFile = args.at(-1)!; return 0; }
    async readFile(name: string) {
        if (name !== "concat-probe.json") return new Uint8Array([1, 2, 3]);
        const duration = this.probeFile === "merged.mp4" ? "2" : "1";
        return new TextEncoder().encode(JSON.stringify({ streams: [{ codec_type: "video", width: 640, height: 360, duration, avg_frame_rate: "30/1" }, { codec_type: "audio", duration }] }));
    }
    async deleteFile(name: string) { deleted.push(name); }
}
mock.module("@ffmpeg/ffmpeg", () => ({ FFmpeg: FakeFFmpeg }));
mock.module("@ffmpeg/core?url", () => ({ default: "fixture-core" }));
mock.module("@ffmpeg/core/wasm?url", () => ({ default: "fixture-wasm" }));
mock.module("@ffmpeg/util", () => ({ fetchFile: async (blob: Blob) => new Uint8Array(await blob.arrayBuffer()) }));
mock.module("@/services/file-storage", () => ({ getMediaBlob: async () => new Blob(["fixture"]) }));
const { mergeVideos } = await import("../src/lib/canvas/canvas-video-merge");
test("merge decodes both inputs and overwrites output without a prompt", async () => {
    const result = await mergeVideos([{ id: "a", storageKey: "a" }, { id: "b", storageKey: "b" }]);
    expect(result.type).toBe("video/mp4"); expect(result.size).toBe(3);
    expect(calls).toHaveLength(1);
    expect(calls.every(args => args[0] === "-y")).toBe(true);
    expect(calls[0]).toContain("libx264");
    expect(deleted).toContain("input-0.mp4");
    expect(deleted).toContain("input-1.mp4");
    expect(deleted).toContain("merged.mp4");
    expect(deleted.filter(name => name === "concat-probe.json")).toHaveLength(3);
});

test("encoding failure reports failure and cleans partial output", async () => {
    encodingFails = true;
    deleted.length = 0;
    try {
        await expect(mergeVideos([{ id: "a", storageKey: "a" }, { id: "b", storageKey: "b" }])).rejects.toThrow("视频编码失败");
        expect(deleted).toContain("merged.mp4");
        expect(deleted).toContain("input-0.mp4");
        expect(deleted).toContain("input-1.mp4");
    } finally { encodingFails = false; }
});
