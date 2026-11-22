import { nanoid } from "nanoid";

import { NODE_DEFAULT_SIZE } from "@/constant/canvas";
import { canGenerateMediaInPlace } from "@/lib/canvas/canvas-generation-layout";
import { buildGenerationNodeTitle, manualNodeTitle } from "@/lib/canvas/canvas-generation-title";
import { nodeSizeFromRatio } from "@/lib/canvas/canvas-node-size";
import { nextCanvasVersionLabel } from "@/lib/canvas/canvas-layout";
import { buildAudioGenerationMetadata, buildVideoGenerationMetadata, generationReferenceUrls, runCanvasGenerationTaskToConsumer } from "@/lib/canvas/canvas-project-generation";
import { canvasGenerationPromptMetadata } from "@/lib/canvas/canvas-generation-submission";
import { musicTaskMetadata, assertMurekaMusic, MUREKA_INSTRUMENTAL } from "@/lib/canvas/ltv-music-options";
import { elevenV3TaskMetadata, assertElevenV3, ELEVEN_V3 } from "@/lib/canvas/ltv-eleven-v3";
import {assertMiniMaxSpeech,miniMaxSpeechTaskMetadata,MINIMAX_SPEECH} from "@/lib/canvas/ltv-minimax-speech";
import { videoSearchTaskMetadata } from "@/lib/canvas/ark-video-search";
import { klingTaskMetadata } from "@/lib/canvas/ltv-kling-options";
import { volcanoVideoEnhanceTaskMetadata } from "@/lib/canvas/ltv-volcano-video-enhance";
import { subtitleEraseTaskMetadata } from "@/lib/canvas/ltv-subtitle-erase";
import { omniHumanTaskMetadata } from "@/lib/canvas/ltv-omnihuman";
import { topazVideoTaskMetadata } from "@/lib/canvas/ltv-topaz-video";
import { wanxVideoTaskMetadata } from "@/lib/canvas/ltv-wanx-options";
import { happyHorseReferenceTaskMetadata, happyHorseFirstFrameTaskMetadata } from "@/lib/canvas/ltv-happyhorse-options";
import { mediaVersionFieldsBeforeReplace } from "@/lib/canvas/canvas-media-versions";
import { resetGenerationTaskMetadata } from "@/lib/canvas/canvas-task-state";
import { producedModelCandidateForGeneration } from "@/lib/canvas/produced-model";
import { isDoubaoAudioConfig } from "@/lib/audio-generation";
import { CanvasNodeType, type CanvasNodeData } from "@/types/canvas";

import type { CanvasGenerationExecution } from "./canvas-generation-executor-types";

const NODE_STATUS_LOADING = "loading" as const;
const NODE_STATUS_SUCCESS = "success" as const;

