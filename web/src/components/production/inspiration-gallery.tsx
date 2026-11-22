import { lazy, Suspense, useEffect, useId, useMemo, useRef, useState } from "react";
import { Button } from "antd";
import { useLocation } from "react-router";
import { Select } from "@/components/ui/base/select";
import { ArrowUpRight, ChevronDown, ChevronLeft, ChevronRight, ImageOff, Play, Search, SlidersHorizontal, Sparkles, X } from "lucide-react";
import { productionCategories, type ProductionItem } from "@/services/production-library";
import { curateInspirationCases } from "@/lib/inspiration-curation";
import { caseCategory, caseCategoryMessages, caseSourceCategories } from "@/lib/case-source-categories";
import { resolveProductionCover, resolveProductionMedia } from "@/lib/cleaned-case-media";
import { publicCasePlaybackURL } from "@/lib/public-case-playback";
import { useInterfaceTranslation } from "@/stores/use-interface-locale-store";
import type { InterfaceMessageKey } from "@/lib/interface-locale";
import { FilmDetail } from "./film-detail";
import { useFilmPlaybackStore } from "@/stores/use-film-playback-store";
import { FilmCaseActions } from "./film-case-actions";
import { useQuery } from "@tanstack/react-query";
import { communityWorksQueryKey, getPublicWorks } from "@/services/api/community-works";
import { communityWorkItem } from "@/lib/community-works";
import { CommunityWorkPreview } from "./community-work-preview";
import "./inspiration-gallery.css";

const CaseProjectViewer = lazy(() => import("./case-project-preview").then((module) => ({ default: module.CaseProjectViewer })));

const COMPACT_PAGE_SIZE = 16;
const FULL_PAGE_SIZE = 24;
const categoryMessages: Record<string, InterfaceMessageKey> = {
    all: "galleryAll",
    drama: "galleryDrama",
    ecommerce: "galleryCommercial",
    creative: "galleryCreative",
    social: "gallerySocial",
    others: "galleryOther",
};

export type InspirationGalleryProps = {
    items: ProductionItem[];
    loading: boolean;
    error: Error | null;
    onRetry: () => void;
    mediaWarning?: string;
    compact?: boolean;
    itemKind?: "case" | "template";
    onUseCase?: (item: ProductionItem, returnState?: unknown) => void | Promise<void>;
};

