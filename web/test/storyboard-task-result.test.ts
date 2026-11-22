import { expect, test } from "bun:test";
import { restoreStoryboardTaskResult } from "../src/services/storyboard-task-result";
import type { GenerationTask } from "../src/services/api/task-center";
import type { RemoteResource, ResourceUploadMeta } from "../src/services/api/resources";

function harness() {
    const keys: string[] = [];
    let captures = 0;
    const rows = [0, 1].map(index => ({ durationSeconds: 0.5, videoReference: { sourceVideoIndex: 0, startTime: index + 0.25, endTime: index + 0.75, referenceFrameImage: "" } }));
    const task = { id: "task-1", inputJson: "{}", resultJson: JSON.stringify({ rows, storyboardReferenceVideos: [{ url: "https://example.test/video.mp4" }] }) } as GenerationTask;
    const services = {
        resourceFileUrl: (id: string) => `/api/resources/${id}/file`,
        getMediaBlob: async () => null,
        captureVideoFrames: async (source: string | Blob, times: number[]) => {
            captures++;
            expect(source).toBe("https://example.test/video.mp4");
            expect(times).toEqual([250, 750, 1250, 1750]);
            return { frames: times.map(timeMs => ({ timeMs, width: 100, height: 80, blob: new Blob(["frame"], { type: "image/png" }) })), failures: [] };
        },
        uploadResourceFile: async (_blob: Blob, _kind: string, meta?: ResourceUploadMeta) => {
            keys.push(meta?.idempotencyKey || "");
            return { id: `frame-${keys.length}`, publicUrl: "" } as RemoteResource;
        },
    };
    return { task, services, keys, captureCount: () => captures };
}

test("完成和恢复使用任务原片集中抽帧，稳定幂等键防止重复资源", async () => {
    const h = harness();
    const restored = await restoreStoryboardTaskResult(h.task, () => {}, h.services);
    expect(h.captureCount()).toBe(1);
    expect(restored.rows.map(row => row.videoReference)).toEqual([
        { startTime: 0.25, endTime: 0.75, referenceFrameImage: "/api/resources/frame-1/file" },
        { startTime: 1.25, endTime: 1.75, referenceFrameImage: "/api/resources/frame-2/file" },
    ]);
    const firstKeys = [...h.keys];
    await restoreStoryboardTaskResult(h.task, () => {}, h.services);
    expect(h.keys.slice(2)).toEqual(firstKeys);
    expect(h.task.resultJson).toContain('"referenceFrameImage":""');
});

test("缺失原片和模型越界时间不变成占位参考帧", async () => {
    const h = harness();
    const withoutSource = JSON.parse(h.task.resultJson!); delete withoutSource.storyboardReferenceVideos;
    await expect(restoreStoryboardTaskResult({ ...h.task, resultJson: JSON.stringify(withoutSource) }, () => {}, h.services)).rejects.toThrow("本次提交");
    h.services.captureVideoFrames = async () => ({ frames: [], failures: [] });
    await expect(restoreStoryboardTaskResult(h.task, () => {}, h.services)).rejects.toThrow("超出原片范围");
    expect(h.keys).toEqual([]);
});

test("旧原生任务没有原片字段时沿用普通恢复，不发任何媒体请求", async () => {
    const h = harness();
    const result = await restoreStoryboardTaskResult({ id: "native", resultJson: '{"rows":[{"durationSeconds":6}]}' } as GenerationTask, () => {}, h.services);
    expect(result.rows[0].durationSeconds).toBe(6);
    expect(h.captureCount()).toBe(0);
    expect(h.keys).toEqual([]);
});
