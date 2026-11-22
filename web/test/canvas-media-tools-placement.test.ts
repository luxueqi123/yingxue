import { beforeEach, expect, mock, test } from "bun:test";
import * as React from "react";
import * as Antd from "antd";
import * as Config from "../src/stores/use-config-store";
import { createCanvasStateWriter } from "../src/lib/canvas/canvas-editor-state";
import { CanvasNodeType, type CanvasConnection, type CanvasNodeData } from "../src/types/canvas";
import type { UploadedImage } from "../src/services/image-storage";

const errors: string[] = [];
const persisted: string[] = [];
const released: string[] = [];
let uploads = 0;
let upload: (input: string | Blob) => Promise<UploadedImage>;
const uploaded = (key: string): UploadedImage => ({ url: `/media/${key}`, storageKey: `resource:${key}`, width: 800, height: 600, bytes: 100, mimeType: "image/png" });
mock.module("react", () => ({ ...React, useCallback: (callback: unknown) => callback, useRef: (value: unknown) => ({ current: value }), useState: (value: unknown) => [typeof value === "function" ? value() : value, () => {}] }));
mock.module("antd", () => ({ ...Antd, App: { ...Antd.App, useApp: () => ({ message: { error: (value: string) => errors.push(value), warning: (value: string) => errors.push(value), success: () => {}, info: () => {} } }) } }));
const store = Object.assign((select: (state: { isAiConfigReady: () => boolean }) => unknown) => select({ isAiConfigReady: () => true }), Config.useConfigStore);
mock.module("@/stores/use-config-store", () => ({ ...Config, useEffectiveConfig: () => Config.defaultConfig, useConfigStore: store }));
const raster = await import("../src/lib/image-raster");
mock.module("@/lib/image-raster", () => ({ ...raster, prepareRasterSource: async (url: string) => ({ url, release: () => released.push(url) }) }));
const imageData = await import("../src/lib/canvas/canvas-image-data");
mock.module("@/lib/canvas/canvas-image-data", () => ({ ...imageData, cropDataUrl: async () => "crop", upscaleDataUrl: async () => "resize", splitDataUrl: async () => [{ dataUrl: "piece-1", row: 0, column: 0 }, { dataUrl: "piece-2", row: 0, column: 1 }] }));
const storage = await import("../src/services/image-storage");
mock.module("@/services/image-storage", () => ({ ...storage, uploadImage: (input: string | Blob) => upload(input) }));
const assets = await import("../src/services/project-asset-sync");
mock.module("@/services/project-asset-sync", () => ({ ...assets, ensureCanvasNodeAsset: async ({ node }: { node: CanvasNodeData }) => { persisted.push(node.id); return { assetId: `asset-${node.id}` }; } }));
const { useCanvasMediaTools } = await import("../src/pages/canvas/use-canvas-media-tools");

function harness() {
    const source: CanvasNodeData = { id: "source", type: CanvasNodeType.Image, title: "Original", position: { x: 0, y: 0 }, width: 300, height: 200, metadata: { content: "source-image", prompt: "original prompt" } };
    const obstacle: CanvasNodeData = { id: "existing-text", type: CanvasNodeType.Text, title: "Keep visible", position: { x: 396, y: 0 }, width: 700, height: 180, metadata: { content: "existing text" } };
    const nodesRef = { current: [source, obstacle] };
    const before = structuredClone(nodesRef.current);
    const connectionsRef = { current: [] as CanvasConnection[] };
    const noop = () => {};
    const tools = useCanvasMediaTools({ projectId: "placement-fixture", nodesRef, connectionsRef, selectedNodeIdsRef: { current: new Set<string>() }, setNodes: createCanvasStateWriter(nodesRef, noop), setConnections: createCanvasStateWriter(connectionsRef, noop), setSelectedNodeIds: noop, setSelectedConnectionId: noop, setDialogNodeId: noop, setContextMenu: noop, setHoveredNodeId: noop, setToolbarNodeId: noop, setRunningNodeId: noop, startUploadStatus: (() => noop) as never, startGenerationRequest: () => new AbortController(), finishGenerationRequest: noop, bindGenerationTask: noop, applyGenerationTaskResult: async () => {} });
    return { tools, source, nodesRef, connectionsRef, before };
}

function assertUnobscured(nodes: CanvasNodeData[]) {
    for (let first = 0; first < nodes.length; first++) {
        for (const other of nodes.slice(first + 1)) {
            const current = nodes[first];
            expect(current.position.x + current.width <= other.position.x || other.position.x + other.width <= current.position.x || current.position.y + current.height <= other.position.y || other.position.y + other.height <= current.position.y).toBe(true);
        }
    }
}

