import { FFmpeg } from "@ffmpeg/ffmpeg";
import ffmpegCoreURL from "@ffmpeg/core?url";
import ffmpegWasmURL from "@ffmpeg/core/wasm?url";
import { fetchFile } from "@ffmpeg/util";
import { getMediaBlob } from "@/services/file-storage";
import { buildRecordingTranscodeArgs } from "./canvas-video-merge-args";
import { concatVideoFiles } from "./canvas-video-concat";

export type MergeVideoInput = { id: string; url?: string; storageKey?: string };
export type MergeVideoProgress = { phase: "loading" | "reading" | "encoding"; progress: number };

const FFMPEG_IDLE_MS = 30_000;
let ffmpegInstance: FFmpeg | null = null;
let queueTail: Promise<void> = Promise.resolve();
let pendingTasks = 0;
let idleTimer: ReturnType<typeof setTimeout> | undefined;

// 只在任务取得执行权时加载，同源 WASM 不随画布首屏启动。
async function loadFFmpeg(onProgress?: (progress: MergeVideoProgress) => void) {
    if (ffmpegInstance) return ffmpegInstance;
    const ffmpeg = new FFmpeg();
    try {
        onProgress?.({ phase: "loading", progress: 0 });
        await ffmpeg.load({ coreURL: ffmpegCoreURL, wasmURL: ffmpegWasmURL });
        ffmpegInstance = ffmpeg;
        return ffmpeg;
    } catch (cause) {
        ffmpeg.terminate();
        throw new Error("视频处理工具加载失败，请稍后重试", { cause });
    }
}

/** 整个任务（含输入读取和 finally 清理）独占虚拟文件系统；排队也阻止空闲回收。 */
export function runFFmpegTask<T>(work: (ffmpeg: FFmpeg) => Promise<T>, onProgress?: (progress: MergeVideoProgress) => void, signal?: AbortSignal): Promise<T> {
    if (signal?.aborted) return Promise.reject(signal.reason ?? new DOMException("媒体处理已取消", "AbortError"));
    pendingTasks += 1;
    clearTimeout(idleTimer);
    idleTimer = undefined;
    let activeWorker: FFmpeg | undefined;
    let rejectCancelled: ((reason: unknown) => void) | undefined;
    const cancelled = new Promise<never>((_, reject) => { rejectCancelled = reject; });
    const abort = () => {
        if (activeWorker) {
            activeWorker.terminate();
            if (ffmpegInstance === activeWorker) ffmpegInstance = null;
            activeWorker = undefined;
        }
        rejectCancelled?.(signal?.reason ?? new DOMException("媒体处理已取消", "AbortError"));
    };
    signal?.addEventListener("abort", abort, { once: true });
    const task = queueTail.then(async () => {
        try {
            signal?.throwIfAborted();
            const ffmpeg = await loadFFmpeg(onProgress);
            activeWorker = ffmpeg;
            signal?.throwIfAborted();
            // FFmpeg 的 signal 只拒绝主线程 Promise，不会停止 Worker；必须等执行和清理完成再交出名额。
            const result = await work(ffmpeg);
            signal?.throwIfAborted();
            return result;
        } finally {
            signal?.removeEventListener("abort", abort);
            if (signal?.aborted && activeWorker) {
                activeWorker.terminate();
                if (ffmpegInstance === activeWorker) ffmpegInstance = null;
            }
            pendingTasks -= 1;
            if (!pendingTasks && ffmpegInstance) {
                idleTimer = setTimeout(() => {
                    idleTimer = undefined;
                    if (pendingTasks) return;
                    ffmpegInstance?.terminate();
                    ffmpegInstance = null;
                }, FFMPEG_IDLE_MS);
            }
        }
    });
    queueTail = task.then(
        () => undefined,
        () => undefined,
    );
    return Promise.race([task, cancelled]);
}

export async function transcodeVideoToMp4(input: Blob, onProgress?: (progress: MergeVideoProgress) => void, signal?: AbortSignal) {
    return runFFmpegTask(
        async (ffmpeg) => {
            const inputName = input.type === "video/mp4" ? "recording.mp4" : "recording.webm";
            const outputName = "recording-transcoded.mp4";
            try {
                const bytes = await fetchFile(input);
                signal?.throwIfAborted();
                await ffmpeg.writeFile(inputName, bytes);
                signal?.throwIfAborted();
                onProgress?.({ phase: "encoding", progress: 55 });
                const logs: string[] = [];
                const onLog = ({ message }: { message: string }) => {
                    if (message) logs.push(message);
                    if (logs.length > 12) logs.shift();
                };
                ffmpeg.on("log", onLog);
                let exitCode = 1;
                try {
                    exitCode = await ffmpeg.exec(buildRecordingTranscodeArgs(inputName, outputName));
                } finally {
                    ffmpeg.off("log", onLog);
                }
                signal?.throwIfAborted();
                if (exitCode !== 0) {
                    console.error("白膜视频转码失败", logs);
                    throw new Error("视频转码失败，请重试");
                }
                const output = await ffmpeg.readFile(outputName);
                signal?.throwIfAborted();
                onProgress?.({ phase: "encoding", progress: 100 });
                return new Blob([output as BlobPart], { type: "video/mp4" });
            } finally {
                await Promise.all([inputName, outputName].map((file) => ffmpeg.deleteFile(file).catch(() => undefined)));
            }
        },
        onProgress,
        signal,
    );
}

export const withFFmpeg = runFFmpegTask;

export async function mergeVideos(inputs: MergeVideoInput[], onProgress?: (progress: MergeVideoProgress) => void) {
    if (inputs.length < 2) throw new Error("至少选择 2 个视频才能合并");
    return runFFmpegTask(async (ffmpeg) => {
    const files: string[] = [];
    try {
        for (let index = 0; index < inputs.length; index += 1) {
            const input = inputs[index];
            const storedBlob = input.storageKey ? await getMediaBlob(input.storageKey) : null;
            const remoteBlob =
                !storedBlob && input.url
                    ? await fetch(input.url).then((response) => {
                          if (!response.ok) throw new Error(`视频资源请求失败（${response.status}）`);
                          return response.blob();
                      })
                    : null;
            const blob = storedBlob || remoteBlob;
            if (!blob) throw new Error(`无法读取第 ${index + 1} 个视频`);
            const name = `input-${index}.mp4`;
            await ffmpeg.writeFile(name, await fetchFile(blob));
            files.push(name);
            onProgress?.({ phase: "reading", progress: Math.round(((index + 1) / inputs.length) * 45) });
        }
        onProgress?.({ phase: "encoding", progress: 55 });
        const output = await concatVideoFiles(ffmpeg, files);
        onProgress?.({ phase: "encoding", progress: 100 });
        return new Blob([output as BlobPart], { type: "video/mp4" });
    } finally {
        await Promise.all(files.map((file) => ffmpeg.deleteFile(file).catch(() => undefined)));
    }
    }, onProgress);
}