export function InspirationGallery({ items, loading, error, onRetry, mediaWarning, compact = false, itemKind = "case", onUseCase }: InspirationGalleryProps) {
    const { t, locale } = useInterfaceTranslation();
    const location = useLocation();
    const community = useQuery({ queryKey: [...communityWorksQueryKey, "featured"], queryFn: ({ signal }) => getPublicWorks(signal), enabled: itemKind === "case", staleTime: 15000, refetchInterval: 30000 });
    const allItems = useMemo(() => (itemKind === "case" ? [...(community.data?.items || []).map(communityWorkItem), ...items] : items), [items, itemKind, community.data]);
    const [restored, setRestored] = useState(() => {
        const value = location.state?.casePreview;
        if (
            !value ||
            typeof value.id !== "string" ||
            typeof value.process !== "boolean" ||
            typeof value.category !== "string" ||
            typeof value.search !== "string" ||
            !Number.isSafeInteger(value.page) ||
            value.page < 1 ||
            !Number.isSafeInteger(value.limit) ||
            value.limit < 1
        )
            return undefined;
        return value as { id: string; process: boolean; category: string; search: string; page: number; limit: number };
    });
    const restorePending = useRef(Boolean(restored));
    const filtersMounted = useRef(false);
    const [category, setCategory] = useState(restored?.category || "all");
    const [filtersOpen, setFiltersOpen] = useState(false);
    const filtersId = useId();
    const [search, setSearch] = useState(restored?.search || "");
    const [page, setPage] = useState(restored?.page || 1);
    const [limit, setLimit] = useState(restored?.limit || COMPACT_PAGE_SIZE);
    const [active, setActive] = useState<ProductionItem | null>(null);
    const loadMoreRef = useRef<HTMLDivElement>(null);
    const categoriesRef = useRef<HTMLDivElement>(null);
    const groups = useMemo(
        () => (itemKind === "case" ? [...curateInspirationCases(allItems.filter((item) => item.communityWork)), ...curateInspirationCases(items)] : items.filter((item) => item.kind === itemKind).map((item) => ({ item, variants: [item] }))),
        [allItems, items, itemKind],
    );
    const cases = useMemo(() => groups.map((group) => group.item), [groups]);
    const categories = useMemo(
        () =>
            itemKind === "case"
                ? [{ value: "all", label: t("galleryAll") }, ...caseSourceCategories(cases).map((option) => ({ value: option.value, label: t(option.messageKey) }))]
                : productionCategories
                      .filter((option) => option.value === "all" || cases.some((item) => item.category === option.value))
                      .map((option) => ({ ...option, label: categoryMessages[option.value] ? t(categoryMessages[option.value]) : option.label })),
        [groups, cases, itemKind, t],
    );
    useEffect(() => {
        if (!loading && !categories.some((option) => option.value === category)) setCategory("all");
    }, [categories, category, loading]);
    const variantCounts = useMemo(() => new Map(groups.map((group) => [group.item.id, group.variants.length])), [groups]);
    const resourceLabel = t(itemKind === "template" ? "galleryTemplates" : "galleryCases");
    const filtered = useMemo(() => {
        const keyword = search.trim().toLocaleLowerCase();
        return groups
            .filter(
                (group) =>
                    (category === "all" || (itemKind === "case" ? caseCategory(group.item) === category : group.item.category === category)) &&
                    group.variants.some((item) => !keyword || `${item.name} ${item.description} ${item.author} ${(item.tags || []).join(" ")}`.toLocaleLowerCase().includes(keyword)),
            )
            .map((group) => group.item);
    }, [groups, category, search, itemKind]);
    const pageCount = Math.max(1, Math.ceil(filtered.length / FULL_PAGE_SIZE));
    const visible = compact ? filtered.slice(0, limit) : filtered.slice((page - 1) * FULL_PAGE_SIZE, page * FULL_PAGE_SIZE);
    const hasMore = compact && visible.length < filtered.length;

    useEffect(() => {
        if (!restorePending.current || loading || !restored) return;
        restorePending.current = false;
        setActive(allItems.find((item) => item.id === restored.id) || null);
        setPage(restored.page);
        setLimit(restored.limit);
    }, [allItems, loading, restored]);

    useEffect(() => {
        const container = categoriesRef.current;
        const selected = container?.querySelector<HTMLButtonElement>('button[aria-pressed="true"]');
        if (!container || !selected) return;
        const bounds = container.getBoundingClientRect();
        const button = selected.getBoundingClientRect();
        // Language changes alter tab widths; move only this strip, never the page.
        if (button.left < bounds.left) container.scrollLeft += button.left - bounds.left;
        else if (button.right > bounds.right) container.scrollLeft += button.right - bounds.right;
    }, [category, locale, cases.length, loading]);

    useEffect(() => {
        if (!filtersMounted.current) {
            filtersMounted.current = true;
            return;
        }
        setPage(1);
        setLimit(COMPACT_PAGE_SIZE);
    }, [category, search, compact]);
    useEffect(() => {
        if (page > pageCount) setPage(pageCount);
    }, [page, pageCount]);
    useEffect(() => {
        const target = loadMoreRef.current;
        if (loading || error || !hasMore || !target) return;
        let root: HTMLElement | null = target.parentElement;
        while (root && root !== document.body && root !== document.documentElement && !/(auto|scroll|overlay)/.test(getComputedStyle(root).overflowY)) root = root.parentElement;
        if (root === document.body || root === document.documentElement) root = null;
        let observing = true;
        const observer = new IntersectionObserver(
            (entries) => {
                if (!observing || !entries.some((entry) => entry.isIntersecting)) return;
                observing = false;
                observer.disconnect();
                setLimit((value) => Math.min(value + COMPACT_PAGE_SIZE, filtered.length));
            },
            { root, rootMargin: "0px 0px 240px 0px" },
        );
        observer.observe(target);
        return () => {
            observing = false;
            observer.disconnect();
        };
    }, [loading, error, hasMore, filtered, limit]);

    if (loading)
        return (
            <div className="inspiration-gallery-state" role="status">
                {t("galleryLoading")}
            </div>
        );
    if (error)
        return (
            <div className="inspiration-gallery-state" role="alert">
                <p>{error.message}</p>
                <Button onClick={onRetry}>{t("galleryRetry")}</Button>
            </div>
        );
    if (!cases.length)
        return (
            <div className="inspiration-gallery-state" role="status">
                {t("galleryUnavailable", { resource: resourceLabel })}
            </div>
        );

    return (
        <section className={`inspiration-gallery${compact ? " is-compact" : ""}`} aria-label={t(itemKind === "template" ? "galleryTemplateRegion" : "galleryCaseRegion")}>
            <div className="inspiration-gallery-toolbar">
                <div ref={categoriesRef} className="inspiration-gallery-categories" aria-label={t("galleryCategories")}>
                    {categories.map((item) => (
                        <button key={item.value} type="button" aria-pressed={category === item.value} onClick={() => setCategory(item.value)}>
                            {item.label}
                        </button>
                    ))}
                </div>
                <label className="inspiration-gallery-search">
                    <Search size={16} />
                    <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={t(itemKind === "template" ? "gallerySearchTemplate" : "gallerySearchCase")} aria-label={t("gallerySearchLabel", { resource: resourceLabel })} />
                    {search ? (
                        <button type="button" aria-label={t("galleryClearSearch")} onClick={() => setSearch("")}>
                            <X size={14} />
                        </button>
                    ) : null}
                </label>
                {itemKind === "case" && (
                    <Button type="text" icon={<SlidersHorizontal size={16} />} aria-expanded={filtersOpen} aria-controls={filtersId} onClick={() => setFiltersOpen((open) => !open)} className="inspiration-gallery-filter-toggle">
                        {t("galleryMoreFilters")}
                        <ChevronDown size={14} aria-hidden className={filtersOpen ? "is-open" : undefined} />
                    </Button>
                )}
            </div>
            {itemKind === "case" && filtersOpen && (
                <div id={filtersId} className="inspiration-gallery-filters" role="group" aria-label={t("galleryMoreFilters")}>
                    <span>{t("galleryCategory")}</span>
                    <Select showSearch optionFilterProp="label" options={categories} value={category} onChange={setCategory} ariaLabel={t("galleryCategories")} />
                    {category !== "all" && (
                        <Button type="text" onClick={() => setCategory("all")}>
                            {t("galleryClearFilter")}
                        </Button>
                    )}
                </div>
            )}
            {mediaWarning ? (
                <div className="inspiration-gallery-warning" role="status">
                    {mediaWarning}
                </div>
            ) : null}
            {community.isError && itemKind === "case" ? (
                <div className="inspiration-gallery-warning" role="alert">
                    {community.error.message}
                    <Button type="text" onClick={() => void community.refetch()}>
                        {t("galleryRetry")}
                    </Button>
                </div>
            ) : null}
            {visible.length ? (
                <div className="inspiration-gallery-grid">
                    {visible.map((item) => (
                        <InspirationCard key={item.id} item={item} variantCount={variantCounts.get(item.id) || 1} onOpen={() => setActive(item)} />
                    ))}
                </div>
            ) : (
                <div className="inspiration-gallery-state">
                    <Search size={22} />
                    <p>{t("galleryNoMatch")}</p>
                    <button
                        type="button"
                        onClick={() => {
                            setSearch("");
                            setCategory("all");
                        }}
                    >
                        {t("galleryReset")}
                    </button>
                </div>
            )}
            {hasMore ? <div ref={loadMoreRef} className="inspiration-gallery-load-trigger" aria-hidden="true" /> : null}
            {!compact && pageCount > 1 ? (
                <nav className="inspiration-gallery-pagination" aria-label={t("galleryPagination")}>
                    <button type="button" disabled={page === 1} aria-label={t("galleryPrevious")} onClick={() => setPage((value) => Math.max(1, value - 1))}>
                        <ChevronLeft size={18} />
                    </button>
                    <span>
                        {page} / {pageCount}
                    </span>
                    <button type="button" disabled={page === pageCount} aria-label={t("galleryNext")} onClick={() => setPage((value) => Math.min(pageCount, value + 1))}>
                        <ChevronRight size={18} />
                    </button>
                </nav>
            ) : null}
            {active?.communityWork ? (
                <CommunityWorkPreview
                    key={active.id}
                    work={active.communityWork}
                    onClose={() => {
                        setActive(null);
                        setRestored(undefined);
                    }}
                />
            ) : (
                <InspirationDetail
                    item={active}
                    works={filtered.filter((item) => !item.communityWork)}
                    variants={groups.find((group) => group.variants.some((item) => item.id === active?.id))?.variants || []}
                    onSelect={setActive}
                    onClose={() => {
                        setActive(null);
                        setRestored(undefined);
                    }}
                    startInProcess={restored?.id === active?.id && restored?.process}
                    onUseCase={onUseCase ? (item) => onUseCase(item, { ...location.state, casePreview: { id: item.id, process: true, category, search, page, limit } }) : undefined}
                />
            )}
        </section>
    );
}

