import { getMediaBlob } from "@/services/file-storage";
import { imageToDataUrl } from "@/services/image-storage";
import { boolConfig } from "@/lib/seedance-video";
import { modelOptionName } from "@/stores/use-config-store";
import { isPublicMediaUrl } from "./video-validation";
import { blobToDataUrl } from "./video-response";
import type { ReferenceImage } from "@/types/image";
import type { ReferenceAudio, ReferenceVideo } from "@/types/media";

import type { MiniMaxVideoCreateResponse, MiniMaxVideoTask, RequestOptions, ResolvedAiConfig, VideoGenerationTask, VideoGenerationTaskState } from "./video-contracts";
import type { VideoProviderDeps } from "./video-provider-deps";
import { resolveVideoImageReferences } from "./video-reference-roles";

export async function createMiniMaxVideoTask(
    deps: VideoProviderDeps,
    config: ResolvedAiConfig,
    model: string,
    prompt: string,
    references: ReferenceImage[],
    videoReferences: ReferenceVideo[],
    audioReferences: ReferenceAudio[],
    options?: RequestOptions,
): Promise<VideoGenerationTask> {
    const apiModel = modelOptionName(model);
    if (apiModel !== "MiniMax-H3" && apiModel !== "MiniMax-H3-Max") throw new Error("MiniMax V2 只支持 MiniMax-H3 或 MiniMax-H3-Max，旧海螺版本不能使用此接口。");
    const resolution = normalizeMiniMaxResolution(config.vquality);
    const supportedTiers = apiModel === "MiniMax-H3" ? ["768P", "2K"] : ["480P", "768P"];
    if (!supportedTiers.includes(resolution)) throw new Error("当前 MiniMax V2 模型不支持请求的分辨率，不能替换像素档位。");
    const duration = normalizeMiniMaxDuration(config.videoSeconds, apiModel);
    const imageUrls = await Promise.all(references.slice(0, 9).map((image) => resolveMiniMaxImageUrl(image)));
    const videoUrls = await Promise.all(videoReferences.slice(0, 3).map((video) => resolveMiniMaxMediaUrl(video, "参考视频")));
    const audioUrls = await Promise.all(audioReferences.slice(0, 3).map((audio) => resolveMiniMaxMediaUrl(audio, "参考音频")));
    const content: Array<Record<string, unknown>> = [{ type: "text", text: prompt.trim() }];
    const imagePlan = resolveVideoImageReferences(references.slice(0, 9), options, { videoCount: videoUrls.length, audioCount: audioUrls.length });
    const frameMode = imagePlan.some(({ role }) => role === "first_frame" || role === "last_frame");
    imageUrls.forEach((url, index) => {
        const role = imagePlan[index]?.role || "reference_image";
        if (frameMode && role === "reference_image") throw new Error("MiniMax 首尾帧模式不能混合未标记的参考图");
        content.push({ type: "image_url", image_url: { url }, role });
    });
    videoUrls.forEach((url) => content.push({ type: "video_url", video_url: { url }, role: "reference_video" }));
    audioUrls.forEach((url) => content.push({ type: "audio_url", audio_url: { url }, role: "reference_audio" }));
    const payload = {
        model: apiModel,
        content,
        resolution,
        duration,
        ratio: normalizeMiniMaxRatio(config.size, frameMode),
        aigc_watermark: boolConfig(config.videoWatermark, false),
    };
    try {
        const created = await deps.transport.post<MiniMaxVideoCreateResponse>(miniMaxVideoUrl(config, "/video_generation"), payload, options);
        const id = created.task_id || created.request_id || created.data?.task_id || created.data?.id || "";
        if (!id) throw new Error("MiniMax 视频接口没有返回任务 ID");
        return { id, provider: "minimax", model };
    } catch (error) {
        throw new Error(deps.response.readAxiosError(error, "MiniMax 视频任务创建失败"));
    }
}

export async function pollMiniMaxVideoTask(deps: VideoProviderDeps, config: ResolvedAiConfig, task: VideoGenerationTask, options?: RequestOptions): Promise<VideoGenerationTaskState> {
    try {
        const response = await deps.transport.get<{ task?: MiniMaxVideoTask }>(miniMaxVideoUrl(config, `/query/video_generation/${encodeURIComponent(task.id)}`), options);
        const state = response.task || {};
        const status = String(state.status || "").toLowerCase();
        if (status === "succeeded" || status === "completed") {
            const url = state.content?.url || "";
            if (!url) return { status: "failed", error: "MiniMax 视频任务已完成但没有返回视频地址" };
            return { status: "completed", result: await deps.response.videoResultFromUrl(url, options) };
        }
        if (status === "failed" || status === "cancelled") {
            const code = state.error?.code ? `${state.error.code}：` : "";
            return { status: "failed", error: `${code}${state.error?.message || "MiniMax 视频生成失败"}` };
        }
        return { status: "pending" };
    } catch (error) {
        throw new Error(deps.response.readAxiosError(error, "MiniMax 视频任务查询失败"));
    }
}

function miniMaxVideoUrl(config: ResolvedAiConfig, path: string) {
    const base = config.baseUrl.replace(/\/+$/, "");
    return /\/v2$/i.test(base) ? `${base}${path}` : `${base}/v2${path}`;
}

function normalizeMiniMaxResolution(value: string) {
    const normalized = value.trim().toLowerCase();
    const tiers: Record<string, string> = {
        "480": "480P",
        "480p": "480P",
        "512": "512P",
        "512p": "512P",
        "768": "768P",
        "768p": "768P",
        "1080": "1080P",
        "1080p": "1080P",
        "2k": "2K",
        "1440": "2K",
        "1440p": "2K",
    };
    const tier = tiers[normalized];
    if (!tier) throw new Error("MiniMax 视频分辨率必须明确选择模型支持的像素档位，不能自动替换。");
    return tier;
}

function normalizeMiniMaxDuration(value: string, _model: string) {
    const seconds = Number(value);
    if (!Number.isInteger(seconds) || seconds < 4 || seconds > 30) throw new Error("MiniMax H3 视频时长必须为 4 至 30 秒的整数，不能自动裁剪或取整。");
    return seconds;
}

function normalizeMiniMaxRatio(value: string, frameMode: boolean) {
    if (frameMode) return "adaptive";
    return ["adaptive", "21:9", "16:9", "4:3", "1:1", "3:4", "9:16"].includes(value) ? value : "16:9";
}

async function resolveMiniMaxImageUrl(image: ReferenceImage) {
    const directUrl = image.url || image.dataUrl;
    if (isPublicMediaUrl(directUrl) || directUrl.startsWith("data:")) return directUrl;
    const dataUrl = await imageToDataUrl(image);
    if (!dataUrl) throw new Error("MiniMax 参考图读取失败，请换一张图片或重新上传");
    return dataUrl;
}

async function resolveMiniMaxMediaUrl(media: ReferenceVideo | ReferenceAudio, label: string) {
    if (isPublicMediaUrl(media.url) || media.url?.startsWith("data:")) return media.url;
    let blob: Blob | null = null;
    if (media.storageKey) blob = await getMediaBlob(media.storageKey);
    if (!blob && media.url?.startsWith("blob:")) blob = await (await fetch(media.url)).blob();
    if (!blob) throw new Error(`MiniMax ${label}必须是公网 URL 或本地已保存素材`);
    return blobToDataUrl(blob);
}
