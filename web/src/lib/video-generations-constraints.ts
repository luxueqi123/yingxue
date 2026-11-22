// Documented model IDs at https://artbox.top/docs; do not expand generic NewAPI limits.
export function artdance25Resolution(model: string): string | undefined {
    return /^Artdance 2\.5-(480p|720p|1080p)$/.exec(model.trim())?.[1];
}

export function videoGenerationsReferenceError(images: number, videos: number, audios: number, model = ""): string {
    const expanded = Boolean(artdance25Resolution(model));
    const limits = expanded ? [30, 10, 10] : [9, 3, 3];
    if (images > limits[0] || videos > limits[1] || audios > limits[2]) return `NewAPI Video Generations 最多支持 ${limits[0]} 张参考图、${limits[1]} 个参考视频和 ${limits[2]} 个参考音频`;
    if (audios > 0 && videos === 0) return "NewAPI Video Generations 的参考音频必须同时提供至少 1 个参考视频；纯音频生视频请切换到支持该模式的渠道";
    return "";
}
