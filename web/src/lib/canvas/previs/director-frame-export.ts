export type PrevisFramePlan = { duration: number; fps: number; count: number };

export function planPrevisFrames(duration: number, fps: number): PrevisFramePlan {
    if (!Number.isFinite(duration) || duration <= 0 || !Number.isInteger(fps) || fps < 1 || fps > 120) {
        throw new Error("导演台导出时长或帧率无效");
    }
    const count = Math.ceil(duration * fps - 1e-9);
    if (!Number.isSafeInteger(count) || count < 1) throw new Error("导演台导出帧数无效");
    return { duration, fps, count };
}

/** Await each rendered frame and its write before advancing; wall-clock stalls never skip source time. */
export async function renderPrevisFrames(
    plan: PrevisFramePlan,
    capture: (time: number) => Promise<Blob>,
    write: (index: number, frame: Blob) => Promise<void>,
    signal?: AbortSignal,
) {
    const checked = planPrevisFrames(plan.duration, plan.fps);
    if (checked.count !== plan.count) throw new Error("导演台导出帧计划不一致");
    for (let index = 0; index < plan.count; index++) {
        signal?.throwIfAborted();
        const frame = await capture(index / plan.fps);
        signal?.throwIfAborted();
        if (frame.type !== "image/png" || frame.size === 0) throw new Error(`导演台第 ${index + 1} 帧无效`);
        await write(index, frame);
    }
    signal?.throwIfAborted();
}
