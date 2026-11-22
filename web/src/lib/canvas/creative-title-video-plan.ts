export type TitleMotion = { startMs: number; lengthMs: number; fadeMs: number; durationMs: number };
export const TITLE_VIDEO_MAX_BYTES = 200 * 1024 * 1024;

export function buildGeneratedTitleBlendArgs(input: { start: number; length: number; duration: number; width: number; height: number }): string[] {
    if (![input.start, input.length, input.duration, input.width, input.height].every(Number.isFinite) || input.start < 0 || input.length <= 0 || input.start + input.length > input.duration + 0.001 || input.width <= 0 || input.height <= 0) throw new Error("片头融合范围无效。");
    const width = Math.ceil(input.width / 2) * 2, height = Math.ceil(input.height / 2) * 2;
    const start = input.start.toFixed(3), end = (input.start + input.length).toFixed(3);
    return ["-y", "-i", "blend-source", "-i", "blend-motion", "-filter_complex",
        `[1:v]scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2,setsar=1,setpts=PTS-STARTPTS+${start}/TB[title];[0:v]pad=${width}:${height},setsar=1[original];[original][title]overlay=0:0:eof_action=pass:enable='between(t,${start},${end})',format=yuv420p[video]`,
        "-map", "[video]", "-map", "0:a?", "-t", input.duration.toFixed(3), "-c:v", "libx264", "-preset", "ultrafast", "-crf", "20", "-c:a", "aac", "-movflags", "+faststart", "blend-result.mp4"];
}

export function buildTitleVideoArgs(motion: TitleMotion): string[] {
    if (!Object.values(motion).every(Number.isFinite) || motion.durationMs <= 0 || motion.startMs < 0 || motion.lengthMs < 500 || motion.lengthMs > 10_000 || motion.fadeMs < 0 || motion.fadeMs * 2 > motion.lengthMs || motion.startMs + motion.lengthMs > motion.durationMs + 1) {
        throw new Error("片名时段需在原片内，持续 0.5–10 秒；淡入淡出各不超过时段的一半。");
    }
    const seconds = (ms: number) => (ms / 1000).toFixed(3);
    const start = seconds(motion.startMs), end = seconds(motion.startMs + motion.lengthMs);
    const fades = motion.fadeMs ? `,fade=t=in:st=${start}:d=${seconds(motion.fadeMs)}:alpha=1,fade=t=out:st=${seconds(motion.startMs + motion.lengthMs - motion.fadeMs)}:d=${seconds(motion.fadeMs)}:alpha=1` : "";
    return ["-y", "-i", "title-source", "-loop", "1", "-framerate", "30", "-i", "title-overlay.png",
        "-filter_complex", `[1:v]format=rgba${fades}[title];[0:v][title]overlay=0:0:enable='between(t,${start},${end})':shortest=1,pad=ceil(iw/2)*2:ceil(ih/2)*2,format=yuv420p[video]`,
        "-map", "[video]", "-map", "0:a?", "-t", seconds(motion.durationMs), "-c:v", "libx264", "-preset", "ultrafast", "-crf", "20", "-c:a", "aac", "-movflags", "+faststart", "title-result.mp4"];
}
