import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Popover, Spin } from "antd";
import { BookOpen, ChevronDown, Search, Sparkles } from "lucide-react";
import { Link } from "react-router";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { listSkillPickerPage, skillPickerQueryKey, type Skill, type SkillScope } from "@/services/api/skills";
import { useInterfaceTranslation } from "@/stores/use-interface-locale-store";
import { useUserStore } from "@/stores/use-user-store";
import "./creation-skill-picker.css";

export function CreationSkillPicker({ disabled, onSelect, open: controlledOpen, onOpenChange, onRequireLogin, className = "creation-chat-control" }: { disabled: boolean; onSelect: (skill: Skill) => Promise<void>; open?: boolean; onOpenChange?: (open: boolean) => void; onRequireLogin?: () => void; className?: string }) {
    const { t } = useInterfaceTranslation();
    const [internalOpen, setInternalOpen] = useState(false);
    const open = controlledOpen ?? internalOpen;
    const changeOpen = (value: boolean) => { setInternalOpen(value); onOpenChange?.(value); };
    const [scope, setScope] = useState<SkillScope>("public");
    const [search, setSearch] = useState("");
    const [selecting, setSelecting] = useState("");
    const [selectionError, setSelectionError] = useState("");
    const [page, setPage] = useState(1);
    const userId = useUserStore(state => state.user?.id);
    const client = useQueryClient();
    const keyword = useDebouncedValue(search.trim(), 200);
    const typing = keyword !== search.trim();
    const options = {
        queryKey: [...skillPickerQueryKey, userId, scope, keyword, page],
        queryFn: ({ signal }: { signal: AbortSignal }) => listSkillPickerPage({ scope, search: keyword, page }, signal),
        staleTime: 60_000,
    };
    const list = useQuery({ ...options, enabled: open && !typing });
    const items = list.data?.skills ?? [];
    const loading = typing || list.isPending;
    const hasMore = list.data?.hasMore ?? false;
    const warmList = () => {
        if (userId && !disabled && !open && !typing) void client.prefetchQuery(options);
    };
    const choose = async (skill: Skill) => {
        if (selecting) return;
        setSelectionError("");
        setSelecting(skill.skillId);
        try { await onSelect(skill); changeOpen(false); }
        catch (reason) { setSelectionError(reason instanceof Error ? reason.message : t("skillsUi.fullSkillLoadFailed")); }
        finally { setSelecting(""); }
    };
    return <Popover open={open} onOpenChange={value => { if (disabled) return; if (value && onRequireLogin) { onRequireLogin(); return; } changeOpen(value); }} trigger="click" placement="bottom" align={{ offset: [0, 0] }} arrow={false} destroyOnHidden classNames={{ root: "creation-control-popover", container: "creation-control-popover-surface" }} content={<div className="creation-skill-menu">
        <header><strong>{t("skillsUi.chooseSkill")}</strong><Link to="/skills" onClick={() => changeOpen(false)}>{t("skillsUi.scopeMarketplace")}<BookOpen size={13} /></Link></header>
        <label className="creation-skill-search"><Search size={14} /><input value={search} onChange={event => { setSearch(event.target.value); setPage(1); }} placeholder={t("skillsUi.searchProfessionalSkills")} aria-label={t("skillsUi.searchCreativeSkillsAria")} /></label>
        <nav aria-label={t("skillsUi.scopeAria")}>{([{ value: "public", labelKey: "skillsUi.scopeAll" }, { value: "mine", labelKey: "skillsUi.scopeMine" }, { value: "favorites", labelKey: "skillsUi.scopeFavorites" }, { value: "created", labelKey: "skillsUi.scopeCreated" }] as const).map(item => <button key={item.value} type="button" aria-pressed={scope === item.value} onClick={() => { setScope(item.value); setPage(1); }}>{t(item.labelKey)}</button>)}</nav>
        {selectionError && <p role="alert">{selectionError}</p>}
        <div className="creation-skill-results" aria-busy={loading}>
            {loading ? <Spin size="small" /> : list.isError && !list.data ? (
                <div role="alert"><p>{list.error.message}</p><button type="button" onClick={() => void list.refetch()}>{t("skillsUi.reload")}</button></div>
            ) : items.length ? items.map(skill => {
                const cover = skill.showcaseMedia.find(media => media.type === "image")?.showcaseUrl;
                return <button type="button" key={skill.skillId} disabled={Boolean(selecting)} onClick={() => void choose(skill)}>
                    <span className="creation-skill-thumb">{cover ? <img src={cover} alt="" loading="lazy" decoding="async" /> : <Sparkles size={18} />}</span>
                    <span><strong>{skill.skillName}</strong><small>{skill.description}</small></span>
                    {selecting === skill.skillId && <Spin size="small" />}
                </button>;
            }) : <p>{t("skillsUi.noMatchingSkills")}</p>}
        </div>
        {!loading && list.data && (page > 1 || hasMore) && <footer><button type="button" disabled={page === 1} onClick={() => setPage(value => value - 1)}>{t("skillsUi.previousPage")}</button><span>{page}</span><button type="button" disabled={!hasMore} onClick={() => setPage(value => value + 1)}>{t("skillsUi.nextPage")}</button></footer>}
    </div>}><button type="button" className={className} disabled={disabled} aria-label={t("skillsUi.chooseSkillAria")} aria-expanded={open} onPointerEnter={warmList} onFocus={warmList}><Sparkles className="size-4" /><span>Skills</span><ChevronDown className="size-3" /></button></Popover>;
}
