import { useInterfaceTranslation } from "@/stores/use-interface-locale-store";
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { useNavigate } from "react-router";
import { App, Button, Drawer, Input, Modal, Select, Tag } from "antd";
import { BookOpen, Check, Copy, ExternalLink, Heart, History, Image as ImageIcon, Library, MoreHorizontal, Plus, Search, Sparkles, Trash2, Video, WandSparkles } from "lucide-react";
import copyToClipboard from "copy-to-clipboard";

import { CollectionGrid, ListToolbar, PageHeader, PaginationBar, WorkspacePage } from "@/components/layout/workspace-page";
import { WorkspaceErrorState, WorkspaceLoadingState, WorkspaceState } from "@/components/layout/workspace-state";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { creationImageAsset } from "@/lib/creation-asset-builders";
import { uploadImage } from "@/services/image-storage";
import { createPrompt, deletePrompt, favoritePrompt, getPrompt, listPrompts, unfavoritePrompt, updatePrompt, usePrompt, type Prompt, type PromptCategory, type PromptList, type PromptMode, type PromptMutationInput, type PromptScope, type PromptSort } from "@/services/api/prompts";
import { useAssetStore } from "@/stores/use-asset-store";
import type { InterfaceMessageKey, InterfaceTranslate } from "@/lib/interface-locale";

const scopeOptions: Array<{ value: PromptScope; label: string; icon: typeof Sparkles }> = [
    { value: "public", label: "精选提示词", icon: Sparkles },
    { value: "mine", label: "我的提示词", icon: Library },
    { value: "created", label: "我创建的", icon: WandSparkles },
    { value: "favorites", label: "我的收藏", icon: Heart },
    { value: "history", label: "最近使用", icon: History },
];

const fallbackCategories: PromptCategory[] = [
    { value: "cinematic", label: "电影感" },
    { value: "portrait", label: "人物肖像" },
    { value: "landscape", label: "风光场景" },
    { value: "product", label: "产品商业" },
    { value: "anime", label: "动漫插画" },
    { value: "storyboard", label: "分镜叙事" },
    { value: "others", label: "其他" },
];

const fallbackModes: Array<{ value: PromptMode; label: string }> = [
    { value: "image", label: "图片" },
    { value: "video", label: "视频" },
    { value: "text", label: "文本" },
    { value: "audio", label: "音频" },
];

const sortOptions: Array<{ value: PromptSort; label: string }> = [
    { value: "popular", label: "最受欢迎" },
    { value: "new", label: "最新发布" },
    { value: "favorites", label: "收藏最多" },
];

const historySortOption: Array<{ value: PromptSort; label: string }> = [{ value: "history", label: "最近使用" }];

const scopeMessageKey: Record<PromptScope, InterfaceMessageKey> = {
    public: "promptsUi.scopeFeatured",
    mine: "promptsUi.scopeMine",
    created: "promptsUi.scopeCreated",
    favorites: "promptsUi.scopeFavorites",
    history: "promptsUi.scopeHistory",
};
const categoryMessageKey: Record<string, InterfaceMessageKey> = {
    cinematic: "promptsUi.categoryCinematic",
    portrait: "promptsUi.categoryPortrait",
    landscape: "promptsUi.categoryLandscape",
    product: "promptsUi.categoryProduct",
    anime: "promptsUi.categoryAnime",
    storyboard: "promptsUi.categoryStoryboard",
    others: "promptsUi.categoryOthers",
};
const modeMessageKey: Record<PromptMode, InterfaceMessageKey> = {
    image: "contextImage",
    video: "contextVideo",
    text: "composerModeText",
    audio: "previewAssetAudio",
};
const sortMessageKey: Record<PromptSort, InterfaceMessageKey> = {
    popular: "promptsUi.sortPopular",
    new: "promptsUi.sortNewest",
    favorites: "promptsUi.sortMostFavorited",
    history: "promptsUi.scopeHistory",
};
const fallbackTags: Array<{ value: string; labelKey?: InterfaceMessageKey }> = [
    { value: "镜头语言", labelKey: "promptsUi.tagCameraLanguage" },
    { value: "光影", labelKey: "promptsUi.tagLighting" },
    { value: "氛围", labelKey: "promptsUi.tagMood" },
    { value: "人物", labelKey: "workbenchUi.categoryPeople" },
    { value: "场景", labelKey: "contextEnvironmentCategory" },
    { value: "电商", labelKey: "workbenchUi.categoryEcommerce" },
    { value: "国风", labelKey: "promptsUi.tagChineseStyle" },
    { value: "动漫", labelKey: "promptsUi.categoryAnime" },
    { value: "分镜", labelKey: "settingsMemoryCategoryStoryboard" },
    { value: "短剧", labelKey: "shortProjects" },
];

