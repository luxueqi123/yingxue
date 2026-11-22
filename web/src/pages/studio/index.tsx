import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { App, Button, Drawer } from "antd";
import { ArrowRight, ArrowUpRight, AudioLines, BookOpen, Bot, Check, ChevronLeft, ChevronRight, Clapperboard, Layers3, Search, Sparkles } from "lucide-react";
import { Link, useSearchParams } from "react-router";
import { useProductionLaunch } from "@/hooks/use-production-launch";
import { useInterfaceTranslation } from "@/stores/use-interface-locale-store";
import { InspirationGallery } from "@/components/production/inspiration-gallery";
import { productionWorkflows } from "@/lib/production-workflows";
import { getSkill } from "@/services/api/skills";
import { loadProductionCatalog, productionCategories, type ProductionCatalog, type ProductionItem } from "@/services/production-library";
import { ResourceCard } from "./resource-card";
import "./studio.css";

const tabs = [{ value: "workflows", icon: Layers3 }, { value: "skills", icon: Sparkles }, { value: "agents", icon: Bot }, { value: "cases", icon: Clapperboard }, { value: "voices", icon: AudioLines }] as const;
const kindForTab: Record<string, ProductionItem["kind"]> = { skills: "skill", agents: "agent", cases: "case", voices: "voice" };
const studioHeadings = {
    workflows: { kicker: "studioUi.kickerWorkflows", title: "studioUi.headingWorkflows" },
    skills: { kicker: "studioUi.kickerSkills", title: "studioUi.headingSkills" },
    agents: { kicker: "studioUi.kickerAgents", title: "studioUi.headingAgents" },
    cases: { kicker: "studioUi.kickerCases", title: "studioUi.headingCases" },
    voices: { kicker: "studioUi.kickerVoices", title: "studioUi.headingVoices" },
} as const;
const studioCategoryKeys = {
    all: "galleryAll",
    drama: "galleryDrama",
    ecommerce: "galleryCommercial",
    creative: "galleryCreative",
    social: "gallerySocial",
    others: "galleryOther",
} as const;

function catalogMediaWarning(catalog?: ProductionCatalog) {
    return (catalog as (ProductionCatalog & { mediaWarning?: string }) | undefined)?.mediaWarning;
}

