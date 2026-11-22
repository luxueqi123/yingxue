import { expect, test } from "bun:test";
import { buildNodeGenerationContext } from "../src/components/canvas/canvas-node-generation";
import { CanvasNodeType, type CanvasNodeData } from "../src/types/canvas";

import {
    assertNativeGenerationInputs,
    isNativeGenerationNode,
    validateNativeGenerationInputs,
} from "../src/lib/canvas/native-generation-inputs";

const emptyHydratedInput = { textCount: 0, imageCount: 0, videoCount: 0, audioCount: 0 };

test("未声明合同的旧节点不进入原生输入校验", () => {
    expect(validateNativeGenerationInputs(undefined, { ...emptyHydratedInput, textCount: -1 })).toBeUndefined();
});

test("原生上下文只消费已完成的上游文本，不能消费待执行提示词", () => {
    const make = (id: string, type: CanvasNodeType, metadata: CanvasNodeData["metadata"]): CanvasNodeData => ({ id, type, title: id, position: { x: 0, y: 0 }, width: 300, height: 200, metadata });
    const source = make("source", CanvasNodeType.Text, { generationMode: "text", generationInputRequirements: { image: 1 }, content: "", prompt: "尚未执行的编排指令" });
    const target = make("target", CanvasNodeType.Video, { generationMode: "video", generationInputRequirements: { text: 1 }, prompt: "制作新镜头" });
    const edges = [{ id: "edge", fromNodeId: source.id, toNodeId: target.id }];
    const pending = buildNodeGenerationContext(target.id, [source, target], edges, target.metadata!.prompt!, [], false);
    expect(pending.textCount).toBe(0);
    expect(pending.prompt).not.toContain("尚未执行");
    expect(() => assertNativeGenerationInputs(target.metadata?.generationInputRequirements, pending)).toThrow("文本");
    source.metadata!.content = "镜头从左侧缓慢推近";
    const ready = buildNodeGenerationContext(target.id, [source, target], edges, target.metadata!.prompt!, [], false);
    expect(ready.textCount).toBe(1);
    expect(ready.prompt).toContain("镜头从左侧缓慢推近");
    expect(() => assertNativeGenerationInputs(target.metadata?.generationInputRequirements, ready)).not.toThrow();
    source.metadata!.generationInputRequirements = undefined;
    source.metadata!.content = "";
    expect(buildNodeGenerationContext(target.id, [source, target], edges, "旧链路", [], false).prompt).toContain("尚未执行的编排指令");
});

test("原生节点的输入约束按水合后的四类数量校验，不会把缺图降级为文生图", () => {
    const error = validateNativeGenerationInputs({ image: 1 }, emptyHydratedInput);

    expect(error).toContain("图片");
    expect(error).toContain("上传或连接");
    expect(error).toContain("不会降级为文生图");
    expect(() => assertNativeGenerationInputs({ image: 1 }, emptyHydratedInput)).toThrow(error!);
});

test("水合输入满足要求时通过，且验证函数不修改输入对象", () => {
    const requirements = { image: 1, text: 2, video: 1, audio: 1 };
    const input = { textCount: 2, imageCount: 1, videoCount: 1, audioCount: 1 };
    const snapshot = JSON.stringify(input);

    expect(validateNativeGenerationInputs(requirements, input)).toBeUndefined();
    expect(JSON.stringify(input)).toBe(snapshot);
});

test("模板输入要求必须是正整数", () => {
    expect(validateNativeGenerationInputs({ image: 0 }, emptyHydratedInput)).toContain("正整数");
    expect(validateNativeGenerationInputs({ video: 1.5 }, emptyHydratedInput)).toContain("正整数");
    expect(validateNativeGenerationInputs({ audio: -1 }, emptyHydratedInput)).toContain("正整数");
});

test("只有带模式、提示词和生成合同的节点才算原生制作节点", () => {
    const base = { metadata: { generationMode: "image" as const, prompt: "修复原图" } };

    expect(isNativeGenerationNode({ metadata: { content: "https://example.test/image.png" } })).toBe(false);
    expect(isNativeGenerationNode(base)).toBe(false);
    expect(isNativeGenerationNode({ metadata: { ...base.metadata, generationInputRequirements: { image: 1 } } })).toBe(true);
    expect(isNativeGenerationNode({ metadata: { ...base.metadata, strictGenerationOptions: ["size"] } })).toBe(true);
});