const emptyEditor: PromptMutationInput = {
    title: "", prompt: "", description: "", coverUrl: "", referenceImageUrl: "", tags: [], category: "cinematic", mode: "image",
    modelHint: "", sourceUrl: "", license: "", visibility: "public",
};

function modeLabel(mode: PromptMode, t: InterfaceTranslate) {
    return t(modeMessageKey[mode]);
}

function categoryLabel(value: string, categories: PromptCategory[], t: InterfaceTranslate) {
    const item = categories.find((category) => category.value === value);
    const key = categoryMessageKey[value];
    return key ? t(key) : item?.label || value || t("promptsUi.categoryOthers");
}

function localizedCategoryOptions(categories: PromptCategory[], t: InterfaceTranslate) {
    return categories.map((category) => ({ ...category, label: categoryLabel(category.value, categories, t) }));
}

function localizedModeOptions(modes: Array<{ value: PromptMode; label: string }>, t: InterfaceTranslate) {
    return modes.map((mode) => ({ ...mode, label: t(modeMessageKey[mode.value]) }));
}

function promptIcon(mode: PromptMode) {
    return mode === "video" ? Video : mode === "image" ? ImageIcon : mode === "text" ? BookOpen : WandSparkles;
}

function promptPreviewSources(prompt: Pick<Prompt, "referenceImageUrl" | "coverUrl">) {
    const sources = [prompt.referenceImageUrl?.trim(), prompt.coverUrl?.trim()].filter((value): value is string => Boolean(value));
    return [...new Set(sources)];
}

async function uploadPromptPreview(prompt: Prompt, t: InterfaceTranslate) {
    let lastError: unknown;
    for (const source of promptPreviewSources(prompt)) {
        try {
            return { source, uploaded: await uploadImage(source) };
        } catch (error) {
            lastError = error;
        }
    }
    throw lastError instanceof Error ? lastError : new Error(t("promptsUi.coverUnableToAdd"));
}

function PromptPreviewImage({ prompt, alt, className, placeholder }: { prompt: Prompt; alt: string; className: string; placeholder: ReactNode }) {
    const sources = promptPreviewSources(prompt);
    const sourceKey = sources.join("\u0000");
    const [sourceIndex, setSourceIndex] = useState(0);
    useEffect(() => { setSourceIndex(0); }, [sourceKey]);
    const source = sources[sourceIndex];

    return source ? <img src={source} alt={alt} className={className} loading="lazy" onError={() => setSourceIndex((current) => current < sources.length ? current + 1 : current)} /> : <>{placeholder}</>;
}

