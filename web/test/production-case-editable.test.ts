import { test, expect } from "bun:test";
import { readFileSync } from "node:fs";
import { productionProjectEntry } from "../src/lib/production-project-registry";
import { loadProductionCaseProject } from "../src/services/production-case-project";

test("published editable cases load independent workflow identities without fetching media", async () => {
    const catalog = JSON.parse(readFileSync(new URL("../public/production-library/published-catalog.json", import.meta.url), "utf8"));
    const previousFetch = globalThis.fetch;
    const requests: string[] = [];
    globalThis.fetch = (async (input: string) => {
        expect(input.startsWith("/production-library/case-projects/")).toBe(true);
        requests.push(input);
        return new Response(readFileSync(new URL("../public" + input, import.meta.url)));
    }) as typeof fetch;
    try {
        for (const id of catalog.publishedCaseIds as string[]) {
            const entry = productionProjectEntry(id)!;
            const original = JSON.parse(readFileSync(new URL("../public" + entry.snapshotPath, import.meta.url), "utf8"));
            const project = await loadProductionCaseProject(id, { mode: "editable" });
            const ids = new Set(project.nodes.map(node => node.id));
            expect(ids.size).toBe(original.nodes.length);
            expect(project.connections.length).toBe(original.connections.length);
            const originalIds = new Set(original.nodes.map((node: { id: string }) => node.id));
            const urls = new Set(original.mediaAssets.map((asset: { path: string }) => asset.path));
            for (const [index, node] of project.nodes.entries()) {
                expect(originalIds.has(node.id)).toBe(false);
                expect(node.position).toEqual(original.nodes[index].position);
                expect(node.metadata?.prompt).toBe(original.nodes[index].metadata?.prompt);
                if (["image", "video", "audio"].includes(node.type) && node.metadata?.content) {
                    expect(urls.has(node.metadata.content)).toBe(true);
                    expect(node.metadata.storageKey).toBeUndefined();
                }
                for (const reference of node.metadata?.ltvReferencePlan?.references ?? []) {
                    if (!reference.deferred && reference.url) expect(urls.has(reference.url)).toBe(true);
                    expect(ids.has(reference.nodeId)).toBe(true);
                }
            }
            for (const edge of project.connections) {
                expect(ids.has(edge.fromNodeId)).toBe(true);
                expect(ids.has(edge.toNodeId)).toBe(true);
            }
            for (const scene of project.previsScenes ?? []) {
                for (const object of scene.objects) {
                    if (object.kind === "model" || object.kind === "billboard") expect(urls.has(object.url!)).toBe(true);
                }
            }
        }
        expect(requests.length).toBe(catalog.publishedCaseIds.length);
    } finally {
        globalThis.fetch = previousFetch;
    }
});
