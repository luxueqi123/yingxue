import { useMemo, useState } from "react";
import { Check, Flame, Search, X } from "lucide-react";

import { DRAMA_STYLE_CATEGORIES, DRAMA_STYLES, filterDramaStyles, styleCoverBackground, type DramaStyleCategory } from "@/lib/drama/drama-styles";
import { useInterfaceTranslation } from "@/stores/use-interface-locale-store";

type CategoryKey = "all" | "hot" | DramaStyleCategory;
const CATEGORY_LABEL_KEYS = {
    all: "drama.stylePicker.categoryAll",
    hot: "drama.stylePicker.categoryHot",
    live: "drama.stylePicker.categoryLive",
    "3d": "drama.stylePicker.category3d",
    "2d": "drama.stylePicker.category2d",
    art: "drama.stylePicker.categoryArt",
} as const satisfies Record<CategoryKey, string>;

/** 短剧风格库：分类 + 搜索 + 封面卡片；选中项在标题栏回显，避免滚动后找不到当前选择。 */
export function DramaStylePicker({ value, onChange }: { value: string; onChange: (id: string) => void }) {
    const { t } = useInterfaceTranslation();
    const [category, setCategory] = useState<CategoryKey>("hot");
    const [query, setQuery] = useState("");
    const styles = useMemo(() => filterDramaStyles(query ? "all" : category, query), [category, query]);
    const selected = DRAMA_STYLES.find((style) => style.id === value);
    const counts = useMemo(() => Object.fromEntries(DRAMA_STYLE_CATEGORIES.map((item) => [item.key, filterDramaStyles(item.key, "").length])), []);
    return (
        <section className="drama-styles">
            <div className="drama-styles-head">
                <div className="min-w-0">
                    <h2>{t("drama.stylePicker.title")}</h2>
                    <p>
                        {selected ? (
                            <>
                                {t("drama.stylePicker.selectedPrefix")} <b>{selected.name}</b> · {selected.description}
                            </>
                        ) : (
                            t("drama.stylePicker.description")
                        )}
                    </p>
                </div>
                <label className="drama-search drama-styles-search">
                    <Search className="size-3.5 shrink-0 opacity-40" />
                    <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t("drama.stylePicker.searchPlaceholder")} aria-label={t("drama.stylePicker.searchAria")} />
                    {query ? (
                        <button type="button" onClick={() => setQuery("")} aria-label={t("drama.stylePicker.clearSearchAria")}>
                            <X className="size-3.5 opacity-40" />
                        </button>
                    ) : null}
                </label>
            </div>
            <div className="drama-styles-tabs" role="tablist" aria-label={t("drama.stylePicker.categoriesAria")}>
                {DRAMA_STYLE_CATEGORIES.map((item) => (
                    <button
                        key={item.key}
                        type="button"
                        role="tab"
                        aria-selected={!query && category === item.key}
                        className="drama-styles-tab"
                        onClick={() => {
                            setQuery("");
                            setCategory(item.key);
                        }}
                    >
                        {item.key === "hot" ? <Flame className="size-3.5" /> : null}
                        {t(CATEGORY_LABEL_KEYS[item.key])}
                        <span>{counts[item.key]}</span>
                    </button>
                ))}
            </div>
            <div className="drama-style-grid thin-scrollbar" role="radiogroup" aria-label={t("drama.stylePicker.choicesAria")}>
                {styles.map((style) => {
                    const active = style.id === value;
                    return (
                        <button key={style.id} type="button" role="radio" aria-checked={active} className="drama-style" onClick={() => onChange(style.id)} title={style.description}>
                            <span className="drama-style-swatch" style={{ background: styleCoverBackground(style) }}>
                                {!style.cover ? (
                                    <span className="drama-style-glyph" aria-hidden>
                                        {style.name.replace(/^3D\s*/, "").slice(0, 2)}
                                    </span>
                                ) : null}
                                {style.hot ? (
                                    <span className="drama-style-hot" title={t("drama.stylePicker.hotBadge")}>
                                        <Flame className="size-2.5" />
                                    </span>
                                ) : null}
                                {active ? (
                                    <span className="drama-style-check">
                                        <Check className="size-3" />
                                    </span>
                                ) : null}
                                <span className="drama-style-overlay">
                                    <span className="drama-style-name">{style.name}</span>
                                    <span className="drama-style-tags">{style.tags.join(" · ")}</span>
                                </span>
                            </span>
                        </button>
                    );
                })}
                {!styles.length ? <div className="col-span-full py-10 text-center text-[var(--fs-label)] text-foreground/45">{t("drama.stylePicker.noResults", { query })}</div> : null}
            </div>
        </section>
    );
}