export default function PromptsPage() {
    const { t } = useInterfaceTranslation();
    const tRef = useRef(t);
    tRef.current = t;
    const { message, modal } = App.useApp();
    const navigate = useNavigate();
    const addAsset = useAssetStore((state) => state.addAsset);
    const [scope, setScope] = useState<PromptScope>("public");
    const [sort, setSort] = useState<PromptSort>("popular");
    const [search, setSearch] = useState("");
    const debouncedSearch = useDebouncedValue(search, 250);
    const [category, setCategory] = useState("all");
    const [mode, setMode] = useState<PromptMode | "all">("all");
    const [tag, setTag] = useState("all");
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(24);
    const [data, setData] = useState<PromptList | null>(null);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState("");
    const [reloadKey, setReloadKey] = useState(0);
    const [activePrompt, setActivePrompt] = useState<Prompt | null>(null);
    const [detailLoading, setDetailLoading] = useState(false);
    const [mutatingID, setMutatingID] = useState("");
    const [editorOpen, setEditorOpen] = useState(false);
    const [editingPrompt, setEditingPrompt] = useState<Prompt | null>(null);

    const reload = () => setReloadKey((value) => value + 1);
    const categories = data?.categories?.length ? data.categories : fallbackCategories;
    const modes = data?.modes?.length ? data.modes : fallbackModes;
    const tags = data?.tags?.length ? data.tags : fallbackTags.map(({ value }) => value);
    const tagOptions = tags.map((value) => ({
        value,
        label: data?.tags?.length ? value : t(fallbackTags.find((tag) => tag.value === value)?.labelKey ?? "promptsUi.tagCameraLanguage"),
    }));

    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        setLoadError("");
        listPrompts({
            page, pageSize, scope, sort, search: debouncedSearch || undefined,
            category: category === "all" ? undefined : category,
            mode: mode === "all" ? undefined : mode,
            tag: tag === "all" ? undefined : tag,
        }).then((value) => {
            if (!cancelled) setData(value);
        }).catch((error) => {
            if (!cancelled) {
                setData(null);
                setLoadError(error instanceof Error ? error.message : tRef.current("promptsUi.loadFailed"));
            }
        }).finally(() => {
            if (!cancelled) setLoading(false);
        });
        return () => { cancelled = true; };
    }, [category, debouncedSearch, mode, page, pageSize, reloadKey, scope, sort, tag]);

    const filtersActive = Boolean(search || category !== "all" || mode !== "all" || tag !== "all" || (scope !== "history" && sort !== "popular"));
    const localizedScopes = scopeOptions.map((option) => ({ ...option, label: t(scopeMessageKey[option.value]) }));
    const localizedSortOptions = (scope === "history" ? historySortOption : sortOptions).map((option) => ({ ...option, label: t(sortMessageKey[option.value]) }));
    const resetFilters = () => { setSearch(""); setCategory("all"); setMode("all"); setTag("all"); setSort(scope === "history" ? "history" : "popular"); setPage(1); };

    const patchPrompt = (next: Prompt) => {
        setData((current) => current ? { ...current, prompts: current.prompts.map((item) => item.id === next.id ? { ...item, ...next, prompt: next.prompt || item.prompt } : item) } : current);
        setActivePrompt((current) => current?.id === next.id ? { ...current, ...next, prompt: next.prompt || current.prompt } : current);
    };

    const openPrompt = async (prompt: Prompt) => {
        setActivePrompt(prompt);
        setDetailLoading(true);
        try {
            const result = await getPrompt(prompt.id);
            setActivePrompt(result.prompt);
            patchPrompt(result.prompt);
        } catch (error) {
            message.error(error instanceof Error ? error.message : t("promptsUi.detailLoadFailed"));
            setActivePrompt(null);
        } finally {
            setDetailLoading(false);
        }
    };

    const toggleFavorite = async (prompt: Prompt) => {
        setMutatingID(prompt.id);
        try {
            const result = prompt.isFavorite ? await unfavoritePrompt(prompt.id) : await favoritePrompt(prompt.id);
            patchPrompt(result.prompt);
            message.success(result.prompt.isFavorite ? t("skillsUi.favorited") : t("skillsUi.unfavorited"));
            if (scope === "favorites" && !result.prompt.isFavorite) reload();
        } catch (error) {
            message.error(error instanceof Error ? error.message : t("skillsUi.updateFavoriteFailed"));
        } finally {
            setMutatingID("");
        }
    };

    const usePromptFor = async (prompt: Prompt, destination: "create" | "canvas") => {
        setMutatingID(prompt.id);
        try {
            const result = await usePrompt(prompt.id);
            patchPrompt(result.prompt);
            const params = new URLSearchParams({ prompt: result.prompt.prompt || prompt.prompt || "", mode: result.prompt.mode, promptId: result.prompt.id });
            if (result.prompt.referenceImageUrl) params.set("referenceImageUrl", result.prompt.referenceImageUrl);
            if (destination === "canvas") {
                params.set("mode", "prompt");
                params.set("promptMode", result.prompt.mode);
                params.set("promptTitle", result.prompt.title);
                navigate(`/canvas?${params.toString()}`);
            } else {
                navigate(`/create?${params.toString()}`);
            }
        } catch (error) {
            message.error(error instanceof Error ? error.message : t("promptsUi.useFailed"));
        } finally {
            setMutatingID("");
        }
    };

    const addCoverToAssets = async (prompt: Prompt) => {
        if (!promptPreviewSources(prompt).length) {
            message.info(t("promptsUi.noCoverAsset"));
            return;
        }
        setMutatingID(prompt.id);
        try {
            const { source, uploaded } = await uploadPromptPreview(prompt, t);
            const isReferenceImage = source === prompt.referenceImageUrl?.trim();
            addAsset(creationImageAsset({ title: `${prompt.title} · ${t("promptsUi.caseCover")}`, uploaded, source: "提示词库", metadata: { source: "prompt-library", promptId: prompt.id, previewSource: isReferenceImage ? "reference-image" : "category-fallback" } }));
            message.success(isReferenceImage ? t("promptsUi.referenceImageAddedToAssets") : t("promptsUi.coverAddedToAssets"));
        } catch (error) {
            message.error(error instanceof Error ? error.message : t("promptsUi.addCoverFailed"));
        } finally {
            setMutatingID("");
        }
    };

    const openEditor = async (prompt?: Prompt) => {
        if (!prompt) {
            setEditingPrompt(null);
            setEditorOpen(true);
            return;
        }
        try {
            const result = prompt.prompt ? { prompt } : await getPrompt(prompt.id);
            setActivePrompt(null);
            setEditingPrompt(result.prompt);
            setEditorOpen(true);
        } catch (error) {
            message.error(error instanceof Error ? error.message : t("promptsUi.readFailed"));
        }
    };

    const saveEditor = async (input: PromptMutationInput) => {
        try {
            const result = editingPrompt ? await updatePrompt(editingPrompt.id, input) : await createPrompt(input);
            setEditorOpen(false);
            setEditingPrompt(null);
            setActivePrompt(result.prompt);
            message.success(editingPrompt ? t("promptsUi.promptUpdated") : t("promptsUi.promptCreated"));
            reload();
        } catch (error) {
            message.error(error instanceof Error ? error.message : t("promptsUi.saveFailed"));
        }
    };

    const confirmDelete = (prompt: Prompt) => {
        modal.confirm({
            title: t("promptsUi.deletePromptTitle", { title: prompt.title }), content: t("promptsUi.deletePromptContent"),
            okText: t("promptsUi.deletePrompt"), okButtonProps: { danger: true }, cancelText: t("timelineCancel"),
            onOk: async () => {
                await deletePrompt(prompt.id);
                setActivePrompt(null);
                message.success(t("promptsUi.promptDeleted"));
                reload();
            },
        });
    };

    return (
        <>
            <WorkspacePage className="library-page prompts-library-page" grid>
                <PageHeader
                    title={t("prompts")}
                    description={t("promptsUi.pageDescription")}
                    meta={<span className="app-projects-header-meta">{t("promptsUi.promptCount", { count: data?.totalCount ?? 0 })}</span>}
                    actions={<Button type="primary" icon={<Plus className="size-3.5" />} onClick={() => void openEditor()}>{t("promptsUi.createPrompt")}</Button>}
                />

                <section className="mt-5 grid gap-3 rounded-2xl border border-foreground/[.08] bg-gradient-to-br from-primary/[.09] via-surface to-surface p-4 sm:grid-cols-[1.2fr_1fr] sm:p-5" aria-label={t("promptsUi.tutorialAriaLabel")}>
                    <div>
                        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[.16em] text-primary"><Sparkles className="size-3.5" />{t("promptsUi.workflowTitle")}</div>
                        <h2 className="mt-2 text-lg font-semibold tracking-tight">{t("promptsUi.tutorialHeading")}</h2>
                        <p className="mt-1.5 max-w-[58ch] text-xs leading-5 text-foreground/58">{t("promptsUi.tutorialDescription")}</p>
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-center text-[var(--fs-tiny)] text-foreground/55">
                        {[["01", t("promptsUi.stepViewCase"), t("promptsUi.stepViewCaseHint")], ["02", t("promptsUi.stepTry"), t("promptsUi.stepTryHint")], ["03", t("promptsUi.stepImprove"), t("promptsUi.stepImproveHint")]].map(([number, title, hint]) => <div key={number} className="rounded-xl bg-background/45 px-2 py-3"><span className="text-base font-semibold text-primary">{number}</span><strong className="mt-1 block text-foreground/80">{title}</strong><span className="mt-0.5 block">{hint}</span></div>)}
                    </div>
                </section>

                <ListToolbar className="prompts-toolbar mt-5" active={filtersActive} onReset={resetFilters}>
                    <div className="flex min-w-0 flex-wrap items-center gap-2">
                        {localizedScopes.map((option) => { const Icon = option.icon; return <button key={option.value} type="button" className={`rounded-lg px-3 py-2 text-xs transition-colors ${scope === option.value ? "bg-primary/12 font-medium text-primary" : "text-foreground/58 hover:bg-foreground/5 hover:text-foreground"}`} onClick={() => { setScope(option.value); setSort(option.value === "history" ? "history" : sort === "history" ? "popular" : sort); setPage(1); }}><Icon className="mr-1.5 inline size-3.5" />{option.label}</button>; })}
                    </div>
                    <div className="flex min-w-0 flex-wrap items-center gap-2">
                        <Input className="min-w-0 sm:!w-56" prefix={<Search className="size-4 text-foreground/38" />} value={search} allowClear placeholder={t("promptsUi.searchPlaceholder")} onChange={(event) => { setSearch(event.target.value); setPage(1); }} />
                        <Select className="w-28" value={category} options={[{ value: "all", label: t("promptsUi.allCategories") }, ...localizedCategoryOptions(categories, t)]} onChange={(value) => { setCategory(value); setPage(1); }} />
                        <Select className="w-24" value={mode} options={[{ value: "all", label: t("promptsUi.allModes") }, ...localizedModeOptions(modes, t)]} onChange={(value) => { setMode(value as PromptMode | "all"); setPage(1); }} />
                        <Select className="w-28" value={tag} options={[{ value: "all", label: t("promptsUi.allTags") }, ...tagOptions]} onChange={(value) => { setTag(value); setPage(1); }} />
                        <Select className="w-24" value={sort} options={localizedSortOptions} onChange={(value) => { setSort(value); setPage(1); }} />
                    </div>
                </ListToolbar>

                {loading && !data ? <WorkspaceLoadingState label={t("promptsUi.loadingPrompts")} detail={t("promptsUi.preparingCases")} rows={6} /> : loadError ? <WorkspaceErrorState compact description={loadError} onRetry={reload} /> : data?.prompts.length ? (
                    <CollectionGrid className="prompts-grid">
                        {data.prompts.map((prompt, index) => <PromptCard key={prompt.id} prompt={prompt} categories={categories} busy={mutatingID === prompt.id} style={{ animationDelay: `${Math.min(index, 10) * 45}ms` }} onOpen={() => void openPrompt(prompt)} onFavorite={() => void toggleFavorite(prompt)} onUse={() => void usePromptFor(prompt, prompt.mode === "audio" ? "canvas" : "create")} onCanvas={() => void usePromptFor(prompt, "canvas")} onAddCover={() => void addCoverToAssets(prompt)} onEdit={() => void openEditor(prompt)} onDelete={() => confirmDelete(prompt)} />)}
                    </CollectionGrid>
                ) : <WorkspaceState compact icon="skills" title={filtersActive ? t("promptsUi.noMatchingPrompts") : scope === "created" ? t("promptsUi.noCreatedPrompts") : t("promptsUi.libraryEmpty")} description={filtersActive ? t("promptsUi.tryDifferentFilters") : t("promptsUi.createFirstPromptDescription")} action={<Button type="primary" icon={<Plus className="size-4" />} onClick={() => void openEditor()}>{t("promptsUi.createPrompt")}</Button>} />}

                <PaginationBar current={page} pageSize={pageSize} total={data?.totalCount ?? 0} pageSizeOptions={[24, 48, 80]} onChange={(nextPage, nextSize) => { setPage(nextSize !== pageSize ? 1 : nextPage); setPageSize(nextSize); }} />
            </WorkspacePage>

            <PromptDetailDrawer prompt={activePrompt} loading={detailLoading} busy={Boolean(activePrompt && mutatingID === activePrompt.id)} categories={categories} onClose={() => setActivePrompt(null)} onFavorite={(value) => void toggleFavorite(value)} onUse={(value) => void usePromptFor(value, value.mode === "audio" ? "canvas" : "create")} onCanvas={(value) => void usePromptFor(value, "canvas")} onAddCover={(value) => void addCoverToAssets(value)} onEdit={(value) => void openEditor(value)} />
            <PromptEditorModal open={editorOpen} prompt={editingPrompt} categories={categories} onClose={() => { setEditorOpen(false); setEditingPrompt(null); }} onSave={saveEditor} />
        </>
    );
}

