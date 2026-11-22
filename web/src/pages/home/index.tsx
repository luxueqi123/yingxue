import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Modal } from "antd";
import { ArrowUp, ArrowUpRight, BookOpen, Bot, ChevronRight, Layers3, Sparkles } from "lucide-react";
import { Link, useLocation, useNavigate } from "react-router";
import { EntryShowcasePlayer } from "@/components/brand/entry-showcase-player";
import { WorkspaceErrorState } from "@/components/layout/workspace-state";
import { InspirationGallery } from "@/components/production/inspiration-gallery";
import { useProductionLaunch } from "@/hooks/use-production-launch";
import { createClientId } from "@/lib/client-id";
import { loadCreatePage } from "@/lib/workspace-route-modules";
import type { CreationEntrySeed } from "@/pages/create";
import { entryShowcaseWorks } from "@/lib/entry-showcase";
import { loadLtvHomeCatalog, loadProductionCatalog, type LtvHomeItem, type ProductionItem } from "@/services/production-library";
import "./ltv-native-effects.css";
import "./ltv-home.css";
import { HomeHighlights } from "./home-highlights";
import { useInterfaceTranslation } from "@/stores/use-interface-locale-store";
import { useUserStore } from "@/stores/use-user-store";
const CommunitySharedWork = lazy(() => import("@/components/production/community-shared-work"));

const CreationEntry = lazy(loadCreatePage);

type HomeDraft = { prompt: string; mode: "plan" | "image" | "video" };

