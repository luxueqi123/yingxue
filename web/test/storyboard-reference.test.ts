import { expect, test } from "bun:test";
import { captureStoryboardReference, saveStoryboardReferenceImage } from "../src/services/storyboard-reference";
import { createCanvasNode } from "../src/lib/canvas/canvas-project-domain";
import { CanvasNodeType } from "../src/types/canvas";
import type { RemoteResource } from "../src/services/api/resources";

function harness(times = [500, 750]) {
    let uploads = 0;
    const blob = new Blob(["frame"], { type: "image/png" });
    const services = {
        getMediaBlob: async () => null,
        captureVideoFrames: async (_: Blob | string, requested: number[]) => {
            expect(requested).toEqual([500, 750]);
            return { frames: times.map(timeMs => ({ timeMs, blob, width: 100, height: 80 })), failures: [] };
        },
        uploadResourceFile: async () => { uploads++; return { id: "saved-frame", publicUrl: "" } as RemoteResource; },
        resourceFileUrl: (id: string) => `/api/resources/${id}/file`,
    };
    const video = createCanvasNode(CanvasNodeType.Video, { x: 0, y: 0 }, { content: "https://example.test/video.mp4" });
    const reference = { startTime: 0.5, endTime: 0.75, referenceFrameImage: "original.png" };
    return { services, video, reference, blob, uploadCount: () => uploads };
}

test("参考帧复用原生抽帧和资源保存，保留片段精度且不修改输入", async () => {
    const h = harness();
    const saved = await captureStoryboardReference(h.video, h.reference, () => {}, h.services);
    expect(saved).toEqual({ startTime: 0.5, endTime: 0.75, referenceFrameImage: "/api/resources/saved-frame/file" });
    expect(h.reference.referenceFrameImage).toBe("original.png");
    expect(h.uploadCount()).toBe(1);
});

test("超出视频范围的时间不能用末帧冒充，失败不上传也不替换", async () => {
    const h = harness([100, 499]);
    await expect(captureStoryboardReference(h.video, h.reference, () => {}, h.services)).rejects.toThrow("超出视频范围");
    expect(h.uploadCount()).toBe(0);
});

test("参考内容或账号变化时停止后续上传，上传失败保持原参考", async () => {
    const h = harness();
    let checks = 0;
    await expect(captureStoryboardReference(h.video, h.reference, () => { if (++checks >= 3) throw new Error("scope changed"); }, h.services)).rejects.toThrow("scope changed");
    expect(h.uploadCount()).toBe(0);
    h.services.uploadResourceFile = async () => { throw new Error("upload failed"); };
    await expect(saveStoryboardReferenceImage(h.blob, () => {}, h.services)).rejects.toThrow("upload failed");
    expect(h.reference.referenceFrameImage).toBe("original.png");
});
