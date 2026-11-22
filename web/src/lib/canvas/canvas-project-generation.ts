import { resolvedMediaConfig } from "@/lib/media-settings";
import { type GenerationTask } from "@/services/api/task-center";
import { arkSearchModelLimits, assertArkRuntimeReferences } from "./ark-video-search";
import { assertKlingRuntimeOptions } from "./ltv-kling-options";
import { assertVolcanoVideoEnhance, VOLCANO_VIDEO_ENHANCE } from "./ltv-volcano-video-enhance";
import { assertSubtitleErase, assertSubtitleEraseMedia, VOLCANO_SUBTITLE_ERASE } from "./ltv-subtitle-erase";
import { assertOmniHumanConfig, assertOmniHumanRuntime, OMNIHUMAN_V15 } from "./ltv-omnihuman";
import { assertHailuoRuntimeOptions } from "./ltv-hailuo-options";
import { VIDU_Q2_PRO, assertViduQ2 } from "./ltv-viduq2";
import {
    HAPPYHORSE_TEXT_CONTRACT,
    HAPPYHORSE_TEXT_PROVIDER,
    assertHappyHorseText,
    HAPPYHORSE_REFERENCE_CONTRACT,
    HAPPYHORSE_REFERENCE_PROVIDER,
    HAPPYHORSE_FIRST_FRAME_CONTRACT,
    HAPPYHORSE_FIRST_FRAME_PROVIDER,
    assertHappyHorseFirstFrame,
    assertHappyHorseReferences,
    happyHorseFirstFrameTaskMetadata,
    happyHorseReferenceTaskMetadata,
} from "./ltv-happyhorse-options";
import { assertTopazImageConfig } from "./ltv-topaz-image";
import { assertTopazVideoConfig } from "./ltv-topaz-video";
import { assertArkImageSequentialConfig } from "./ltv-ark-image-options";
import { assertLtvAudioSemantics } from "./ltv-audio-options";
import { assertMurekaMusic, MUREKA_INSTRUMENTAL } from "./ltv-music-options";
import { assertElevenV3, ELEVEN_V3 } from "./ltv-eleven-v3";
import { assertMiniMaxSpeech, MINIMAX_SPEECH } from "./ltv-minimax-speech";
import { assertWanxPromptExtendConfig, LTV_WANX_PROMPT_EXTEND_CONTRACT, LTV_WANX_PROMPT_EXTEND_PROVIDER } from "./ltv-wanx-options";
import { ltvMaskEditMask } from "./ltv-mask-edit";
import { imageBackgroundTaskMetadata } from "./ltv-image-background";
import { ltvTextReferenceBody } from "./ltv-runtime-references";
import { backendProviderConfig, logicalModelIDForConfig, runBackendGenerationTask, type GenerationTaskDependencies } from "@/services/api/generation-task";
import {
    configuredModelMatchesCapability,
    defaultConfig,
    normalizeModelOptionValue,
    normalizeRunningHubCapability,
    type AiConfig,
    type WorkflowFieldMapping,
    modelOptionName,
    resolveModelChannel,
    resolveModelRequestConfig,
} from "@/stores/use-config-store";
import { resolveImageUrl, uploadImage } from "@/services/image-storage";
import { resolveMediaUrl, resolveVideoMediaUrl } from "@/services/file-storage";
import { resourceIdFromStorageKey } from "@/services/api/resources";
import { NODE_DEFAULT_SIZE } from "@/constant/canvas";
import { normalizeVideoDuration, normalizeVideoResolution } from "@/lib/video-generation-options";
import {
    modelCapabilityConfigFor,
    workflowFieldCurrentValue,
    workflowFieldHasStoredValue,
    workflowFieldKey,
    workflowFieldRandomKey,
    workflowFieldSubmissionValue,
    workflowOutputSizeValue,
    workflowVideoFieldsFromJson,
    videoDurationAllowed,
} from "@/lib/model-capabilities";
import { isSeedanceVideoConfig } from "@/lib/seedance-video";
import { modelRequestOptions, resolveCompatibleModel, resolveModelGenerationDefaults, resolveVideoOperation, type ModelGenerationDefaults, type ModelRequirements } from "@/lib/model-selection";
import { currentGenerationBatchLimit } from "@/lib/generation-batch-limit";
import { imageMetadata } from "@/lib/canvas/canvas-generation-task-sync";
import { producedModelCandidateForGeneration } from "@/lib/canvas/produced-model";
import { ensureMediaNodeMinimumSize } from "@/lib/canvas/canvas-node-size";
import { interruptFileUpload } from "@/lib/canvas/canvas-file-upload";
import { isCanvasWorkflowProvider, resolveCanvasWorkflowProvider } from "@/lib/canvas/canvas-workflow";
import { canvasVideoOperation, canvasVideoReferenceMode, usesProjectedVideoReferences } from "./canvas-video-reference-mode";
import type { CanvasNodeGenerationMode } from "@/components/canvas/canvas-node-prompt-panel";
import { CanvasNodeType, type CanvasAssistantSession, type CanvasConnection, type CanvasImageGenerationType, type CanvasNodeData, type CanvasNodeMetadata, type CanvasVideoEditOperation } from "@/types/canvas";
import type { ReferenceImage } from "@/types/image";
import type { ReferenceAudio, ReferenceVideo } from "@/types/media";
import { generationSpecMetadata, readNodeGenerationSpec, resolveGenerationSelection } from "@/lib/canvas/generation-contract";
import { withReferenceImageSize, type ImageDimensions } from "@/lib/canvas/canvas-reference-image-size";

export async function runBackendCanvasGenerationTask(
    {
        projectId,
        nodeId,
        mode,
        prompt,
        config,
        referenceImages = [],
        referenceVideos = [],
        referenceAudios = [],
        mask,
        signal,
        metadata,
        onTaskCreated,
        clientOperationId,
        retryOf,
        attemptGroupId,
    }: {
        projectId: string;
        nodeId: string;
        mode: CanvasNodeGenerationMode;
        prompt: string;
        config: AiConfig;
        referenceImages?: ReferenceImage[];
        referenceVideos?: ReferenceVideo[];
        referenceAudios?: ReferenceAudio[];
        mask?: ReferenceImage;
        signal?: AbortSignal;
        metadata?: Record<string, unknown>;
        onTaskCreated?: (task: GenerationTask) => void;
        clientOperationId?: string;
        retryOf?: string;
        attemptGroupId?: string;
    },
    dependencies?: GenerationTaskDependencies,
) {
    if (mode === "image") assertCanvasImageReferenceLimit(config, referenceImages);
    return runBackendGenerationTask(
        {
            projectId,
            mode,
            prompt,
            config,
            referenceImages,
            referenceVideos,
            referenceAudios,
            mask,
            signal,
            metadata: { nodeId, ...metadata },
            onTaskUpdate: onTaskCreated,
            clientOperationId,
            retryOf,
            attemptGroupId,
        },
        dependencies,
    );
}

export function canvasImageReferenceLimitError(config: AiConfig, referenceImages: ReferenceImage[]) {
    // 工作流的参考素材上限由字段映射槽位决定，不能再套用当前普通图片模型的能力表。
    if ((config.taskWorkflowProvider || "model") !== "model") return "";
    const maxImages = modelCapabilityConfigFor(config, config.model).image?.references.maxImages;
    if (maxImages === undefined || referenceImages.length <= maxImages) return "";
    return `当前图片模型最多支持 ${maxImages} 张参考图，当前已连接 ${referenceImages.length} 张。请移除多余连线后重试`;
}

export function assertCanvasImageReferenceLimit(config: AiConfig, referenceImages: ReferenceImage[]) {
    const error = canvasImageReferenceLimitError(config, referenceImages);
    if (error) throw new Error(error);
}

export { backendProviderConfig };
// 兼容故事板执行器的旧导入路径。
export { logicalModelIDForConfig };

const generationOperationLocks = new Map<string, Promise<unknown>>();

