import { assertCanvasGenerationRequirements, buildGenerationConfig } from "./canvas-project-generation";
import { isNativeGenerationNode, validateNativeGenerationInputs } from "./native-generation-inputs";
import { assertLtvAudioSemantics } from "./ltv-audio-options";
import { configuredModelDisplayName, modelCompatibilityError, modelRequestOptions } from "@/lib/model-selection";
import { isAiConfigReady, modelOptionName, resolveModelChannel, selectableModelsByCapability, type AiConfig, type ModelCapability } from "@/stores/use-config-store";
import { CanvasNodeType, type CanvasConnection, type CanvasNodeData } from "@/types/canvas";
import providerProtocols from "./ltv-provider-protocols.json";

export type CaseModelReadiness = {
    nodeId: string;
    title: string;
    protocol: string;
    status: "ready" | "unconnected" | "mismatch";
    models: string[];
    reason: string;
    provenance?: NonNullable<CanvasNodeData["metadata"]>["generationModelProvenance"];
};

// 这里只检查当前账号可选模型的声明合同，不调用模型、不绑定替代模型，也不改写源工程。
export function assessCaseModels(nodes: CanvasNodeData[], config: AiConfig, connections: CanvasConnection[] = []): CaseModelReadiness[] {
    config = { ...config, taskWorkflowProvider: "model" };
    return nodes.flatMap(node => {
        const metadata = node.metadata;
        if (!metadata) return [];
        const isLtvNode = Boolean(metadata?.ltvReferencePlan);
        const isNativeNode = isNativeGenerationNode(node);
        if (!isLtvNode && !isNativeNode) return [];
        const mode = metadata.generationMode || (node.type === CanvasNodeType.Script ? "text" : node.type);
        if (!["text", "image", "video", "audio"].includes(mode)) return [];
        const capability = mode as ModelCapability;
        const protocol = metadata.ltvExecutionContract || "";
        if (capability === "audio") {
            try {
                assertLtvAudioSemantics(metadata);
            } catch (error) {
                return [{ nodeId: node.id, title: node.title || "制作节点", protocol: protocol || capability, status: "mismatch", models: [], reason: error instanceof Error ? error.message : "源音频协议尚待核验", provenance: metadata.generationModelProvenance }];
            }
        }
        const registeredProtocol = Object.hasOwn(providerProtocols, protocol) ? providerProtocols[protocol as keyof typeof providerProtocols] : protocol;
        const candidates = selectableModelsByCapability(config, capability).filter(model => {
            const channel = resolveModelChannel(config, model);
            if (channel.enabled === false) return false;
            if (!isAiConfigReady(config, model)) return false;
            if (!protocol) return true;
            return (channel.modelCosts?.find(cost => cost.model === modelOptionName(model))?.protocol || channel.interfaceType) === registeredProtocol;
        });
        const models: string[] = [];
        const errors: string[] = [];
        const references = metadata.ltvReferencePlan?.references || [];
        const actualInput = isLtvNode ? {
            textCount: metadata.ltvReferencePlan?.texts?.length || 0,
            imageCount: references.filter(ref => ref.kind === "image").length,
            videoCount: references.filter(ref => ref.kind === "video").length,
            audioCount: references.filter(ref => ref.kind === "audio").length,
        } : nativeInputCounts(node, nodes, connections);
        const inputRequirements = metadata.generationInputRequirements;
        const input = {
            // A native template declares the minimum material contract even before
            // the user uploads anything. This is model preflight only; execution
            // still rejects the missing hydrated inputs before creating a task.
            textCount: Math.max(actualInput.textCount, validRequirementCount(inputRequirements?.text)),
            imageCount: Math.max(actualInput.imageCount, validRequirementCount(inputRequirements?.image)),
            videoCount: Math.max(actualInput.videoCount, validRequirementCount(inputRequirements?.video)),
            audioCount: Math.max(actualInput.audioCount, validRequirementCount(inputRequirements?.audio)),
            characterCount: 0,
        };
        const nativeInputError = isNativeNode ? validateNativeGenerationInputs(inputRequirements, input) : undefined;
        if (nativeInputError) {
            return [{ nodeId: node.id, title: node.title || "制作节点", protocol: protocol || capability, status: "mismatch", models: [], reason: nativeInputError, provenance: metadata.generationModelProvenance }];
        }
        const generationRequirements = isNativeNode
            ? { capability, input, videoOperation: metadata.videoEditOperation, preserveVideoOperation: Boolean(metadata.videoEditOperation) }
            : { capability, input };
        for (const model of candidates) {
            try {
                const candidate = { ...node, metadata: { ...metadata, model } };
                const generation = buildGenerationConfig(config, candidate, capability, generationRequirements);
                if (generation.model !== model) throw new Error("该模型无法保留案例要求，需要另外选择模型");
                const error = modelCompatibilityError(config, model, {
                    capability, input, videoOperation: metadata.videoEditOperation,
                    preserveVideoOperation: isLtvNode || Boolean(metadata.videoEditOperation), videoSeconds: metadata.seconds,
                    imageSize: capability === "image" ? metadata.size : undefined,
                    options: modelRequestOptions(generation, capability),
                });
                if (error) throw new Error(error);
                assertCanvasGenerationRequirements(generation, candidate, capability);
                models.push(configuredModelDisplayName(config, model));
            } catch (error) {
                errors.push(error instanceof Error ? error.message : "模型规格暂不能确认");
            }
        }
        return [{ nodeId: node.id, title: node.title || "制作节点", protocol: protocol || capability, provenance: metadata.generationModelProvenance,
            status: models.length ? "ready" as const : candidates.length ? "mismatch" as const : "unconnected" as const,
            models: [...new Set(models)], reason: models.length ? "当前目录有符合声明要求的可选模型，复制后在节点中选择。" : candidates.length ? errors[0] || "当前模型规格不匹配" : "当前账号尚无可选的对应协议模型。" }];
    });
}

