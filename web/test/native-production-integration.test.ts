import { expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { nativeProductionRecords } from "../src/lib/production-project-registry";
import { loadProductionCaseProject } from "../src/services/production-case-project";
import { loadProductionCatalog } from "../src/services/production-library";
import { verifiedLtvCaseIds } from "../src/lib/verified-production-assets";
import { isCaseWithdrawn } from "../src/lib/case-publication-policy";
import { assessCaseModels } from "../src/lib/canvas/production-case-model-readiness";
import { defaultConfig } from "../src/stores/use-config-store";

const asset = (path: string) => readFileSync(path.startsWith("file:") ? new URL(path) : new URL(`../public${path}`, import.meta.url));

test("保留28个重建案例与30个原生模板资源，公开目录只展示选定200例", async () => {
    expect(nativeProductionRecords.filter(entry => entry.item.kind === "case")).toHaveLength(28);
    expect(nativeProductionRecords.filter(entry => entry.item.kind === "template")).toHaveLength(30);
    const previous = globalThis.fetch;
    globalThis.fetch = (async (url: string) => new Response(asset(url))) as typeof fetch;
    try {
        const catalog = await loadProductionCatalog();
        const published = JSON.parse(asset(new URL("../src/assets/published-catalog-featured-200.json", import.meta.url).href).toString());
        const expectedPublicIds = published.items.filter((item: {kind: string; id: string}) => item.kind === "case" && !isCaseWithdrawn(item.id)).map((item: {id: string}) => item.id);
        expect(catalog.stats.cases).toBe(expectedPublicIds.length);
        expect(new Set(catalog.items.filter(item => item.kind === "case").map(item => item.id))).toEqual(new Set(expectedPublicIds));
        expect(catalog.stats.templates).toBe(30);
        expect(new Set(catalog.items.map(item => item.id)).size).toBe(catalog.items.length);
        for (const id of expectedPublicIds) expect(catalog.items.some(item => item.id === id)).toBe(true);
    } finally { globalThis.fetch = previous; }
});

test("全部原生快照校验通过，预览不改ID，复制保留输入约束且重映射所有节点引用", async () => {
    expect(nativeProductionRecords.length).toBe(58);
    const previous = globalThis.fetch;
    globalThis.fetch = (async (url: string) => new Response(asset(url))) as typeof fetch;
    try {
        for (const entry of nativeProductionRecords) {
            const bytes = asset(entry.project.snapshotPath);
            expect(createHash("sha256").update(bytes).digest("hex")).toBe(entry.project.sha256);
            const source = JSON.parse(bytes.toString());
            expect(bytes.toString()).not.toMatch(/\b[A-Za-z]:[\\/]/);
            const preview = await loadProductionCaseProject(entry.item.id, { mode: "preview" });
            expect(preview.nodes.map(node => node.id)).toEqual(source.nodes.map((node: any) => node.id));
            const copy = await loadProductionCaseProject(entry.item.id);
            const oldIds = new Set(preview.nodes.map(node => node.id));
            const newIds = new Set(copy.nodes.map(node => node.id));
            expect(copy.nodes.every(node => !oldIds.has(node.id))).toBe(true);
            expect(copy.connections.every(edge => newIds.has(edge.fromNodeId) && newIds.has(edge.toNodeId))).toBe(true);
            expect(copy.nodes.map(node => node.metadata?.generationInputRequirements)).toEqual(preview.nodes.map(node => node.metadata?.generationInputRequirements));
            for (const node of copy.nodes) {
                if (node.metadata?.videoStartFrameNodeId) expect(newIds.has(node.metadata.videoStartFrameNodeId)).toBe(true);
                for (const row of node.metadata?.storyboard?.rows || []) if (row.videoNodeId) expect(newIds.has(row.videoNodeId)).toBe(true);
            }
            expect(assessCaseModels(copy.nodes, { ...defaultConfig, channels: [] }, copy.connections)).toHaveLength(entry.project.generationNodeCount);
            if (entry.item.kind === "case") {
                expect(entry.project.generationNodeCount).toBe(2);
                const creation = preview.nodes.filter(node => node.metadata?.generationInputRequirements);
                expect(creation).toHaveLength(2);
                for (const node of creation) {
                    expect(node.metadata?.content).toBe("");
                    expect(node.metadata?.prompt?.trim()).toBeTruthy();
                    expect(node.metadata?.prompt).not.toContain("@[node:");
                }
                expect(asset(entry.item.localMedia!).byteLength).toBeGreaterThan(0);
                expect(asset(entry.item.localCover!).byteLength).toBeGreaterThan(0);
                expect(preview.nodes.some(node => node.type === "video" && node.metadata?.content === entry.item.localMedia && !node.metadata?.generationMode)).toBe(true);
            } else {
                expect(entry.item.media).toBeUndefined();
                expect(entry.item.cover).toBe(`/production-library/editorial-covers/${entry.item.id}.webp`);
                expect(entry.item.localMedia).toBeUndefined();
            }
        }
    } finally { globalThis.fetch = previous; }
});
