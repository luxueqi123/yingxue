import { beforeEach, expect, mock, test } from "bun:test";
let code = 0, jobs = 0;
let output: Uint8Array | string = new Uint8Array([1, 2, 3]);
let deleted: string[] = [];
const encoder = { on() {}, off() {}, async writeFile() {}, async exec() { return code; }, async readFile() { return output; }, async deleteFile(name: string) { deleted.push(name); } };
mock.module("@/lib/canvas/canvas-video-merge", () => ({ withFFmpeg: async (run: (encoder: typeof encoder) => Promise<Blob>) => { jobs++; return run(encoder); } }));
const { exportCreativeTitleVideo } = await import("../src/services/creative-title-video");
const source = new Blob(["source"]), overlay = new Blob(["png"], { type: "image/png" });
const motion = { startMs: 0, lengthMs: 1000, fadeMs: 200, durationMs: 2000 };
beforeEach(() => { code = jobs = 0; output = new Uint8Array([1, 2, 3]); deleted = []; });
test("encoder failure never returns the original video as a successful title export", async () => {
    code = 1;
    await expect(exportCreativeTitleVideo(source, overlay, motion)).rejects.toThrow("片头编码未完成");
    expect(deleted.sort()).toEqual(["title-overlay.png", "title-result.mp4", "title-source"]);
});
test("invalid output is rejected and temporary files are cleaned", async () => {
    output = "invalid";
    await expect(exportCreativeTitleVideo(source, overlay, motion)).rejects.toThrow("有效视频");
    expect(deleted).toHaveLength(3);
});
test("empty source and invalid overlay fail before acquiring the worker", async () => {
    await expect(exportCreativeTitleVideo(new Blob(), overlay, motion)).rejects.toThrow("200 MiB");
    await expect(exportCreativeTitleVideo(source, new Blob(["jpg"], { type: "image/jpeg" }), motion)).rejects.toThrow("透明片名");
    expect(jobs).toBe(0);
});
