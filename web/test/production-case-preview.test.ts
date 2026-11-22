import { test, expect } from "bun:test";
import { readFileSync } from "node:fs";
import support from "../src/lib/production-case-support.json";
import { loadProductionCaseProject } from "../src/services/production-case-project";
import { verifiedLtvCaseIds } from "../src/lib/verified-production-assets";
import { getCanvasNodesBounds, initialCasePreviewViewport, viewportAtScale, viewportForBounds } from "../src/lib/canvas/canvas-viewport";

test("大型案例初始预览可读并聚焦实际内容，原节点布局不变", () => {
    const source = JSON.parse(readFileSync(new URL("../public/production-library/case-projects/case-2180f1ab1d4c4d4da547df21a5543317.json", import.meta.url), "utf8"));
    const original = JSON.stringify(source.nodes);
    const first = source.nodes.find((node: any) => node.type !== "frame");
    for (const size of [{ width: 1000, height: 650 }, { width: 310, height: 460 }]) {
        const view = initialCasePreviewViewport(source.nodes, size);
        expect(view.k).toBeGreaterThanOrEqual(0.5);
        expect((first.position.x + first.width / 2) * view.k + view.x).toBeCloseTo(size.width / 2);
        expect((first.position.y + first.height / 2) * view.k + view.y).toBeCloseTo(size.height / 2);
    }
    expect(JSON.stringify(source.nodes)).toBe(original);
});

test("小工程初始预览显示全部内容，空工程保持原点", () => {
    const nodes = [{ id: "image", type: "image", title: "Image", position: { x: 5000, y: -1000 }, width: 320, height: 180 }] as any;
    const view = initialCasePreviewViewport(nodes, { width: 1000, height: 650 });
    expect(view.k).toBe(1);
    expect(nodes[0].position.x * view.k + view.x).toBeGreaterThan(0);
    expect((nodes[0].position.x + 320) * view.k + view.x).toBeLessThan(1000);
    expect(initialCasePreviewViewport([], { width: 310, height: 460 })).toEqual({ x: 0, y: 0, k: 1 });
});

test("只读案例预览保留原节点标识、坐标与连接，复制使用新标识", async () => {
    const entry = support.find(item => item.generationNodeCount > 0)!;
    const bytes = readFileSync(new URL(`../public${entry.snapshotPath}`, import.meta.url));
    const original = JSON.parse(bytes.toString());
    const previousFetch = globalThis.fetch;
    globalThis.fetch = (async () => new Response(bytes)) as typeof fetch;
    try {
        const preview = await loadProductionCaseProject(entry.id, { mode: "preview" });
        expect(preview.nodes.map(node => [node.id, node.position, node.parentId])).toEqual(original.nodes.map((node: any) => [node.id, node.position, node.parentId]));
        expect(new Set(preview.connections.map(edge => edge.id))).toEqual(new Set(original.connections.map((edge: any) => edge.id)));
        const copy = await loadProductionCaseProject(entry.id);
        const oldIds = new Set(original.nodes.map((node: any) => node.id));
        expect(copy.nodes.every(node => !oldIds.has(node.id))).toBe(true);
        expect(copy.nodes.length).toBe(preview.nodes.length);
        expect(copy.connections.length).toBe(preview.connections.length);
        for (const record of original.adaptation.models) {
            const index = original.nodes.findIndex((node: any) => node.id === record.nodeId);
            const provenance = { sourceModel: record.sourceModel, convertedModel: record.targetModel, operation: record.operation };
            expect(preview.nodes[index].metadata?.generationModelProvenance).toEqual(provenance);
            expect(copy.nodes[index].metadata?.generationModelProvenance).toEqual(provenance);
        }
    } finally { globalThis.fetch = previousFetch; }
});

test("灵感案例仅准入含制作节点的工程，不将素材整理冒充制作过程", () => {
    expect(verifiedLtvCaseIds.size).toBe(support.filter(item => item.generationNodeCount > 0).length);
    for (const entry of support) expect(verifiedLtvCaseIds.has(entry.id)).toBe(entry.generationNodeCount > 0);
});

test("全部案例在桌面与手机预览均可适应完整工程，大图缩小不跳回百分之五", () => {
    for (const entry of support) {
        const source = JSON.parse(readFileSync(new URL(`../public${entry.snapshotPath}`, import.meta.url), "utf8"));
        const bounds = getCanvasNodesBounds(source.nodes)!;
        for (const size of [{ width: 1000, height: 650 }, { width: 310, height: 460 }]) {
            const viewport = viewportForBounds(bounds, size, { padding: 72, minScale: 0.001, maxScale: 1 });
            expect(bounds.left * viewport.k + viewport.x).toBeGreaterThanOrEqual(71.99);
            expect(bounds.right * viewport.k + viewport.x).toBeLessThanOrEqual(size.width - 71.99);
            expect(bounds.top * viewport.k + viewport.y).toBeGreaterThanOrEqual(71.99);
            expect(bounds.bottom * viewport.k + viewport.y).toBeLessThanOrEqual(size.height - 71.99);
        }
    }
    const viewport = { x: 0, y: 0, k: 0.02 };
    expect(viewportAtScale(viewport, { width: 1000, height: 650 }, 0.01, 0.001).k).toBe(0.01);
    expect(viewportAtScale(viewport, { width: 1000, height: 650 }, 0.01).k).toBe(0.05);
});
