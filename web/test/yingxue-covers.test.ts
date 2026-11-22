import { expect, test } from "bun:test";
import { withYingxueCover, yingxueCover } from "../src/lib/yingxue-covers";
import overrides from "../src/lib/yingxue-cover-overrides.json";
import support from "../src/lib/production-case-support.json";
import { isCaseWithdrawn } from "../src/lib/case-publication-policy";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

test("新封面具备独立版本路径，覆盖远程与本地显示字段但不篡改原片", () => {
    const coveredIds = new Set(Object.keys(overrides));
    const supportedIds = new Set(support.map(item => item.id));
    for (const id of coveredIds) expect(supportedIds.has(id)).toBe(true);
    // Engineering support alone does not approve an unreviewed public cover.
    for (const { id } of support) {
        if (!coveredIds.has(id)) expect(isCaseWithdrawn(id)).toBe(true);
    }
    expect(Object.keys(overrides).length).toBe(355);
    for (const [id, cover] of Object.entries(overrides)) {
        expect(existsSync(resolve(import.meta.dir, "../public" + cover))).toBe(true);
        const source = { id, cover: "source.webp", localCover: "old.webp", localMedia: "original.mp4" };
        const result = withYingxueCover(source);
        expect(result.cover).toBe(cover);
        expect(result.localCover).toBe(cover);
        expect(result.localMedia).toBe(source.localMedia);
        expect(source.cover).toBe("source.webp");
        expect(yingxueCover(id, "old")).toBe(cover);
    }
});
test("未审核的条目不借用其他作品封面", () => {
    const item = { id: "unreviewed", cover: "original" };
    expect(withYingxueCover(item)).toBe(item);
    expect(yingxueCover(item.id, "original")).toBe("original");
});
