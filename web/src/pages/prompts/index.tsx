import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
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

const emptyEditor: PromptMutationInput = {
    title: "", prompt: "", description: "", coverUrl: "", referenceImageUrl: "", tags: [], category: "cinematic", mode: "image",
    modelHint: "", sourceUrl: "", license: "", visibility: "public",
};

function modeLabel(mode: PromptMode) {
    return fallbackModes.find((item) => item.value === mode)?.label || mode;
}

function categoryLabel(value: string, categories: PromptCategory[]) {
    return categories.find((item) => item.value === value)?.label || value || "其他";
}

function promptIcon(mode: PromptMode) {
    return mode === "video" ? Video : mode === "image" ? ImageIcon : mode === "text" ? BookOpen : WandSparkles;
}

function promptPreviewSources(prompt: Pick<Prompt, "referenceImageUrl" | "coverUrl">) {
    const sources = [prompt.referenceImageUrl?.trim(), prompt.coverUrl?.trim()].filter((value): value is string => Boolean(value));
    return [...new Set(sources)];
}

async function uploadPromptPreview(prompt: Prompt) {
    let lastError: unknown;
    for (const source of promptPreviewSources(prompt)) {
        try {
            return { source, uploaded: await uploadImage(source) };
        } catch (error) {
            lastError = error;
        }
    }
    throw lastError instanceof Error ? lastError : new Error("案例封面无法加入素材库");
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
    const tags = data?.tags?.length ? data.tags : ["镜头语言", "光影", "氛围", "人物", "场景", "电商", "国风", "动漫", "分镜", "短剧"];

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
                setLoadError(error instanceof Error ? error.message : "提示词加载失败");
            }
        }).finally(() => {
            if (!cancelled) setLoading(false);
        });
        return () => { cancelled = true; };
    }, [category, debouncedSearch, mode, page, pageSize, reloadKey, scope, sort, tag]);

    const filtersActive = Boolean(search || category !== "all" || mode !== "all" || tag !== "all" || (scope !== "history" && sort !== "popular"));
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
            message.error(error instanceof Error ? error.message : "提示词详情加载失败");
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
            message.success(result.prompt.isFavorite ? "已收藏提示词" : "已取消收藏");
            if (scope === "favorites" && !result.prompt.isFavorite) reload();
        } catch (error) {
            message.error(error instanceof Error ? error.message : "收藏状态更新失败");
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
            message.error(error instanceof Error ? error.message : "提示词使用失败");
        } finally {
            setMutatingID("");
        }
    };

    const addCoverToAssets = async (prompt: Prompt) => {
        if (!promptPreviewSources(prompt).length) {
            message.info("这个提示词还没有封面素材");
            return;
        }
        setMutatingID(prompt.id);
        try {
            const { source, uploaded } = await uploadPromptPreview(prompt);
            const isReferenceImage = source === prompt.referenceImageUrl?.trim();
            addAsset(creationImageAsset({ title: `${prompt.title} · 案例封面`, uploaded, source: "提示词库", metadata: { source: "prompt-library", promptId: prompt.id, previewSource: isReferenceImage ? "reference-image" : "category-fallback" } }));
            message.success(isReferenceImage ? "原始案例图已加入素材库" : "案例封面已加入素材库");
        } catch (error) {
            message.error(error instanceof Error ? error.message : "封面加入素材库失败");
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
            message.error(error instanceof Error ? error.message : "提示词读取失败");
        }
    };

    const saveEditor = async (input: PromptMutationInput) => {
        try {
            const result = editingPrompt ? await updatePrompt(editingPrompt.id, input) : await createPrompt(input);
            setEditorOpen(false);
            setEditingPrompt(null);
            setActivePrompt(result.prompt);
            message.success(editingPrompt ? "提示词已更新" : "提示词已创建");
            reload();
        } catch (error) {
            message.error(error instanceof Error ? error.message : "提示词保存失败");
        }
    };

    const confirmDelete = (prompt: Prompt) => {
        modal.confirm({
            title: `删除“${prompt.title}”？`, content: "删除后这条提示词将从你的提示词库移除，已产生的素材不受影响。",
            okText: "删除提示词", okButtonProps: { danger: true }, cancelText: "取消",
            onOk: async () => {
                await deletePrompt(prompt.id);
                setActivePrompt(null);
                message.success("提示词已删除");
                reload();
            },
        });
    };

    return (
        <>
            <WorkspacePage className="library-page prompts-library-page" grid>
                <PageHeader
                    title="提示词库"
                    description="看案例、拿提示词、直接生成。每条内容都保留来源和适用模型，适合新手快速上手。"
                    meta={<span className="app-projects-header-meta">{data?.totalCount ?? 0} 条</span>}
                    actions={<Button type="primary" icon={<Plus className="size-3.5" />} onClick={() => void openEditor()}>创建提示词</Button>}
                />

                <section className="mt-5 grid gap-3 rounded-2xl border border-foreground/[.08] bg-gradient-to-br from-primary/[.09] via-surface to-surface p-4 sm:grid-cols-[1.2fr_1fr] sm:p-5" aria-label="提示词库使用教程">
                    <div>
                        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[.16em] text-primary"><Sparkles className="size-3.5" />映雪提示词工作流</div>
                        <h2 className="mt-2 text-lg font-semibold tracking-tight">先看成品，再一键试用</h2>
                        <p className="mt-1.5 max-w-[58ch] text-xs leading-5 text-foreground/58">选择一个案例，提示词会自动带入创作页或画布；你可以先照着生成，再替换主体、风格和镜头参数。</p>
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-center text-[var(--fs-tiny)] text-foreground/55">
                        {[["01", "看案例", "封面 + 说明"], ["02", "试一次", "自动带入"], ["03", "再改进", "保存为自己的"]].map(([number, title, hint]) => <div key={number} className="rounded-xl bg-background/45 px-2 py-3"><span className="text-base font-semibold text-primary">{number}</span><strong className="mt-1 block text-foreground/80">{title}</strong><span className="mt-0.5 block">{hint}</span></div>)}
                    </div>
                </section>

                <ListToolbar className="prompts-toolbar mt-5" active={filtersActive} onReset={resetFilters}>
                    <div className="flex min-w-0 flex-wrap items-center gap-2">
                        {scopeOptions.map((option) => { const Icon = option.icon; return <button key={option.value} type="button" className={`rounded-lg px-3 py-2 text-xs transition-colors ${scope === option.value ? "bg-primary/12 font-medium text-primary" : "text-foreground/58 hover:bg-foreground/5 hover:text-foreground"}`} onClick={() => { setScope(option.value); setSort(option.value === "history" ? "history" : sort === "history" ? "popular" : sort); setPage(1); }}><Icon className="mr-1.5 inline size-3.5" />{option.label}</button>; })}
                    </div>
                    <div className="flex min-w-0 flex-wrap items-center gap-2">
                        <Input className="min-w-0 sm:!w-56" prefix={<Search className="size-4 text-foreground/38" />} value={search} allowClear placeholder="搜索标题、正文或标签" onChange={(event) => { setSearch(event.target.value); setPage(1); }} />
                        <Select className="w-28" value={category} options={[{ value: "all", label: "全部分类" }, ...categories]} onChange={(value) => { setCategory(value); setPage(1); }} />
                        <Select className="w-24" value={mode} options={[{ value: "all", label: "全部模式" }, ...modes]} onChange={(value) => { setMode(value as PromptMode | "all"); setPage(1); }} />
                        <Select className="w-28" value={tag} options={[{ value: "all", label: "全部标签" }, ...tags.map((value) => ({ value, label: value }))]} onChange={(value) => { setTag(value); setPage(1); }} />
                        <Select className="w-24" value={sort} options={scope === "history" ? historySortOption : sortOptions} onChange={(value) => { setSort(value); setPage(1); }} />
                    </div>
                </ListToolbar>

                {loading && !data ? <WorkspaceLoadingState label="正在加载提示词库" detail="准备案例、封面和适用模型" rows={6} /> : loadError ? <WorkspaceErrorState compact description={loadError} onRetry={reload} /> : data?.prompts.length ? (
                    <CollectionGrid className="prompts-grid">
                        {data.prompts.map((prompt, index) => <PromptCard key={prompt.id} prompt={prompt} categories={categories} busy={mutatingID === prompt.id} style={{ animationDelay: `${Math.min(index, 10) * 45}ms` }} onOpen={() => void openPrompt(prompt)} onFavorite={() => void toggleFavorite(prompt)} onUse={() => void usePromptFor(prompt, prompt.mode === "audio" ? "canvas" : "create")} onCanvas={() => void usePromptFor(prompt, "canvas")} onAddCover={() => void addCoverToAssets(prompt)} onEdit={() => void openEditor(prompt)} onDelete={() => confirmDelete(prompt)} />)}
                    </CollectionGrid>
                ) : <WorkspaceState compact icon="skills" title={filtersActive ? "没有找到匹配提示词" : scope === "created" ? "还没有创建提示词" : "提示词库还是空的"} description={filtersActive ? "换个关键词、分类或标签试试。" : "先创建第一条提示词，保存你的创作方法。"} action={<Button type="primary" icon={<Plus className="size-4" />} onClick={() => void openEditor()}>创建提示词</Button>} />}

                <PaginationBar current={page} pageSize={pageSize} total={data?.totalCount ?? 0} pageSizeOptions={[24, 48, 80]} onChange={(nextPage, nextSize) => { setPage(nextSize !== pageSize ? 1 : nextPage); setPageSize(nextSize); }} />
            </WorkspacePage>

            <PromptDetailDrawer prompt={activePrompt} loading={detailLoading} busy={Boolean(activePrompt && mutatingID === activePrompt.id)} categories={categories} onClose={() => setActivePrompt(null)} onFavorite={(value) => void toggleFavorite(value)} onUse={(value) => void usePromptFor(value, value.mode === "audio" ? "canvas" : "create")} onCanvas={(value) => void usePromptFor(value, "canvas")} onAddCover={(value) => void addCoverToAssets(value)} onEdit={(value) => void openEditor(value)} />
            <PromptEditorModal open={editorOpen} prompt={editingPrompt} categories={categories} onClose={() => { setEditorOpen(false); setEditingPrompt(null); }} onSave={saveEditor} />
        </>
    );
}