function InspirationCard({ item, variantCount, onOpen }: { item: ProductionItem; variantCount: number; onOpen: () => void }) {
    const { t } = useInterfaceTranslation();
    const previewBlocked = useFilmPlaybackStore((state) => state.activePreviews > 0);
    const [coverFailed, setCoverFailed] = useState(false);
    const [remoteCover, setRemoteCover] = useState(false);
    const [hovered, setHovered] = useState(false);
    const [playing, setPlaying] = useState(false);
    const [remotePreview, setRemotePreview] = useState(false);
    const previewTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
    const video = useRef<HTMLVideoElement>(null);
    const { local: localCover, remote: sourceCover } = resolveProductionCover(item);
    const cover = remoteCover ? sourceCover : localCover || sourceCover;
    const { local: localMedia, remote: remoteMedia } = resolveProductionMedia(item);
    const previewMedia = publicCasePlaybackURL(remotePreview ? remoteMedia : localMedia || remoteMedia);
    useEffect(() => {
        const element = video.current;
        if (!hovered || previewBlocked || !element) return;
        void element.play().catch(() => setPlaying(false));
        return () => {
            element.pause();
            element.removeAttribute("src");
            element.load();
        };
    }, [hovered, previewMedia, previewBlocked]);
    useEffect(() => () => clearTimeout(previewTimer.current), []);
    const preview = () => {
        clearTimeout(previewTimer.current);
        if (item.mediaKind !== "image" && !previewBlocked && previewMedia && !matchMedia("(prefers-reduced-motion: reduce)").matches) previewTimer.current = setTimeout(() => setHovered(true), 250);
    };
    const stop = () => {
        clearTimeout(previewTimer.current);
        setHovered(false);
        setPlaying(false);
    };
    return (
        <button
            type="button"
            className="inspiration-card"
            onClick={() => {
                stop();
                onOpen();
            }}
            onPointerEnter={(event) => {
                if (event.pointerType === "mouse") preview();
            }}
            onPointerLeave={stop}
            onFocus={preview}
            onBlur={stop}
            aria-label={t(item.kind === "template" ? "galleryViewNamedTemplate" : "galleryViewNamedCase", { name: item.name })}
        >
            <span className="inspiration-card-media">
                {!coverFailed && cover ? (
                    <img
                        src={cover}
                        alt={item.name}
                        loading="lazy"
                        decoding="async"
                        onError={() => {
                            if (!remoteCover && localCover && sourceCover && sourceCover !== localCover) setRemoteCover(true);
                            else setCoverFailed(true);
                        }}
                    />
                ) : item.kind === "template" ? (
                    <span className="inspiration-template-cover">
                        <Sparkles size={26} />
                        <small>{t(item.presentation === "storyboard-template" ? "galleryStoryboardProduction" : "galleryCanvasProduction")}</small>
                        <strong>{item.name}</strong>
                        <span>{t("galleryTemplateFeatures")}</span>
                    </span>
                ) : (
                    <span className="inspiration-card-missing">
                        <ImageOff size={24} />
                        <span>{t("galleryCoverUnavailable")}</span>
                    </span>
                )}
                {hovered && !previewBlocked && previewMedia ? (
                    <video
                        ref={video}
                        src={previewMedia}
                        muted
                        loop
                        playsInline
                        preload="none"
                        onPlaying={() => setPlaying(true)}
                        onError={() => {
                            setPlaying(false);
                            if (!remotePreview && localMedia && remoteMedia && remoteMedia !== localMedia) setRemotePreview(true);
                        }}
                        className={playing ? "is-playing" : ""}
                    />
                ) : null}
                <span className="inspiration-card-corner" aria-label={t(previewMedia ? "galleryPlayWork" : "galleryViewWork")}>
                    {previewMedia ? <Play size={10} fill="currentColor" /> : <ArrowUpRight size={12} />}
                </span>
                <span className="inspiration-card-overlay">
                    <span>{item.author || t("galleryLibraryAuthor")}</span>
                    <span>
                        {t(item.kind === "template" ? "galleryViewTemplate" : "galleryViewCase")}
                        <ArrowUpRight size={14} />
                    </span>
                </span>
            </span>
            <span className="inspiration-card-caption">
                <strong>{item.name}</strong>
                <span>
                    {variantCount > 1
                        ? t("gallerySeriesCount", { count: variantCount })
                        : item.kind === "case"
                          ? t(caseCategoryMessages[caseCategory(item)])
                          : t(item.category === "drama" ? "galleryDrama" : item.category === "ecommerce" ? "galleryCommercial" : item.category === "social" ? "gallerySocial" : item.category === "creative" ? "galleryCreative" : "galleryCreativeCase")}
                </span>
            </span>
        </button>
    );
}

