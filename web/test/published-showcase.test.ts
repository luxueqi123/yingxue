import { expect, test } from "bun:test";
import { entryShowcaseWorks } from "../src/lib/entry-showcase";
import catalog from "../public/production-library/published-catalog.json";

test("the public film browser uses the same 200 admitted local films as the gallery", () => {
    expect(entryShowcaseWorks).toHaveLength(200);
    expect(new Set(entryShowcaseWorks.map(work => `case-${work.id}`))).toEqual(new Set(catalog.publishedCaseIds));
    expect(entryShowcaseWorks.every(work => work.src.startsWith("/production-library/case-media/"))).toBe(true);
    const ranks = new Map(catalog.items.map(item => [item.id, item.sourceRank]));
    const order = entryShowcaseWorks.map(work => ranks.get(`case-${work.id}`));
    expect(order).toEqual([...order].sort((a, b) => a! - b!));
});
