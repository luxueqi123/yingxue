import type { GenerationTask } from "./api/task-center";
import { resourceFileUrl, uploadResourceFile } from "./api/resources";
import { getMediaBlob } from "./file-storage";
import { captureVideoFrames } from "@/lib/canvas/canvas-video-frame";
import { storyboardRowsFromTask } from "@/lib/canvas/canvas-project-domain";

const resultServices = { resourceFileUrl, uploadResourceFile, getMediaBlob, captureVideoFrames };

/** Both live completion and refresh recovery materialize references from the actual submitted video. */
export async function restoreStoryboardTaskResult(task: GenerationTask, assertCurrent: () => void, services = resultServices) {
    assertCurrent();
    const result = storyboardRowsFromTask(task);
    const groups = new Map<number, Array<number>>();
    result.rows.forEach((row, index) => {
        const sourceIndex = row.videoReference?.sourceVideoIndex;
        if (sourceIndex === undefined) return;
        if (!Number.isSafeInteger(sourceIndex) || sourceIndex < 0) throw new Error("分镜原片编号无效");
        const indices = groups.get(sourceIndex) || [];
        indices.push(index); groups.set(sourceIndex, indices);
    });
    if (!groups.size) return result;
    if (!task.id) throw new Error("缺少原始分镜任务标识，未用占位图替代参考帧");
    const output = JSON.parse(task.resultJson || "{}") as { storyboardReferenceVideos?: Array<{ storageKey?: string; url?: string }> };
    for (const [sourceIndex, rowIndices] of groups) {
        const source = output.storyboardReferenceVideos?.[sourceIndex];
        if (!source) throw new Error("分镜引用的原片不在本次提交中");
        const times = rowIndices.flatMap(index => {
            const ref = result.rows[index].videoReference!;
            if (!Number.isFinite(ref.startTime) || !Number.isFinite(ref.endTime) || ref.startTime < 0 || ref.endTime < ref.startTime) throw new Error("分镜原片时间无效");
            return [Math.round(ref.startTime * 1000), Math.round(ref.endTime * 1000)];
        });
        const stored = source.storageKey ? await services.getMediaBlob(source.storageKey) : null;
        assertCurrent();
        const media = stored || source.url || (source.storageKey?.startsWith("resource:") ? services.resourceFileUrl(source.storageKey.slice(9)) : undefined);
        if (!media) throw new Error("原片资源缺失，未替换已有分镜");
        const captured = await services.captureVideoFrames(media, times);
        assertCurrent();
        const frameAt = (time: number) => captured.frames.find(frame => Math.abs(frame.timeMs - Math.round(time * 1000)) <= 1);
        for (const index of rowIndices) {
            const ref = result.rows[index].videoReference!;
            if (captured.failures.length || !frameAt(ref.startTime) || !frameAt(ref.endTime)) throw new Error(captured.failures[0]?.error || "模型返回的参考时间超出原片范围，未替换已有分镜");
        }
        for (const index of rowIndices) {
            const ref = result.rows[index].videoReference!;
            const frame = frameAt(ref.startTime)!;
            assertCurrent();
            const resource = await services.uploadResourceFile(frame.blob, "image", {
                width: frame.width, height: frame.height, fileName: `shot-${index + 1}-reference.png`,
                idempotencyKey: `storyboard-frame:${task.id}:${index}:${sourceIndex}:${Math.round(ref.startTime * 1000)}`,
            });
            assertCurrent();
            result.rows[index].videoReference = { startTime: ref.startTime, endTime: ref.endTime, referenceFrameImage: resource.publicUrl || services.resourceFileUrl(resource.id) };
        }
    }
    return result;
}
