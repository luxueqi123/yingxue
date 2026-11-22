import { resolveCanvasGenerationModel } from "@/lib/canvas/canvas-project-generation";
import { modelCapabilityConfigFor } from "@/lib/model-capabilities";
import { resolveImageRequestSize } from "@/services/api/image-validation";
import { resolveModelRequestConfig, type AiConfig } from "@/stores/use-config-store";
import type { CanvasNodeData } from "@/types/canvas";

export function buildOutpaintGenerationConfig(config: AiConfig, node: CanvasNodeData, output: { width: number; height: number }): AiConfig {
    const model = resolveCanvasGenerationModel(config, node.metadata?.model || config.imageModel, "image");
    if (!model) throw new Error("请选择可用的图片模型后再扩图。");
    if (resolveModelRequestConfig(config, model).interfaceType !== "openai-image") throw new Error("AI 扩图需要支持蒙版与像素尺寸的 OpenAI Images 模型；当前仍可导出透明扩图 PNG。");
    const quality = node.metadata?.quality ?? config.quality;
    const profile = modelCapabilityConfigFor(config, model).image!;
    if (!profile.references.maskSupported || profile.references.maxImages < 1) throw new Error("当前图片模型不支持参考图蒙版扩图；可导出透明扩图 PNG 或选择支持蒙版的模型。");
    const size = `${output.width}x${output.height}`;
    if (profile.size.parameter !== "size" || (!profile.size.allowCustom && !profile.size.values.includes(size))) throw new Error(`当前模型不支持 ${size} 的精确像素尺寸，请调整扩图范围或选择支持该尺寸的模型。`);
    // The shared request contract may normalize unsupported settings; outpaint must keep this pixel grid exactly.
    const requestSize = resolveImageRequestSize(profile, quality, size);
    if (requestSize?.parameter !== "size" || requestSize.value !== size) throw new Error("当前模型无法按指定像素尺寸扩图。");
    return {
        ...config,
        model,
        size,
        quality,
        count: "1",
        transparentBackground: node.metadata?.transparentBackground ?? config.transparentBackground,
        taskWorkflowProvider: "model",
        runningHub: { ...config.runningHub, enabled: false },
        comfyBridge: { ...config.comfyBridge, enabled: false },
    };
}