type NativeInputCounts = { textCount: number; imageCount: number; videoCount: number; audioCount: number };

function validRequirementCount(value: number | undefined) {
    return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : 0;
}

function nativeInputCounts(node: CanvasNodeData, nodes: CanvasNodeData[], connections: CanvasConnection[]): NativeInputCounts {
    const nodeById = new Map(nodes.map(item => [item.id, item]));
    const seen = { text: new Set<string>(), image: new Set<string>(), video: new Set<string>(), audio: new Set<string>() };
    const add = (nodeId: string | undefined) => {
        if (!nodeId) return;
        const source = nodeById.get(nodeId);
        const kind = source && nativeInputKind(source);
        if (kind) seen[kind].add(source.id);
    };
    connections.filter(connection => connection.toNodeId === node.id).forEach(connection => add(connection.fromNodeId));
    [node.metadata?.videoStartFrameNodeId, node.metadata?.videoEndFrameNodeId, node.metadata?.videoFrameSourceNodeId].forEach(add);
    return { textCount: seen.text.size, imageCount: seen.image.size, videoCount: seen.video.size, audioCount: seen.audio.size };
}

function nativeInputKind(node: CanvasNodeData): "text" | "image" | "video" | "audio" | undefined {
    switch (node.type) {
        case CanvasNodeType.Text:
            // A pending generation node may carry a prompt before it has produced
            // an actual text asset. Do not count that prompt as a native text input.
            return node.metadata?.content?.trim() ? "text" : undefined;
        case CanvasNodeType.Script:
            return hasNativeScriptContent(node) ? "text" : undefined;
        case CanvasNodeType.Skill:
            return hasNativeSkillContent(node) ? "text" : undefined;
        case CanvasNodeType.Image:
            return "image";
        case CanvasNodeType.Video:
            return "video";
        case CanvasNodeType.Audio:
            return "audio";
        default:
            return undefined;
    }
}

function hasNativeScriptContent(node: CanvasNodeData) {
    if (node.metadata?.content?.trim()) return true;
    const rows = node.metadata?.storyboard?.rows || [];
    const textFields = [
        "plotDescription",
        "dialogue",
        "narrativeIntent",
        "viewerPOV",
        "performanceBlocking",
        "sceneTags",
        "propTags",
        "shotSize",
        "emotion",
        "lightingAndAtmosphere",
        "audioEffects",
        "camera",
        "motion",
        "timeBeats",
        "imageGenerationPrompt",
        "videoMotionPrompt",
        "continuityOut",
        "negativePrompt",
    ] as const;
    return rows.some((row) => textFields.some((field) => Boolean(row[field]?.trim())));
}

function hasNativeSkillContent(node: CanvasNodeData) {
    if (node.metadata?.content?.trim()) return true;
    const skill = node.metadata?.skillSnapshot;
    if (!skill) return false;
    return [skill.name, skill.description, skill.template, skill.outputContract, ...(skill.files || []).map((file) => file.content)].some((value) => Boolean(value?.trim()));
}
