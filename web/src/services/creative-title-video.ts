import { withFFmpeg } from "@/lib/canvas/canvas-video-merge";
import { buildTitleVideoArgs, buildGeneratedTitleBlendArgs, TITLE_VIDEO_MAX_BYTES, type TitleMotion } from "@/lib/canvas/creative-title-video-plan";

export async function blendGeneratedTitleVideo(source: Blob, motion: Blob, input: Parameters<typeof buildGeneratedTitleBlendArgs>[0], signal?: AbortSignal): Promise<Blob> {
    const args = buildGeneratedTitleBlendArgs(input);
    if (!source.size || !motion.size || source.size + motion.size > TITLE_VIDEO_MAX_BYTES) throw new Error("浏览器融合支持总计200MiB以内的视频。");
    return withFFmpeg(async ffmpeg => {
        try {
            await ffmpeg.writeFile("blend-source", new Uint8Array(await source.arrayBuffer()));
            await ffmpeg.writeFile("blend-motion", new Uint8Array(await motion.arrayBuffer()));
            const code = await ffmpeg.exec(args, 120_000);
            if (code !== 0) throw new Error("片头融合编码失败，原片与生成视频均已保留。");
            const output = await ffmpeg.readFile("blend-result.mp4");
            if (!(output instanceof Uint8Array) || !output.byteLength) throw new Error("融合未返回有效视频。");
            return new Blob([output as BlobPart], { type: "video/mp4" });
        } finally {
            await Promise.all(["blend-source", "blend-motion", "blend-result.mp4"].map(name => ffmpeg.deleteFile(name).catch(() => undefined)));
        }
    }, undefined, signal);
}

export async function exportCreativeTitleVideo(source: Blob, overlay: Blob, motion: TitleMotion, options: { signal?: AbortSignal; onProgress?: (percent: number) => void } = {}): Promise<Blob> {
    const args = buildTitleVideoArgs(motion);
    if (!source.size || source.size > TITLE_VIDEO_MAX_BYTES) throw new Error("浏览器本地导出支持最大 200 MiB 的视频，请先选择符合大小限制的原片。");
    if (!overlay.size || overlay.type !== "image/png") throw new Error("请先生成透明片名图层。");
    options.onProgress?.(0);
    return withFFmpeg(async ffmpeg => {
        const progress = ({ progress: value }: { progress: number }) => {
            if (!options.signal?.aborted && Number.isFinite(value)) options.onProgress?.(Math.min(95, Math.max(5, Math.round(value * 90) + 5)));
        };
        ffmpeg.on("progress", progress);
        try {
            await ffmpeg.writeFile("title-source", new Uint8Array(await source.arrayBuffer()));
            await ffmpeg.writeFile("title-overlay.png", new Uint8Array(await overlay.arrayBuffer()));
            options.signal?.throwIfAborted();
            const code = await ffmpeg.exec(args, 120_000);
            if (code !== 0) throw new Error("片头编码未完成，可能是编码不受支持或超过本机处理时限；没有导出无动效替代文件。");
            const output = await ffmpeg.readFile("title-result.mp4");
            if (!(output instanceof Uint8Array) || !output.byteLength) throw new Error("片头编码没有返回有效视频。");
            options.signal?.throwIfAborted();
            options.onProgress?.(100);
            return new Blob([output as BlobPart], { type: "video/mp4" });
        } finally {
            ffmpeg.off("progress", progress);
            await Promise.all(["title-source", "title-overlay.png", "title-result.mp4"].map(name => ffmpeg.deleteFile(name).catch(() => undefined)));
        }
    }, undefined, options.signal);
}
