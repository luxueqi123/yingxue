import { expect, test } from "bun:test";
import { createHash } from "node:crypto";
import catalog from "../src/assets/published-catalog-featured-200.json";
import homeCatalog from "../src/assets/ltv-home-published.json";
import thumbnails from "../src/lib/case-cover-thumbnails.json";
import { caseCoverThumbnail } from "../src/lib/case-cover-thumbnails";
import { resolveProductionCover } from "../src/lib/cleaned-case-media";
import { loadLtvHomeCatalog, loadProductionCatalog, type ProductionItem } from "../src/services/production-library";
import { publishedSkills } from "../src/lib/published-production-assets";

test("the compact public catalog preserves admitted order, project identity and film metadata", async () => {
    const originalFetch = globalThis.fetch;
    const controller = new AbortController();
    const requests: string[] = [];
    let requestSignal: AbortSignal | undefined;
    globalThis.fetch = (async (url, options) => {
        requests.push(String(url));
        requestSignal = options?.signal ?? undefined;
        expect(requestSignal?.aborted).toBe(false);
        expect(String(url)).toBe(new URL("../src/assets/published-catalog-featured-200.json", import.meta.url).href);
        return Response.json(catalog);
    }) as typeof fetch;
    try {
        const result = await loadProductionCatalog(false, controller.signal);
        expect(requests).toHaveLength(1);
        expect(result.items).toHaveLength(283);
        expect(result.stats.cases).toBe(200);
        const admitted = new Set(catalog.items.map(item => item.id));
        expect(result.items.filter(item => admitted.has(item.id)).map(item => item.id)).toEqual(catalog.items.map(item => item.id));
        const cases = result.items.filter(item => item.kind === "case");
        expect(new Set(cases.map(item => item.id))).toEqual(new Set(catalog.publishedCaseIds));
        for (const original of catalog.items.filter(item => item.kind === "case")) {
            const actual = cases.find(item => item.id === original.id)!;
            for (const key of ["name", "description", "category", "source", "author", "sourceRank", "sourceProjectId", "sourceTemplateId", "likeCount", "publishedAt", "tags"] as const) {
                expect(actual[key]).toEqual((original as ProductionItem)[key]);
            }
            expect(actual.localMedia).toBe((original as ProductionItem).localMedia);
            expect(actual.localMediaInfo).toEqual((original as ProductionItem).localMediaInfo);
        }
        controller.abort();
        expect(requestSignal?.aborted).toBe(true);
    } finally {
        globalThis.fetch = originalFetch;
    }
});

test("the small shortcut catalog retains its published skill records and order", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async url => {
        expect(String(url)).toBe(new URL("../src/assets/ltv-home-published.json", import.meta.url).href);
        return Response.json(homeCatalog);
    }) as typeof fetch;
    try {
        const result = await loadLtvHomeCatalog();
        expect(result.items).toEqual([]);
        expect(result.skills).toHaveLength(37);
        expect(result.skills).toEqual(homeCatalog.skills.map(item => ({ ...item, cover: publishedSkills[item.id].cover })));
    } finally {
        globalThis.fetch = originalFetch;
    }
});

test("display thumbnails match the same case and source while keeping cleaned and local covers first", () => {
    const [id, thumbnail] = Object.entries(thumbnails)[0];
    const item = catalog.items.find(item => item.id === id)! as ProductionItem;
    expect(item.cover).toBe(thumbnail.source);
    expect(resolveProductionCover(item)).toEqual({ local: caseCoverThumbnail(id, thumbnail.source), remote: undefined });
    expect(resolveProductionCover({ ...item, localCover: "/existing-clean-cover.webp" }))
        .toEqual({ local: "/existing-clean-cover.webp", remote: item.cover });
    expect(caseCoverThumbnail(id, "https://changed.invalid/new.webp")).toBeUndefined();
    expect(caseCoverThumbnail("case-unknown", thumbnail.source)).toBeUndefined();
});

test("every thumbnail is a small packaged WebP linked to an unchanged source record", async () => {
    expect(Object.keys(thumbnails)).toHaveLength(143);
    let total = 0;
    for (const [id, thumbnail] of Object.entries(thumbnails)) {
        const item = catalog.items.find(item => item.id === id)!;
        expect(item).toBeDefined();
        expect(item.cover).toBe(thumbnail.source);
        expect(thumbnail.file).toBe(`cover-${createHash("sha256").update(thumbnail.source).digest("hex").slice(0, 24)}.webp`);
        const content = new Uint8Array(await Bun.file(new URL(`../src/assets/case-covers/${thumbnail.file}`, import.meta.url)).arrayBuffer());
        expect(new TextDecoder().decode(content.subarray(0, 4))).toBe("RIFF");
        expect(new TextDecoder().decode(content.subarray(8, 12))).toBe("WEBP");
        expect(content.length).toBeLessThan(250_000);
        total += content.length;
    }
    expect(total).toBeLessThan(15_000_000);
});
