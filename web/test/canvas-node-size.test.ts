import { expect, test } from "bun:test";
import { ensureMediaNodeMinimumSize, IMAGE_NODE_MAX_SIZE } from "../src/lib/canvas/canvas-node-size";
import { CanvasNodeType, type CanvasNodeData } from "../src/types/canvas";

const image = (metadata: CanvasNodeData["metadata"]): CanvasNodeData => ({
    id: "author-layout", type: CanvasNodeType.Image, title: "原工程图片",
    position: { x: 41.38948546090546, y: -1587.6362822137544 }, width: 350, height: 622, metadata,
});

test("打开已保存媒体时保留手动布局，不将原工程350宽图片放大并移动", () => {
    const node = image({ content: "/api/resources/original/file", manualSize: true, naturalWidth: 896, naturalHeight: 1592 });
    expect(ensureMediaNodeMinimumSize(node)).toBe(node);
    const video = { ...node, type: CanvasNodeType.Video };
    expect(ensureMediaNodeMinimumSize(video)).toBe(video);
});

test("非手动图片及空生成节点保留比例，预览不超过原生尺寸边界", () => {
    for (const node of [image({ content: "/api/resources/original/file" }), image({})]) {
        const normalized = ensureMediaNodeMinimumSize(node);
        expect(normalized.width).toBeGreaterThan(0);
        expect(normalized.width).toBeLessThanOrEqual(IMAGE_NODE_MAX_SIZE.width);
        expect(normalized.height).toBeLessThanOrEqual(IMAGE_NODE_MAX_SIZE.height);
        expect(normalized.width / normalized.height).toBeCloseTo(node.width / node.height);
        expect(normalized.position.x + normalized.width / 2).toBeCloseTo(node.position.x + node.width / 2);
        expect(normalized.position.y + normalized.height / 2).toBeCloseTo(node.position.y + node.height / 2);
    }
});

test("原工程手动布局的空视频重开时不按目标比例缩小或移动", () => {
    const node: CanvasNodeData = { ...image({ manualSize: true, size: "21:9", status: "idle" }),
        type: CanvasNodeType.Video, title: "原工程待生成视频", width: 817, height: 350,
        position: { x: 4676.175627906176, y: 11082.828975898246 } };
    expect(ensureMediaNodeMinimumSize(node)).toBe(node);
});

test("手动媒体保留布局及比例，但仍规范旧默认名称", () => {
    const node = { ...image({ content: "/api/resources/original/file", manualSize: true,
        generationType: "edit", size: "16:9", naturalWidth: 1920, naturalHeight: 1080 }), title: "New Generation" };
    expect(ensureMediaNodeMinimumSize(node)).toEqual({ ...node, title: "图片" });
});
