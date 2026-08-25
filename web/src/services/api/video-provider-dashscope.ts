import { modelCapabilityConfigFor } from "@/lib/model-capabilities";
import { modelOptionName } from "@/stores/use-config-store";
import type { ReferenceImage } from "@/types/image";
import type { ReferenceAudio, ReferenceVideo } from "@/types/media";

import type { ApiEnvelope, RequestOptions, ResolvedAiConfig, VideoGenerationTask, VideoGenerationTaskState } from "./video-contracts";
import type { VideoProviderDeps } from "./video-provider-deps";

type DashScopeResponse = {
    output?: { task_id?: string; task_status?: string; video_url?: string; message?: string };
    task_id?: string;
    task_status?: string;
    video_url?: string;
    message?: string;
    id?: string;
};

export async function createDashScopeVideoTask(deps: VideoProviderDeps, config: ResolvedAiConfig, model: string, prompt: string, references: ReferenceImage[], videoReferences: ReferenceVideo[], audioReferences: ReferenceAudio[], options?: RequestOptions): Promise<VideoGenerationTask> {
    if (references.length || videoReferences.length || audioReferences.length) throw new Error("通义万相当前只支持文生视频，请移除参考素材");
    const profile = modelCapabilityConfigFor(config, model).video!;
    const duration = profile.duration.values?.includes(Number(config.videoSeconds)) ? Number(config.videoSeconds) : profile.duration.default;
    const resolution = normalizeDashScopeResolution(profile.resolutions, config.vquality);
    const ratio = profile.ratios.includes(config.size || "") ? config.size : profile.defaultRatio;
    const payload = {
        model: modelOptionName(model),
        input: { prompt: prompt.trim() },
        parameters: { duration, resolution, ...(ratio ? { ratio } : {}) },
    };
    try {
        const created = await deps.transport.post<ApiEnvelope<DashScopeResponse>>(
            deps.transport.apiUrl("/services/aigc/video-generation/video-synthesis"),
            payload,
            options,
            { "X-DashScope-Async": "enable" },
        );
        const envelope = unwrapDashScopeResponse(created);
        const id = envelope?.output?.task_id || envelope?.task_id || envelope?.id;
        if (!id) throw new Error("通义万相接口没有返回任务 ID");
        return { id, provider: "dashscope-wanx", model };
    } catch (error) {
        throw new Error(deps.response.readAxiosError(error, "通义万相视频任务创建失败"));
    }
}

export async function pollDashScopeVideoTask(deps: VideoProviderDeps, config: ResolvedAiConfig, task: VideoGenerationTask, options?: RequestOptions): Promise<VideoGenerationTaskState> {
    try {
        const raw = await deps.transport.get<ApiEnvelope<DashScopeResponse>>(deps.transport.apiUrl(`/tasks/${encodeURIComponent(task.id)}`), options);
        const envelope = unwrapDashScopeResponse(raw);
        const output = envelope?.output || envelope;
        const status = String(output?.task_status || "").toUpperCase();
        if (status === "SUCCEEDED") {
            const url = output?.video_url || "";
            if (!url) return { status: "failed", error: "通义万相任务成功但没有返回视频 URL" };
            return { status: "completed", result: await deps.response.videoResultFromUrl(url, options) };
        }
        if (status === "FAILED" || status === "CANCELED") return { status: "failed", error: output?.message || "通义万相视频生成失败" };
        return { status: "pending" };
    } catch (error) {
        throw new Error(deps.response.readAxiosError(error, "通义万相视频任务查询失败"));
    }
}

function normalizeDashScopeResolution(resolutions: string[], value?: string) {
    const normalized = String(value || "720p").trim().toLowerCase();
    const selected = resolutions.find((item) => item.toLowerCase() === normalized) || resolutions[0] || "720p";
    return selected.toUpperCase();
}

function unwrapDashScopeResponse(value: ApiEnvelope<DashScopeResponse>): DashScopeResponse {
    if (value && typeof value === "object" && "data" in value) return value.data || {};
    return value as DashScopeResponse;
}
