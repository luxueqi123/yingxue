import { expect, test } from "bun:test";
import catalog from "../public/production-library/published-catalog.json";
import { entryShowcaseWorks } from "../src/lib/entry-showcase";
import { cleanedCaseMediaBinding, resolveProductionMedia } from "../src/lib/cleaned-case-media";
import { productionProjectEntry } from "../src/lib/production-project-registry";
import { loadProductionCatalog, mergeProductionCaseMedia, type ProductionCatalog } from "../src/services/production-library";

test("all published films retain their released web rendition and immutable project binding", () => {
    const selected = new Set(catalog.publishedCaseIds);
    expect(selected.size).toBe(200);
    expect(entryShowcaseWorks).toHaveLength(200);
    for (const work of entryShowcaseWorks) {
        const id = `case-${work.id}`;
        expect(selected.has(id)).toBe(true);
        const hash = /-([a-f0-9]{64})\.mp4$/.exec(work.src)?.[1];
        const binding = cleanedCaseMediaBinding(id, hash);
        expect(binding?.path).toBe(work.src);
        if (hash) expect(binding?.sha256).toBe(hash);
        else expect(id).toBe("case-2218cb4006b441e5b87aa7402c80080b");
        const project = productionProjectEntry(id)!;
        expect(project.snapshotPath).toBe(`/production-library/case-projects/${id}-web-${project.sha256}.json`);
    }
});

test("the home catalog loads every published browser film without a global preview warning", async () => {
    const entries = entryShowcaseWorks.map(work => {
        const id = `case-${work.id}`;
        const hash = /-([a-f0-9]{64})\.mp4$/.exec(work.src)?.[1];
        const binding = cleanedCaseMediaBinding(id, hash)!;
        return { id, localMedia: work.src, localMediaInfo: { bytes: binding.bytes, sha256: binding.sha256,
            durationSeconds: 30, format: "mp4", videoCodec: "h264", audioCodec: "aac" } };
    });
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async url => String(url).endsWith("published-catalog-featured-200.json") ? Response.json(catalog)
        : Response.json({ version: 1, kind: "ltv-case-media", metadataCount: catalog.items.filter(item => item.kind === "case").length, entries })) as typeof fetch;
    try {
        const result = await loadProductionCatalog();
        const cases = result.items.filter(item => item.kind === "case");
        expect(cases).toHaveLength(200);
        expect(cases.every(item => item.mediaStatus === "local" && resolveProductionMedia(item).local && !resolveProductionMedia(item).remote)).toBe(true);
        expect(result.mediaWarning).toBeUndefined();
        expect(new Set(cases.map(item => item.id))).toEqual(new Set(catalog.publishedCaseIds));
    } finally { globalThis.fetch = originalFetch; }
});

test("the released browser rendition merges without discarding the media manifest or restoring source video", () => {
    const id = "case-05823d8aa02046d1a9a89e2c59ff1a08";
    const sha256 = "d376edfa2e8616b6ad57aed4d0f5c958954db00939249055cf97215420795e9e";
    const binding = cleanedCaseMediaBinding(id, sha256)!;
    const item = catalog.items.find(item => item.id === id)!;
    const input = { version: 1, stats: { ...catalog.stats, cases: 1 }, items: [item] } as ProductionCatalog;
    const localMedia = `/production-library/case-media/${id.slice(5)}-${sha256}.mp4`;
    const merged = mergeProductionCaseMedia(input, { version: 1, kind: "ltv-case-media", metadataCount: 1,
        entries: [{ id, localMedia, localMediaInfo: { bytes: binding.bytes, sha256, durationSeconds: 30, format: "mp4", videoCodec: "h264", audioCodec: "aac" } }] });
    expect(resolveProductionMedia(merged.items[0])).toEqual({ local: localMedia, remote: undefined });
    expect(merged.items[0].media).toBeUndefined();
    expect(merged.items[0].name).toBe(item.name);
    expect(resolveProductionMedia({ ...merged.items[0], localMediaInfo: { ...merged.items[0].localMediaInfo!, bytes: binding.bytes - 1 } }))
        .toEqual({ local: undefined, remote: undefined });
});