export function runGenerationOperationOnce<T>(clientOperationId: string | undefined, operation: () => Promise<T>): Promise<T> {
    if (!clientOperationId) return operation();
    const existing = generationOperationLocks.get(clientOperationId) as Promise<T> | undefined;
    if (existing) return existing;
    const running = operation().finally(() => {
        if (generationOperationLocks.get(clientOperationId) === running) generationOperationLocks.delete(clientOperationId);
    });
    generationOperationLocks.set(clientOperationId, running);
    return running;
}

export async function runCanvasGenerationTaskToConsumer(
    input: Parameters<typeof runBackendCanvasGenerationTask>[0],
    dependencies: {
        bindTask(task: GenerationTask): void;
        consumeTask(task: GenerationTask): Promise<void>;
        runTask?: (options: Parameters<typeof runBackendCanvasGenerationTask>[0]) => ReturnType<typeof runBackendCanvasGenerationTask>;
    },
) {
    return runGenerationOperationOnce(input.clientOperationId, async () => {
        let completedTask: GenerationTask | undefined;
        const result = await (dependencies.runTask ?? runBackendCanvasGenerationTask)({
            ...input,
            onTaskCreated: (task) => {
                input.onTaskCreated?.(task);
                dependencies.bindTask(task);
                if (task.status === "succeeded") completedTask = task;
            },
        });
        if (!completedTask) throw new Error("生成任务缺少成功终态");
        await dependencies.consumeTask(completedTask);
        return result;
    });
}

export type GenerationRetryContext = {
    retryOf: string;
    attemptGroupId: string;
    clientOperationId: string;
};

export async function createGenerationRetryContext(retryOf: string, attemptGroupId = retryOf): Promise<GenerationRetryContext> {
    const bytes = new TextEncoder().encode(`generation-retry\0${attemptGroupId}\0${retryOf}`);
    const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
    const hex = Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join("");
    return { retryOf, attemptGroupId, clientOperationId: `retry:${hex}` };
}

export function createGenerationBatchRetryContexts(taskIds: readonly string[], attemptGroupId: string) {
    return Promise.all(taskIds.map((taskId) => createGenerationRetryContext(taskId, attemptGroupId)));
}

export function generationTaskMetadata(task: GenerationTask): CanvasNodeMetadata {
    const progress = normalizeTaskProgress(task.progress, task.status);
    return {
        taskId: task.id,
        taskClientOperationId: task.clientOperationId,
        retryOf: task.retryOf,
        attemptGroupId: task.attemptGroupId,
        taskStatus: task.status,
        taskProgress: progress,
        taskStage: task.stage,
        taskMediaStage: task.mediaStage,
        taskCanRecoverMedia: task.canRecoverMedia,
        taskProvider: task.provider,
        taskStartedAt: task.startedAt,
        taskCompletedAt: task.completedAt,
        taskDurationMs: task.startedAt && task.completedAt ? Math.max(0, Date.parse(task.completedAt) - Date.parse(task.startedAt)) : undefined,
        taskErrorCode: task.errorCode,
        taskOfficialStatus: task.officialStatus,
        taskReceiptRecorded: task.receiptRecorded,
        taskCreatedAt: task.createdAt || task.created_at,
        taskUpdatedAt: task.updatedAt || task.updated_at,
    };
}

export { resetGenerationTaskMetadata } from "@/lib/canvas/canvas-task-state";

function normalizeTaskProgress(progress: number | undefined, status: GenerationTask["status"]) {
    if (typeof progress === "number" && Number.isFinite(progress)) return Math.max(0, Math.min(100, Math.round(progress)));
    if (status === "queued") return 0;
    if (status === "succeeded") return 100;
    return undefined;
}

export function imageExtension(dataUrl: string) {
    return dataUrl.match(/^data:image[/]([^;]+)/)?.[1] || dataUrl.match(/image[/]([^;]+)/)?.[1] || "png";
}

export function audioExtension(mimeType?: string) {
    if (mimeType?.includes("wav")) return "wav";
    if (mimeType?.includes("opus")) return "opus";
    if (mimeType?.includes("aac")) return "aac";
    if (mimeType?.includes("flac")) return "flac";
    if (mimeType?.includes("pcm")) return "pcm";
    return "mp3";
}

export function buildImageGenerationMetadata(type: CanvasImageGenerationType, config: AiConfig, count: number, references: ReferenceImage[]): CanvasNodeMetadata {
    return {
        ...generationWorkflowMetadata(config),
        generationType: type,
        model: config.model,
        producedModelCandidate: producedModelCandidateForGeneration(config),
        size: config.size,
        quality: config.quality,
        transparentBackground: config.transparentBackground,
        count,
        references: references.map(referenceUrl).filter((url): url is string => Boolean(url)),
    };
}

export function nodeReferenceImage(node: CanvasNodeData): ReferenceImage | null {
    if (node.type === CanvasNodeType.MediaConversion) {
        // 转换结果只在成功物化后作为生成参考；运行中、跳过和失败状态都不能透传旧结果。
        const conversion = node.metadata?.mediaConversion;
        const storageKey = conversion?.resultStorageKey || node.metadata?.storageKey;
        if (conversion?.status !== "completed" || !storageKey) return null;
        return {
            id: node.id,
            name: node.title || `conversion-${node.id}.png`,
            type: node.metadata?.mimeType || "image/png",
            dataUrl: node.metadata?.content || "",
            storageKey,
        };
    }
    if (node.type !== CanvasNodeType.Image || (!node.metadata?.content && !node.metadata?.storageKey)) return null;
    return {
        id: node.id,
        name: `reference-${node.id}.png`,
        type: node.metadata.mimeType || "image/png",
        dataUrl: node.metadata.content || "",
        storageKey: node.metadata.storageKey,
    };
}

export function buildAudioGenerationMetadata(config: AiConfig): CanvasNodeMetadata {
    return {
        ...generationWorkflowMetadata(config),
        model: config.model,
        producedModelCandidate: producedModelCandidateForGeneration(config),
        audioMode: config.audioMode,
        audioVoice: config.audioVoice,
        audioFormat: config.audioFormat,
        audioSpeed: config.audioSpeed,
        audioLanguage: config.audioLanguage,
        audioDialect: config.audioDialect,
        audioInstructions: config.audioInstructions,
        audioEmotionControlMethod: config.audioEmotionControlMethod,
        audioEmotionRandom: config.audioEmotionRandom,
        audioEmotionHappy: config.audioEmotionHappy,
        audioEmotionAngry: config.audioEmotionAngry,
        audioEmotionSad: config.audioEmotionSad,
        audioEmotionAfraid: config.audioEmotionAfraid,
        audioEmotionDisgusted: config.audioEmotionDisgusted,
        audioEmotionMelancholic: config.audioEmotionMelancholic,
        audioEmotionSurprised: config.audioEmotionSurprised,
        audioEmotionCalm: config.audioEmotionCalm,
    };
}

function referenceUrl(image: ReferenceImage) {
    return image.storageKey || image.url || (!image.dataUrl.startsWith("data:") ? image.dataUrl : undefined);
}

export async function resolveStoredReferenceImages(references?: string[]) {
    if (!references?.length) return [];
    const imageReferences = references.filter(isStoredImageReference);
    const images = await Promise.all(
        imageReferences.map(async (url, index) => {
            const storageKey = url.startsWith("image:") || resourceIdFromStorageKey(url) ? url : undefined;
            const dataUrl = storageKey ? await resolveImageUrl(storageKey, "") : url;
            if (!dataUrl) return null;
            return {
                id: `${index}`,
                name: `reference-${index + 1}.png`,
                type: imageMimeType(dataUrl),
                dataUrl,
                url: /^https?:\/\//i.test(dataUrl) ? dataUrl : undefined,
                storageKey,
            };
        }),
    );
    return images.every(Boolean) ? (images as ReferenceImage[]) : null;
}

