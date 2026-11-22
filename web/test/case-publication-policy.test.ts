import { expect, test } from "bun:test";
import { hasWithdrawnCaseBrand, isCasePublic, isCaseWithdrawn } from "../src/lib/case-publication-policy";
import { curateInspirationCases } from "../src/lib/inspiration-curation";
import { entryShowcaseWorks, showcaseBatch } from "../src/lib/entry-showcase";
import { productionProjectEntry } from "../src/lib/production-project-registry";
import { loadProductionCaseProject } from "../src/services/production-case-project";
import policy from "../src/lib/case-publication-policy.json";
import type { ProductionItem } from "../src/services/production-library";

test("recognizes the visible brand variants without treating provenance as a watermark", () => {
    for (const title of ["LTV作品", "LibTV 概念广告", "Lib TV概念广告", "ＬｉｂＴＶ宣传", "l-tv"]) expect(hasWithdrawnCaseBrand(title)).toBe(true);
    expect(hasWithdrawnCaseBrand("淮水谣")).toBe(false);
    expect(isCasePublic({ id: "case-clean", name: "东方奇幻", kind: "case", ...{ source: "LibTV" } })).toBe(true);
});

test("rank 79 can enter the local library after its existing clean cover was reviewed", () => {
    const id = "case-83b01cd189ac434db70d2613c0c42693";
    expect(isCaseWithdrawn(id)).toBe(false);
    expect(isCasePublic({ id, name: "原生4K短片《没人知道》", kind: "case" })).toBe(true);
    expect(isCasePublic({ id, name: "LibTV推广", kind: "case" })).toBe(false);
});

test("rank 165 resolves only its title hold while branded titles remain rejected", () => {
    const id = "case-89d84659abc04965bb1872a1d966400d";
    expect(isCaseWithdrawn(id)).toBe(false);
    expect(isCasePublic({ id, name: "【seedance2】霓虹 · 次元", kind: "case" })).toBe(true);
    expect(isCasePublic({ id, name: "【LibTV x seedance2】霓虹 · 次元", kind: "case" })).toBe(false);
    expect(isCaseWithdrawn("case-b462577e8a5c49c2a0ccc09bc5e16d16")).toBe(true);
});

test("a renamed cover cannot republish a withdrawn video in either gallery or homepage", () => {
    const id = "case-19a5252f8c8044a682b220a4c359ac19";
    expect(isCaseWithdrawn(id.slice(5))).toBe(true);
    expect(isCasePublic({ id, name: "全新标题" })).toBe(false);
    const groups = curateInspirationCases([{ id, kind: "case", name: "全新标题", cover: "/brand-new.webp", media: "/same-original.mp4" } as ProductionItem]);
    expect(groups).toHaveLength(0);
    expect(entryShowcaseWorks.every(work => !isCaseWithdrawn(work.id))).toBe(true);
    for (let i = -1; i < 10; i++) expect(showcaseBatch(i).every(work => !isCaseWithdrawn(work.id))).toBe(true);
});

test("withdrawn catalog entries cannot be opened or copied through a stale card", async () => {
    for (const { id } of policy.withdrawn) {
        expect(productionProjectEntry(id)).toBeUndefined();
        await expect(loadProductionCaseProject(id, { mode: "preview" })).rejects.toThrow("该案例已从作品库下架");
        await expect(loadProductionCaseProject(id, { mode: "copy" })).rejects.toThrow("该案例已从作品库下架");
    }
});
