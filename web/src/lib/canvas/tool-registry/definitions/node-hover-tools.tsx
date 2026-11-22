import {
    AudioLines,
    Captions,
    Clapperboard,
    CircleCheckBig,
    Download,
    FolderPlus,
    History,
    Images,
    Image as ImageIcon,
    Info,
    LoaderCircle,
    Lock,
    Maximize2,
    MessageSquare,
    Minus,
    Music2,
    Plus,
    RefreshCw,
    RotateCcw,
    RotateCw,
    Scissors,
    Settings2,
    Trash2,
    Unlock,
    Upload,
    UserRound,
    Video,
    ImageUpscale,
    Layers,
} from "lucide-react";

import { translateInterface, type InterfaceValues } from "@/lib/interface-locale";

import { CONTENT_MODERATION_ERROR_CODE, isContentModerationError } from "@/lib/generation-error";
import { registerToolbarTools, type ToolContext, type ToolDefinition } from "@/lib/canvas/tool-registry";
import { CanvasNodeType } from "@/types/canvas";
import { isCanvasImageSourceNode } from "@/lib/canvas/canvas-image-source";
import { canRotateCanvasImage, currentImageRotation } from "@/lib/canvas/canvas-image-rotation";
import { hasMediaVersionHistory, listMediaVersions } from "@/lib/canvas/canvas-media-versions";

const toolText = (ctx: ToolContext, key: string, values?: InterfaceValues) => translateInterface(ctx.locale ?? "zh-CN", key, values);

// 节点状态判定辅助函数——从 ToolContext 派生
function isImage(ctx: ToolContext) {
    return ctx.node?.type === CanvasNodeType.Image;
}
function isVideo(ctx: ToolContext) {
    return ctx.node?.type === CanvasNodeType.Video;
}
function isAudio(ctx: ToolContext) {
    return ctx.node?.type === CanvasNodeType.Audio;
}
function isText(ctx: ToolContext) {
    return ctx.node?.type === CanvasNodeType.Text;
}
function isConfig(ctx: ToolContext) {
    return ctx.node?.type === CanvasNodeType.Config;
}
function hasMediaPayload(ctx: ToolContext) {
    return Boolean(ctx.nodeMetadata?.content || ctx.nodeMetadata?.storageKey || ctx.nodeMetadata?.previewContent);
}
function hasImage(ctx: ToolContext) {
    return isImage(ctx) && hasMediaPayload(ctx);
}
function hasVideo(ctx: ToolContext) {
    return isVideo(ctx) && hasMediaPayload(ctx);
}
function hasAudio(ctx: ToolContext) {
    return isAudio(ctx) && Boolean(ctx.nodeMetadata?.content || ctx.nodeMetadata?.storageKey);
}
function isCharacterReference(ctx: ToolContext) {
    return isText(ctx) && ctx.nodeMetadata?.workflowKind === "character" && Boolean(ctx.nodeMetadata?.characterAssetId);
}
function isEditableText(ctx: ToolContext) {
    return isText(ctx) && !isCharacterReference(ctx);
}
function canOpenDialog(ctx: ToolContext) {
    return isEditableText(ctx) || (isImage(ctx) && !isCanvasImageSourceNode(ctx.node)) || isVideo(ctx);
}
function simpleMode(ctx: ToolContext) {
    return ctx.workspaceMode === "simple";
}
function isImageBatchRoot(ctx: ToolContext) {
    return isImage(ctx) && Boolean(ctx.nodeMetadata?.isBatchRoot && ctx.nodeMetadata.batchChildIds?.length);
}
function canRetry(ctx: ToolContext) {
    if (ctx.nodeMetadata?.fileUpload) return false;
    const requiresPromptChange = ctx.nodeMetadata?.generationErrorCode === CONTENT_MODERATION_ERROR_CODE || isContentModerationError(ctx.nodeMetadata?.errorDetails);
    const batchHasFailures = isImageBatchRoot(ctx) && (ctx.nodeMetadata?.batchFailedCount || (ctx.nodeMetadata?.status === "error" ? 1 : 0)) > 0;
    return (ctx.nodeMetadata?.status === "error" || (batchHasFailures && ctx.nodeMetadata?.status !== "loading")) && !requiresPromptChange;
}

