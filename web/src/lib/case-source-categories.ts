import type { InterfaceMessageKey } from "./interface-locale";

type TaggedCase = { tags?: string[]; communityWork?: { category: string } };

export const caseCategoryMessages = {
    drama: "galleryDrama",
    animation: "galleryAnimation",
    commercial: "galleryCommercial",
    music: "galleryMusic",
    documentary: "galleryDocumentary",
    education: "galleryEducation",
    creative: "galleryVisualCreative",
    other: "galleryCategoryOther",
} as const satisfies Record<string, InterfaceMessageKey>;

export type CaseCategory = keyof typeof caseCategoryMessages;

// Classify purpose before format: an animated product commercial is still an ad.
const contentRules: readonly (readonly [CaseCategory, readonly string[]])[] = [
    ["commercial", ["创意TVC", "产品展示", "功能卖点", "公益广告", "企业宣传", "商业广告", "游戏美宣", "营销促销", "信息流广告"]],
    ["music", ["MV"]],
    ["education", ["教学教程", "儿童教育", "人文科普", "经验分享"]],
    ["documentary", ["vlog", "纪实·访谈", "文旅政媒", "才艺颜值"]],
    ["animation", ["动画短片", "精品漫剧"]],
    ["drama", ["短片剧集", "经典衍生", "剧情演绎"]],
    ["creative", ["风格美学", "概念设计", "PPT演绎", "创意单元", "互动玩法", "meme"]],
];

export function caseCategory(item: TaggedCase): CaseCategory {
    if (item.communityWork && Object.hasOwn(caseCategoryMessages, item.communityWork.category)) return item.communityWork.category as CaseCategory;
    const tags = new Set((item.tags || []).map((tag) => tag.trim()));
    for (const [category, sources] of contentRules) {
        if (sources.some((tag) => tags.has(tag))) return category;
    }
    // Some original entries only carry their animated or live-action format.
    if (tags.has("3D") || tags.has("2D")) return "animation";
    if (tags.has("仿真人")) return "drama";
    return "other";
}

export function caseSourceCategories(items: readonly TaggedCase[]) {
    const present = new Set(items.map(caseCategory));
    return (Object.keys(caseCategoryMessages) as CaseCategory[]).filter((value) => present.has(value)).map((value) => ({ value, messageKey: caseCategoryMessages[value] }));
}
