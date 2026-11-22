import type { InterfaceMessageKey } from "@/lib/interface-locale";
import type { ToolScope } from "@/services/api/tools";
// 各子 Tab 的独立标签集，与 backend internal/tools/seed/tools.json 的 tags 对齐
export const SUB_TAB_TAGS: Record<"style" | "motion", Array<{ id: string; label: InterfaceMessageKey }>> = {
    style: [
        { id: "period", label: "toolTagsUi.period" },
        { id: "city", label: "toolTagsUi.city" },
        { id: "decade", label: "toolTagsUi.decade" },
        { id: "life", label: "toolTagsUi.life" },
        { id: "science_fiction", label: "toolTagsUi.scienceFiction" },
        { id: "type", label: "previewType" },
        { id: "poetic", label: "toolTagsUi.poetic" },
        { id: "animation", label: "toolTagsUi.animation" },
        { id: "drawing", label: "toolTagsUi.drawing" },
        { id: "myth", label: "toolTagsUi.myth" },
    ],
    motion: [
        { id: "basic", label: "toolTagsUi.basic" },
        { id: "follow", label: "toolTagsUi.follow" },
        { id: "reveal", label: "toolTagsUi.reveal" },
        { id: "emotion", label: "toolTagsUi.emotion" },
        { id: "aerial", label: "toolTagsUi.aerial" },
    ],
};

type FeedTab = ToolScope;

export const FEED_TABS: Array<{ id: FeedTab; label: InterfaceMessageKey }> = [
    { id: "public", label: "toolTagsUi.public" },
    { id: "favorites", label: "skillsUi.favorite" },
    { id: "custom", label: "createUiCustom" },
];

export function toAbsoluteUrl(value?: string) {
    const text = (value || "").trim();
    if (/^https?:\/\//i.test(text)) return text;
    if (text.startsWith("/") && !text.startsWith("//")) return new URL(text, window.location.origin).href;
    return "";
}
