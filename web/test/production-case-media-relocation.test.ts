import { expect, test } from "bun:test";
import { createHash } from "node:crypto";
import support from "../src/lib/production-case-support.json";
import { isCaseWithdrawn } from "../src/lib/case-publication-policy";
import { loadProductionCaseProject } from "../src/services/production-case-project";
import { resolveLtvRuntimeReferences } from "../src/lib/canvas/ltv-runtime-references";
import { ensureMediaNodeMinimumSize } from "../src/lib/canvas/canvas-node-size";

test("preview and copy relocate ordinary media and fixed reference slots together", async () => {
    const entry = support.find(item => !isCaseWithdrawn(item.id))!;
    const previous = { ...entry };
    const fetchBefore = globalThis.fetch;
    const old = "https://media.example/original.png";
    const relocated = "/api/resources/verified-image/file";
    const snapshot = { version: 1, id: entry.id, title: "原工程", nodes: [
        { id: "source", type: "image", title: "原图", position: { x: 0, y: 0 }, width: 320, height: 180, metadata: { content: old } },
        { id: "target", type: "image", title: "生成", position: { x: 400, y: 0 }, width: 320, height: 180, metadata: {
            prompt: "@图片1 原风格", ltvReferencePlan: { prompt: "@图片1 原风格", references: [{ nodeId: "source", kind: "image", url: old }] },
        } },
    ], connections: [{ id: "edge", fromNodeId: "source", toNodeId: "target" }], mediaAssets: [{ source:old,kind:"image",mimeType:"image/png",bytes:12,sha256:"a".repeat(64),path:`/production-library/case-media/${entry.id}/${"a".repeat(64)}.png` }] };
    const bytes = JSON.stringify(snapshot);
    Object.assign(entry, { nodeCount: 2, connectionCount: 1, sha256: createHash("sha256").update(bytes).digest("hex") });
    globalThis.fetch = (async () => new Response(bytes)) as typeof fetch;
    try {
        for (const mode of ["preview", "copy"] as const) {
            const project = await loadProductionCaseProject(entry.id, { mode, mediaUrlMap: { [old]: relocated } });
            const source = project.nodes.find(node => node.title === "原图")!;
            expect(project.mediaAssets).toEqual(snapshot.mediaAssets);
            const target = project.nodes.find(node => node.title === "生成")!;
            expect(source.metadata?.content).toBe(relocated);
            expect(source.metadata?.manualSize).toBe(true);
            expect([source.width, source.height]).toEqual([320, 180]);
            expect(target.metadata?.manualSize).toBe(true);
            expect(ensureMediaNodeMinimumSize(target)).toBe(target);
            expect(target.metadata?.prompt).toBe("@图片1 原风格");
            const plan = target.metadata!.ltvReferencePlan!;
            expect(plan.references).toEqual([{ nodeId: source.id, kind: "image", url: relocated }]);
            expect(resolveLtvRuntimeReferences(plan, project.nodes, plan.prompt).map(node => node.id)).toEqual([source.id]);
            expect(project.connections[0].fromNodeId).toBe(source.id);
        }
        expect(JSON.stringify(snapshot)).toBe(bytes);
    } finally { Object.assign(entry, previous); globalThis.fetch = fetchBefore; }
});

test("只读预览使用快照内已核验的本地媒体，复制仍保留待入库的原来源", async () => {
    const entry = support.find(item => !isCaseWithdrawn(item.id))!;
    const previous = { ...entry };
    const fetchBefore = globalThis.fetch;
    const mediaAssets = (["image", "video", "audio"] as const).map((kind, index) => {
        const extension = ["png", "mp4", "mp3"][index];
        const sha256 = String(index + 1).repeat(64);
        return { kind, source: `https://media.example/original.${extension}`, bytes: 12, sha256,
            mimeType: ["image/png", "video/mp4", "audio/mpeg"][index],
            path: `/production-library/case-media/${entry.id}/${sha256}.${extension}` };
    });
    const snapshot = { version: 1, id: entry.id, title: "本地预览", nodes: [
        ...mediaAssets.map(asset => ({ id: asset.kind, type: asset.kind, title: asset.kind,
            position: { x: 0, y: 0 }, width: 320, height: 180, metadata: { content: asset.source } })),
        { id: "generate", type: "image", title: "生成", position: { x: 400, y: 0 }, width: 320, height: 180,
            metadata: { prompt: "@图片1 保留原风格", ltvReferencePlan: { prompt: "@图片1 保留原风格",
                references: [{ nodeId: "image", kind: "image", url: mediaAssets[0].source }] } } },
    ], connections: [{ id: "edge", fromNodeId: "image", toNodeId: "generate" }], mediaAssets };
    const bytes = JSON.stringify(snapshot);
    Object.assign(entry, { nodeCount: 4, connectionCount: 1, sha256: createHash("sha256").update(bytes).digest("hex") });
    globalThis.fetch = (async () => new Response(bytes)) as typeof fetch;
    try {
        const preview = await loadProductionCaseProject(entry.id, { mode: "preview" });
        for (const asset of mediaAssets) {
            const node = preview.nodes.find(node => node.id === asset.kind)!;
            expect(node.metadata?.content).toBe(asset.path);
            if (asset.kind === "image") expect(node.metadata?.previewContent).toBe(asset.path);
        }
        const target = preview.nodes.find(node => node.id === "generate")!;
        const plan = target.metadata!.ltvReferencePlan!;
        expect(plan.references[0].url).toBe(mediaAssets[0].path);
        expect(resolveLtvRuntimeReferences(plan, preview.nodes, plan.prompt).map(node => node.id)).toEqual(["image"]);
        expect(target.metadata?.prompt).toBe(snapshot.nodes[3].metadata.prompt);
        expect(preview.mediaAssets).toEqual(mediaAssets);
        const copy = await loadProductionCaseProject(entry.id);
        for (const asset of mediaAssets) {
            expect(copy.nodes.find(node => node.title === asset.kind)?.metadata?.content).toBe(asset.source);
        }
        const editable = await loadProductionCaseProject(entry.id, { mode: "editable" });
        expect(editable.nodes.every(node => !snapshot.nodes.some(original => original.id === node.id))).toBe(true);
        for (const asset of mediaAssets) {
            expect(editable.nodes.find(node => node.title === asset.kind)?.metadata?.content).toBe(asset.path);
        }
        const editableTarget = editable.nodes.find(node => node.title === "生成")!;
        expect(resolveLtvRuntimeReferences(editableTarget.metadata!.ltvReferencePlan!, editable.nodes, plan.prompt).map(node => node.id))
            .toEqual([editable.nodes.find(node => node.title === "image")!.id]);
        expect(JSON.stringify(snapshot)).toBe(bytes);
    } finally {
        Object.assign(entry, previous);
        globalThis.fetch = fetchBefore;
    }
});