export const nodeHoverToolbarTools: ToolDefinition[] = [
    {
        id: "createEditCopy",
        toolbar: "node-hover",
        category: "node-state",
        label: (ctx) => toolText(ctx, "nodeTools.createCopy"),
        displayLabel: (ctx) => toolText(ctx, "nodeTools.createCopy"),
        icon: <Images className="size-3.5" />,
        defaultVisible: true,
        defaultOrder: 195,
        nodeToolbar: { group: "process", order: 5, section: (ctx) => toolText(ctx, "nodeTools.copyGroup"), description: (ctx) => toolText(ctx, "nodeTools.copyHint") },
        applicable: (ctx) => hasImage(ctx) && !ctx.nodeMetadata?.imageLayerGroup && !ctx.nodeMetadata?.imageLayer && !ctx.nodeMetadata?.layerExtraction,
        disabled: (ctx) => Boolean(ctx.nodeMetadata?.fileUpload) || !ctx.handlers.onNodeCreateEditCopy,
        run: (ctx) => ctx.handlers.onNodeCreateEditCopy?.(ctx.node!),
    },
    ...(
        [
            { id: "rotateClockwise", labelKey: "nodeTools.rotateRight", direction: 1, icon: <RotateCw className="size-3.5" /> },
            { id: "rotateCounterclockwise", labelKey: "nodeTools.rotateLeft", direction: -1, icon: <RotateCcw className="size-3.5" /> },
            { id: "restoreImageOrientation", labelKey: "nodeTools.restoreRotation", direction: 0, icon: <RefreshCw className="size-3.5" /> },
        ] as const
    ).map((rotation, index): ToolDefinition => ({
        id: rotation.id,
        toolbar: "node-hover",
        category: "node-state",
        label: (ctx) => toolText(ctx, rotation.labelKey),
        displayLabel: (ctx) => toolText(ctx, rotation.labelKey),
        icon: rotation.icon,
        defaultVisible: true,
        defaultOrder: 200 + index,
        nodeToolbar: {
            group: (ctx) => (ctx.nodeMetadata?.imageEditSourceNodeId && rotation.direction !== 0 ? "primary" : "process"),
            order: 25 + index,
            section: (ctx) => toolText(ctx, "nodeTools.orientation"),
            description: (ctx) => toolText(ctx, "nodeTools.orientationHint"),
        },
        applicable: (ctx) => hasImage(ctx) && !ctx.nodeMetadata?.imageLayerGroup && !ctx.nodeMetadata?.imageLayer && !ctx.nodeMetadata?.layerExtraction,
        disabled: (ctx) => !ctx.node || !canRotateCanvasImage(ctx.node) || Boolean(ctx.rotatingImage) || !ctx.handlers.onNodeRotateImage || (rotation.direction === 0 && !currentImageRotation(ctx.node)?.quarterTurns),
        run: (ctx) => ctx.handlers.onNodeRotateImage?.(ctx.node!, rotation.direction),
    })),
    // 基础工具组
    {
        id: "info",
        toolbar: "node-hover",
        category: "node-state",
        label: (ctx) => (isCharacterReference(ctx) ? toolText(ctx, "nodeTools.viewCharacter") : toolText(ctx, "nodeTools.viewNode")),
        displayLabel: (ctx) => (isCharacterReference(ctx) ? toolText(ctx, "nodeTools.characterDetails") : toolText(ctx, "nodeTools.nodeInfo")),
        icon: (ctx) => (isCharacterReference(ctx) ? <UserRound className="size-3.5" /> : <Info className="size-3.5" />),
        defaultVisible: true,
        defaultOrder: 10,
        nodeToolbar: {
            group: (ctx) => (isCharacterReference(ctx) || (!isImage(ctx) && !isVideo(ctx) && !isAudio(ctx) && !isEditableText(ctx) && !isConfig(ctx)) ? "primary" : "more"),
            order: 10,
            section: (ctx) => toolText(ctx, "nodeTools.nodeManagement"),
        },
        run: (ctx) => ctx.handlers.onNodeInfo(ctx.node!),
    },
    {
        id: "delete",
        toolbar: "node-hover",
        category: "node-state",
        label: (ctx) => toolText(ctx, "nodeTools.remove"),
        displayLabel: (ctx) => toolText(ctx, "nodeTools.remove"),
        icon: <Trash2 className="size-3.5" />,
        defaultVisible: true,
        defaultOrder: 20,
        nodeToolbar: { group: "more", order: 1000, section: (ctx) => toolText(ctx, "nodeTools.danger") },
        danger: true,
        run: (ctx) => ctx.handlers.onNodeDelete(ctx.node!),
    },
    // 节点操作工具组——通过 applicable 谓词实现上下文感知
    {
        id: "retry",
        toolbar: "node-hover",
        category: "node-state",
        label: (ctx) => (isImageBatchRoot(ctx) ? toolText(ctx, "nodeTools.retryBatch") : toolText(ctx, "nodeTools.regenerate")),
        displayLabel: (ctx) => (isImageBatchRoot(ctx) ? toolText(ctx, "nodeTools.retryFailed") : toolText(ctx, "nodeTools.retry")),
        icon: <RefreshCw className="size-3.5" />,
        defaultVisible: true,
        defaultOrder: 30,
        nodeToolbar: { group: "primary", order: 5 },
        applicable: canRetry,
        run: (ctx) => ctx.handlers.onNodeRetry(ctx.node!),
    },
    {
        id: "extractFrames",
        toolbar: "node-hover",
        category: "node-state",
        label: (ctx) => (ctx.extractingVideoFrames ? toolText(ctx, "nodeTools.extractingFrames") : toolText(ctx, "nodeTools.framesHint")),
        displayLabel: (ctx) => (ctx.extractingVideoFrames ? toolText(ctx, "nodeTools.extracting") : toolText(ctx, "nodeTools.extractFrames")),
        icon: (ctx) => (ctx.extractingVideoFrames ? <LoaderCircle className="size-3.5 animate-spin" /> : <Images className="size-3.5" />),
        defaultVisible: true,
        defaultOrder: 40,
        nodeToolbar: { group: "process", order: 10, section: (ctx) => toolText(ctx, "nodeTools.extractMedia"), description: (ctx) => toolText(ctx, "nodeTools.framesDescription") },
        applicable: (ctx) => hasVideo(ctx) && !simpleMode(ctx),
        disabled: (ctx) => ctx.extractingVideoFrames,
        run: (ctx) => ctx.handlers.onNodeExtractVideoFrames(ctx.node!),
    },
    {
        id: "extractAudio",
        toolbar: "node-hover",
        category: "node-state",
        label: (ctx) => (ctx.extractingAudio ? toolText(ctx, "nodeTools.extractingAudio") : toolText(ctx, "nodeTools.audioHint")),
        displayLabel: (ctx) => (ctx.extractingAudio ? toolText(ctx, "nodeTools.extracting") : toolText(ctx, "nodeTools.extractAudio")),
        icon: (ctx) => (ctx.extractingAudio ? <LoaderCircle className="size-3.5 animate-spin" /> : <AudioLines className="size-3.5" />),
        defaultVisible: true,
        defaultOrder: 42,
        nodeToolbar: { group: "process", order: 20, section: (ctx) => toolText(ctx, "nodeTools.extractMedia"), description: (ctx) => toolText(ctx, "nodeTools.audioDescription") },
        applicable: (ctx) => hasVideo(ctx) && !simpleMode(ctx),
        disabled: (ctx) => ctx.extractingAudio || ctx.trimmingVideo,
        run: (ctx) => ctx.handlers.onNodeExtractAudioFromVideo(ctx.node!),
    },
    {
        id: "trimRegenerate",
        toolbar: "node-hover",
        category: "node-state",
        label: (ctx) => (ctx.trimmingVideo ? toolText(ctx, "nodeTools.trimming") : toolText(ctx, "nodeTools.trimHint")),
        displayLabel: (ctx) => (ctx.trimmingVideo ? toolText(ctx, "nodeTools.extracting") : toolText(ctx, "nodeTools.trim")),
        icon: (ctx) => (ctx.trimmingVideo ? <LoaderCircle className="size-3.5 animate-spin" /> : <Scissors className="size-3.5" />),
        defaultVisible: true,
        defaultOrder: 44,
        nodeToolbar: { group: "primary", order: 10, description: (ctx) => toolText(ctx, "nodeTools.trimDescription") },
        applicable: (ctx) => hasVideo(ctx) && !simpleMode(ctx),
        disabled: (ctx) => ctx.extractingAudio || ctx.trimmingVideo,
        run: (ctx) => ctx.handlers.onNodeTrimVideoSegments(ctx.node!),
    },
    {
        id: "enhanceVideo",
        toolbar: "node-hover",
        category: "node-state",
        label: (ctx) => toolText(ctx, "nodeTools.enhanceHint"),
        displayLabel: (ctx) => toolText(ctx, "nodeTools.enhance"),
        icon: <ImageUpscale className="size-3.5" />,
        defaultVisible: true,
        defaultOrder: 45,
        nodeToolbar: { group: "process", order: 30, section: (ctx) => toolText(ctx, "nodeTools.quality"), description: (ctx) => toolText(ctx, "nodeTools.enhanceDescription") },
        applicable: (ctx) => hasVideo(ctx) && !simpleMode(ctx) && Boolean(ctx.handlers.onNodeEnhanceVideo) && ctx.nodeMetadata?.status !== "loading",
        disabled: (ctx) => !ctx.nodeMetadata?.storageKey && !ctx.nodeMetadata?.content,
        run: (ctx) => ctx.handlers.onNodeEnhanceVideo?.(ctx.node!),
    },
    {
        id: "depthVideo",
        toolbar: "node-hover",
        category: "node-state",
        label: "生成逐帧相对深度视频，用于动作与运镜参考",
        displayLabel: "相对深度",
        icon: <Layers className="size-3.5" />,
        defaultVisible: true,
        defaultOrder: 46,
        nodeToolbar: { group: "process", order: 31, section: "深度", description: "提取相对深度，另存为新视频" },
        applicable: (ctx) => hasVideo(ctx) && !simpleMode(ctx) && Boolean(ctx.handlers.onNodeDepthVideo) && ctx.nodeMetadata?.status !== "loading",
        run: (ctx) => ctx.handlers.onNodeDepthVideo?.(ctx.node!),
    },
    {
        id: "saveAsset",
        toolbar: "node-hover",
        category: "node-state",
        label: (ctx) => toolText(ctx, "nodeTools.addAsset"),
        displayLabel: (ctx) => toolText(ctx, "nodeTools.saveAsset"),
        icon: <FolderPlus className="size-3.5" />,
        defaultVisible: true,
        defaultOrder: 50,
        nodeToolbar: { group: "more", order: 40, section: (ctx) => toolText(ctx, "nodeTools.assets") },
        applicable: (ctx) => hasImage(ctx) || hasVideo(ctx) || isEditableText(ctx),
        run: (ctx) => ctx.handlers.onNodeSaveAsset(ctx.node!),
    },
    {
        id: "download",
        toolbar: "node-hover",
        category: "node-state",
        label: (ctx) => (hasAudio(ctx) ? toolText(ctx, "nodeTools.downloadAudio") : hasVideo(ctx) ? toolText(ctx, "nodeTools.downloadVideo") : toolText(ctx, "nodeTools.downloadImage")),
        displayLabel: (ctx) => toolText(ctx, "nodeTools.download"),
        icon: <Download className="size-3.5" />,
        defaultVisible: true,
        defaultOrder: 60,
        nodeToolbar: { group: "utility", order: 20 },
        applicable: (ctx) => hasImage(ctx) || hasVideo(ctx) || hasAudio(ctx),
        run: (ctx) => ctx.handlers.onNodeDownload(ctx.node!),
    },
    {
        id: "edit",
        toolbar: "node-hover",
        category: "node-state",
        label: (ctx) => (isEditableText(ctx) ? toolText(ctx, "nodeTools.generateText") : toolText(ctx, "nodeTools.edit")),
        displayLabel: (ctx) => (isEditableText(ctx) ? toolText(ctx, "nodeTools.textGeneration") : toolText(ctx, "nodeTools.generationSettings")),
        icon: <MessageSquare className="size-3.5" />,
        defaultVisible: true,
        defaultOrder: 70,
        nodeToolbar: { group: (ctx) => (isEditableText(ctx) ? "primary" : "more"), order: 20, section: (ctx) => toolText(ctx, "nodeTools.generationInfo") },
        applicable: canOpenDialog,
        run: (ctx) => ctx.handlers.onNodeToggleDialog(ctx.node!),
    },
    {
        id: "editText",
        toolbar: "node-hover",
        category: "node-state",
        label: (ctx) => toolText(ctx, "nodeTools.enlargeText"),
        displayLabel: (ctx) => toolText(ctx, "nodeTools.enlarge"),
        icon: <Maximize2 className="size-3.5" />,
        defaultVisible: true,
        defaultOrder: 80,
        nodeToolbar: { group: "primary", order: 30 },
        applicable: isEditableText,
        run: (ctx) => ctx.handlers.onNodeEditText(ctx.node!),
    },
    {
        id: "generateImage",
        toolbar: "node-hover",
        category: "node-state",
        label: (ctx) => toolText(ctx, "nodeTools.generateFromText"),
        displayLabel: (ctx) => toolText(ctx, "nodeTools.generateImage"),
        icon: <ImageIcon className="size-3.5" />,
        defaultVisible: true,
        defaultOrder: 90,
        nodeToolbar: { group: "primary", order: 40 },
        applicable: isEditableText,
        run: (ctx) => ctx.handlers.onNodeGenerateImage(ctx.node!),
    },
    {
        id: "config",
        toolbar: "node-hover",
        category: "node-state",
        label: (ctx) => toolText(ctx, "nodeTools.generationConfig"),
        displayLabel: (ctx) => toolText(ctx, "nodeTools.generationConfig"),
        icon: <Settings2 className="size-3.5" />,
        defaultVisible: true,
        defaultOrder: 100,
        nodeToolbar: { group: "primary", order: 10 },
        applicable: (ctx) => isConfig(ctx) && !simpleMode(ctx),
        run: (ctx) => ctx.handlers.onNodeToggleDialog(ctx.node!),
    },
    {
        id: "decreaseFont",
        toolbar: "node-hover",
        category: "node-state",
        label: (ctx) => toolText(ctx, "nodeTools.decreaseFont"),
        displayLabel: (ctx) => toolText(ctx, "nodeTools.zoomOut"),
        icon: <Minus className="size-3.5" />,
        defaultVisible: true,
        defaultOrder: 110,
        nodeToolbar: { group: "process", order: 10 },
        applicable: (ctx) => isEditableText(ctx) && !simpleMode(ctx),
        run: (ctx) => ctx.handlers.onNodeDecreaseFont(ctx.node!),
    },
    {
        id: "increaseFont",
        toolbar: "node-hover",
        category: "node-state",
        label: (ctx) => toolText(ctx, "nodeTools.increaseFont"),
        displayLabel: (ctx) => toolText(ctx, "nodeTools.zoomIn"),
        icon: <Plus className="size-3.5" />,
        defaultVisible: true,
        defaultOrder: 120,
        nodeToolbar: { group: "process", order: 20 },
        applicable: (ctx) => isEditableText(ctx) && !simpleMode(ctx),
        run: (ctx) => ctx.handlers.onNodeIncreaseFont(ctx.node!),
    },
    {
        id: "uploadImage",
        toolbar: "node-hover",
        category: "node-state",
        label: (ctx) => toolText(ctx, "nodeTools.uploadImage"),
        displayLabel: (ctx) => toolText(ctx, "nodeTools.uploadImage"),
        icon: <Upload className="size-3.5" />,
        defaultVisible: true,
        defaultOrder: 130,
        nodeToolbar: { group: "primary", order: 10 },
        applicable: (ctx) => isImage(ctx) && !hasImage(ctx),
        run: (ctx) => ctx.handlers.onNodeUpload(ctx.node!),
    },
    {
        id: "uploadVideo",
        toolbar: "node-hover",
        category: "node-state",
        label: (ctx) => (hasVideo(ctx) ? toolText(ctx, "nodeTools.replaceVideo") : toolText(ctx, "nodeTools.uploadVideo")),
        displayLabel: (ctx) => (hasVideo(ctx) ? toolText(ctx, "nodeTools.replaceVideo") : toolText(ctx, "nodeTools.uploadVideo")),
        icon: <Video className="size-3.5" />,
        defaultVisible: true,
        defaultOrder: 140,
        nodeToolbar: { group: (ctx) => (hasVideo(ctx) ? "more" : "primary"), order: 45, section: (ctx) => toolText(ctx, "nodeTools.assets") },
        applicable: isVideo,
        run: (ctx) => ctx.handlers.onNodeUpload(ctx.node!),
    },
    {
        id: "downloadSubtitles",
        toolbar: "node-hover",
        category: "node-state",
        label: (ctx) => toolText(ctx, "nodeTools.editSubtitles"),
        displayLabel: (ctx) => toolText(ctx, "nodeTools.subtitles"),
        icon: <Captions className="size-3.5" />,
        defaultVisible: true,
        defaultOrder: 145,
        nodeToolbar: { group: "more", order: 46, section: (ctx) => toolText(ctx, "nodeTools.assets") },
        applicable: (ctx) => isVideo(ctx) && Boolean(ctx.nodeMetadata?.subtitleEntries?.length && ctx.handlers.onNodeDownloadSubtitles),
        run: (ctx) => ctx.handlers.onNodeDownloadSubtitles?.(ctx.node!),
    },
    // 精修画布 → 短剧：只在关联短剧的画布上由页面提供处理函数。
    {
        id: "adoptToDrama",
        toolbar: "node-hover",
        category: "node-state",
        label: (ctx) => (isVideo(ctx) ? toolText(ctx, "nodeTools.adoptVideo") : toolText(ctx, "nodeTools.adoptImage")),
        displayLabel: (ctx) => toolText(ctx, "nodeTools.adopt"),
        icon: <CircleCheckBig className="size-3.5" />,
        defaultVisible: true,
        defaultOrder: 146,
        nodeToolbar: { group: "workspace", order: 5, section: (ctx) => toolText(ctx, "nodeTools.drama"), description: (ctx) => toolText(ctx, "nodeTools.adoptHint") },
        applicable: (ctx) => Boolean(ctx.handlers.onNodeAdoptToDrama) && (hasImage(ctx) || hasVideo(ctx)) && !isImageBatchRoot(ctx),
        run: (ctx) => ctx.handlers.onNodeAdoptToDrama?.(ctx.node!),
    },
    {
        id: "refreshFromDrama",
        toolbar: "node-hover",
        category: "node-state",
        label: (ctx) => toolText(ctx, "nodeTools.syncDramaTitle"),
        displayLabel: (ctx) => toolText(ctx, "nodeTools.syncDrama"),
        icon: <RefreshCw className="size-3.5" />,
        defaultVisible: true,
        defaultOrder: 146,
        nodeToolbar: { group: "workspace", order: 6, section: (ctx) => toolText(ctx, "nodeTools.drama"), description: (ctx) => toolText(ctx, "nodeTools.syncDramaHint") },
        applicable: (ctx) => Boolean(ctx.handlers.onNodeRefreshFromDrama),
        run: (ctx) => ctx.handlers.onNodeRefreshFromDrama?.(ctx.node!),
    },

    {
        id: "mediaVersions",
        toolbar: "node-hover",
        category: "node-state",
        label: (ctx) => toolText(ctx, "nodeTools.versionHistory"),
        displayLabel: (ctx) => toolText(ctx, "nodeTools.versionCount", { count: listMediaVersions(ctx.node).length }),
        icon: <History className="size-3.5" />,
        defaultVisible: true,
        defaultOrder: 147,
        nodeToolbar: { group: "workspace", order: 10, section: (ctx) => toolText(ctx, "nodeTools.versionGroup"), description: (ctx) => toolText(ctx, "nodeTools.versionHint") },
        // 只有一个版本时没有可回看的内容，不占工具条位置。
        applicable: (ctx) => Boolean(ctx.handlers.onNodeVersions) && hasMediaVersionHistory(ctx.node),
        run: (ctx) => ctx.handlers.onNodeVersions?.(ctx.node!),
    },
    {
        id: "timeline",
        toolbar: "node-hover",
        category: "node-state",
        label: (ctx) => toolText(ctx, "nodeTools.timeline"),
        displayLabel: (ctx) => toolText(ctx, "nodeTools.openTimeline"),
        icon: <Clapperboard className="size-3.5" />,
        defaultVisible: true,
        defaultOrder: 148,
        nodeToolbar: { group: "workspace", order: 30, section: (ctx) => toolText(ctx, "nodeTools.projectEdit"), description: (ctx) => toolText(ctx, "nodeTools.timelineHint") },
        applicable: (ctx) => Boolean(ctx.handlers.onNodeTimeline) && (hasVideo(ctx) || hasAudio(ctx) || Boolean(ctx.node?.metadata?.timelineComposition)),
        run: (ctx) => ctx.handlers.onNodeTimeline?.(ctx.node!),
    },
    {
        id: "uploadAudio",
        toolbar: "node-hover",
        category: "node-state",
        label: (ctx) => (hasAudio(ctx) ? toolText(ctx, "nodeTools.replaceAudio") : toolText(ctx, "nodeTools.uploadAudio")),
        displayLabel: (ctx) => (hasAudio(ctx) ? toolText(ctx, "nodeTools.replaceAudio") : toolText(ctx, "nodeTools.uploadAudio")),
        icon: <Music2 className="size-3.5" />,
        defaultVisible: true,
        defaultOrder: 150,
        nodeToolbar: { group: (ctx) => (hasAudio(ctx) ? "more" : "primary"), order: 45, section: (ctx) => toolText(ctx, "nodeTools.assets") },
        applicable: isAudio,
        run: (ctx) => ctx.handlers.onNodeUpload(ctx.node!),
    },
    // 节点锁定——独立分类，自动插入前置分隔符
    {
        id: "node-lock",
        toolbar: "node-hover",
        category: "navigation",
        label: (ctx) => (ctx.nodeMetadata?.locked ? toolText(ctx, "nodeTools.unlock") : toolText(ctx, "nodeTools.lock")),
        displayLabel: (ctx) => (ctx.nodeMetadata?.locked ? toolText(ctx, "nodeTools.unlockGeometry") : toolText(ctx, "nodeTools.lockGeometry")),
        icon: (ctx) => (ctx.nodeMetadata?.locked ? <Unlock className="size-3.5" /> : <Lock className="size-3.5" />),
        defaultVisible: true,
        defaultOrder: 160,
        nodeToolbar: { group: "more", order: 900, section: (ctx) => toolText(ctx, "nodeTools.nodeManagement") },
        active: (ctx) => Boolean(ctx.nodeMetadata?.locked),
        run: (ctx) => ctx.handlers.onNodeToggleLocked(ctx.node!),
    },
];

registerToolbarTools(nodeHoverToolbarTools);
