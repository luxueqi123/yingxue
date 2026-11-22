import type { CanvasNodeData, StoryboardRow } from "@/types/canvas";
import { captureVideoFrames } from "@/lib/canvas/canvas-video-frame";
import { getMediaBlob } from "./file-storage";
import { resourceFileUrl, uploadResourceFile } from "./api/resources";

const referenceServices = { captureVideoFrames, getMediaBlob, uploadResourceFile, resourceFileUrl };

export async function saveStoryboardReferenceImage(file: Blob, assertCurrent: () => void, services = referenceServices) {
    assertCurrent();
    if (!file.type.startsWith("image/")) throw new Error("请选择图片文件");
    const resource = await services.uploadResourceFile(file, "image");
    assertCurrent();
    return resource.publicUrl || services.resourceFileUrl(resource.id);
}

/** Uses native frame extraction and resource storage; never treats a clamped timestamp as success. */
export async function captureStoryboardReference(video: CanvasNodeData, reference: NonNullable<StoryboardRow["videoReference"]>, assertCurrent: () => void, services = referenceServices) {
    assertCurrent();
    const { startTime, endTime } = reference;
    if (!Number.isFinite(startTime) || !Number.isFinite(endTime) || startTime < 0 || endTime < startTime) throw new Error("参考片段时间无效");
    const stored = video.metadata?.storageKey ? await services.getMediaBlob(video.metadata.storageKey) : null;
    assertCurrent();
    const source = stored || video.metadata?.content;
    if (!source || video.type !== "video") throw new Error("请先选择已上传的视频");
    const startMs = Math.round(startTime * 1000), endMs = Math.round(endTime * 1000);
    const result = await services.captureVideoFrames(source, [startMs, endMs]);
    assertCurrent();
    const frame = result.frames.find(item => Math.abs(item.timeMs - startMs) <= 1);
    const end = result.frames.find(item => Math.abs(item.timeMs - endMs) <= 1);
    if (!frame || !end || result.failures.length) throw new Error(result.failures[0]?.error || "参考时间超出视频范围，未替换原参考帧");
    const resource = await services.uploadResourceFile(frame.blob, "image", { width: frame.width, height: frame.height, fileName: "storyboard-reference.png" });
    assertCurrent();
    return { ...reference, referenceFrameImage: resource.publicUrl || services.resourceFileUrl(resource.id) };
}
