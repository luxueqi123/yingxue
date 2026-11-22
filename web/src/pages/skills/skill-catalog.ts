import { currentLocale, translate } from "@/i18n";
import type { Skill, SkillCategory } from "@/services/api/skills";
import type { InterfaceLocale, InterfaceTranslate } from "@/lib/interface-locale";

export const fallbackSkillCategories: SkillCategory[] = [
    { value: "drama", get label() { return translate("library.skills.category.drama"); } },
    { value: "ecommerce", get label() { return translate("library.skills.category.ecommerce"); } },
    { value: "creative", get label() { return translate("library.skills.category.creative"); } },
    { value: "social", get label() { return translate("library.skills.category.social"); } },
    { value: "others", get label() { return translate("library.skills.category.others"); } },
];

const categoryMessageKeys: Record<string, "skillsUi.categoryDrama" | "skillsUi.categoryEcommerce" | "skillsUi.categoryCreative" | "skillsUi.categorySocial" | "skillsUi.categoryOther"> = {
    drama: "skillsUi.categoryDrama",
    ecommerce: "skillsUi.categoryEcommerce",
    creative: "skillsUi.categoryCreative",
    social: "skillsUi.categorySocial",
    others: "skillsUi.categoryOther",
};

export function skillCategoryLabel(value: string, categories: SkillCategory[], t: InterfaceTranslate) {
    const messageKey = categoryMessageKeys[value];
    return messageKey ? t(messageKey) : categories.find((item) => item.value === value)?.label || t("skillsUi.categoryOther");
}

export function groupSkills(skills: Skill[], categories: SkillCategory[], t: InterfaceTranslate) {
    const ordered = categories.length ? categories : fallbackSkillCategories;
    return ordered
        .map((category) => ({ ...category, label: skillCategoryLabel(category.value, ordered, t), skills: skills.filter((skill) => skill.tag === category.value) }))
        .filter((group) => group.skills.length > 0);
}

export function formatSkillCount(value: number, locale: InterfaceLocale = currentLocale()) {
    return new Intl.NumberFormat(locale, { notation: "compact", maximumFractionDigits: 1 }).format(value);
}

export const skillAccentNames = ["blue", "orange", "pink", "green", "violet", "cyan"] as const;
export type SkillAccent = (typeof skillAccentNames)[number];
const fixedSkillAccents: Record<string, SkillAccent> = { drama: "blue", ecommerce: "orange", creative: "pink", social: "green", others: "violet" };

export function skillAccent(category: string | undefined) {
    const key = (category || "").trim();
    if (fixedSkillAccents[key]) return fixedSkillAccents[key];
    let hash = 0;
    for (const char of key) hash = (hash * 31 + (char.codePointAt(0) || 0)) >>> 0;
    return skillAccentNames[hash % skillAccentNames.length];
}

/** 技能卡字形：取名称首个字素（兼容中文与组合 emoji），拉丁字母转大写；空名称回退「技」。 */
export function skillGlyph(name: string | undefined) {
    const value = (name || "").trim();
    const first = typeof Intl !== "undefined" && "Segmenter" in Intl
        ? new Intl.Segmenter(currentLocale(), { granularity: "grapheme" }).segment(value)[Symbol.iterator]().next().value?.segment
        : Array.from(value)[0];
    return first ? first.toLocaleUpperCase("en-US") : translate("library.skills.glyphFallback");
}

export function formatSkillDate(value: string) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return translate("library.skills.unknownTime");
    return new Intl.DateTimeFormat(currentLocale(), { year: "numeric", month: "short", day: "numeric" }).format(date);
}