function InspirationDetail({
    item,
    works,
    variants,
    onSelect,
    onClose,
    onUseCase,
    startInProcess,
}: {
    item: ProductionItem | null;
    works: ProductionItem[];
    variants: ProductionItem[];
    onSelect: (item: ProductionItem) => void;
    onClose: () => void;
    onUseCase?: (item: ProductionItem) => void | Promise<void>;
    startInProcess?: boolean;
}) {
    const { t } = useInterfaceTranslation();
    const [showFilm, setShowFilm] = useState(true);
    const itemId = item?.id;
    useEffect(() => {
        setShowFilm(item?.kind !== "template" && !startInProcess);
    }, [itemId, item?.kind, startInProcess]);
    const [mediaOverride, setMediaOverride] = useState<{ id: string; state: "remote-fallback" | "failed" } | null>(null);
    const activeItemId = useRef(item?.id);
    activeItemId.current = item?.id;
    const { local: localMedia, remote: remoteMedia } = item ? resolveProductionMedia(item) : { local: undefined, remote: undefined };
    const coverSources = item ? resolveProductionCover(item) : undefined;
    const cover = coverSources?.local || coverSources?.remote;
    const mediaState = item && mediaOverride?.id === item.id ? mediaOverride.state : localMedia ? "local" : remoteMedia ? "remote" : "failed";
    const mediaSource = mediaState === "local" ? localMedia : mediaState === "remote" || mediaState === "remote-fallback" ? remoteMedia : undefined;
    const handleMediaError = () => {
        if (!item || activeItemId.current !== item.id) return;
        if (mediaState === "local" && remoteMedia && remoteMedia !== localMedia) setMediaOverride({ id: item.id, state: "remote-fallback" });
        else setMediaOverride({ id: item.id, state: "failed" });
    };
    const close = () => {
        activeItemId.current = undefined;
        setMediaOverride(null);
        onClose();
    };
    if (!item) return null;
    const process = (
        <Suspense fallback={<div role="status">{t("galleryOpeningProcess")}</div>}>
            <CaseProjectViewer key={item.id} id={item.id} title={item.name} author={item.author} onClose={() => (item.kind === "template" ? close() : setShowFilm(true))} onCopy={onUseCase ? () => onUseCase(item) : undefined} />
        </Suspense>
    );
    return (
        <FilmDetail
            work={{ id: item.id, title: item.name, author: item.author, description: item.description, src: mediaSource, poster: cover }}
            works={works.map((entry) => ({ id: entry.id, title: entry.name, poster: resolveProductionCover(entry).local || resolveProductionCover(entry).remote }))}
            onSelect={(id) => {
                const selected = works.find((entry) => entry.id === id);
                if (selected) onSelect(selected);
            }}
            onClose={showFilm || item.kind === "template" ? close : () => setShowFilm(true)}
            onMediaError={handleMediaError}
            process={showFilm ? undefined : process}
            notice={showFilm && mediaState === "remote-fallback" ? t("galleryVideoFallback") : showFilm && mediaState === "failed" ? t("galleryVideoUnavailable") : undefined}
            actions={
                <>
                    <FilmCaseActions key={item.id} caseId={item.id} onViewProcess={() => setShowFilm(false)} />
                    {variants.length > 1 ? (
                        <select
                            className="inspiration-series-select"
                            aria-label={t("gallerySeriesMethods")}
                            value={item.id}
                            onChange={(event) => {
                                const variant = variants.find((value) => value.id === event.target.value);
                                if (variant) onSelect(variant);
                            }}
                        >
                            {variants.map((variant) => (
                                <option key={variant.id} value={variant.id}>
                                    {variant.name}
                                </option>
                            ))}
                        </select>
                    ) : null}
                </>
            }
        />
    );
}
