import { expect, test } from "bun:test";
import { curateInspirationCases, inspirationSeries } from "../src/lib/inspiration-curation";
import { deferredCreationIds, featuredCreationIds } from "../src/lib/featured-creation-order";
import native from "../src/lib/native-production-assets.json";
import catalog from "../public/production-library/published-catalog.json";
import support from "../src/lib/production-case-support.json";
import policy from "../src/lib/case-publication-policy.json";
import type { ProductionItem } from "../src/services/production-library";

const item = (id: string, more: Partial<ProductionItem> = {}): ProductionItem => ({ id, kind: "case", name: id, description: "", category: "creative", source: "test", author: "test", available: true, ...more });

test("curated order promotes featured picks and moves deferred cases back without changing source ranks", () => {
    const [firstFeatured, secondFeatured] = featuredCreationIds;
    const [firstDeferred] = deferredCreationIds;
    const input = [
        item(firstDeferred, { sourceRank: 1 }),
        item("source-order", { sourceRank: 3, likeCount: 900 }),
        item(secondFeatured, { sourceRank: 6 }),
        item(firstFeatured, { sourceRank: 1097 }),
    ];
    const sourceRanks = input.map(value => [value.id, value.sourceRank]);
    const groups = curateInspirationCases(input);

    expect(groups.map(group => group.item.id)).toEqual([firstFeatured, secondFeatured, "source-order", firstDeferred]);
    expect(input.map(value => [value.id, value.sourceRank])).toEqual(sourceRanks);
});

test("same media under different IDs is one card but all workflows remain accessible", () => {
    const input = [item("a", { media: "https://media.example/a.mp4?token=old" }), item("b", { media: "https://media.example/a.mp4?token=new" }), item("a"), item("c", { name: "a", media: "https://media.example/b.mp4" })];
    const groups = curateInspirationCases(input);
    expect(groups).toHaveLength(2);
    expect(groups[0].variants.map(value => value.id)).toEqual(["a", "b"]);
    expect(input).toHaveLength(4);
});

test("media identity retains meaningful query parameters and merges transitive duplicates", () => {
    const groups = curateInspirationCases([item("a", { media: "/video?id=1" }), item("b", { media: "/video?id=2" }), item("c", { media: "/video?id=1", localMedia: "/video?id=2" })]);
    expect(groups).toHaveLength(1);
    expect(groups[0].variants).toHaveLength(3);
    expect(curateInspirationCases([item("a", { media: "/video?id=1" }), item("b", { media: "/video?id=2" })])).toHaveLength(2);
});

test("public gallery excludes every withdrawn workflow without losing other archived cases", () => {
    const admitted = new Set(support.filter(value => value.generationNodeCount > 0).map(value => value.id));
    const items = [...native.entries.map(value => value.item), ...catalog.items.filter(value => admitted.has(value.id))] as ProductionItem[];
    const groups = curateInspirationCases(items);
    const withdrawn = new Set(policy.withdrawn.map(value => value.id));
    const expected = items.filter(value => value.kind === "case" && !withdrawn.has(value.id));
    const expectedSourceRanks = new Map(expected.map(value => [value.id, value.sourceRank]));
    expect(new Set(items.map(value => value.id)).size).toBe(items.length);
    const presentFeatured = featuredCreationIds.filter(id => expected.some(value => value.id === id));
    expect(groups.map(value => value.item.id).slice(0, presentFeatured.length)).toEqual(presentFeatured);
    const expectedIds = new Set(expected.map(value => value.id));
    const seriesDuplicates = inspirationSeries.reduce((count, series) =>
        count + Math.max(0, series.filter(id => expectedIds.has(id)).length - 1), 0);
    expect(groups).toHaveLength(expected.length - seriesDuplicates);
    const accessibleCases = groups.flatMap(value => value.variants);
    expect(accessibleCases.map(value => value.id).sort()).toEqual(expected.map(value => value.id).sort());
    expect(accessibleCases.every(value => value.kind === "case")).toBe(true);
    expect(accessibleCases.every(value => value.sourceRank === expectedSourceRanks.get(value.id))).toBe(true);
    for (const series of inspirationSeries) expect(groups.find(value => value.variants.some(entry => entry.id === series[0]))?.variants).toHaveLength(series.length);
});