function PromptCard({ prompt, categories, busy, style, onOpen, onFavorite, onUse, onCanvas, onAddCover, onEdit, onDelete }: { prompt: Prompt; categories: PromptCategory[]; busy: boolean; style?: CSSProperties; onOpen: () => void; onFavorite: () => void; onUse: () => void; onCanvas: () => void; onAddCover: () => void; onEdit: () => void; onDelete: () => void }) {
    const { t, locale } = useInterfaceTranslation();
    const Icon = promptIcon(prompt.mode);
    return <article style={style} className="group overflow-hidden rounded-2xl border border-foreground/[.08] bg-surface shadow-sm transition duration-200 hover:-translate-y-0.5 hover:border-primary/25 hover:shadow-lg">
        <button type="button" className="relative block aspect-[16/9] w-full overflow-hidden bg-foreground/[.04] text-left" onClick={onOpen} aria-label={t("promptsUi.viewPromptCase", { title: prompt.title })}>
            <PromptPreviewImage prompt={prompt} alt="" className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.03]" placeholder={<span className="grid h-full w-full place-items-center bg-gradient-to-br from-primary/15 via-surface-active to-foreground/[.03]"><Icon className="size-12 text-primary/55" strokeWidth={1.25} /></span>} />
            <span className="absolute inset-0 bg-gradient-to-t from-black/55 via-transparent to-transparent" />
            <span className="absolute bottom-2.5 left-3 flex items-center gap-1.5 text-[var(--fs-tiny)] font-medium text-white/90"><Icon className="size-3.5" />{modeLabel(prompt.mode, t)}<span className="mx-0.5 text-white/45">·</span>{categoryLabel(prompt.category, categories, t)}</span>
            {prompt.featured ? <span className="absolute right-2.5 top-2.5 rounded-full bg-white/90 px-2 py-1 text-[10px] font-semibold text-primary shadow-sm">{t("promptsUi.featured")}</span> : null}
        </button>
        <div className="p-3.5">
            <div className="flex items-start justify-between gap-2"><button type="button" className="min-w-0 text-left" onClick={onOpen}><h3 className="truncate text-sm font-semibold text-foreground">{prompt.title}</h3><p className="mt-1 line-clamp-2 min-h-9 text-xs leading-4.5 text-foreground/55">{prompt.description || t("promptsUi.openPromptDetails")}</p></button><div className="flex shrink-0 items-center gap-1"><button type="button" className={`grid size-7 place-items-center rounded-md transition-colors ${prompt.isFavorite ? "bg-rose-500/10 text-rose-500" : "text-foreground/35 hover:bg-foreground/5 hover:text-foreground/70"}`} aria-label={prompt.isFavorite ? t("skillsUi.unfavorite") : t("promptsUi.favoritePrompt")} onClick={onFavorite}><Heart className="size-4" fill={prompt.isFavorite ? "currentColor" : "none"} /></button>{prompt.isOwner ? <DropdownMenu onEdit={onEdit} onDelete={onDelete} /> : null}</div></div>
            <div className="mt-3 flex flex-wrap gap-1">{prompt.tags.slice(0, 3).map((tag) => <Tag key={tag} className="!m-0 !rounded-md !border-0 !bg-foreground/[.05] !px-1.5 !py-0.5 !text-[10px] !text-foreground/55">{tag}</Tag>)}</div>
            <div className="mt-3 flex items-center justify-between text-[var(--fs-tiny)] text-foreground/38"><span>{prompt.authorName || t("promptsUi.yingxueFeaturedAuthor")}</span><span>{t("promptsUi.useCount", { count: prompt.useCount.toLocaleString(locale) })}</span></div>
            <div className="mt-3 grid grid-cols-[1fr_auto_auto] gap-1.5"><Button size="small" type="primary" loading={busy} icon={busy ? undefined : prompt.mode === "audio" ? <Library className="size-3.5" /> : <WandSparkles className="size-3.5" />} onClick={prompt.mode === "audio" ? onCanvas : onUse}>{prompt.mode === "audio" ? t("promptsUi.insertIntoCanvas") : t("promptsUi.tryNow")}</Button>{prompt.mode !== "audio" ? <Button size="small" aria-label={t("promptsUi.bringIntoCanvas")} title={t("promptsUi.bringIntoCanvas")} icon={<Library className="size-3.5" />} onClick={onCanvas} /> : <span aria-hidden /> }<Button size="small" aria-label={t("promptsUi.saveCaseCover")} title={t("promptsUi.saveCaseCoverToAssets")} icon={<ImageIcon className="size-3.5" />} onClick={onAddCover} /></div>
        </div>
    </article>;
}