export async function executeVideoGeneration({
    nodeId,
    sourceNode,
    canvasNodes,
    prompt,
    effectivePrompt,
    generationConfig,
    generationContext,
    controller,
    projectId,
    canvasConnections,
    setNodes,
    setConnections,
    startGenerationRequest,
    finishGenerationRequest,
    bindGenerationTask,
    applyGenerationTaskResult,
    registerPendingNodeIds,
    styleMetadata,
    skillMetadata,
    taskContext,
    retryContext,
}: CanvasGenerationExecution) {
    const spec = nodeSizeFromRatio(generationConfig.size, NODE_DEFAULT_SIZE[CanvasNodeType.Video].width, NODE_DEFAULT_SIZE[CanvasNodeType.Video].height) || NODE_DEFAULT_SIZE[CanvasNodeType.Video];
    const reuseSourceNode = canGenerateMediaInPlace(sourceNode, CanvasNodeType.Video);
    const isExistingVideoNode = sourceNode?.type === CanvasNodeType.Video && Boolean(sourceNode.metadata?.content) && !reuseSourceNode;
    const videoId = reuseSourceNode ? nodeId : nanoid();
    const versionRootId = isExistingVideoNode && sourceNode ? sourceNode.metadata?.versionOfNodeId || sourceNode.id : undefined;
    const parent = sourceNode?.position || { x: 0, y: 0 };
    const videoGenerationMetadata = buildVideoGenerationMetadata(sourceNode, generationContext, generationConfig);
    // 原位重新生成沿用用户起的名称（命名标记随旧 metadata 一起保留）；新建的结果节点仍按提示词命名。
    const keptVideoTitle = reuseSourceNode ? manualNodeTitle(canvasNodes.find((node) => node.id === nodeId)) : undefined;
    const videoNode: CanvasNodeData = {
        id: videoId,
        type: CanvasNodeType.Video,
        title: keptVideoTitle ?? buildGenerationNodeTitle(effectivePrompt, "Generated Video"),
        position: reuseSourceNode ? sourceNode!.position : { x: parent.x + (sourceNode?.width || spec.width) + 96, y: parent.y },
        width: reuseSourceNode ? sourceNode!.width : spec.width,
        height: reuseSourceNode ? sourceNode!.height : spec.height,
        metadata: {
            // 就地重生成不能继承旧任务的计时字段；媒体内容与提示词不在清理范围内。
            ...resetGenerationTaskMetadata(reuseSourceNode ? sourceNode?.metadata : undefined, NODE_STATUS_LOADING),
            manualTitle: Boolean(keptVideoTitle),
            ...(reuseSourceNode ? mediaVersionFieldsBeforeReplace(sourceNode) : {}),
            ...canvasGenerationPromptMetadata(prompt, effectivePrompt),
            status: NODE_STATUS_LOADING,
            errorDetails: undefined,
            generationErrorCode: undefined,
            resourceReloadAvailable: undefined,
            failedPromptFingerprint: undefined,
            model: generationConfig.model,
            producedModelCandidate: producedModelCandidateForGeneration(generationConfig),
            size: generationConfig.size,
            seconds: generationConfig.videoSeconds,
            vquality: generationConfig.vquality,
            generateAudio: generationConfig.videoGenerateAudio,
            watermark: generationConfig.videoWatermark,
            references: generationReferenceUrls(generationContext),
            ...videoGenerationMetadata,
            videoReferenceMode:
                sourceNode?.metadata?.videoReferenceMode ??
                (sourceNode?.type === CanvasNodeType.Video && videoGenerationMetadata.videoEditOperation === "reference_to_video" && !videoGenerationMetadata.videoStartFrameNodeId && !videoGenerationMetadata.videoEndFrameNodeId ? "all" : undefined),
            ...styleMetadata,
            ...skillMetadata,
        },
    };
    registerPendingNodeIds([videoId]);
    // 待生成版本先加入版本族，但只有成功结果才能替换当前主版本。
    setNodes((current) => {
        if (reuseSourceNode) return current.map((node) => (node.id === nodeId ? { ...node, ...videoNode } : node));
        if (!isExistingVideoNode || !sourceNode) return [...current.map((node) => (node.id === nodeId ? { ...node, metadata: { ...node.metadata, status: NODE_STATUS_SUCCESS } } : node)), videoNode];
        const rootId = versionRootId!;
        const nextLabel = nextCanvasVersionLabel(rootId, current);
        const hasPrimaryVersion = current.some((node) => (node.metadata?.versionOfNodeId || node.id) === rootId && node.metadata?.versionPrimary);
        return [
            ...current.map((node) => {
                if ((node.metadata?.versionOfNodeId || node.id) !== rootId) return node;
                return {
                    ...node,
                    metadata: {
                        ...node.metadata,
                        versionOfNodeId: rootId,
                        versionLabel: node.metadata?.versionLabel || "A",
                        versionPrimary: node.metadata?.versionPrimary || (!hasPrimaryVersion && node.id === sourceNode.id),
                        status: node.id === nodeId ? NODE_STATUS_SUCCESS : node.metadata?.status,
                    },
                };
            }),
            { ...videoNode, metadata: { ...videoNode.metadata, versionOfNodeId: rootId, versionLabel: nextLabel, versionPrimary: false } },
        ];
    });
    // 重新生成已有视频时，新节点继承源视频的上游连接，与源视频保持并行关系，而不是作为其下游子节点。
    if (!reuseSourceNode) {
        setConnections((current) => {
            if (!isExistingVideoNode) return [...current, { id: nanoid(), fromNodeId: nodeId, toNodeId: videoId }];
            return [...current, ...canvasConnections.filter((connection) => connection.toNodeId === nodeId).map((connection) => ({ ...connection, id: nanoid(), toNodeId: videoId }))];
        });
    }

    startGenerationRequest(videoId, nodeId, nodeId, controller);
    try {
        await runCanvasGenerationTaskToConsumer(
            {
                projectId,
                nodeId: videoId,
                ...retryContext,
                mode: "video",
                prompt: effectivePrompt,
                config: generationConfig,
                referenceImages: generationContext.referenceImages,
                referenceVideos: generationContext.referenceVideos,
                referenceAudios: generationContext.referenceAudios,
                signal: controller.signal,
                metadata: {
                    assetTitle: videoNode.title,
                    sourceNodeId: nodeId,
                    ...taskContext,
                    resolvedCharacterVersions: generationContext.resolvedCharacterVersions,
                    resolvedCharacterVoices: generationContext.resolvedCharacterVoices,
                    promptTemplateOperation: sourceNode?.metadata?.promptTemplateOperation,
                    promptTemplateVariables: sourceNode?.metadata?.promptTemplateVariables,
                    ...videoGenerationMetadata,
                    ...styleMetadata,
                    ...skillMetadata,
                    ...videoSearchTaskMetadata(sourceNode?.metadata),
                    ...klingTaskMetadata(sourceNode?.metadata),
                    ...volcanoVideoEnhanceTaskMetadata(sourceNode?.metadata),
                    ...subtitleEraseTaskMetadata(sourceNode?.metadata),
                    ...omniHumanTaskMetadata(sourceNode?.metadata),
                    ...wanxVideoTaskMetadata(sourceNode?.metadata),
                    ...happyHorseReferenceTaskMetadata(sourceNode?.metadata, effectivePrompt, generationContext.referenceImages.length),
                    ...happyHorseFirstFrameTaskMetadata(sourceNode?.metadata, effectivePrompt, generationContext.referenceImages.length),
                    ...await topazVideoTaskMetadata(sourceNode?.metadata, generationConfig, generationContext),
                },
            },
            {
                bindTask: (task) => bindGenerationTask(videoId, task),
                consumeTask: (task) => applyGenerationTaskResult(videoId, task),
            },
        );
    } finally {
        finishGenerationRequest(videoId, controller);
    }
}