beforeEach(() => {
    errors.length = 0; persisted.length = 0; released.length = 0; uploads = 0;
    upload = async () => uploaded(`result-${++uploads}`);
});

for (const operation of ["crop", "resize", "annotation"] as const) {
    test(`${operation}: real tool callback preserves existing nodes, original media and result connections`, async () => {
        const { tools, source, nodesRef, connectionsRef, before } = harness();
        if (operation === "crop") await tools.cropImageNode(source, { x: 0, y: 0, width: 0.5, height: 0.5 });
        else if (operation === "resize") await tools.upscaleImageNode(source, { targetLongEdge: 2048, algorithm: "high" });
        else await tools.saveAnnotatedImageNode(source, "annotation");
        expect(errors).toEqual([]);
        expect(nodesRef.current.slice(0, 2)).toEqual(before);
        expect(nodesRef.current).toHaveLength(3);
        const result = nodesRef.current[2];
        expect(result.metadata).toMatchObject({ content: "/media/result-1", naturalWidth: 800, naturalHeight: 600, prompt: "original prompt", assetId: `asset-${result.id}` });
        expect(connectionsRef.current).toMatchObject([{ fromNodeId: source.id, toNodeId: result.id }]);
        expect(persisted).toEqual([result.id]);
        assertUnobscured(nodesRef.current);
    });
}

test("out-of-order crop and resize uploads include edits and results committed while waiting", async () => {
    const { tools, source, nodesRef, before } = harness();
    const pending = new Map<string, (image: UploadedImage) => void>();
    upload = (input) => new Promise(resolve => pending.set(String(input), resolve));
    const crop = tools.cropImageNode(source, { x: 0, y: 0, width: 0.5, height: 0.5 });
    const resize = tools.upscaleImageNode(source, { targetLongEdge: 2048, algorithm: "high" });
    for (let turn = 0; turn < 10 && pending.size < 2; turn++) await Promise.resolve();
    expect(pending.size).toBe(2);
    nodesRef.current = nodesRef.current.map(node => node.id === source.id ? { ...node, position: { x: 50, y: 300 }, width: 350 } : node);
    pending.get("resize")!(uploaded("resize")); await resize;
    const lateObstacle: CanvasNodeData = { id: "late", type: CanvasNodeType.Text, title: "late edit", position: { x: 496, y: 1000 }, width: 400, height: 200 };
    nodesRef.current = [...nodesRef.current, lateObstacle];
    pending.get("crop")!(uploaded("crop")); await crop;
    expect(errors).toEqual([]);
    expect(nodesRef.current).toHaveLength(5);
    expect(nodesRef.current[0].position).toEqual({ x: 50, y: 300 });
    expect(nodesRef.current[1]).toEqual(before[1]);
    expect(nodesRef.current.find(node => node.id === "late")).toEqual(lateObstacle);
    expect(nodesRef.current.find(node => node.metadata?.storageKey === "resource:resize")!.position).toEqual({ x: 496, y: 300 });
    expect(persisted).toHaveLength(2); expect(released).toHaveLength(2);
    assertUnobscured(nodesRef.current);
});

test("a repeated split moves the whole grid while retaining row, column and source links", async () => {
    const { tools, source, nodesRef, connectionsRef, before } = harness();
    await tools.splitImageNode(source, { rows: 1, columns: 2 });
    await tools.splitImageNode(source, { rows: 1, columns: 2 });
    expect(errors).toEqual([]); expect(nodesRef.current).toHaveLength(6);
    expect(nodesRef.current.slice(0, 2)).toEqual(before);
    const pieces = nodesRef.current.slice(2);
    expect(pieces[0].position.y).toBe(pieces[1].position.y);
    expect(pieces[2].position.x - pieces[3].position.x).toBe(pieces[0].position.x - pieces[1].position.x);
    expect(connectionsRef.current.map(link => link.fromNodeId)).toEqual([source.id, source.id, source.id, source.id]);
    assertUnobscured(nodesRef.current);
});

test("a failed crop creates no nodes and still releases its decoded source", async () => {
    const { tools, source, nodesRef, before } = harness();
    upload = async () => { throw new Error("upload rejected"); };
    await tools.cropImageNode(source, { x: 0, y: 0, width: 1, height: 1 });
    expect(nodesRef.current).toEqual(before); expect(persisted).toEqual([]);
    expect(errors).toHaveLength(1); expect(errors[0]).toContain("upload rejected");
    expect(released).toEqual(["source-image"]);
});
