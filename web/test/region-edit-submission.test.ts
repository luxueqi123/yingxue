import { describe, expect, mock, test } from "bun:test";
import * as React from "react";
import * as Antd from "antd";
import * as Config from "../src/stores/use-config-store";
import { defaultImageCapabilityConfig } from "../src/lib/model-capabilities";
import { CanvasNodeType, type CanvasNodeData, type CanvasConnection } from "../src/types/canvas";
import type { CanvasImageRegionEditPayload } from "../src/components/canvas/canvas-node-region-edit-dialog";

const model = "fixture::image";
let config: Config.AiConfig;
const errors: string[] = [];
const submitted: Parameters<typeof import("../src/lib/canvas/canvas-project-generation").runBackendCanvasGenerationTask>[0][] = [];
mock.module("react", () => ({ ...React, useCallback: (fn: unknown) => fn, useRef: (value: unknown) => ({ current: value }), useState: (value: unknown) => [typeof value === "function" ? value() : value, () => {}] }));
mock.module("antd", () => ({ ...Antd, App: { ...Antd.App, useApp: () => ({ message: { error: (value: string) => errors.push(value), warning: (value: string) => errors.push(value), info: () => {} } }) } }));
const store = Object.assign((select: (state: { isAiConfigReady: () => boolean }) => unknown) => select({ isAiConfigReady: () => true }), Config.useConfigStore);
mock.module("@/stores/use-config-store", () => ({ ...Config, useEffectiveConfig: () => config, useConfigStore: store }));
const generation = await import("../src/lib/canvas/canvas-project-generation");
mock.module("@/lib/canvas/canvas-project-generation", () => ({ ...generation, runBackendCanvasGenerationTask: async (input: typeof submitted[number]) => { submitted.push(input); throw new Error("transport capture: no model invoked"); } }));
const { useCanvasMediaTools } = await import("../src/pages/canvas/use-canvas-media-tools");

const payload: CanvasImageRegionEditPayload = {
    prompt: "@区域1 换成树\n@区域2 换成船",
    size: { width: 1000, height: 500 },
    regions: [{ index: 1, x: 100, y: 50, width: 200, height: 100 }, { index: 2, x: 600, y: 300, width: 150, height: 100 }],
    annotatedDataUrl: "data:image/jpeg;base64,YW5ub3RhdGVk",
    maskDataUrl: "data:image/png;base64,bWFzaw==",
    generationConfig: { imageModel: model, model, size: "1024x1024", count: "1", quality: "high" },
};

async function capture(maxImages: number, maskSupported: boolean, input = payload) {
    errors.length = 0;
    submitted.length = 0;
    const image = defaultImageCapabilityConfig("openai-image", "image");
    config = { ...Config.defaultConfig, model, imageModel: model, imageModels: [model], models: [model], size: "1024x1024", quality: "high", channels: [{ id: "fixture", name: "fixture", enabled: true, baseUrl: "https://fixture.invalid", apiKey: "fixture", apiFormat: "openai", models: ["image"], modelCosts: [{ model: "image", capability: "image", protocol: "openai-image", capabilityConfig: { version: 1, image: { ...image, references: { ...image.references, maxImages, maskSupported } } } }] }] };
    const source: CanvasNodeData = { id: "original", type: CanvasNodeType.Image, title: "原图", position: { x: 0, y: 0 }, width: 400, height: 200, metadata: { content: "data:image/png;base64,b3JpZ2luYWw=", storageKey: "original-key", model, status: "success" } };
    const unchanged = structuredClone(source);
    const nodesRef = { current: [source] };
    const connectionsRef = { current: [] as CanvasConnection[] };
    const noop = () => {};
    const tools = useCanvasMediaTools({ projectId: "fixture", nodesRef, connectionsRef, selectedNodeIdsRef: { current: new Set<string>() }, setNodes: (value) => { nodesRef.current = typeof value === "function" ? value(nodesRef.current) : value; }, setConnections: (value) => { connectionsRef.current = typeof value === "function" ? value(connectionsRef.current) : value; }, setSelectedNodeIds: noop, setSelectedConnectionId: noop, setDialogNodeId: noop, setContextMenu: noop, setHoveredNodeId: noop, setToolbarNodeId: noop, setRunningNodeId: noop, startUploadStatus: (() => noop) as never, startGenerationRequest: () => new AbortController(), finishGenerationRequest: noop, bindGenerationTask: noop });
    await tools.regionEditImageNode(source, input);
    expect(source).toEqual(unchanged);
    return nodesRef.current;
}

describe("区域编辑提交能力分支（仅截获任务边界，不调用模型）", () => {
    for (const { maxImages, maskSupported } of [{ maxImages: 1, maskSupported: false }, { maxImages: 1, maskSupported: true }, { maxImages: 2, maskSupported: false }, { maxImages: 3, maskSupported: true }]) {
        test(`${maxImages} 参考图能力，蒙版 ${maskSupported}`, async () => {
            const nodes = await capture(maxImages, maskSupported);
            expect(submitted).toHaveLength(1);
            const input = submitted[0];
            expect(input.referenceImages?.[0]).toEqual({ id: "original", name: "reference-original.png", type: "image/png", dataUrl: "data:image/png;base64,b3JpZ2luYWw=", storageKey: "original-key" });
            expect(input.referenceImages).toHaveLength(maxImages >= 2 ? 2 : 1);
            if (maxImages >= 2) expect(input.referenceImages?.[1]?.dataUrl).toBe(payload.annotatedDataUrl);
            expect(input.mask?.dataUrl).toBe(maskSupported ? payload.maskDataUrl : undefined);
            expect(input.prompt.includes("第二张参考图")).toBe(maxImages >= 2);
            expect(input.prompt.includes("蒙版透明部分")).toBe(maskSupported);
            expect(input.prompt).toContain("【区域1】 换成树");
            expect(input.config.imageModel).toBe(model);
            expect(input.config.model).toBe(model);
            expect(input.config.size).toBe("1024x1024");
            expect(input.metadata).toMatchObject({ edit: "region", regionCount: 2 });
            expect(errors).toHaveLength(1);
            expect(nodes.find((node) => node.id !== "original")?.metadata?.status).toBe("error");
        });
    }

    test("不支持参考图时拒绝建任务和节点", async () => {
        const nodes = await capture(0, false);
        expect(submitted).toHaveLength(0);
        expect(nodes).toHaveLength(1);
        expect(errors).toEqual(["当前图片模型不支持参考图编辑，请选择支持图片编辑的模型"]);
    });

    test("没有区域时拒绝建任务和节点", async () => {
        const nodes = await capture(2, true, { ...payload, regions: [] });
        expect(submitted).toHaveLength(0);
        expect(nodes).toHaveLength(1);
        expect(errors).toEqual(["请先框选需要修改的区域"]);
    });
});