export async function executeAudioGeneration({
    nodeId,
    sourceNode,
    canvasNodes,
    prompt,
    effectivePrompt,
    generationConfig,
    generationContext,
    controller,
    projectId,
    setNodes,
    setConnections,
    startGenerationRequest,
    finishGenerationRequest,
    bindGenerationTask,
    applyGenerationTaskResult,
    registerPendingNodeIds,
    taskContext,
    skillMetadata,
    retryContext,
}: CanvasGenerationExecution) {
    const musicMetadata = musicTaskMetadata(sourceNode?.metadata?.audioMusic);
    if(sourceNode?.metadata?.ltvExecutionContract===MUREKA_INSTRUMENTAL)assertMurekaMusic(sourceNode.metadata,generationConfig,effectivePrompt,generationContext.referenceImages.length+generationContext.referenceVideos.length+generationContext.referenceAudios.length);
    const speechMetadata = miniMaxSpeechTaskMetadata(sourceNode?.metadata);
    const elevenMetadata = elevenV3TaskMetadata(sourceNode?.metadata);
    if(sourceNode?.metadata?.ltvExecutionContract===ELEVEN_V3)assertElevenV3(sourceNode.metadata,generationConfig,effectivePrompt,generationContext.referenceImages.length+generationContext.referenceVideos.length+generationContext.referenceAudios.length);
    if(sourceNode?.metadata?.ltvExecutionContract===MINIMAX_SPEECH)assertMiniMaxSpeech(sourceNode.metadata,generationConfig,effectivePrompt,generationContext.referenceImages.length+generationContext.referenceVideos.length+generationContext.referenceAudios.length);
    if (sourceNode?.metadata?.audioMusic && (generationContext.referenceImages.length || generationContext.referenceVideos.length || generationContext.referenceAudios.length)) throw new Error('此作曲接口不接受参考媒体，不能忽略已连接素材。');
    const spec = NODE_DEFAULT_SIZE[CanvasNodeType.Audio];
    const reuseAudioNode = canGenerateMediaInPlace(sourceNode, CanvasNodeType.Audio);
    const audioId = reuseAudioNode ? nodeId : nanoid();
    const parent = sourceNode?.position || { x: 0, y: 0 };
    const keptAudioTitle = reuseAudioNode ? manualNodeTitle(canvasNodes.find((node) => node.id === nodeId) ?? sourceNode) : undefined;
    const audioNode: CanvasNodeData = {
        id: audioId,
        type: CanvasNodeType.Audio,
        title: keptAudioTitle ?? buildGenerationNodeTitle(effectivePrompt, "Generated Audio"),
        position: reuseAudioNode ? sourceNode!.position : { x: parent.x + (sourceNode?.width || spec.width) + 96, y: parent.y + ((sourceNode?.height || spec.height) - spec.height) / 2 },
        width: reuseAudioNode ? sourceNode!.width : spec.width,
        height: reuseAudioNode ? sourceNode!.height : spec.height,
        metadata: {
            ...(reuseAudioNode ? { ...resetGenerationTaskMetadata(sourceNode?.metadata, NODE_STATUS_LOADING), ...mediaVersionFieldsBeforeReplace(sourceNode) } : {}),
            // 空音频节点原位生成会重建 metadata，命名标记要跟着保留，下次重新生成仍沿用名称。
            manualTitle: Boolean(keptAudioTitle),
            ...canvasGenerationPromptMetadata(prompt, effectivePrompt),
            status: NODE_STATUS_LOADING,
            ...buildAudioGenerationMetadata(generationConfig),
            ...skillMetadata,
            ...(sourceNode?.metadata?.audioMusic ? { audioMusic: sourceNode.metadata.audioMusic } : {}),
            ...(sourceNode?.metadata?.audioSpeech ? { audioSpeech: sourceNode.metadata.audioSpeech, ltvExecutionContract: MINIMAX_SPEECH } : {}),
        },
    };
    registerPendingNodeIds([audioId]);
    setNodes((current) =>
        reuseAudioNode ? current.map((node) => (node.id === nodeId ? { ...node, ...audioNode } : node)) : [...current.map((node) => (node.id === nodeId ? { ...node, metadata: { ...node.metadata, status: NODE_STATUS_SUCCESS } } : node)), audioNode],
    );
    if (!reuseAudioNode) setConnections((current) => [...current, { id: nanoid(), fromNodeId: nodeId, toNodeId: audioId }]);

    startGenerationRequest(audioId, nodeId, nodeId, controller);
    try {
        await runCanvasGenerationTaskToConsumer(
            {
                projectId,
                nodeId: audioId,
                ...retryContext,
                mode: "audio",
                prompt: doubaoAudioPrompt(generationConfig, effectivePrompt, generationContext.referenceAudios.length, generationContext.referenceImages.length),
                config: generationConfig,
                referenceImages: generationContext.referenceImages,
                referenceAudios: generationContext.referenceAudios,
                signal: controller.signal,
                metadata: {
                    assetTitle: audioNode.title,
                    sourceNodeId: nodeId,
                    ...taskContext,
                    ...(sourceNode?.metadata?.audioVoiceBindings?.length ? { audioVoiceBindings: sourceNode.metadata.audioVoiceBindings } : {}),
                    resolvedCharacterVersions: generationContext.resolvedCharacterVersions,
                    resolvedCharacterVoiceKey: generationContext.resolvedCharacterVoices[0]?.voiceKey,
                    ...skillMetadata,
                },
            },
            {
                bindTask: (task) => bindGenerationTask(audioId, task),
                consumeTask: (task) => applyGenerationTaskResult(audioId, task),
            },
        );
    } finally {
        finishGenerationRequest(audioId, controller);
    }
}

function doubaoAudioPrompt(config: CanvasGenerationExecution["generationConfig"], prompt: string, audioCount: number, imageCount: number) {
    if (config.audioMode === "tts") return prompt;
    if (!isDoubaoAudioConfig(config)) return prompt;
    // 参考图片模式的 text_prompt 只保留要合成的文本，图片走 references。
    if (imageCount > 0)
        return prompt
            .replace(/@(图片|音频|视频|绘图|角色|文本)\d+/g, " ")
            .replace(/[ \t]{2,}/g, " ")
            .trim();
    if (audioCount <= 0) return prompt;
    // 官方参考音频用 @Audio1、@Audio2，和 references 的顺序一致。画布里的 @音频N 只是编辑器槽位。
    const next = prompt.replace(/@音频(\d+)/g, "@Audio$1");
    const missing = Array.from({ length: audioCount }, (_, index) => `@Audio${index + 1}`).filter((marker) => !next.includes(marker));
    return missing.length ? `${missing.join(" ")} ${next}` : next;
}
