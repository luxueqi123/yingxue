import type { ModelCapabilityConfig } from "@/lib/model-capabilities";
import { creationAttachmentKind, type CreationAttachmentKind, type CreationMode } from "./creation-assets";

export type CreationIntent = CreationMode | "agent";
type InputMedia = { type: string; name: string; bytes?: number; durationMs?: number };
type InputLimit = { count: number; bytes?: number; seconds?: number };
const MB = 1024 * 1024;
const labels: Record<CreationAttachmentKind, string> = { image: "图片", video: "视频", audio: "音频", file: "文档" };

export function creationCollectionCapabilities(capabilities: ModelCapabilityConfig, videoGroupLimits?: { maxImages: number; maxVideos: number; maxAudios: number }): ModelCapabilityConfig {
    if (!capabilities.video || !videoGroupLimits) return capabilities;
    // 收集阶段允许同名模型的其他路由；提交仍由模型匹配和后端能力检查把关，不裁切草稿。
    return { ...capabilities, video: { ...capabilities.video, references: { ...capabilities.video.references, ...videoGroupLimits } } };
}

/** LTV 的素材收集上限与生成模型的输入限制是两个层级；超限只报告，不裁切用户草稿。 */
export function creationInputLimits(intent: CreationIntent, capabilities: ModelCapabilityConfig): Record<CreationAttachmentKind, InputLimit> {
    const none = { count: 0 };
    if (intent === "agent") return { image: { count: 20 }, video: { count: 20 }, audio: { count: 20 }, file: { count: 20, bytes: 20 * MB } };
    if (intent === "image") return { image: { count: capabilities.image?.references.maxImages ?? 0, bytes: capabilities.image?.references.maxImageBytes }, video: none, audio: none, file: none };
    if (intent === "video") {
        const refs = capabilities.video?.references;
        return {
            image: { count: refs?.maxImages ?? 0, bytes: refs?.maxImageBytes },
            video: { count: refs?.maxVideos ?? 0, bytes: refs?.maxVideoBytes, seconds: refs?.maxVideoDurationSeconds },
            audio: { count: refs?.maxAudios ?? 0, bytes: refs?.maxAudioBytes, seconds: refs?.maxAudioDurationSeconds },
            file: none,
        };
    }
    const refs = capabilities.text?.references;
    return { image: { count: refs?.maxImages ?? 6, bytes: refs?.maxImageBytes }, video: { count: refs?.maxVideos ?? 6, bytes: refs?.maxVideoBytes }, audio: { count: 6 }, file: { count: 6, bytes: 20 * MB } };
}

export function creationInputIssues(intent: CreationIntent, inputs: InputMedia[], capabilities: ModelCapabilityConfig): string[] {
    const limits = creationInputLimits(intent, capabilities);
    const issues: string[] = [];
    for (const kind of Object.keys(limits) as CreationAttachmentKind[]) {
        const items = inputs.filter(item => creationAttachmentKind(item) === kind);
        const limit = limits[kind];
        if (items.length > limit.count) issues.push(limit.count === 0 ? `当前模式或模型不支持${labels[kind]}参考，请更换模型、模式或移除对应附件。` : `${labels[kind]}最多支持 ${limit.count} 项，当前 ${items.length} 项。`);
        for (const item of items) {
            if (limit.bytes && item.bytes && item.bytes > limit.bytes) issues.push(`${item.name} 超过当前${labels[kind]} ${Number((limit.bytes / MB).toFixed(2))} MB 的上限。`);
            if (limit.seconds && item.durationMs && item.durationMs > limit.seconds * 1000) issues.push(`${item.name} 超过当前${labels[kind]} ${limit.seconds} 秒的上限。`);
        }
    }
    return issues;
}
