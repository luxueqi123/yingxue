import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { loadProductionCaseProject } from "../src/services/production-case-project";
import { productionProjectEntry } from "../src/lib/production-project-registry";

test("作品库第3工程复制保留原图片尺寸并移除转换机器的模型绑定", async () => {
    const id = "case-2180f1ab1d4c4d4da547df21a5543317";
    const bytes = readFileSync(new URL(`../public${productionProjectEntry(id)!.snapshotPath}`, import.meta.url));
    const source = JSON.parse(bytes.toString());
    const fetchBefore = globalThis.fetch;
    globalThis.fetch = (async () => new Response(bytes)) as typeof fetch;
    try {
        const project = await loadProductionCaseProject(id);
        expect(project.nodes).toHaveLength(156);
        expect(project.connections).toHaveLength(156);
        expect(project.mediaAssets).toHaveLength(104);
        expect(project.mediaAssets?.filter(asset => asset.kind === "image")).toHaveLength(42);
        expect(project.mediaAssets?.filter(asset => asset.kind === "video")).toHaveLength(62);
        expect(project.mediaAssets?.reduce((bytes, asset) => bytes + asset.bytes, 0)).toBe(source.mediaAssets.reduce((bytes: number, asset: { bytes: number }) => bytes + asset.bytes, 0));
        const sources = new Set(project.mediaAssets?.map(asset => asset.source));
        const mediaNodes = project.nodes.filter(node => ["image", "video", "audio"].includes(node.type) && node.metadata?.content);
        expect(mediaNodes).toHaveLength(138);
        expect(mediaNodes.every(node => sources.has(node.metadata!.content!))).toBe(true);
        for (let index = 0; index < project.nodes.length; index++) {
            const node = project.nodes[index];
            if (!["image", "video"].includes(node.type) || !node.metadata?.content) continue;
            expect(node.metadata.manualSize).toBe(true);
            expect([node.width, node.height]).toEqual([source.nodes[index].width, source.nodes[index].height]);
        }
        const images = project.nodes.filter(node => node.type === "image" && node.metadata?.ltvReferencePlan);
        expect(images).toHaveLength(46);
        const sizes: Record<string, number> = {};
        for (const node of images) {
            expect(node.metadata?.ltvExecutionContract).toBe("openai-image");
            expect(node.metadata?.model).toBe("");
            const size = node.metadata!.size!;
            sizes[size] = (sizes[size] || 0) + 1;
            expect(node.metadata?.generationModelProvenance?.sourceModel).toBe("lib-image-2");
        }
        expect(sizes).toEqual({ "2816x1584": 43, "1584x2816": 1, "1776x2368": 1, "3360x1440": 1 });
    } finally { globalThis.fetch = fetchBefore; }
});