function PromptCard({ prompt, categories, busy, style, onOpen, onFavorite, onUse, onCanvas, onAddCover, onEdit, onDelete }: { prompt: Prompt; categories: PromptCategory[]; busy: boolean; style?: CSSProperties; onOpen: () => void; onFavorite: () => void; onUse: () => void; onCanvas: () => void; onAddCover: () => void; onEdit: () => void; onDelete: () => void }) {
    const Icon = promptIcon(prompt.mode);
    return <article style={style} className="group overflow-hidden rounded-2xl border border-foreground/[.08] bg-surface shadow-sm transition duration-200 hover:-translate-y-0.5 hover:border-primary/25 hover:shadow-lg">
        <button type="button" className="relative block aspect-[16/9] w-full overflow-hidden bg-foreground/[.04] text-left" onClick={onOpen} aria-label={`查看${prompt.title}案例`}>
            <PromptPreviewImage prompt={prompt} alt="" className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.03]" placeholder={<span className="grid h-full w-full place-items-center bg-gradient-to-br from-primary/15 via-surface-active to-foreground/[.03]"><Icon className="size-12 text-primary/55" strokeWidth={1.25} /></span>} />
            <span className="absolute inset-0 bg-gradient-to-t from-black/55 via-transparent to-transparent" />
            <span className="absolute bottom-2.5 left-3 flex items-center gap-1.5 text-[var(--fs-tiny)] font-medium text-white/90"><Icon className="size-3.5" />{modeLabel(prompt.mode)}<span className="mx-0.5 text-white/45">·</span>{categoryLabel(prompt.category, categories)}</span>
            {prompt.featured ? <span className="absolute right-2.5 top-2.5 rounded-full bg-white/90 px-2 py-1 text-[10px] font-semibold text-primary shadow-sm">映雪精选</span> : null}
        </button>
        <div className="p-3.5">
            <div className="flex items-start justify-between gap-2"><button type="button" className="min-w-0 text-left" onClick={onOpen}><h3 className="truncate text-sm font-semibold text-foreground">{prompt.title}</h3><p className="mt-1 line-clamp-2 min-h-9 text-xs leading-4.5 text-foreground/55">{prompt.description || "打开查看完整提示词和使用说明"}</p></button><div className="flex shrink-0 items-center gap-1"><button type="button" className={`grid size-7 place-items-center rounded-md transition-colors ${prompt.isFavorite ? "bg-rose-500/10 text-rose-500" : "text-foreground/35 hover:bg-foreground/5 hover:text-foreground/70"}`} aria-label={prompt.isFavorite ? "取消收藏" : "收藏提示词"} onClick={onFavorite}><Heart className="size-4" fill={prompt.isFavorite ? "currentColor" : "none"} /></button>{prompt.isOwner ? <DropdownMenu onEdit={onEdit} onDelete={onDelete} /> : null}</div></div>
            <div className="mt-3 flex flex-wrap gap-1">{prompt.tags.slice(0, 3).map((tag) => <Tag key={tag} className="!m-0 !rounded-md !border-0 !bg-foreground/[.05] !px-1.5 !py-0.5 !text-[10px] !text-foreground/55">{tag}</Tag>)}</div>
            <div className="mt-3 flex items-center justify-between text-[var(--fs-tiny)] text-foreground/38"><span>{prompt.authorName || "映雪精选"}</span><span>{prompt.useCount.toLocaleString("zh-CN")} 次使用</span></div>
            <div className="mt-3 grid grid-cols-[1fr_auto_auto] gap-1.5"><Button size="small" type="primary" loading={busy} icon={busy ? undefined : prompt.mode === "audio" ? <Library className="size-3.5" /> : <WandSparkles className="size-3.5" />} onClick={prompt.mode === "audio" ? onCanvas : onUse}>{prompt.mode === "audio" ? "插入画布" : "直接试用"}</Button>{prompt.mode !== "audio" ? <Button size="small" aria-label="带入画布" title="带入画布" icon={<Library className="size-3.5" />} onClick={onCanvas} /> : <span aria-hidden /> }<Button size="small" aria-label="保存案例封面" title="保存案例封面到素材库" icon={<ImageIcon className="size-3.5" />} onClick={onAddCover} /></div>
        </div>
    </article>;
}