export default function StudioPage() {
    const { t } = useInterfaceTranslation();
    const [params, setParams] = useSearchParams();
    const tab = tabs.find(item => item.value === params.get("tab"))?.value ?? "workflows";
    const [search, setSearch] = useState("");
    const [category, setCategory] = useState("all");
    const [reference, setReference] = useState(false);
    const [page, setPage] = useState(1);
    const [active, setActive] = useState<ProductionItem | null>(null);
    const [brief, setBrief] = useState("");
    const [file, setFile] = useState("");
    const { message } = App.useApp();
    const actions = useProductionLaunch();
    const query = useQuery({ queryKey: ["production-library"], queryFn: ({ signal }) => loadProductionCatalog(false, signal), staleTime: Infinity });
    const detail = useQuery({ queryKey: ["production-skill", active?.id], queryFn: () => getSkill(active!.id), enabled: Boolean(active?.available), staleTime: 60_000 });
    const items = query.data?.items || [];
    const heading = studioHeadings[tab];
    const tabLabels: Record<string, string> = {
        workflows: t("studioUi.tabWorkflows"),
        skills: t("professionalSkills"),
        agents: t("agents"),
        cases: t("galleryTitle"),
        voices: t("voices"),
    };
    const categories = productionCategories.map(item => {
        const key = studioCategoryKeys[item.value as keyof typeof studioCategoryKeys];
        return key ? { ...item, label: t(key) } : item;
    });
    const availableWorkflows = productionWorkflows.filter(workflow => !workflow.skill || items.some(item => item.name === workflow.skill && item.available));
    const selectedWorkflow = availableWorkflows.find(item => item.id === params.get("workflow"));
    useEffect(() => {
        const resourceId = params.get("resource");
        if (!resourceId || !query.data) return;
        const item = query.data.items.find(item => item.id === resourceId);
        if (item && item.kind !== "case" && item.kind !== "template") { setActive(item); setBrief(""); setFile(""); }
    }, [params, query.data]);
    useEffect(() => { setPage(1); }, [search, category, tab, reference]);
    useEffect(() => { setBrief(""); }, [params.get("workflow")]);
    const filtered = useMemo(() => items.filter(item => item.kind === kindForTab[tab] && (category === "all" || item.category === category) && (tab !== "skills" || reference || item.available) && `${item.name} ${item.description} ${item.author}`.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase())).sort((a, b) => Number(b.available) - Number(a.available)), [items, tab, category, reference, search]);
    const count = Math.max(1, Math.ceil(filtered.length / 24));
    const changeTab = (value: string) => { setParams({ tab: value }); setCategory("all"); setSearch(""); setPage(1); setActive(null); };
    const open = (item: ProductionItem) => { setActive(item); setBrief(""); setFile(""); };
    const copy = async (text: string) => { try { await navigator.clipboard.writeText(text); message.success(t("studioUi.copySuccess")); } catch { message.error(t("studioUi.copyFailed")); } };

    return <main className="production-page studio-scroll"><div className="studio-container">
        <header className="studio-page-heading"><div><span className="studio-kicker">{t(heading.kicker)}</span><h1>{t(heading.title)}</h1></div><Link className="studio-subtle-link" to="/prompts"><BookOpen size={16} />{t("prompts")}<ArrowUpRight size={15} /></Link></header>
        <nav className="studio-tabs" aria-label={t("studioUi.resourcesCategory")}>{tabs.filter(item => ["workflows", "skills", "cases"].includes(item.value) || items.some(resource => resource.kind === kindForTab[item.value])).map(item => <button type="button" key={item.value} aria-pressed={tab === item.value} onClick={() => changeTab(item.value)}><item.icon size={16} />{tabLabels[item.value]}</button>)}</nav>
        {tab === "cases" ? <InspirationGallery items={items} loading={query.isPending} error={query.error instanceof Error ? query.error : null} onRetry={() => void query.refetch()} mediaWarning={catalogMediaWarning(query.data)} onUseCase={actions.caseProject} /> : query.isPending ? <div className="studio-state" role="status">{t("studioUi.loadingResources")}</div> : query.isError ? <div className="studio-state" role="alert"><p>{query.error.message}</p><Button onClick={() => void query.refetch()}>{t("stateReload")}</Button></div> : tab === "workflows" ? <>
            <div className="studio-workflow-intro"><p>{t("studioUi.workflowStart")}</p><span>{t("studioUi.workflowSteps")}</span></div>
            <div className="studio-workflows">{availableWorkflows.map(workflow => <button type="button" key={workflow.id} className="studio-workflow-card" onClick={() => setParams({ tab, workflow: workflow.id })}><img src={workflow.image} alt="" /><span><strong>{workflow.title}</strong><small>{workflow.description}</small></span><ArrowUpRight size={22} /></button>)}</div>
            <div className="studio-library-links"><Link to="/skills"><Sparkles />{t("studioUi.skillsAndFavorites")}<ArrowRight size={16} /></Link><Link to="/assets"><Layers3 />{t("studioUi.myAssetLibrary")}<ArrowRight size={16} /></Link><Link to="/prompts"><BookOpen />{t("studioUi.promptAndHistory")}<ArrowRight size={16} /></Link></div>
            <div className="studio-workflow-intro"><p>{t("studioUi.copyableTemplates")}</p><span>{t("studioUi.templateWorkflowHint")}</span></div>
            <InspirationGallery itemKind="template" items={items} loading={false} error={null} onRetry={() => void query.refetch()} onUseCase={actions.caseProject} />
        </> : <>
            <div className="studio-library-toolbar"><div className="studio-filter-chips" aria-label={t("studioUi.domainFilters")}>{categories.map(item => <button key={item.value} type="button" aria-pressed={category === item.value} onClick={() => setCategory(item.value)}>{item.label}</button>)}</div><label className="studio-search"><Search size={16} /><input value={search} onChange={event => setSearch(event.target.value)} placeholder={t("studioUi.searchPlaceholder")} aria-label={t("studioUi.searchLabel")} /></label></div>
            <div className="studio-results-meta"><span>{t("studioUi.resultsCount", { count: filtered.length, unit: t(tab === "skills" ? "studioUi.unitSkills" : tab === "voices" ? "studioUi.unitVoices" : "studioUi.unitResources") })}</span>{tab === "voices" && <span>{t("studioUi.voiceHint")}</span>}</div>
            {filtered.length ? <div className="studio-resource-grid">{filtered.slice((page - 1) * 24, page * 24).map(item => <ResourceCard key={item.id} item={item} onOpen={() => open(item)} />)}</div> : <div className="studio-state">{t("studioUi.noMatch")}</div>}
            {count > 1 && <nav className="studio-pagination" aria-label={t("studioUi.pagination")}><button type="button" disabled={page === 1} aria-label={t("galleryPrevious")} onClick={() => setPage(value => value - 1)}><ChevronLeft size={18} /></button><span>{page} / {count}</span><button type="button" disabled={page >= count} aria-label={t("galleryNext")} onClick={() => setPage(value => value + 1)}><ChevronRight size={18} /></button></nav>}
        </>}
    </div>
    <Drawer className="studio-drawer" open={Boolean(active)} onClose={() => setActive(null)} size={760} destroyOnHidden title={active?.name}>
        {active && <div className="studio-detail">
            <p>{active.description}</p>
            {active.media && (active.kind === "voice" ? <audio controls preload="none" src={active.media} /> : <video controls preload="none" playsInline poster={active.cover} src={active.media} />)}
            <div className="studio-detail-meta"><span>{active.source} · {active.author}</span>{active.version && <span>{t("studioUi.version", { version: active.version })}</span>}{Boolean(active.fileCount) && <span>{t("studioUi.filesCount", { count: active.fileCount! })}</span>}</div>
            {active.available ? <>
                {active.input && <p><strong>{t("studioUi.input")}</strong>　{active.input}</p>}{active.output && <p><strong>{t("studioUi.output")}</strong>　{active.output}</p>}
                <label className="studio-brief-label" htmlFor="resource-brief">{t("studioUi.briefLabel")}</label><textarea id="resource-brief" className="studio-brief" value={brief} onChange={event => setBrief(event.target.value)} placeholder={t("studioUi.briefPlaceholder")} maxLength={5000} />
                <div className="studio-detail-actions"><Button type="primary" loading={actions.busy} disabled={!detail.data || detail.isError} onClick={() => void actions.agent(active, brief)}>{t("studioUi.addToCanvas")}<ArrowUpRight size={15} /></Button><Button disabled={!detail.data || actions.busy} onClick={() => void actions.create(brief || "请按照所选技能开始策划，并先列出当前阶段需要的输入。", "text", active)}>{t("studioUi.useInConversation")}</Button></div>
                {detail.isPending ? <p role="status">{t("studioUi.loadingSkill")}</p> : detail.isError ? <div role="alert"><p>{t("studioUi.skillLoadFailed")}</p><Button onClick={() => void detail.refetch()}>{t("authRetry")}</Button></div> : detail.data && <details className="studio-source"><summary>{t("studioUi.viewSkillFiles")}</summary>{Boolean(detail.data.skill.files?.length) && <label>{t("studioUi.filesLabel")}<select value={file} onChange={event => setFile(event.target.value)}><option value="">{t("studioUi.skillBody")}</option>{detail.data.skill.files!.map(item => <option key={item.path} value={item.path}>{item.path}</option>)}</select></label>}<pre>{file ? detail.data.skill.files?.find(item => item.path === file)?.content : detail.data.skill.instruction}</pre></details>}
            </> : active.kind === "case" ? <><p>{t("studioUi.caseLocalNotice")}</p><Button type="primary" onClick={() => void actions.create(`请根据下面的创意参考策划一份新的作品方案：\n${active.name}\n${active.description}`)}>{t("studioUi.createFromInspiration")}</Button><Button onClick={() => void copy(active.description)}>{t("studioUi.copyProductionNotes")}</Button></> : active.kind === "voice" ? <><p>{t("studioUi.voiceSource", { voiceId: active.voiceId || "", modelFamily: active.modelFamily || "" })}</p><p>{t("studioUi.voiceNotice")}</p><Button type="primary" loading={actions.busy} onClick={() => void actions.workflow(productionWorkflows.find(item => item.id === "voice")!, `声音参考：${active.name}；${active.description}。请在配音节点选择当前模型支持的音色。`, items)}>{t("studioUi.openVoiceStudio")}</Button></> : <><p>{t("studioUi.skillSourceUnavailable")}</p>{active.input && <p>{t("studioUi.input")}：{active.input}</p>}{active.output && <p>{t("studioUi.output")}：{active.output}</p>}<Button onClick={() => { setActive(null); setReference(false); changeTab("skills"); }}>{t("studioUi.viewUsableSkills")}</Button></>}
        </div>}
    </Drawer>
    <Drawer className="studio-drawer" open={Boolean(selectedWorkflow)} onClose={() => setParams({ tab: "workflows" })} size={680} destroyOnHidden title={selectedWorkflow?.title}>
        {selectedWorkflow && <div className="studio-detail"><img className="studio-workflow-cover" src={selectedWorkflow.image} alt="" /><div className="studio-stage-list">{selectedWorkflow.stages.map((stage, index) => <span key={stage.title}><i>{index + 1}</i>{stage.title}{index < selectedWorkflow.stages.length - 1 && <ArrowRight size={15} />}</span>)}</div><label htmlFor="workflow-brief" className="studio-brief-label">{t("studioUi.workflowBrief")}</label><textarea id="workflow-brief" className="studio-brief" value={brief} onChange={event => setBrief(event.target.value)} placeholder={t("studioUi.workflowBriefPlaceholder")} maxLength={5000} /><Button type="primary" loading={actions.busy} disabled={!query.data} onClick={() => void actions.workflow(selectedWorkflow, brief, items)}>{t("studioUi.createCanvas")}<ArrowUpRight size={16} /></Button><p className="studio-detail-note"><Check size={14} />{t("studioUi.canvasPreparationNote")}</p></div>}
    </Drawer>
    </main>;
}