function DropdownMenu({ onEdit, onDelete }: { onEdit: () => void; onDelete: () => void }) {
    const { t } = useInterfaceTranslation();
    return <div className="relative"><button type="button" className="grid size-7 place-items-center rounded-md text-foreground/35 hover:bg-foreground/5 hover:text-foreground/70" aria-label={t("promptsUi.promptActions")} onClick={(event) => { event.stopPropagation(); const menu = event.currentTarget.nextElementSibling; menu?.classList.toggle("hidden"); }}><MoreHorizontal className="size-4" /></button><div className="absolute right-0 top-8 z-10 hidden w-28 overflow-hidden rounded-lg border border-foreground/10 bg-surface p-1 shadow-xl"><button type="button" className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs hover:bg-foreground/5" onClick={onEdit}>{t("assetsUi.edit")}</button><button type="button" className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs text-red-500 hover:bg-red-500/5" onClick={onDelete}><Trash2 className="size-3.5" />{t("canvasLibraryDelete")}</button></div></div>;
}

function PromptDetailDrawer({ prompt, loading, busy, categories, onClose, onFavorite, onUse, onCanvas, onAddCover, onEdit }: { prompt: Prompt | null; loading: boolean; busy: boolean; categories: PromptCategory[]; onClose: () => void; onFavorite: (prompt: Prompt) => void; onUse: (prompt: Prompt) => void; onCanvas: (prompt: Prompt) => void; onAddCover: (prompt: Prompt) => void; onEdit: (prompt: Prompt) => void }) {
    const { t, locale } = useInterfaceTranslation();
    const { message } = App.useApp();
    const [copied, setCopied] = useState(false);
    useEffect(() => { setCopied(false); }, [prompt?.id]);
    if (!prompt && !loading) return null;
    const copy = () => { if (!prompt?.prompt) return; copyToClipboard(prompt.prompt); setCopied(true); message.success(t("creationPagePromptCopied")); window.setTimeout(() => setCopied(false), 1600); };
    return <Drawer open={Boolean(prompt) || loading} onClose={onClose} width={minDrawerWidth()} title={prompt?.title || t("promptsUi.promptDetails")} className="prompt-detail-drawer" destroyOnClose>
        {loading && !prompt ? <WorkspaceLoadingState label={t("promptsUi.readingPrompt")} rows={2} /> : prompt ? <div className="flex flex-col gap-4 pb-4">
            <div className="overflow-hidden rounded-2xl bg-foreground/[.04]"><PromptPreviewImage prompt={prompt} alt={t("promptsUi.caseCoverAlt", { title: prompt.title })} className="aspect-video h-auto w-full object-cover" placeholder={<div className="grid aspect-video place-items-center text-primary/55"><Sparkles className="size-12" /></div>} /></div>
            <div className="flex flex-wrap items-center gap-1.5"><Tag color="blue">{modeLabel(prompt.mode, t)}</Tag><Tag>{categoryLabel(prompt.category, categories, t)}</Tag>{prompt.featured ? <Tag color="gold">{t("promptsUi.featured")}</Tag> : null}{prompt.tags.map((tag) => <Tag key={tag}>{tag}</Tag>)}</div>
            <p className="text-sm leading-6 text-foreground/65">{prompt.description || t("promptsUi.noDescription")}</p>
            <div className="rounded-xl border border-foreground/[.08] bg-foreground/[.025] p-3.5"><div className="mb-2 flex items-center justify-between"><strong className="text-xs text-foreground/65">{t("promptsUi.promptBody")}</strong><Button type="text" size="small" icon={copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />} onClick={copy}>{copied ? t("studioUi.copySuccess") : t("promptsUi.copy")}</Button></div><pre className="max-h-[360px] overflow-y-auto whitespace-pre-wrap text-xs leading-5 text-foreground/80">{prompt.prompt || t("promptsUi.loadingPromptBody")}</pre></div>
            <div className="grid gap-2 text-xs text-foreground/58 sm:grid-cols-2"><InfoRow label={t("promptsUi.modelHintLabel")} value={prompt.modelHint || t("promptsUi.autoAdaptToCurrentModel")} /><InfoRow label={t("pluginUi.docAuthor")} value={prompt.authorName || t("promptsUi.yingxueFeaturedAuthor")} /><InfoRow label={t("promptsUi.useCountLabel")} value={t("promptsUi.useCount", { count: prompt.useCount.toLocaleString(locale) })} /><InfoRow label={t("assetsUi.source")} value={prompt.sourceUrl ? <a href={prompt.sourceUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline">{t("promptsUi.viewSource")}<ExternalLink className="size-3" /></a> : t("completeUi.063")} /></div>
            {prompt.license ? <p className="text-[var(--fs-tiny)] leading-4 text-foreground/42">{t("promptsUi.copyrightNote", { license: prompt.license })}</p> : null}
            <div className="grid gap-2 sm:grid-cols-2"><Button type="primary" loading={busy} icon={prompt.mode === "audio" ? <Library className="size-4" /> : <WandSparkles className="size-4" />} onClick={() => prompt.mode === "audio" ? onCanvas(prompt) : onUse(prompt)}>{prompt.mode === "audio" ? t("promptsUi.insertIntoCanvas") : t("promptsUi.bringToCreatePage")}</Button>{prompt.mode !== "audio" ? <Button icon={<Library className="size-4" />} onClick={() => onCanvas(prompt)}>{t("promptsUi.insertIntoCurrentCanvas")}</Button> : null}<Button icon={<Heart className="size-4" />} onClick={() => onFavorite(prompt)}>{prompt.isFavorite ? t("skillsUi.unfavorite") : t("promptsUi.favoritePrompt")}</Button><Button icon={<ImageIcon className="size-4" />} onClick={() => onAddCover(prompt)}>{t("promptsUi.addCoverToAssets")}</Button></div>
            {prompt.isOwner ? <Button type="link" onClick={() => onEdit(prompt)}>{t("promptsUi.editPrompt")}</Button> : null}
        </div> : null}
    </Drawer>;
}

function InfoRow({ label, value }: { label: string; value: ReactNode }) { return <div className="rounded-lg bg-foreground/[.03] px-3 py-2"><span className="block text-[var(--fs-tiny)] text-foreground/38">{label}</span><span className="mt-0.5 block truncate text-foreground/70">{value}</span></div>; }
function minDrawerWidth() { return typeof window !== "undefined" && window.innerWidth < 640 ? "100%" : 520; }

function PromptEditorModal({ open, prompt, categories, onClose, onSave }: { open: boolean; prompt: Prompt | null; categories: PromptCategory[]; onClose: () => void; onSave: (input: PromptMutationInput) => Promise<void> }) {
    const { t } = useInterfaceTranslation();
    const [form, setForm] = useState<PromptMutationInput>(emptyEditor);
    const [saving, setSaving] = useState(false);
    const [tagInput, setTagInput] = useState("");
    useEffect(() => {
        if (!open) return;
        setForm(prompt ? { title: prompt.title, prompt: prompt.prompt || "", description: prompt.description, coverUrl: prompt.coverUrl, referenceImageUrl: prompt.referenceImageUrl || "", tags: [...prompt.tags], category: prompt.category, mode: prompt.mode, modelHint: prompt.modelHint, sourceUrl: prompt.sourceUrl || "", license: prompt.license || "", visibility: prompt.visibility === "private" ? "private" : "public" } : emptyEditor);
        setTagInput("");
    }, [open, prompt]);
    const update = <K extends keyof PromptMutationInput>(key: K, value: PromptMutationInput[K]) => setForm((current) => ({ ...current, [key]: value }));
    const addTag = () => { const value = tagInput.trim(); if (!value || form.tags.includes(value) || form.tags.length >= 8) return; update("tags", [...form.tags, value]); setTagInput(""); };
    const save = async () => { if (!form.title.trim() || !form.prompt.trim()) return; setSaving(true); try { await onSave(form); } finally { setSaving(false); } };
    return <Modal open={open} onCancel={onClose} title={prompt ? t("createUiEditPrompt") : t("promptsUi.createPrompt")} okText={prompt ? t("promptsUi.saveChanges") : t("promptsUi.createPrompt")} cancelText={t("timelineCancel")} confirmLoading={saving} onOk={() => void save()} width={720} destroyOnClose>
        <div className="grid gap-3 py-2"><Input value={form.title} maxLength={160} showCount placeholder={t("promptsUi.titlePlaceholder")} onChange={(event) => update("title", event.target.value)} /><div className="grid gap-3 sm:grid-cols-2"><Select value={form.category} options={localizedCategoryOptions(categories, t)} placeholder={t("promptsUi.categoryFieldLabel")} onChange={(value) => update("category", value)} /><Select value={form.mode} options={localizedModeOptions(fallbackModes, t)} placeholder={t("promptsUi.modeFieldLabel")} onChange={(value) => update("mode", value)} /></div><Input.TextArea value={form.description} maxLength={600} showCount autoSize={{ minRows: 2, maxRows: 4 }} placeholder={t("promptsUi.descriptionPlaceholder")} onChange={(event) => update("description", event.target.value)} /><Input.TextArea value={form.prompt} maxLength={100000} showCount autoSize={{ minRows: 8, maxRows: 16 }} placeholder={t("promptsUi.promptBodyPlaceholder")} onChange={(event) => update("prompt", event.target.value)} /><div><div className="mb-1.5 text-xs text-foreground/55">{t("pluginUi.tags")}</div><div className="flex flex-wrap gap-1.5">{form.tags.map((tag) => <Tag key={tag} closable onClose={() => update("tags", form.tags.filter((value) => value !== tag))}>{tag}</Tag>)}<Input size="small" className="!w-32" value={tagInput} placeholder={t("promptsUi.addTagPlaceholder")} onChange={(event) => setTagInput(event.target.value)} onPressEnter={(event) => { event.preventDefault(); addTag(); }} /></div></div><Input placeholder={t("promptsUi.coverUrlPlaceholder")} value={form.coverUrl} onChange={(event) => update("coverUrl", event.target.value)} /><Input placeholder={t("promptsUi.referenceImageUrlPlaceholder")} value={form.referenceImageUrl} onChange={(event) => update("referenceImageUrl", event.target.value)} /><Input placeholder={t("promptsUi.modelHintPlaceholder")} value={form.modelHint} onChange={(event) => update("modelHint", event.target.value)} /><div className="grid gap-3 sm:grid-cols-2"><Input placeholder={t("promptsUi.sourceUrlPlaceholder")} value={form.sourceUrl} onChange={(event) => update("sourceUrl", event.target.value)} /><Select value={form.visibility} options={[{ value: "public", label: t("promptsUi.visibilityPublic") }, { value: "private", label: t("promptsUi.visibilityPrivate") }]} onChange={(value) => update("visibility", value)} /></div><Input placeholder={t("promptsUi.licensePlaceholder")} value={form.license} onChange={(event) => update("license", event.target.value)} /></div>
    </Modal>;
}