function DropdownMenu({ onEdit, onDelete }: { onEdit: () => void; onDelete: () => void }) {
    return <div className="relative"><button type="button" className="grid size-7 place-items-center rounded-md text-foreground/35 hover:bg-foreground/5 hover:text-foreground/70" aria-label="提示词操作" onClick={(event) => { event.stopPropagation(); const menu = event.currentTarget.nextElementSibling; menu?.classList.toggle("hidden"); }}><MoreHorizontal className="size-4" /></button><div className="absolute right-0 top-8 z-10 hidden w-28 overflow-hidden rounded-lg border border-foreground/10 bg-surface p-1 shadow-xl"><button type="button" className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs hover:bg-foreground/5" onClick={onEdit}>编辑</button><button type="button" className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs text-red-500 hover:bg-red-500/5" onClick={onDelete}><Trash2 className="size-3.5" />删除</button></div></div>;
}

function PromptDetailDrawer({ prompt, loading, busy, categories, onClose, onFavorite, onUse, onCanvas, onAddCover, onEdit }: { prompt: Prompt | null; loading: boolean; busy: boolean; categories: PromptCategory[]; onClose: () => void; onFavorite: (prompt: Prompt) => void; onUse: (prompt: Prompt) => void; onCanvas: (prompt: Prompt) => void; onAddCover: (prompt: Prompt) => void; onEdit: (prompt: Prompt) => void }) {
    const { message } = App.useApp();
    const [copied, setCopied] = useState(false);
    useEffect(() => { setCopied(false); }, [prompt?.id]);
    if (!prompt && !loading) return null;
    const copy = () => { if (!prompt?.prompt) return; copyToClipboard(prompt.prompt); setCopied(true); message.success("提示词已复制"); window.setTimeout(() => setCopied(false), 1600); };
    return <Drawer open={Boolean(prompt) || loading} onClose={onClose} width={minDrawerWidth()} title={prompt?.title || "提示词详情"} className="prompt-detail-drawer" destroyOnClose>
        {loading && !prompt ? <WorkspaceLoadingState label="正在读取提示词" rows={2} /> : prompt ? <div className="flex flex-col gap-4 pb-4">
            <div className="overflow-hidden rounded-2xl bg-foreground/[.04]"><PromptPreviewImage prompt={prompt} alt={`${prompt.title}案例封面`} className="aspect-video h-auto w-full object-cover" placeholder={<div className="grid aspect-video place-items-center text-primary/55"><Sparkles className="size-12" /></div>} /></div>
            <div className="flex flex-wrap items-center gap-1.5"><Tag color="blue">{modeLabel(prompt.mode)}</Tag><Tag>{categoryLabel(prompt.category, categories)}</Tag>{prompt.featured ? <Tag color="gold">映雪精选</Tag> : null}{prompt.tags.map((tag) => <Tag key={tag}>{tag}</Tag>)}</div>
            <p className="text-sm leading-6 text-foreground/65">{prompt.description || "暂无简介"}</p>
            <div className="rounded-xl border border-foreground/[.08] bg-foreground/[.025] p-3.5"><div className="mb-2 flex items-center justify-between"><strong className="text-xs text-foreground/65">提示词正文</strong><Button type="text" size="small" icon={copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />} onClick={copy}>{copied ? "已复制" : "复制"}</Button></div><pre className="max-h-[360px] overflow-y-auto whitespace-pre-wrap text-xs leading-5 text-foreground/80">{prompt.prompt || "正在加载正文…"}</pre></div>
            <div className="grid gap-2 text-xs text-foreground/58 sm:grid-cols-2"><InfoRow label="适用模型" value={prompt.modelHint || "按当前模型自动适配"} /><InfoRow label="作者" value={prompt.authorName || "映雪精选"} /><InfoRow label="使用次数" value={`${prompt.useCount.toLocaleString("zh-CN")} 次`} /><InfoRow label="来源" value={prompt.sourceUrl ? <a href={prompt.sourceUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline">查看来源<ExternalLink className="size-3" /></a> : "映雪整理"} /></div>
            {prompt.license ? <p className="text-[var(--fs-tiny)] leading-4 text-foreground/42">版权说明：{prompt.license}</p> : null}
            <div className="grid gap-2 sm:grid-cols-2"><Button type="primary" loading={busy} icon={prompt.mode === "audio" ? <Library className="size-4" /> : <WandSparkles className="size-4" />} onClick={() => prompt.mode === "audio" ? onCanvas(prompt) : onUse(prompt)}>{prompt.mode === "audio" ? "插入画布" : "带入创作页"}</Button>{prompt.mode !== "audio" ? <Button icon={<Library className="size-4" />} onClick={() => onCanvas(prompt)}>插入当前画布</Button> : null}<Button icon={<Heart className="size-4" />} onClick={() => onFavorite(prompt)}>{prompt.isFavorite ? "取消收藏" : "收藏提示词"}</Button><Button icon={<ImageIcon className="size-4" />} onClick={() => onAddCover(prompt)}>封面加入素材库</Button></div>
            {prompt.isOwner ? <Button type="link" onClick={() => onEdit(prompt)}>编辑这条提示词</Button> : null}
        </div> : null}
    </Drawer>;
}

function InfoRow({ label, value }: { label: string; value: ReactNode }) { return <div className="rounded-lg bg-foreground/[.03] px-3 py-2"><span className="block text-[var(--fs-tiny)] text-foreground/38">{label}</span><span className="mt-0.5 block truncate text-foreground/70">{value}</span></div>; }
function minDrawerWidth() { return typeof window !== "undefined" && window.innerWidth < 640 ? "100%" : 520; }

function PromptEditorModal({ open, prompt, categories, onClose, onSave }: { open: boolean; prompt: Prompt | null; categories: PromptCategory[]; onClose: () => void; onSave: (input: PromptMutationInput) => Promise<void> }) {
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
    return <Modal open={open} onCancel={onClose} title={prompt ? "编辑提示词" : "创建提示词"} okText={prompt ? "保存修改" : "创建提示词"} cancelText="取消" confirmLoading={saving} onOk={() => void save()} width={720} destroyOnClose>
        <div className="grid gap-3 py-2"><Input value={form.title} maxLength={160} showCount placeholder="给这条提示词起一个容易理解的标题" onChange={(event) => update("title", event.target.value)} /><div className="grid gap-3 sm:grid-cols-2"><Select value={form.category} options={categories} onChange={(value) => update("category", value)} /><Select value={form.mode} options={fallbackModes} onChange={(value) => update("mode", value)} /></div><Input.TextArea value={form.description} maxLength={600} showCount autoSize={{ minRows: 2, maxRows: 4 }} placeholder="一句话说明适合什么场景" onChange={(event) => update("description", event.target.value)} /><Input.TextArea value={form.prompt} maxLength={100000} showCount autoSize={{ minRows: 8, maxRows: 16 }} placeholder="写下可直接使用的提示词正文" onChange={(event) => update("prompt", event.target.value)} /><div><div className="mb-1.5 text-xs text-foreground/55">标签</div><div className="flex flex-wrap gap-1.5">{form.tags.map((tag) => <Tag key={tag} closable onClose={() => update("tags", form.tags.filter((value) => value !== tag))}>{tag}</Tag>)}<Input size="small" className="!w-32" value={tagInput} placeholder="回车添加" onChange={(event) => setTagInput(event.target.value)} onPressEnter={(event) => { event.preventDefault(); addTag(); }} /></div></div><Input placeholder="封面地址（可选，支持站内路径或 HTTP(S)）" value={form.coverUrl} onChange={(event) => update("coverUrl", event.target.value)} /><Input placeholder="参考图地址（可选）" value={form.referenceImageUrl} onChange={(event) => update("referenceImageUrl", event.target.value)} /><Input placeholder="适用模型和参数建议（可选）" value={form.modelHint} onChange={(event) => update("modelHint", event.target.value)} /><div className="grid gap-3 sm:grid-cols-2"><Input placeholder="来源链接（可选）" value={form.sourceUrl} onChange={(event) => update("sourceUrl", event.target.value)} /><Select value={form.visibility} options={[{ value: "public", label: "公开分享" }, { value: "private", label: "仅自己可见" }]} onChange={(value) => update("visibility", value)} /></div><Input placeholder="版权/许可说明（可选）" value={form.license} onChange={(event) => update("license", event.target.value)} /></div>
    </Modal>;
}
