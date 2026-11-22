import { expect, test } from "bun:test";
import { caseCategory, caseSourceCategories } from "../src/lib/case-source-categories";
import { curateInspirationCases } from "../src/lib/inspiration-curation";
import catalog from "../public/production-library/published-catalog.json";
import type { ProductionItem } from "../src/services/production-library";

test("related commercial labels share one category and input tags stay intact", () => {
    const item = { tags: ["精选画布", "产品展示", "创意TVC", "功能卖点", "3D"] };
    expect(caseCategory(item)).toBe("commercial");
    expect(caseCategory({ tags: [...item.tags].reverse() })).toBe("commercial");
    expect(caseSourceCategories([item, { tags: ["公益广告"] }, { tags: ["企业宣传"] }]).map(value => value.value)).toEqual(["commercial"]);
    expect(item.tags).toEqual(["精选画布", "产品展示", "创意TVC", "功能卖点", "3D"]);
});

test("purpose wins over format without guessing from a title or legacy category", () => {
    expect(caseCategory({ tags: ["MV", "概念设计", "动画短片"] })).toBe("music");
    expect(caseCategory({ tags: ["经典衍生", "动画短片"] })).toBe("animation");
    expect(caseCategory({ tags: ["短片剧集", "公益广告"] })).toBe("commercial");
    expect(caseCategory({ tags: ["教学教程", "vlog"] })).toBe("education");
    expect(caseCategory({ tags: ["风格美学", "3D"] })).toBe("creative");
    expect(caseCategory({ tags: ["3D"] })).toBe("animation");
    expect(caseCategory({ tags: ["仿真人"] })).toBe("drama");
    expect(caseCategory({ tags: ["精选画布", "Seedance 2.5"] })).toBe("other");
    expect(caseCategory({})).toBe("other");
    expect(caseSourceCategories([])).toEqual([]);
});

test("every published gallery card belongs to exactly one populated main category", () => {
    const ids = new Set(catalog.publishedCaseIds);
    const items = catalog.items.filter(item => item.kind === "case" && ids.has(item.id)) as ProductionItem[];
    const groups = curateInspirationCases(items);
    const categories = caseSourceCategories(groups.map(group => group.item));
    expect(items).toHaveLength(200);
    expect(categories.map(category => category.value)).toEqual(["drama", "animation", "commercial", "music", "documentary", "education", "creative"]);
    const assigned = categories.flatMap(category => groups.filter(group => caseCategory(group.item) === category.value).map(group => group.item.id));
    expect(assigned).toHaveLength(groups.length);
    expect(new Set(assigned).size).toBe(groups.length);
    expect(groups.every(group => categories.some(category => category.value === caseCategory(group.item)))).toBe(true);
});