function stateRecord(value: unknown): Record<string, unknown> {
    return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function readHomeDraft(value: unknown): HomeDraft | undefined {
    const draft = stateRecord(stateRecord(value).homeDraft);
    if (typeof draft.prompt !== "string" || !["plan", "image", "video"].includes(String(draft.mode))) return undefined;
    return { prompt: draft.prompt.slice(0, 5000), mode: draft.mode as HomeDraft["mode"] };
}

export default function IndexPage() {
    const { t } = useInterfaceTranslation();
    const actions = useProductionLaunch();
    const location = useLocation();
    const navigate = useNavigate();
    const composerSection = useRef<HTMLElement>(null);
    const scroll = useRef<HTMLElement>(null);
    const [composerSeed, setComposerSeed] = useState<CreationEntrySeed>();
    const [selected, setSelected] = useState<LtvHomeItem>();
    const [selectedShowcase, setSelectedShowcase] = useState<(typeof entryShowcaseWorks)[number]>();
    const sharedCaseId = new URLSearchParams(location.search).get("case");
    useEffect(() => {
        if (sharedCaseId) setSelectedShowcase(entryShowcaseWorks.find((item) => item.id === sharedCaseId));
    }, [sharedCaseId]);
    useEffect(() => {
        const routeState = stateRecord(location.state);
        const draft = readHomeDraft(routeState);
        const hasShowcaseState = Object.prototype.hasOwnProperty.call(routeState, "homeShowcaseId");
        const showcase = typeof routeState.homeShowcaseId === "string" ? entryShowcaseWorks.find((item) => item.id === routeState.homeShowcaseId) : undefined;
        if (!draft && !hasShowcaseState) return;
        if (draft) {
            setComposerSeed({ id: createClientId(), prompt: draft.prompt, ...(draft.mode === "plan" ? {} : { mode: draft.mode }) });
        }
        if (showcase) setSelectedShowcase(showcase);
        const remainingState = { ...routeState };
        delete remainingState.homeDraft;
        delete remainingState.homeShowcaseId;
        navigate(
            { pathname: location.pathname, search: location.search, hash: location.hash },
            {
                replace: true,
                state: Object.keys(remainingState).length ? remainingState : null,
            },
        );
    }, [location.hash, location.pathname, location.search, location.state, navigate]);
    const catalog = useQuery({ queryKey: ["ltv-home-catalog"], queryFn: ({ signal }) => loadLtvHomeCatalog(signal), staleTime: Infinity });
    const inspiration = useQuery({ queryKey: ["production-library"], queryFn: ({ signal }) => loadProductionCatalog(false, signal), staleTime: Infinity });
    const chooseSkill = (item: ProductionItem) => {
        if (!useUserStore.getState().user) {
            navigate(`/login?next=${encodeURIComponent("/studio?tab=skills&resource=" + encodeURIComponent(item.id))}`);
            return;
        }
        setComposerSeed({ id: createClientId(), skillId: item.id });
        setSelected(undefined);
        requestAnimationFrame(() => {
            composerSection.current?.scrollIntoView({ block: "center", behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth" });
        });
    };

    return (
        <main ref={scroll} className="ltv-home ltv-home-page" aria-label={t("homeWorkspaceLabel")}>
            <Suspense fallback={null}>
                <CommunitySharedWork />
            </Suspense>
            <div className="ltv-home-content">
                <HomeHighlights />
                {catalog.data?.items.some((item) => item.cover && item.available) && (
                    <section className="home-skill-shortcuts" aria-label={t("homeFeaturedSkills")}>
                        {catalog.data.items
                            .filter((item) => item.cover && item.available)
                            .slice(0, 4)
                            .map((item) => (
                                <button type="button" key={item.id} onClick={() => setSelected(item)}>
                                    <img src={item.cover} alt="" loading="lazy" />
                                    <span>{item.name}</span>
                                    <ArrowUpRight size={14} />
                                </button>
                            ))}
                    </section>
                )}
                {catalog.isError && <WorkspaceErrorState title={t("homeSkillLoadFailed")} description={catalog.error.message} onRetry={() => void catalog.refetch()} />}

                <section ref={composerSection} className="ltv-creation-workspace" aria-label={t("homeCreationInput")}>
                    <Suspense fallback={null}>
                        <CreationEntry embedded seed={composerSeed} />
                    </Suspense>
                </section>

                <section className="ltv-show" aria-labelledby="ltv-show-title">
                    <header className="ltv-show-header">
                        <div className="ltv-section-heading">
                            <h2 id="ltv-show-title" tabIndex={-1}>{t("galleryTitle")}</h2>
                            <Link to="/studio?tab=cases">
                                {t("galleryBrowse")}
                                <ChevronRight size={16} />
                            </Link>
                        </div>
                    </header>
                    <InspirationGallery
                        items={inspiration.data?.items || []}
                        loading={inspiration.isPending}
                        error={inspiration.error}
                        mediaWarning={inspiration.data?.mediaWarning}
                        onRetry={() => void inspiration.refetch()}
                        compact
                        onUseCase={actions.caseProject}
                    />
                </section>
                <footer className="ltv-home-footer">
                    <span>{t("homeTagline")}</span>
                    <nav aria-label={t("homeQuickLinks")}>
                        <Link to="/studio?tab=agents">
                            <Bot size={15} />
                            {t("agents")}
                        </Link>
                        <Link to="/prompts">
                            <BookOpen size={15} />
                            {t("prompts")}
                        </Link>
                        <Link to="/assets">
                            <Layers3 size={15} />
                            {t("homeMyAssets")}
                        </Link>
                        <a href="/privacy" target="_blank" rel="noopener noreferrer">
                            {t("legalPrivacy")}
                        </a>
                        <a href="/terms" target="_blank" rel="noopener noreferrer">
                            {t("legalTerms")}
                        </a>
                    </nav>
                    <button type="button" aria-label={t("homeBackToTop")} onClick={() => scroll.current?.scrollTo({ top: 0, behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth" })}>
                        <ArrowUp size={16} />
                    </button>
                </footer>
            </div>
            {selectedShowcase && (
                <EntryShowcasePlayer
                    work={selectedShowcase}
                    onClose={() => {
                        setSelectedShowcase(undefined);
                        if (sharedCaseId) {
                            const search = new URLSearchParams(location.search);
                            search.delete("case");
                            navigate({ pathname: location.pathname, search: search.toString(), hash: location.hash }, { replace: true, state: location.state });
                        }
                    }}
                />
            )}
            <Modal
                open={Boolean(selected)}
                onCancel={() => setSelected(undefined)}
                footer={null}
                width={1000}
                centered
                className="ltv-home ltv-detail-modal"
                title={selected?.name}
                styles={{ container: { background: "var(--nt-bg-body)" }, body: { padding: 0 } }}
                destroyOnHidden
            >
                {selected && (
                    <div className="ltv-detail">
                        <div className="ltv-detail-media">{selected.media ? <video src={selected.media} poster={selected.cover} controls playsInline preload="metadata" /> : <img src={selected.cover} alt={selected.name} />}</div>
                        <div className="ltv-detail-copy">
                            <span className="ltv-detail-source">{t("homeSelectedSkillSource", { author: selected.author || t("homeSourceAuthor") })}</span>
                            <p>{selected.description}</p>
                            {selected.media && <span className="ltv-detail-note">{t("homeSkillPreview")}</span>}
                            <div className="ltv-detail-actions">
                                {selected.available ? (
                                    <button type="button" className="ltv-primary-action" onClick={() => chooseSkill(selected)}>
                                        <Sparkles size={16} />
                                        {t("homeUseSkill")}
                                        <ArrowUpRight size={16} />
                                    </button>
                                ) : (
                                    <Link className="ltv-primary-action" to={"/studio?tab=skills&resource=" + encodeURIComponent(selected.id)}>
                                        {t("homeViewSkillDetails")}
                                        <ArrowUpRight size={16} />
                                    </Link>
                                )}
                                <Link to="/canvas">
                                    {t("homeOpenCanvas")}
                                    <ChevronRight size={16} />
                                </Link>
                            </div>
                        </div>
                    </div>
                )}
            </Modal>
        </main>
    );
}