function isStoredImageReference(url: string) {
    return resourceIdFromStorageKey(url) || url.startsWith("image:") || url.startsWith("data:image/") || /\.(png|jpe?g|webp|gif|avif)(?:[?#]|$)/i.test(url);
}

function imageMimeType(url: string) {
    return url.match(/^data:(image\/[^;,]+)/)?.[1] || "image/png";
}

export function generationReferenceUrls(context: { referenceImages: ReferenceImage[]; referenceVideos: Array<{ storageKey?: string; url?: string }>; referenceAudios?: Array<{ storageKey?: string; url?: string }> }) {
    return [
        ...context.referenceImages.map(referenceUrl).filter((url): url is string => Boolean(url)),
        ...context.referenceVideos.map((video) => video.storageKey || video.url).filter((url): url is string => Boolean(url)),
        ...(context.referenceAudios || []).map((audio) => audio.storageKey || audio.url).filter((url): url is string => Boolean(url)),
    ];
}

function resolveVideoEditOperation(
    node: CanvasNodeData | undefined,
    context?: {
        referenceImages: ReferenceImage[];
        referenceVideos: ReferenceVideo[];
        referenceAudios: ReferenceAudio[];
    },
): CanvasVideoEditOperation {
    const input = {
        textCount: 0,
        imageCount: context?.referenceImages.length || 0,
        videoCount: context?.referenceVideos.length || 0,
        audioCount: context?.referenceAudios.length || 0,
        characterCount: 0,
    };
    return resolveVideoOperation(input, canvasVideoOperation(node, input), Boolean(node?.metadata?.ltvReferencePlan || node?.metadata?.generationInputRequirements)) as CanvasVideoEditOperation;
}

export function buildVideoGenerationMetadata(
    node: CanvasNodeData | undefined,
    context?: {
        referenceImages: ReferenceImage[];
        referenceVideos: ReferenceVideo[];
        referenceAudios: ReferenceAudio[];
    },
    config?: AiConfig,
): CanvasNodeMetadata {
    const metadata = node?.metadata;
    if (metadata?.ltvExecutionContract === VOLCANO_SUBTITLE_ERASE && context && config) {
        assertSubtitleErase(metadata, config, { image: context.referenceImages.length, video: context.referenceVideos.length, audio: context.referenceAudios.length }, metadata.composerContent ?? metadata.prompt ?? "");
        assertSubtitleEraseMedia(context.referenceVideos);
    }
    if (metadata?.ltvExecutionContract === VOLCANO_VIDEO_ENHANCE && context && config) assertVolcanoVideoEnhance(metadata, config, context, metadata.composerContent ?? metadata.prompt ?? "");
    if (metadata?.ltvExecutionContract === OMNIHUMAN_V15 && context && config) assertOmniHumanRuntime(metadata, config, context);
    if (metadata?.videoWebSearch !== undefined && context && config) assertArkRuntimeReferences(modelOptionName(config.model), context);
    if (metadata?.videoKling && context && config) assertKlingRuntimeOptions(metadata.videoKling, modelOptionName(config.model), config.vquality, config.videoSeconds, config.videoGenerateAudio, context, metadata.ltvExecutionContract);
    const referenceImageIds = new Set((context?.referenceImages || []).map((image) => image.id));
    const workflowVideo = node?.type === CanvasNodeType.Config && (config?.taskWorkflowProvider === "runninghub" || isCanvasWorkflowProvider(metadata));
    const videoMode = canvasVideoReferenceMode(node, referenceImageIds.size > 0);
    const useFrames = !workflowVideo && (videoMode === undefined || videoMode === "frames" || usesProjectedVideoReferences(node));
    const startFrame = useFrames ? requireConnectedVideoFrame(metadata?.videoStartFrameNodeId, "首帧", referenceImageIds) : undefined;
    const endFrame = useFrames ? requireConnectedVideoFrame(metadata?.videoEndFrameNodeId, "尾帧", referenceImageIds) : undefined;
    return {
        ...(config ? generationWorkflowMetadata(config) : {}),
        videoEditOperation: resolveVideoEditOperation(node, context),
        videoCameraMoveId: metadata?.videoCameraMoveId,
        videoCameraMovePrompt: metadata?.videoCameraMovePrompt,
        videoStartFrameNodeId: startFrame,
        videoEndFrameNodeId: endFrame,
        videoWebSearch: metadata?.videoWebSearch,
        videoKling: metadata?.videoKling ? { ...metadata.videoKling } : undefined,
        videoUpscale: metadata?.videoUpscale ? { ...metadata.videoUpscale } : undefined,
        videoSubtitleErase: metadata?.videoSubtitleErase
            ? { ...metadata.videoSubtitleErase, ...(metadata.videoSubtitleErase.eraseRatioLocation ? { eraseRatioLocation: metadata.videoSubtitleErase.eraseRatioLocation.map((box) => ({ ...box })) } : {}) }
            : undefined,
        omniHuman: metadata?.omniHuman ? { ...metadata.omniHuman } : undefined,
        wanxPromptExtend: metadata?.wanxPromptExtend ? { ...metadata.wanxPromptExtend } : undefined,
        ltvExecutionContract: metadata?.ltvExecutionContract,
        ltvHailuoModel: metadata?.ltvHailuoModel,
        ltvViduModel: metadata?.ltvViduModel,
        ltvHappyHorseModel: metadata?.ltvHappyHorseModel,
        imageEnhancement: metadata?.imageEnhancement ? { ...metadata.imageEnhancement } : undefined,
        videoEnhancement: metadata?.videoEnhancement ? { ...metadata.videoEnhancement } : undefined,
        ltvReferencePlan: metadata?.ltvReferencePlan ? structuredClone(metadata.ltvReferencePlan) : undefined,
        strictGenerationOptions: metadata?.strictGenerationOptions ? [...metadata.strictGenerationOptions] : undefined,
    };
}

function requireConnectedVideoFrame(frameNodeId: string | undefined, label: string, referenceImageIds: Set<string>) {
    if (!frameNodeId) return undefined;
    if (referenceImageIds.has(frameNodeId)) return frameNodeId;
    throw new Error(`已配置的${label}参考图未连接或不可用，请重新选择后再生成`);
}

export async function resolveMetadataReferences(metadata: CanvasNodeMetadata) {
    if (metadata.generationType !== "edit") return [];
    if (!metadata.references?.length) return null;
    return resolveStoredReferenceImages(metadata.references);
}

export async function hydrateCanvasImages(nodes: CanvasNodeData[]) {
    return Promise.all(
        nodes.map(async (node) => {
            const content = node.metadata?.content;
            const videoPreview =
                node.type === CanvasNodeType.Video && node.metadata?.videoPreview?.storageKey
                    ? { ...node.metadata.videoPreview, content: await resolveImageUrl(node.metadata.videoPreview.storageKey, node.metadata.videoPreview.content, { cacheMiss: true }) }
                    : node.metadata?.videoPreview;
            if ((node.type === CanvasNodeType.Video || node.type === CanvasNodeType.Audio) && node.metadata?.storageKey)
                return { ...node, metadata: { ...node.metadata, content: node.type === CanvasNodeType.Video ? await resolveVideoMediaUrl(node.metadata.storageKey, content) : await resolveMediaUrl(node.metadata.storageKey, content), videoPreview } };
            if (videoPreview !== node.metadata?.videoPreview) return { ...node, metadata: { ...node.metadata, videoPreview } };
            if (node.type === CanvasNodeType.Image && node.metadata?.storageKey) return { ...node, metadata: { ...node.metadata, content: await resolveImageUrl(node.metadata.storageKey, content, { cacheMiss: true }) } };
            if (node.type !== CanvasNodeType.Image || !content) return node;
            if (!content.startsWith("data:image/")) return node;
            return { ...node, metadata: { ...node.metadata, ...imageMetadata(await uploadImage(content)) } };
        }),
    );
}

export async function hydrateAssistantImages(sessions: CanvasAssistantSession[]) {
    const hydrateItem = async <T extends { dataUrl?: string; storageKey?: string }>(item: T) => {
        if (item.storageKey) return { ...item, dataUrl: await resolveImageUrl(item.storageKey, item.dataUrl) };
        if (item.dataUrl?.startsWith("data:image/")) {
            const image = await uploadImage(item.dataUrl);
            return { ...item, dataUrl: image.url, storageKey: image.storageKey };
        }
        return item;
    };
    return Promise.all(
        sessions.map(async (session) => ({
            ...session,
            messages: await Promise.all(
                session.messages.map(async (message) => ({
                    ...message,
                    references: await Promise.all((message.references || []).map(hydrateItem)),
                })),
            ),
        })),
    );
}

export function getGenerationCount(count: string) {
    return Math.max(1, Math.min(15, currentGenerationBatchLimit(), Math.floor(Math.abs(Number(count)) || 1)));
}

export function generationWorkflowMetadata(config: AiConfig): Pick<CanvasNodeMetadata, "workflowProvider" | "runningHubWorkflowId" | "runningHubWorkflowKind"> {
    const provider = config.taskWorkflowProvider || "model";
    return {
        workflowProvider: provider,
        runningHubWorkflowId: provider === "runninghub" ? config.runningHub.workflowId : undefined,
        runningHubWorkflowKind: provider === "runninghub" ? config.runningHub.selectedKind : undefined,
    };
}

export function buildGenerationConfig(config: AiConfig, node: CanvasNodeData | undefined, mode: CanvasNodeGenerationMode, requirements?: ModelRequirements, displayOnly = false, referenceImage?: ImageDimensions): AiConfig {
    const generationSpec = node ? readNodeGenerationSpec(node) : undefined;
    const selection = generationSpec?.mode === mode ? generationSpec.modelSelection : undefined;
    const selectedModel = resolveGenerationSelection(config, selection);
    if (selection && !selectedModel && !displayOnly) throw new Error("节点选择的模型或渠道已不可用，请重新选择模型后生成");
    if (node && generationSpec?.mode === mode) node = { ...node, metadata: { ...node.metadata, ...generationSpecMetadata(generationSpec) } };
    // 只有独立 Config 节点读取工作流元数据；普通图片/视频/音频节点始终按基础模型生成。
    const workflowProvider = mode !== "text" && node?.type === CanvasNodeType.Config && resolveCanvasWorkflowProvider(node.metadata) === "runninghub" ? "runninghub" : "model";
    const defaultModel = mode === "image" ? config.imageModel : mode === "video" ? config.videoModel : mode === "audio" ? config.audioModel : config.textModel;
    const fallbackModel = mode === "image" ? defaultConfig.imageModel : mode === "video" ? defaultConfig.videoModel : mode === "audio" ? defaultConfig.audioModel : defaultConfig.textModel;
    const storedModel = resolveCanvasGenerationModel(config, selectedModel || node?.metadata?.model, mode);
    if (selection && selectedModel && !storedModel && !displayOnly) throw new Error("节点选择的模型不支持当前生成模式，请重新选择");
    const preferredModel = storedModel || resolveCanvasGenerationModel(config, defaultModel, mode) || fallbackModel;
    // 图生图未明确选择尺寸时按参考图比例生成；随后的路由与默认值都把它当作节点选择。
    if (mode === "image" && workflowProvider === "model" && node) node = withReferenceImageSize(config, node, preferredModel, referenceImage);
    // 先合并节点上的实时选择，再做兼容性匹配。否则路由只看到全局默认值，节点改过的时长、分辨率或布尔能力无法参与分流。
    const workflowParameters = node?.metadata?.workflowParameters || {};
    const runningHubWorkflowId = node?.metadata?.runningHubWorkflowId?.trim() || config.runningHub.workflowId.trim();
    const selectedRunningHubWorkflow =
        workflowProvider === "runninghub"
            ? config.runningHub.workflows.find((item) => item.workflowId.trim() === runningHubWorkflowId && (!node?.metadata?.runningHubWorkflowKind || (item.kind === "app" ? "app" : "workflow") === node.metadata.runningHubWorkflowKind))
            : undefined;
    const selectedWorkflowFields = workflowProvider === "runninghub" ? (selectedRunningHubWorkflow?.fields?.length ? selectedRunningHubWorkflow.fields : workflowVideoFieldsFromJson(selectedRunningHubWorkflow?.workflowJson)) : [];
    const workflowOutputSize = workflowProvider === "model" ? "" : workflowOutputSizeValue(selectedWorkflowFields, workflowParameters);
    const workflowParameterValue = (source: string) => {
        const value = workflowParameters[`source:${source}`];
        return value === undefined || value === null ? undefined : String(value);
    };
    const requestedConfig: AiConfig = {
        ...config,
        quality: node?.metadata?.quality ?? workflowParameterValue("quality") ?? config.quality ?? defaultConfig.quality,
        imageResolution: node?.metadata?.imageResolution ?? config.imageResolution ?? defaultConfig.imageResolution,
        imageParameters: node?.metadata?.imageParameters ?? config.imageParameters ?? "{}",
        size: workflowProvider === "model" ? (node?.metadata?.size ?? config.size ?? defaultConfig.size) : workflowOutputSize || node?.metadata?.size || config.size || defaultConfig.size,
        transparentBackground: node?.metadata?.transparentBackground ?? config.transparentBackground ?? defaultConfig.transparentBackground,
        videoSeconds:
            workflowProvider === "model"
                ? normalizeVideoDuration(node?.metadata?.seconds ?? workflowParameterValue("videoSeconds") ?? config.videoSeconds ?? defaultConfig.videoSeconds)
                : String(node?.metadata?.seconds ?? workflowParameterValue("videoSeconds") ?? config.videoSeconds ?? defaultConfig.videoSeconds),
        vquality:
            workflowProvider === "model"
                ? normalizeVideoResolution(node?.metadata?.vquality ?? workflowParameterValue("vquality") ?? config.vquality ?? defaultConfig.vquality)
                : String(node?.metadata?.vquality ?? workflowParameterValue("vquality") ?? config.vquality ?? defaultConfig.vquality),
        videoGenerateAudio: node?.metadata?.generateAudio ?? config.videoGenerateAudio ?? defaultConfig.videoGenerateAudio,
        videoWatermark: node?.metadata?.watermark ?? config.videoWatermark ?? defaultConfig.videoWatermark,
        videoArkPrivateAssetUpload: node?.metadata?.arkPrivateAssetUpload ?? config.videoArkPrivateAssetUpload ?? defaultConfig.videoArkPrivateAssetUpload,
        audioMode: node?.metadata?.audioMode ?? config.audioMode ?? defaultConfig.audioMode,
        audioVoice: node?.metadata?.audioVoice ?? config.audioVoice ?? defaultConfig.audioVoice,
        audioFormat: node?.metadata?.audioFormat ?? config.audioFormat ?? defaultConfig.audioFormat,
        audioSpeed: node?.metadata?.audioSpeed ?? config.audioSpeed ?? defaultConfig.audioSpeed,
        audioLanguage: node?.metadata?.audioLanguage ?? config.audioLanguage ?? defaultConfig.audioLanguage,
        audioDialect: node?.metadata?.audioDialect ?? config.audioDialect ?? defaultConfig.audioDialect,
        audioInstructions: node?.metadata?.audioInstructions ?? config.audioInstructions ?? defaultConfig.audioInstructions,
        count: String(node?.metadata?.count ?? (mode === "image" ? config.canvasImageCount || config.count || defaultConfig.count : config.count || defaultConfig.count)),
    };
    const imageSize = mode === "image" ? requestedConfig.size : undefined;
    // 当前模型保持用户选择；图片/视频旧参数在共同配置层按目标能力适配。
    const liveOptions = modelRequestOptions(requestedConfig, mode);
    const baseRequirements = requirements?.capability ? { ...requirements, options: { ...liveOptions, ...(requirements.options || {}) } } : { capability: mode, options: liveOptions };
    const model = workflowProvider === "model" ? resolveCompatibleModel(config, preferredModel, imageSize ? { ...baseRequirements, imageSize } : baseRequirements) || preferredModel : preferredModel;
    const generationDefaults: Partial<ModelGenerationDefaults> =
        workflowProvider === "model"
            ? resolveModelGenerationDefaults(
                  config,
                  model,
                  mode === "image" ? "image" : mode === "video" ? "video" : undefined,
                  mode === "image"
                      ? {
                            size: node?.metadata?.size,
                            imageResolution: node?.metadata?.imageResolution,
                            imageParameters: node?.metadata?.imageParameters,
                            quality: node?.metadata?.quality,
                            transparentBackground: node?.metadata?.transparentBackground,
                            count: requestedConfig.count,
                        }
                      : {
                            size: node?.metadata?.size,
                            videoSeconds: node?.metadata?.seconds,
                            vquality: node?.metadata?.vquality,
                            videoGenerateAudio: node?.metadata?.generateAudio,
                            videoWatermark: node?.metadata?.watermark,
                        },
                  {
                      size: requestedConfig.size,
                      imageResolution: requestedConfig.imageResolution,
                      imageParameters: requestedConfig.imageParameters,
                      quality: requestedConfig.quality,
                      transparentBackground: requestedConfig.transparentBackground,
                      count: requestedConfig.count,
                      videoSeconds: requestedConfig.videoSeconds,
                      vquality: requestedConfig.vquality,
                      videoGenerateAudio: requestedConfig.videoGenerateAudio,
                      videoWatermark: requestedConfig.videoWatermark,
                  },
              )
            : {};
    const modeCapability = mode === "video" || mode === "audio" ? mode : "image";
    const runningHubCapability = normalizeRunningHubCapability(selectedRunningHubWorkflow?.capability, normalizeRunningHubCapability(config.runningHub.capability));
    const runningHub = {
        ...config.runningHub,
        enabled: workflowProvider === "runninghub" && config.runningHub.enabled,
        selectedKind: selectedRunningHubWorkflow?.kind === "app" ? ("app" as const) : ("workflow" as const),
        workflowId: runningHubWorkflowId,
        capability: runningHubCapability,
        workflows:
            workflowProvider === "runninghub"
                ? config.runningHub.workflows.map((item) =>
                      item.workflowId.trim() === runningHubWorkflowId && (!node?.metadata?.runningHubWorkflowKind || (item.kind === "app" ? "app" : "workflow") === node.metadata.runningHubWorkflowKind)
                          ? { ...item, fields: applyWorkflowParameterValues(item.fields?.length ? item.fields : (workflowVideoFieldsFromJson(item.workflowJson) as WorkflowFieldMapping[]), workflowParameters) }
                          : item,
                  )
                : config.runningHub.workflows,
    };
    const result: AiConfig = {
        ...requestedConfig,
        taskWorkflowProvider: workflowProvider,
        runningHub,
        model,
        quality: generationDefaults.quality ?? requestedConfig.quality,
        imageResolution: generationDefaults.imageResolution ?? requestedConfig.imageResolution,
        imageParameters: generationDefaults.imageParameters ?? requestedConfig.imageParameters,
        size: generationDefaults.size ?? requestedConfig.size,
        transparentBackground: generationDefaults.transparentBackground || (requestedConfig.transparentBackground === "true" ? "true" : "false"),
        // Audio-driven OmniHuman has no independent duration; preserve its saved automatic mode.
        videoSeconds: node?.metadata?.ltvExecutionContract === VOLCANO_SUBTITLE_ERASE ? "" : node?.metadata?.ltvExecutionContract === OMNIHUMAN_V15 ? String(node.metadata.seconds ?? "") : (generationDefaults.videoSeconds ?? requestedConfig.videoSeconds),
        vquality: node?.metadata?.ltvExecutionContract === OMNIHUMAN_V15 ? String(node.metadata.vquality) : (generationDefaults.vquality ?? requestedConfig.vquality),
        videoGenerateAudio: generationDefaults.videoGenerateAudio ?? requestedConfig.videoGenerateAudio,
        videoWatermark: generationDefaults.videoWatermark ?? requestedConfig.videoWatermark,
        videoArkPrivateAssetUpload: requestedConfig.videoArkPrivateAssetUpload,
        count: generationDefaults.count || requestedConfig.count,
    };
    return workflowProvider === "model" ? resolvedMediaConfig(result, mode) : result;
}

export function assertCanvasGenerationRequirements(config: AiConfig, node: CanvasNodeData | undefined, mode: CanvasNodeGenerationMode, submittedPrompt?: string) {
    if (node?.metadata?.timelineComposition) throw new Error("独立剪辑工程请通过「进入剪辑」编辑和导出，不作为模型生成请求提交。");
    const metadata = node?.metadata;
    if (/^vidu/i.test(metadata?.generationModelProvenance?.sourceModel || "") && metadata?.ltvExecutionContract !== VIDU_Q2_PRO) throw new Error("原Vidu节点缺少同版本执行合同，不能使用通用模型替代。");
    if (metadata?.generationModelProvenance?.sourceModel?.startsWith("omnihuman-") && metadata.ltvExecutionContract !== OMNIHUMAN_V15) throw new Error("原OmniHuman节点缺少同版本执行合同，不能用通用视频模型代替。");
    if (metadata?.imageBackground !== undefined) {
        imageBackgroundTaskMetadata(metadata);
        const channel = resolveModelChannel(config, config.model);
        const registered = channel.modelCosts?.find((item) => item.model === modelOptionName(config.model));
        if (mode !== "image" || (registered?.protocol || channel.interfaceType) !== "openai-image") throw new Error("图片背景参数需要 OpenAI Images 协议，已停止丢参生成。");
        if (metadata.imageBackground === "transparent" && !registered?.capabilityConfig?.image?.transparentBackground?.supported) throw new Error("当前模型未声明透明背景能力，已停止生成。");
    }
    if (metadata?.ltvMaskEdit || metadata?.ltvExecutionContract === "ltv-mask-edit") {
        if (mode !== "image" || !metadata.ltvMaskEdit || metadata.ltvExecutionContract !== "ltv-mask-edit") throw new Error("局部编辑合同不完整，已停止生成。");
        const channel = resolveModelChannel(config, config.model);
        const model = modelOptionName(config.model);
        const registered = channel.modelCosts?.find((item) => item.model === model);
        if ((registered?.protocol || channel.interfaceType) !== "openai-image" || !registered?.capabilityConfig?.image?.references?.maskSupported) throw new Error("请选择明确支持蒙版的 OpenAI Images 模型，已停止整图重绘。");
        if (!["2K", "4K"].includes(metadata.ltvMaskEdit.sourceQuality) || !registered.capabilityConfig.image.size.values.includes(metadata.ltvMaskEdit.outputSize)) throw new Error("当前蒙版模型未登记源案例所需的精确输出尺寸，已停止降档生成。");
        if (metadata.ltvReferencePlan?.references.length !== 1 || metadata.ltvReferencePlan.references[0].kind !== "image") throw new Error("局部编辑必须保留唯一原图参考，已停止生成。");
        ltvMaskEditMask(metadata, [{ id: metadata.ltvReferencePlan.references[0].nodeId, name: "source.png", type: "image/png", dataUrl: metadata.ltvMaskEdit.sourceUrl }]);
    }
    if (mode === "audio") assertLtvAudioSemantics(metadata);
    if (metadata?.ltvExecutionContract === "topaz-video-enhance" || metadata?.videoEnhancement) {
        if (mode !== "video") throw new Error("Topaz 视频增强不能作为其它生成类型提交。");
        assertTopazVideoConfig(metadata, config);
        if (metadata.ltvReferencePlan?.references.some((ref) => ref.kind !== "video")) throw new Error("Topaz 视频增强不能忽略其它媒体输入。");
        return;
    }
    if (metadata?.ltvExecutionContract === "topaz-image-enhance" || metadata?.imageEnhancement) {
        if (mode !== "image") throw new Error("此节点为图像增强操作，请使用图像模式。");
        assertTopazImageConfig(metadata, config);
        if ((submittedPrompt ?? metadata.composerContent ?? metadata.prompt ?? "").trim()) throw new Error("Topaz 图像增强不接收提示词，不能忽略文字制作要求。");
        if (metadata.ltvReferencePlan?.references.some((ref) => ref.kind !== "image")) throw new Error("Topaz 图像增强只接收原图，不能忽略音视频输入。");
        return;
    }
    if (metadata?.ltvExecutionContract === LTV_WANX_PROMPT_EXTEND_CONTRACT) {
        if (mode !== "video") throw new Error("Wanx 智能扩写要求只能用于视频生成。");
        assertWanxPromptExtendConfig(metadata);
        const channel = resolveModelChannel(config, config.model);
        const model = modelOptionName(config.model);
        const protocol = channel.modelCosts?.find((item) => item.model === model)?.protocol || channel.interfaceType;
        if (protocol !== LTV_WANX_PROMPT_EXTEND_PROVIDER) throw new Error("当前模型的协议不能完整承接 Wanx 智能扩写，请选择 DashScope Wan 视频模型，已停止生成。");
    }
    if (!metadata?.strictGenerationOptions?.length) return;
    const sourceMode = metadata.generationMode || (node?.type === CanvasNodeType.Script ? "text" : node?.type);
    if (sourceMode !== mode) return;
    const fields = {
        model: ["model", "模型"],
        size: ["size", "画幅"],
        quality: ["quality", "图片质量"],
        transparentBackground: ["transparentBackground", "透明背景"],
        count: ["count", "生成数量"],
        seconds: ["videoSeconds", "视频时长"],
        vquality: ["vquality", "视频分辨率"],
        generateAudio: ["videoGenerateAudio", "视频声音"],
        watermark: ["videoWatermark", "水印"],
        audioVoice: ["audioVoice", "音色"],
        audioFormat: ["audioFormat", "音频格式"],
        audioSpeed: ["audioSpeed", "语速"],
        audioInstructions: ["audioInstructions", "配音要求"],
    } as const;
    for (const key of metadata.strictGenerationOptions) {
        const field = fields[key];
        if (!field) throw new Error("工作流包含无法识别的制作参数要求，已停止生成。");
        const value = metadata[key];
        // Read the current node value so an explicit edit updates the requirement as well.
        if (value === undefined) continue;
        const expected = key === "model" ? normalizeModelOptionValue(String(value), config.channels) || String(value) : key === "vquality" ? normalizeVideoResolution(String(value)) : String(value);
        const actual = key === "vquality" ? normalizeVideoResolution(String(config[field[0]])) : String(config[field[0]]);
        if (actual !== expected) throw new Error(`制作要求未满足：当前渠道无法保留节点「${node?.title || "制作步骤"}」指定的${field[1]}，已停止生成。请选用支持这些要求的模型，或修改该节点的要求。`);
    }
    if (metadata.ltvExecutionContract && metadata.ltvReferencePlan) {
        const channel = resolveModelChannel(config, config.model);
        const model = modelOptionName(config.model);
        const registeredModel = channel.modelCosts?.find((item) => item.model === model);
        const protocol = registeredModel?.protocol || channel.interfaceType;
        const contract = metadata.ltvExecutionContract;
        if (contract === OMNIHUMAN_V15) {
            if (mode !== "video") throw new Error("OmniHuman仅用于视频。");
            const refs = metadata.ltvReferencePlan.references;
            assertOmniHumanConfig(metadata, config, { image: refs.filter((r) => r.kind === "image").length, video: refs.filter((r) => r.kind === "video").length, audio: refs.filter((r) => r.kind === "audio").length });
            return;
        }
        if (contract === MINIMAX_SPEECH) {
            if (mode !== "audio") throw new Error("MiniMax配音不能用于其他媒体类型。");
            const prompt = submittedPrompt ?? [metadata.composerContent ?? metadata.prompt ?? metadata.ltvReferencePlan.prompt, ...(metadata.ltvReferencePlan.texts || []).map((ref) => ltvTextReferenceBody(ref))].join("\n\n");
            assertMiniMaxSpeech(metadata, config, prompt, metadata.ltvReferencePlan.references.length);
            return;
        }
        if (contract === VOLCANO_SUBTITLE_ERASE) {
            if (mode !== "video") throw new Error("字幕擦除只支持视频。");
            const refs = metadata.ltvReferencePlan.references;
            const prompt = submittedPrompt ?? [metadata.composerContent ?? metadata.prompt ?? metadata.ltvReferencePlan.prompt, ...(metadata.ltvReferencePlan.texts || []).map((ref) => ltvTextReferenceBody(ref))].join("\n\n");
            assertSubtitleErase(metadata, config, { image: refs.filter((r) => r.kind === "image").length, video: refs.filter((r) => r.kind === "video").length, audio: refs.filter((r) => r.kind === "audio").length }, prompt);
            return;
        }
        if (contract === VOLCANO_VIDEO_ENHANCE) {
            if (mode !== "video") throw new Error("火山视频增强不能用于其他媒体类型。");
            const refs = metadata.ltvReferencePlan.references;
            const prompt = submittedPrompt ?? [metadata.composerContent ?? metadata.prompt ?? metadata.ltvReferencePlan.prompt, ...(metadata.ltvReferencePlan.texts || []).map((ref) => ltvTextReferenceBody(ref))].join("\n\n");
            assertVolcanoVideoEnhance(metadata, config, { referenceImages: refs.filter((r) => r.kind === "image"), referenceVideos: refs.filter((r) => r.kind === "video"), referenceAudios: refs.filter((r) => r.kind === "audio") }, prompt);
            return;
        }
        if (contract === ELEVEN_V3) {
            const prompt = submittedPrompt ?? [metadata.composerContent ?? metadata.prompt ?? metadata.ltvReferencePlan.prompt, ...(metadata.ltvReferencePlan.texts || []).map((ref) => ltvTextReferenceBody(ref))].join("\n\n");
            if (mode !== "audio") throw new Error("Eleven V3配音不能用于其他媒体类型。");
            assertElevenV3(metadata, config, prompt, metadata.ltvReferencePlan.references.length);
            return;
        }
        if (contract === MUREKA_INSTRUMENTAL) {
            const prompt = submittedPrompt ?? [metadata.composerContent ?? metadata.prompt ?? metadata.ltvReferencePlan.prompt, ...(metadata.ltvReferencePlan.texts || []).map((ref) => ltvTextReferenceBody(ref))].join("\n\n");
            if (mode !== "audio") throw new Error("Mureka 纯音乐不能用于其他媒体类型。");
            assertMurekaMusic(metadata, config, prompt, metadata.ltvReferencePlan.references.length);
            return;
        }
        if (contract === "elevenlabs-music") {
            if (mode !== "audio" || protocol !== "elevenlabs-music" || !["music_v1", "music_v2", "music_v2_5"].includes(model)) throw new Error("请选择已配置的 ElevenLabs 音乐模型，不能用配音模型替代作曲。");
            const music = metadata.audioMusic;
            if (!music || music.provider !== contract || typeof music.forceInstrumental !== "boolean" || (music.durationMs !== undefined && (!Number.isInteger(music.durationMs) || music.durationMs < 3000 || music.durationMs > 600000)))
                throw new Error("音乐曲长或参数无效，请检查音乐设置。");
            if (metadata.ltvReferencePlan.references.length) throw new Error("此作曲接口不承接参考媒体，不能忽略已连接素材。");
            const prompt = submittedPrompt ?? [metadata.composerContent ?? metadata.prompt ?? metadata.ltvReferencePlan.prompt, ...(metadata.ltvReferencePlan.texts || []).map((ref) => ltvTextReferenceBody(ref))].join("\n\n");
            if (!prompt.trim() || Array.from(prompt).length > 5000) throw new Error("请填写不超过 5000 字的完整音乐描述，不能截断原文提交。");
            return;
        }
        if (
            contract === "kling-v26-video"
                ? protocol !== contract || model !== "kling-2.6"
                : contract === "kling-v3-turbo-video"
                  ? protocol !== contract || model !== "kling-3.0-turbo"
                  : contract === "kling-o1-video"
                    ? protocol !== contract || model !== "kling-video-o1"
                    : contract === "kling-v25-video"
                      ? protocol !== contract || model !== "kling-v2-5-turbo"
                      : contract === "kling-v3-video"
                        ? protocol !== contract || model !== "kling-v3"
                        : contract === "kling-omni-video"
                          ? protocol !== contract || model !== "kling-v3-omni"
                          : contract === "ark-video-search"
                            ? protocol !== "volcengine-ark-video" || !arkSearchModelLimits(model)
                            : contract === "gemini-image-search" || contract === "gemini-image"
                              ? protocol !== "gemini-image" || !/^gemini-(3-pro|3\.1-flash)-image(?:-preview)?$/.test(model)
                              : contract === "openai-image" || contract === "ltv-mask-edit"
                                ? protocol !== "openai-image"
                                : contract === "ark-image-sequential"
                                  ? protocol !== "volcengine-ark-image"
                                  : contract === "minimax-video" || contract === "minimax-video-v1" || contract === "minimax-hailuo02-video"
                                    ? protocol !== contract
                                    : contract === LTV_WANX_PROMPT_EXTEND_CONTRACT
                                      ? protocol !== LTV_WANX_PROMPT_EXTEND_PROVIDER
                                      : contract === VIDU_Q2_PRO
                                        ? mode !== "video" || protocol !== VIDU_Q2_PRO
                                        : contract === HAPPYHORSE_TEXT_CONTRACT
                                          ? mode !== "video" || protocol !== HAPPYHORSE_TEXT_PROVIDER
                                          : contract === HAPPYHORSE_FIRST_FRAME_CONTRACT
                                            ? mode !== "video" || protocol !== HAPPYHORSE_FIRST_FRAME_PROVIDER
                                            : contract === HAPPYHORSE_REFERENCE_CONTRACT
                                              ? mode !== "video" || protocol !== HAPPYHORSE_REFERENCE_PROVIDER
                                              : protocol !== "newapi-channel-2" || !/^Artdance 2\.5-(480p|720p|1080p)$/.test(model)
        ) {
            throw new Error("当前模型的协议不能完整承接此案例操作，请选择匹配协议的模型，已停止生成。");
        }
        if (contract === "artdance25" && normalizeVideoResolution(model.split("-").at(-1)) !== normalizeVideoResolution(config.vquality)) throw new Error("模型名称固定的分辨率与节点要求不一致，已停止生成。");
        if (contract === "kling-omni-video" || contract === "kling-v3-video") {
            if (!metadata.videoKling) throw new Error("案例缺少可灵质量与分镜设置。");
            assertKlingRuntimeOptions(metadata.videoKling, model, config.vquality, config.videoSeconds, config.videoGenerateAudio, { referenceImages: [], referenceVideos: [], referenceAudios: [] });
        }
        // The MiniMax V2 pass-through takes the ratio/resolution/duration verbatim and never sends
        // `generate_audio`, so the node's saved requirements are re-checked against the selected
        // channel's own values instead of being silently clamped by the client provider.
        if (contract === "minimax-video" || contract === "minimax-video-v1" || contract === "minimax-hailuo02-video") assertHailuoRuntimeOptions(model, config.vquality, config.videoSeconds, config.videoGenerateAudio, metadata.ltvHailuoModel, contract);
        // Seedream 组图要求随请求一起发往火山方舟，不能静默退回单图：这里核对组图参数与参考图上限。
        if (contract === "ark-image-sequential") assertArkImageSequentialConfig(metadata);
        const profile = modelCapabilityConfigFor(config, config.model);
        // Fallback UI defaults are not evidence that a configured provider supports an imported contract.
        if (!registeredModel?.capabilityConfig?.[mode === "image" ? "image" : "video"]) throw new Error("当前模型未登记完整制作规格，请先配置模型能力，已停止生成。");
        const limits = mode === "image" ? profile.image?.references : profile.video?.references;
        const plan = metadata.ltvReferencePlan;
        const counts = { image: 0, video: 0, audio: 0 };
        for (const ref of plan.references) counts[ref.kind]++;
        if (contract === "kling-v3-turbo-video" || contract === "kling-v26-video") {
            if (!metadata.videoKling || config.size !== "adaptive" || metadata.videoEditOperation !== "image_to_video") throw new Error("此可灵图生视频入口需保持原单首帧操作和自适应画幅。");
            assertKlingRuntimeOptions(
                metadata.videoKling,
                model,
                config.vquality,
                config.videoSeconds,
                config.videoGenerateAudio,
                { referenceImages: Array(counts.image), referenceVideos: Array(counts.video), referenceAudios: Array(counts.audio) },
                contract,
            );
        }
        if (contract === "kling-o1-video") {
            if (!metadata.videoKling) throw new Error("案例缺少可灵O1原品质档位。");
            assertKlingRuntimeOptions(
                metadata.videoKling,
                model,
                config.vquality,
                config.videoSeconds,
                config.videoGenerateAudio,
                { referenceImages: Array(counts.image), referenceVideos: Array(counts.video), referenceAudios: Array(counts.audio) },
                contract,
            );
            const frame = metadata.videoEditOperation === "image_to_video";
            if (frame ? counts.image < 1 || counts.image > 2 : metadata.videoEditOperation === "text_to_video" ? counts.image !== 0 : metadata.videoEditOperation !== "reference_to_video" || counts.image < 1)
                throw new Error("可灵O1参考数量与原始操作不匹配。");
            if (!["16:9", "9:16", "1:1"].includes(config.size) && !(frame && config.size === "adaptive")) throw new Error("可灵O1画幅不符合原操作。");
        }
        if (contract === "kling-v25-video") {
            if (!metadata.videoKling || config.size !== "adaptive") throw new Error("可灵2.5需保留原图自适应画幅和质量设置。");
            assertKlingRuntimeOptions(
                metadata.videoKling,
                model,
                config.vquality,
                config.videoSeconds,
                config.videoGenerateAudio,
                { referenceImages: Array(counts.image), referenceVideos: Array(counts.video), referenceAudios: Array(counts.audio) },
                contract,
            );
        }
        if (contract === VIDU_Q2_PRO) assertViduQ2(model, config.vquality, config.videoSeconds, config.size, config.videoGenerateAudio, metadata, counts);
        if (contract === HAPPYHORSE_REFERENCE_CONTRACT) assertHappyHorseReferences(model, config.vquality, config.videoSeconds, config.size, config.videoGenerateAudio, metadata, counts);
        if (contract === HAPPYHORSE_FIRST_FRAME_CONTRACT) assertHappyHorseFirstFrame(model, config.vquality, config.videoSeconds, config.size, config.videoGenerateAudio, metadata, counts);
        if (contract === "ark-video-search") {
            const native = arkSearchModelLimits(model)!;
            if (typeof metadata.videoWebSearch !== "boolean") throw new Error("案例缺少视频联网开关，已停止生成。");
            const tier = normalizeVideoResolution(config.vquality);
            const resolution = tier === "2160" ? "4k" : `${tier}p`;
            if (!native.resolutions.includes(resolution) || Number(config.videoSeconds) < 4 || Number(config.videoSeconds) > native.maxDuration) throw new Error("当前Seedance版本不支持案例指定的分辨率或时长。");
            if (counts.image > native.images || counts.video > native.videos || counts.audio > native.audios || (native.maxDuration === 15 && counts.audio > 0 && counts.image + counts.video === 0)) throw new Error("当前Seedance版本不支持这些参考输入。");
            for (const kind of ["video", "audio"] as const) {
                const refs = plan.references.filter((ref) => ref.kind === kind && !ref.deferred);
                if (refs.some((ref) => !Number.isFinite(ref.durationSec) || Number(ref.durationSec) < 2) || refs.reduce((total, ref) => total + Number(ref.durationSec), 0) > native.maxDuration)
                    throw new Error("视频或音频参考时长不符合当前Seedance版本要求。");
            }
        }
        const maxImages = limits?.maxImages ?? 0;
        const maxVideos = mode === "video" ? (profile.video?.references.maxVideos ?? 0) : 0;
        const maxAudios = mode === "video" ? (profile.video?.references.maxAudios ?? 0) : 0;
        if (counts.image > maxImages || counts.video > maxVideos || counts.audio > maxAudios) throw new Error("当前模型登记的参考数量不足，已停止生成。");
        const prompt = submittedPrompt ?? [metadata.composerContent ?? metadata.prompt ?? plan.prompt, ...(plan.texts || []).map((ref) => ltvTextReferenceBody(ref))].join("\n\n");
        if (contract === HAPPYHORSE_TEXT_CONTRACT) assertHappyHorseText(model, config.vquality, config.videoSeconds, config.size, config.videoGenerateAudio, metadata, counts, prompt);
        if (contract === HAPPYHORSE_REFERENCE_CONTRACT) happyHorseReferenceTaskMetadata(metadata, prompt, counts.image);
        if (contract === HAPPYHORSE_FIRST_FRAME_CONTRACT) happyHorseFirstFrameTaskMetadata(metadata, prompt, counts.image);
        if (!limits || !Number.isFinite(limits.promptMaxChars) || limits.promptMaxChars <= 0 || Array.from(prompt).length > limits.promptMaxChars) throw new Error("当前模型登记的正文长度不足，不能截断原文生成。");
        if (mode === "image") {
            const cap = profile.image!;
            if (cap.size.parameter === "none" || (!cap.size.allowCustom && !cap.size.values.includes(config.size))) throw new Error("当前模型未登记支持此图片尺寸，已停止生成。");
            if (!cap.quality.supported || !cap.quality.values.includes(config.quality)) throw new Error("当前模型未登记支持此图片质量，已停止生成。");
        }
        if (mode === "video") {
            const cap = profile.video!;
            if (!cap.operations.includes(metadata.videoEditOperation || "")) throw new Error("当前模型未登记此视频操作，已停止生成。");
            if (!cap.ratios.includes(config.size)) throw new Error("当前模型未登记支持此视频画幅，已停止生成。");
            if (!cap.resolutions.some((value) => normalizeVideoResolution(value) === normalizeVideoResolution(config.vquality))) throw new Error("当前模型未登记支持此视频分辨率，已停止生成。");
            if (!videoDurationAllowed(cap, Number(config.videoSeconds))) throw new Error("当前模型未登记支持此视频时长，已停止生成。");
            if (config.videoGenerateAudio === "true" && !cap.generateAudio.supported) throw new Error("当前模型未登记支持同步生成声音，已停止生成。");
            for (const ref of plan.references) {
                if (ref.kind === "image" || ref.deferred) continue;
                const maximum = ref.kind === "video" ? cap.references.maxVideoDurationSeconds : cap.references.maxAudioDurationSeconds;
                if (!Number.isFinite(ref.durationSec) || Number(ref.durationSec) <= 0 || !Number.isFinite(maximum) || Number(ref.durationSec) > maximum) throw new Error("参考素材时长未确认或超出当前模型限制，已停止生成。");
            }
        }
    }
    if (mode === "text" && metadata.ltvReferencePlan) {
        const limits = modelCapabilityConfigFor(config, config.model).text?.references;
        for (const [kind, limit, label] of [
            ["image", limits?.maxImages, "图片"],
            ["video", limits?.maxVideos, "视频"],
        ] as const) {
            const count = metadata.ltvReferencePlan.references.filter((ref) => ref.kind === kind).length;
            if (count > Number(limit || 0)) throw new Error(`当前文字模型未登记支持 ${count} 个${label}参考，请配置对应能力或选择支持该输入的模型。`);
        }
    }
}

export function resolveCanvasGenerationModel(config: AiConfig, model: string | undefined, mode: CanvasNodeGenerationMode): string {
    if (!model) return "";
    const normalized = normalizeModelOptionValue(model, config.channels);
    if (!normalized) return "";
    return configuredModelMatchesCapability(config, normalized, mode) ? normalized : "";
}

function applyWorkflowParameterValues(fields: WorkflowFieldMapping[] | undefined, values: Record<string, unknown>) {
    if (!fields?.length || !Object.keys(values).length) return fields;
    return fields.map((field) => {
        const key = workflowFieldKey(field);
        const randomKey = workflowFieldRandomKey(field);
        const hasValue = workflowFieldHasStoredValue(field, values);
        const hasRandom = Object.prototype.hasOwnProperty.call(values, randomKey);
        if (!hasValue && !hasRandom) return field;
        const value = workflowFieldSubmissionValue(field, workflowFieldCurrentValue(field, values));
        // 画布动态参数按具体字段覆盖，不能继续走 aspectRatio/quality 等全局来源，
        // 否则同一工作流中的两个同类参数会被折叠成同一个值。
        return {
            ...field,
            ...(hasValue ? { fieldValue: value, value } : {}),
            source: "",
            sourceAutomatic: false,
            sourceFromUpstream: false,
            randomEnabled: hasRandom ? values[randomKey] === true : hasValue ? false : field.randomEnabled,
        };
    });
}

// 与首次生成同一来源：模型能力声明了参考音频上限才带参考音频，不按协议 ID 或模型名判断。
export function supportsVideoReferenceAudio(config: AiConfig) {
    return (modelCapabilityConfigFor(config, config.model).video?.references.maxAudios ?? 0) > 0;
}

export function resetInterruptedGeneration(nodes: CanvasNodeData[]) {
    const configWidth = NODE_DEFAULT_SIZE[CanvasNodeType.Config].width;
    const configHeight = NODE_DEFAULT_SIZE[CanvasNodeType.Config].height;
    let changed = false;
    const reset = nodes.map((node) => {
        const mediaNode = ensureMediaNodeMinimumSize(interruptFileUpload(node));
        const resizedNode =
            mediaNode.type === CanvasNodeType.Config && (mediaNode.width < configWidth || mediaNode.height < configHeight)
                ? { ...mediaNode, width: Math.max(mediaNode.width, configWidth), height: Math.max(mediaNode.height, configHeight) }
                : mediaNode.type === CanvasNodeType.Script && mediaNode.height < NODE_DEFAULT_SIZE[CanvasNodeType.Script].height
                  ? { ...mediaNode, height: NODE_DEFAULT_SIZE[CanvasNodeType.Script].height }
                  : mediaNode;
        const restoredNode = resizedNode.metadata?.status === "loading" ? { ...resizedNode, metadata: { ...resizedNode.metadata, errorDetails: "正在从任务中心恢复生成状态..." } } : resizedNode;
        if (restoredNode !== node) changed = true;
        return restoredNode;
    });
    return changed ? reset : nodes;
}

export function isGenerationCanceled(error: unknown) {
    return error instanceof Error && (error.message === "请求已取消" || error.name === "AbortError");
}

export function findRetrySourceNode(nodeId: string, nodes: CanvasNodeData[], connections: CanvasConnection[]) {
    const queue = connections.filter((connection) => connection.toNodeId === nodeId).map((connection) => connection.fromNodeId);
    const visited = new Set<string>();
    while (queue.length) {
        const id = queue.shift()!;
        if (visited.has(id)) continue;
        visited.add(id);
        const node = nodes.find((item) => item.id === id);
        if (node?.type === CanvasNodeType.Config) return node;
        connections.filter((connection) => connection.toNodeId === id).forEach((connection) => queue.push(connection.fromNodeId));
    }
    return null;
}

export function sourceNodeReferenceImages(node: CanvasNodeData | null) {
    const reference = node ? nodeReferenceImage(node) : null;
    return reference ? [reference] : [];
}

export function isAudioFile(file: File) {
    return file.type.startsWith("audio/") || /\.(mp3|wav)$/i.test(file.name);
}
