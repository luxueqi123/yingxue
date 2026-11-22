import { withFFmpeg } from "@/lib/canvas/canvas-video-merge";
import { planPrevisFrames, renderPrevisFrames } from "@/lib/canvas/previs/director-frame-export";

export async function exportPrevisFrameVideo(duration: number, fps: number, capture: (time: number) => Promise<Blob>, signal?: AbortSignal): Promise<Blob> {
    const plan = planPrevisFrames(duration, fps);
    return withFFmpeg(async ffmpeg => {
        const prefix = `director-${crypto.randomUUID()}`;
        const output = `${prefix}.mp4`;
        const files: string[] = [output];
        try {
            await renderPrevisFrames(plan, capture, async (index, frame) => {
                const name = `${prefix}-${String(index).padStart(8, "0")}.png`;
                files.push(name);
                await ffmpeg.writeFile(name, new Uint8Array(await frame.arrayBuffer()));
            }, signal);
            signal?.throwIfAborted();
            const code = await ffmpeg.exec([
                "-framerate", String(fps), "-start_number", "0", "-i", `${prefix}-%08d.png`,
                "-frames:v", String(plan.count), "-t", String(duration),
                "-vf", "pad=ceil(iw/2)*2:ceil(ih/2)*2", "-c:v", "libx264", "-preset", "fast",
                "-crf", "18", "-pix_fmt", "yuv420p", "-movflags", "+faststart", "-y", output,
            ]);
            if (code !== 0) throw new Error("导演台逐帧编码失败，未回写残缺视频");
            const bytes = await ffmpeg.readFile(output);
            signal?.throwIfAborted();
            if (!(bytes instanceof Uint8Array) || !bytes.length) throw new Error("导演台逐帧编码产物为空");
            return new Blob([bytes as BlobPart], { type: "video/mp4" });
        } finally {
            // The shared FFmpeg queue remains held until this job's files have been cleaned.
            for (const name of files) await ffmpeg.deleteFile(name).catch(() => undefined);
        }
    }, undefined, signal);
}
