import { describe, expect, test } from "bun:test";
import { isCaseMediaReference, isPersonalLibraryAsset } from "../src/lib/asset-library-origin";
import { canvasNodeToAsset } from "../src/lib/canvas/canvas-node-asset";
import { CanvasNodeType } from "../src/types/canvas";

describe("personal asset library origin", () => {
    test("excludes historical automatic case references from local cache", () => {
        expect(isPersonalLibraryAsset({ metadata: { source: "canvas-upload" }, data: { url: "https://libtv-res.liblib.art/case.mp4" } })).toBe(false);
        expect(isPersonalLibraryAsset({ metadata: { source: "canvas-upload" }, data: { dataUrl: "/production-library/case-media/a/image.png" } })).toBe(false);
        expect(isPersonalLibraryAsset({ metadata: { source: "case-import" }, data: { storageKey: "resource:case" } })).toBe(false);
    });
    test("retains generated results, manual uploads and deliberate saves", () => {
        expect(isPersonalLibraryAsset({ metadata: { source: "generation-task", taskId: "task-1" } })).toBe(true);
        expect(isPersonalLibraryAsset({ metadata: { source: "case-import", taskId: "task-1" } })).toBe(true);
        expect(isPersonalLibraryAsset({ metadata: { source: "canvas-manual" }, data: { url: "https://libtv-res.liblib.art/case.mp4" } })).toBe(true);
        expect(isPersonalLibraryAsset({ metadata: { source: "canvas-upload" }, data: { storageKey: "resource:mine" } })).toBe(true);
        expect(isPersonalLibraryAsset({ data: { content: "a personal note" } })).toBe(true);
    });
    test("matches the case host exactly", () => {
        expect(isCaseMediaReference("https://libtv-res.liblib.art.example.org/case.mp4")).toBe(false);
        expect(isCaseMediaReference("https://example.org/libtv-res.liblib.art/case.mp4")).toBe(false);
        expect(isCaseMediaReference("not a URL")).toBe(false);
    });
    test("automatic canvas repair marks case imports without hiding new generation or deliberate saves", () => {
        const node = { id: "case-node", type: CanvasNodeType.Image, title: "Case", position: { x: 0, y: 0 }, width: 320, height: 180, metadata: { content: "https://libtv-res.liblib.art/source.png" } };
        expect(canvasNodeToAsset(node, { canvasId: "canvas", source: "canvas-upload" })?.metadata?.source).toBe("case-import");
        expect(canvasNodeToAsset(node, { canvasId: "canvas", source: "canvas-upload", taskId: "new-task" })?.metadata?.source).toBe("canvas-upload");
        expect(canvasNodeToAsset(node, { canvasId: "canvas", source: "canvas-manual" })?.metadata?.source).toBe("canvas-manual");
    });
});
