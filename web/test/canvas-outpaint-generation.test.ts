import { expect, test, beforeEach, afterEach } from "bun:test";
import { installResourceAccessFixture } from "./resource-access-fixture";
let restoreResourceAccess: () => void;
beforeEach(() => {
    restoreResourceAccess = installResourceAccessFixture({
        "raw-outpaint": "/api/resources/raw-outpaint/file",
        "ordinary-mask": "/api/resources/ordinary-mask/file",
        ordinary: "/api/resources/ordinary/file",
    });
});
afterEach(() => restoreResourceAccess());
import { existsSync } from "node:fs";
import { defaultConfig, type AiConfig } from "../src/stores/use-config-store";
import { CanvasNodeType, type CanvasNodeData } from "../src/types/canvas";
import { defaultImageCapabilityConfig, type ImageCapabilityConfig } from "../src/lib/model-capabilities";
import { buildGenerationTaskNodeResult } from "../src/lib/canvas/canvas-generation-task-sync";
import type { GenerationTask } from "../src/services/api/task-center";

const moduleUrl = new URL("../src/lib/canvas/canvas-outpaint-generation.ts", import.meta.url);
const generation = existsSync(moduleUrl) ? await import(moduleUrl.href) : null;
const config: AiConfig = {
    ...defaultConfig,
    imageModel: "selected::gpt-image-2",
    channels: [
        { id: "selected", name: "selected", apiFormat: "openai", interfaceType: "openai-image", apiKey: "", baseUrl: "https://fixture.invalid", models: ["gpt-image-2"] },
        { id: "alternative", name: "alternative", apiFormat: "openai", interfaceType: "openai-image", apiKey: "", baseUrl: "https://fixture.invalid", models: ["gpt-image-1"] },
    ],
};
const node: CanvasNodeData = { id: "source", type: CanvasNodeType.Image, title: "source", position: { x: 0, y: 0 }, width: 400, height: 300, metadata: { model: "selected::gpt-image-2", size: "auto", quality: "high" } };

test("扩图请求使用精确像素尺寸并保持源节点选择的模型", () => {
    expect(typeof generation?.buildOutpaintGenerationConfig).toBe("function");
    const result = generation!.buildOutpaintGenerationConfig(config, node, { width: 1280, height: 1024 });
    expect(result.model).toBe("selected::gpt-image-2");
    expect(result.size).toBe("1280x1024");
    expect(result.quality).toBe("high");
    expect(result.count).toBe("1");
    expect(result.taskWorkflowProvider).toBe("model");
    expect(result.runningHub.enabled).toBe(false);
    expect(result.comfyBridge.enabled).toBe(false);
    expect(node.metadata?.size).toBe("auto");
});

test("扩图不将不支持的蒙版或像素尺寸静默降级成默认尺寸", () => {
    const profile = defaultImageCapabilityConfig("openai-image", "gpt-image-2");
    const withProfile = (image: ImageCapabilityConfig): AiConfig => ({
        ...config,
        channels: [{ ...config.channels[0], modelCosts: [{ model: "gpt-image-2", capability: "image", billingMode: "fixed_request", unitPriceMicrocredits: 0, capabilityConfig: { version: 1, image } }] }, config.channels[1]],
    });
    const output = { width: 1280, height: 1024 };
    for (const size of [
        { ...profile.size, allowCustom: false, values: ["1024x1024"], default: "1024x1024" },
        { ...profile.size, parameter: "aspect_ratio" as const },
        { ...profile.size, parameter: "none" as const },
    ]) expect(() => generation!.buildOutpaintGenerationConfig(withProfile({ ...profile, size }), node, output)).toThrow("像素尺寸");
    for (const references of [
        { ...profile.references, maskSupported: false },
        { ...profile.references, maxImages: 0 },
    ]) expect(() => generation!.buildOutpaintGenerationConfig(withProfile({ ...profile, references }), node, output)).toThrow("蒙版");
    expect(() => generation!.buildOutpaintGenerationConfig({ ...config, channels: [{ ...config.channels[0], interfaceType: "gemini-image" }] }, node, output)).toThrow("OpenAI Images");
    expect(() => generation!.buildOutpaintGenerationConfig(config, { ...node, metadata: { model: "removed::missing-image" } }, output)).toThrow("模型");
    for (const invalid of [{ width: 1279, height: 1024 }, { width: 16, height: 16 }, { width: 4096, height: 1024 }, { width: Infinity, height: 1024 }]) {
        expect(() => generation!.buildOutpaintGenerationConfig(config, node, invalid)).toThrow();
    }
});

