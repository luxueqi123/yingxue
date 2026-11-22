import type { CanvasNodeData, CanvasNodeMetadata } from "@/types/canvas";

export type HydratedGenerationInputCounts = {
    textCount: number;
    imageCount: number;
    videoCount: number;
    audioCount: number;
};

type GenerationInputKind = "image" | "text" | "video" | "audio";
type GenerationInputRequirements = NonNullable<CanvasNodeMetadata["generationInputRequirements"]>;

const INPUT_KINDS: readonly GenerationInputKind[] = ["image", "text", "video", "audio"];
const INPUT_LABELS: Record<GenerationInputKind, string> = {
    image: "图片",
    text: "文本",
    video: "视频",
    audio: "音频",
};

/**
 * 判断节点是否是带真实生成合同的原生制作节点。
 * 静态媒体只有 content/storageKey 时不应被当成待接入的生成模型。
 */
export function isNativeGenerationNode(node: Pick<CanvasNodeData, "metadata">): boolean {
    const metadata = node.metadata;
    const mode = metadata?.generationMode;
    const prompt = metadata?.prompt;
    return Boolean(
        (mode === "text" || mode === "image" || mode === "video" || mode === "audio") &&
            typeof prompt === "string" &&
            prompt.trim() &&
            (metadata?.generationInputRequirements !== undefined || Boolean(metadata?.strictGenerationOptions?.length)),
    );
}

/**
 * 在真实素材完成水合后，按节点声明的最低输入数做纯校验。
 * 返回 undefined 表示通过；返回中文错误表示必须停止提交，调用方不得将其改写为普通文生图。
 */
export function validateNativeGenerationInputs(
    requirements: CanvasNodeMetadata["generationInputRequirements"] | undefined,
    input: HydratedGenerationInputCounts,
): string | undefined {
    if (requirements === undefined) return undefined;
    if (requirements !== undefined && (!requirements || typeof requirements !== "object" || Array.isArray(requirements))) {
        return "原生制作模板的输入要求格式无效，请重新复制模板后再试。";
    }

    const invalidRequirement = INPUT_KINDS.find((kind) => {
        const value = requirements?.[kind];
        return value !== undefined && (!Number.isInteger(value) || value <= 0);
    });
    if (invalidRequirement) {
        return `原生制作模板的${INPUT_LABELS[invalidRequirement]}输入要求必须是正整数，请联系模板维护者后再试。`;
    }

    const invalidInput = INPUT_KINDS.find((kind) => {
        const count = input[`${kind}Count` as keyof HydratedGenerationInputCounts];
        return !Number.isInteger(count) || count < 0;
    });
    if (invalidInput) {
        return `已水合的${INPUT_LABELS[invalidInput]}输入数量无效，请重新准备素材后再试。`;
    }

    const missing = INPUT_KINDS.flatMap((kind) => {
        const required = requirements?.[kind];
        const actual = input[`${kind}Count` as keyof HydratedGenerationInputCounts];
        if (required === undefined || actual >= required) return [];
        return [{ kind, required, actual }];
    });
    if (!missing.length) return undefined;

    const details = missing
        .map(({ kind, required, actual }) => `${INPUT_LABELS[kind]}至少需要 ${required} 个，当前已水合 ${actual} 个`)
        .join("；");
    const actions = missing.map(({ kind }) => (kind === "text" ? "补充或连接文本" : `上传或连接${INPUT_LABELS[kind]}`)).join("、");
    return `缺少原生制作输入：${details}。请先${actions}后再生成；系统不会降级为文生图。`;
}

/** Throwing adapter for generation paths that must stop before a paid request. */
export function assertNativeGenerationInputs(
    requirements: CanvasNodeMetadata["generationInputRequirements"] | undefined,
    input: HydratedGenerationInputCounts,
): void {
    const error = validateNativeGenerationInputs(requirements, input);
    if (error) throw new Error(error);
}
