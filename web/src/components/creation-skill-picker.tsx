import { useEffect, useState } from "react";
import { Popover, Spin } from "antd";
import { BookOpen, ChevronDown, Search, Sparkles } from "lucide-react";
import { Link } from "react-router";
import { listSkills, type Skill, type SkillScope } from "@/services/api/skills";
import { useInterfaceTranslation } from "@/stores/use-interface-locale-store";
import "./creation-skill-picker.css";

export function CreationSkillPicker({ disabled, onSelect, open: controlledOpen, onOpenChange, onRequireLogin, className = "creation-chat-control" }: { disabled: boolean; onSelect: (skill: Skill) => Promise<void>; open?: boolean; onOpenChange?: (open: boolean) => void; onRequireLogin?: () => void; className?: string }) {
    const { t } = useInterfaceTranslation();
    const [internalOpen, setInternalOpen] = useState(false);
    const open = controlledOpen ?? internalOpen;
    const changeOpen = (value: boolean) => { setInternalOpen(value); onOpenChange?.(value); };
    const [scope, setScope] = useState<SkillScope>("public");
    const [search, setSearch] = useState("");
    const [items, setItems] = useState<Skill[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const [revision, setRevision] = useState(0);
    const [selecting, setSelecting] = useState("");
    const [page, setPage] = useState(1);
    const [hasMore, setHasMore] = useState(false);
    useEffect(() => {
        if (!open) return;
        let cancelled = false;
        setLoading(true);
        const timer = window.setTimeout(() => {
            void listSkills({ scope, search, page, pageSize: 24 }).then(result => {
                if (cancelled) return;
                setItems(result.skills);
                setHasMore(result.hasMore);
                setError("");
            }).catch(reason => {
                if (!cancelled) setError(reason instanceof Error ? reason.message : t("skillsUi.skillsTemporarilyUnavailable"));
            }).finally(() => { if (!cancelled) setLoading(false); });
        }, search ? 200 : 0);
        return () => { cancelled = true; window.clearTimeout(timer); };
    }, [open, scope, search, page, revision, t]);
    const choose = async (skill: Skill) => {
        if (selecting) return;
        setSelecting(skill.skillId);
        try { await onSelect(skill); changeOpen(false); }
        catch (reason) { setError(reason instanceof Error ? reason.message : t("skillsUi.fullSkillLoadFailed")); }
        finally { setSelecting(""); }
    };
    return <Popover open={open} onOpenChange={value => { if (disabled) return; if (value && onRequireLogin) { onRequireLogin(); return; } changeOpen(value); }} trigger="click" placement="bottom" align={{ offset: [0, 0] }} arrow={false} classNames={{ root: "creation-control-popover", container: "creation-control-popover-surface" }} content={<div className="creation-skill-menu">
        <header><strong>{t("skillsUi.chooseSkill")}</strong><Link to="/skills" onClick={() => changeOpen(false)}>{t("skillsUi.scopeMarketplace")}<BookOpen size={13} /></Link></header>
        <label className="creation-skill-search"><Search size={14} /><input value={search} onChange={event => { setSearch(event.target.value); setPage(1); }} placeholder={t("skillsUi.searchProfessionalSkills")} aria-label={t("skillsUi.searchCreativeSkillsAria")} /></label>
        <nav aria-label={t("skillsUi.scopeAria")}>{([{ value: "public", labelKey: "skillsUi.scopeAll" }, { value: "mine", labelKey: "skillsUi.scopeMine" }, { value: "favorites", labelKey: "skillsUi.scopeFavorites" }, { value: "created", labelKey: "skillsUi.scopeCreated" }] as const).map(item => <button key={item.value} type="button" aria-pressed={scope === item.value} onClick={() => { setScope(item.value); setPage(1); }}>{t(item.labelKey)}</button>)}</nav>
        <div className="creation-skill-results" aria-busy={loading}>{loading ? <Spin size="small" /> : error ? <div role="alert"><p>{error}</p><button type="button" onClick={() => setRevision(value => value + 1)}>{t("skillsUi.reload")}</button></div> : items.length ? items.map(skill => <button type="button" key={skill.skillId} disabled={Boolean(selecting)} onClick={() => void choose(skill)}><span className="creation-skill-thumb">{skill.showcaseMedia[0]?.showcaseUrl ? <img src={skill.showcaseMedia[0].showcaseUrl} alt="" /> : <Sparkles size={18} />}</span><span><strong>{skill.skillName}</strong><small>{skill.description}</small></span>{selecting === skill.skillId && <Spin size="small" />}</button>) : <p>{t("skillsUi.noMatchingSkills")}</p>}</div>
        {!loading && !error && (page > 1 || hasMore) && <footer><button type="button" disabled={page === 1} onClick={() => setPage(value => value - 1)}>{t("skillsUi.previousPage")}</button><span>{page}</span><button type="button" disabled={!hasMore} onClick={() => setPage(value => value + 1)}>{t("skillsUi.nextPage")}</button></footer>}
    </div>}><button type="button" className={className} disabled={disabled} aria-label={t("skillsUi.chooseSkillAria")} aria-expanded={open}><Sparkles className="size-4" /><span>Skills</span><ChevronDown className="size-3" /></button></Popover>;
}