test("刷新恢复缺少扩图快照时拒绝直接使用模型原始结果", async () => {
    const task: GenerationTask = {
        id: "outpaint-recovery", type: "canvas_image", status: "succeeded", prompt: "outpaint fixture", attempts: 1,
        createdAt: "2026-09-12T00:00:00Z", updatedAt: "2026-09-12T00:00:00Z",
        inputJson: JSON.stringify({ mode: "image", metadata: { edit: "outpaint", outpaint: { width: 1280, height: 1024, padding: { left: 128, right: 128, top: 0, bottom: 0 } } } }),
        resultJson: JSON.stringify({ images: [{ dataUrl: "/api/resources/raw-outpaint/file", storageKey: "resource:raw-outpaint", width: 1280, height: 1024, mimeType: "image/png" }] }),
    };
    await expect(buildGenerationTaskNodeResult(node, task)).rejects.toThrow("扩图");
    const marked = { ...node, metadata: { ...node.metadata, outpaintEdit: { taskId: task.id, sourceNodeId: "source", width: 1280, height: 1024, padding: { left: 128, right: 128, top: 0, bottom: 0 } } } };
    await expect(buildGenerationTaskNodeResult(marked, { ...task, inputJson: undefined })).rejects.toThrow("扩图");
    const cancelled = new AbortController();
    cancelled.abort();
    await expect(buildGenerationTaskNodeResult(marked, task, [marked], cancelled.signal)).rejects.toMatchObject({ name: "AbortError" });
    const ordinary = await buildGenerationTaskNodeResult(node, { ...task, inputJson: JSON.stringify({ mode: "image", metadata: { edit: "mask" } }), resultJson: JSON.stringify({ images: [{ dataUrl: "/api/resources/ordinary-mask/file", storageKey: "resource:ordinary-mask", width: 4096, height: 2048, mimeType: "image/png" }] }) });
    expect(ordinary.metadata?.storageKey).toBe("resource:ordinary-mask");
    expect([ordinary.metadata?.naturalWidth, ordinary.metadata?.naturalHeight]).toEqual([4096, 2048]);
});

test("普通生成复用失败扩图节点时不继承上一任务的扩图合同", async () => {
    const task: GenerationTask = {
        id: "ordinary-after-outpaint", type: "canvas_image", status: "succeeded", prompt: "ordinary fixture", attempts: 1,
        createdAt: "2026-09-12T00:00:00Z", updatedAt: "2026-09-12T00:00:00Z",
        inputJson: JSON.stringify({ mode: "image", metadata: { nodeId: node.id } }),
        resultJson: JSON.stringify({ images: [{ dataUrl: "/api/resources/ordinary/file", storageKey: "resource:ordinary", width: 2048, height: 1024, mimeType: "image/png" }] }),
    };
    const marked = { ...node, metadata: { ...node.metadata, taskId: task.id, outpaintEdit: { taskId: "previous-outpaint", sourceNodeId: "source", width: 1280, height: 1024, padding: { left: 128, right: 128, top: 0, bottom: 0 } } } };
    const result = await buildGenerationTaskNodeResult(marked, task);
    expect(result.metadata?.storageKey).toBe("resource:ordinary");
    expect(result.metadata?.outpaintEdit).toBeUndefined();
    const withoutInput = await buildGenerationTaskNodeResult(marked, { ...task, inputJson: undefined });
    expect(withoutInput.metadata?.storageKey).toBe("resource:ordinary");
    expect(withoutInput.metadata?.outpaintEdit).toBeUndefined();
    await expect(buildGenerationTaskNodeResult({ ...marked, metadata: { ...marked.metadata, outpaintEdit: { ...marked.metadata.outpaintEdit, taskId: task.id } } }, { ...task, inputJson: undefined })).rejects.toThrow("扩图");
});
