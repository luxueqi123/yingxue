import { describe, expect, test } from "bun:test";

import { canGenerateImageInPlace, canGenerateMediaInPlace, findAvailableGenerationGroupPosition, imageGenerationGroupSize, placeCanvasToolResults } from "../src/lib/canvas/canvas-generation-layout";
import { CanvasNodeType, type CanvasNodeData } from "../src/types/canvas";

function node(id: string, x: number, y: number, width = 340, height = 240): CanvasNodeData {
    return { id, type: CanvasNodeType.Image, title: id, position: { x, y }, width, height };
}

describe("findAvailableGenerationGroupPosition", () => {
    test("已有存储标识但预览未恢复的媒体不能当作空节点覆盖", () => {
        expect(canGenerateImageInPlace({ ...node("stored", 0, 0), metadata: { storageKey: "resource:image" } })).toBe(false);
        expect(canGenerateMediaInPlace({ ...node("video", 0, 0), type: CanvasNodeType.Video, metadata: { storageKey: "resource:video" } }, CanvasNodeType.Video)).toBe(false);
    });
    test("首选位置没有占用时保持原坐标", () => {
        expect(findAvailableGenerationGroupPosition([node("source", 0, 0)], { x: 436, y: 0 }, { width: 340, height: 240 })).toEqual({ x: 436, y: 0 });
    });

    test("右侧已有节点时选择距离更短的下方空位", () => {
        expect(findAvailableGenerationGroupPosition([node("occupied", 436, 0)], { x: 436, y: 0 }, { width: 340, height: 240 })).toEqual({ x: 436, y: 276 });
    });

    test("纵向大节点遮挡时改为向右避让", () => {
        expect(findAvailableGenerationGroupPosition([node("occupied", 436, 0, 340, 900)], { x: 436, y: 0 }, { width: 340, height: 240 })).toEqual({ x: 812, y: 0 });
    });

    test("按完整批次范围检测碰撞", () => {
        const groupSize = imageGenerationGroupSize({ width: 340, height: 240 }, { width: 340, height: 240 }, 4);
        expect(groupSize).toEqual({ width: 1176, height: 516 });
        expect(findAvailableGenerationGroupPosition([node("child-area", 900, 0)], { x: 436, y: 0 }, groupSize)).toEqual({ x: 436, y: 276 });
    });
});

describe("placeCanvasToolResults", () => {
    test("avoids an obstacle anywhere in a group without changing its internal layout or existing nodes", () => {
        const existing = [node("source", 0, 0), node("blocked-second-output", 1000, 0, 340, 900)];
        const results = [node("prompt", 436, 0), node("output", 900, 0)];
        const before = structuredClone({ existing, results });
        const placed = placeCanvasToolResults(existing, results, existing[0]);
        expect(placed[1].position.x - placed[0].position.x).toBe(464);
        expect(placed[0].position).toEqual({ x: 436, y: 936 });
        expect(placed.map((item) => item.id)).toEqual(["prompt", "output"]);
        expect({ existing, results }).toEqual(before);
    });

    test("follows the latest source position and width when processing finishes", () => {
        const source = node("source", 0, 0);
        const moved = { ...source, position: { x: 100, y: 80 }, width: 500 };
        expect(placeCanvasToolResults([moved], [node("result", 436, 0)], source)[0].position).toEqual({ x: 696, y: 80 });
    });

    test("concurrent and repeated results use the newly committed obstacles", () => {
        const source = node("source", 0, 0);
        const first = placeCanvasToolResults([source], [node("first", 436, 0)], source);
        const second = placeCanvasToolResults([source, ...first], [node("second", 436, 0)], source);
        expect(first[0].position).toEqual({ x: 436, y: 0 });
        expect(second[0].position).toEqual({ x: 436, y: 276 });
        expect(placeCanvasToolResults([source, ...first, ...second], [], source)).toEqual([]);
    });
});

describe("canGenerateImageInPlace", () => {
    test("空图片和显式复制节点复用原节点", () => {
        expect(canGenerateImageInPlace(node("empty", 0, 0))).toBe(true);
        expect(canGenerateImageInPlace({ ...node("result", 0, 0), metadata: { content: "image-url" } })).toBe(false);
        expect(canGenerateImageInPlace({ ...node("copy", 0, 0), metadata: { content: "image-url", generationResultPlacement: "replace-node" } })).toBe(true);
        expect(canGenerateImageInPlace({ ...node("copy", 0, 0), metadata: { content: "image-url", generationResultPlacement: "new-version", copiedFromNodeId: "source" } })).toBe(false);
        expect(canGenerateImageInPlace({ ...node("text", 0, 0), type: CanvasNodeType.Text })).toBe(false);
    });

    test("视频复制节点与图片使用相同的结果落点规则", () => {
        const video = { ...node("video-copy", 0, 0), type: CanvasNodeType.Video, metadata: { content: "video-url", generationResultPlacement: "replace-node" as const } };
        expect(canGenerateMediaInPlace(video, CanvasNodeType.Video)).toBe(true);
        expect(canGenerateMediaInPlace({ ...video, metadata: { ...video.metadata, generationResultPlacement: "new-version" } }, CanvasNodeType.Video)).toBe(false);
    });
});
