import { describe, expect, test } from "bun:test";
import { entryShowcaseLanes, entryShowcaseWorks, showcaseBatch, SHOWCASE_INTERVAL_MS } from "../src/lib/entry-showcase";

describe("首页精选轮换", () => {
    test("三列都来自同一份已发布精选名单", () => {
        expect(entryShowcaseLanes).toHaveLength(3);
        expect(entryShowcaseLanes[1].label).toBe("精选影像 2");
        for (const lane of entryShowcaseLanes) {
            expect(lane.workIds.length).toBeGreaterThanOrEqual(2);
            for (const id of lane.workIds) expect(entryShowcaseWorks.some(work => work.id === id)).toBe(true);
        }
    });
    test("每十二秒换一批，支持前后循环且一批没有重复作品", () => {
        expect(SHOWCASE_INTERVAL_MS).toBe(12_000);
        const first = showcaseBatch(0);
        expect(new Set(first.map(work => work.id)).size).toBe(3);
        expect(showcaseBatch(1).every((work, i) => work.id !== first[i].id)).toBe(true);
        const period = entryShowcaseWorks.length;
        const seen = new Set<string>();
        for (let index = 0; index < period; index++) {
            const batch = showcaseBatch(index);
            expect(new Set(batch.map(work => work.id)).size).toBe(entryShowcaseLanes.length);
            batch.forEach(work => seen.add(work.id));
        }
        expect([...seen].sort()).toEqual(entryShowcaseWorks.map(work => work.id).sort());
        expect(showcaseBatch(period).map(work => work.id)).toEqual(first.map(work => work.id));
        expect(showcaseBatch(-1).map(work => work.id)).toEqual(showcaseBatch(period - 1).map(work => work.id));
    });
});
