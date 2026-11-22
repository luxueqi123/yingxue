import type { InterfaceMessageKey } from "@/lib/interface-locale";
import { useInterfaceTranslation } from "@/stores/use-interface-locale-store";
import { useDeferredValue, useEffect, useRef, useState, type DragEvent } from "react";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { App, Button, Dropdown, Input } from "antd";
import { BookOpenText, ClipboardPaste, Clapperboard, ExternalLink, FileUp, MoreHorizontal, Plus, Search, Trash2 } from "lucide-react";
import { Link, useNavigate } from "react-router";

import { CollectionToolbar } from "@/components/layout/collection-toolbar";
import { PageHeader, PaginationBar, WorkspacePage } from "@/components/layout/workspace-page";
import { WorkspaceErrorState, WorkspaceLoadingState, WorkspaceState } from "@/components/layout/workspace-state";
import { deleteDrama, listDramas, type DramaListItem, type DramaStatus } from "@/services/api/drama";

import { formatCredits, MediaThumb, STATUS_LABEL } from "./drama-shared";
import { progressFillStyle } from "@/lib/drama/progress-fill";
import { RelativeTime } from "@/components/ui/product/relative-time";
import "./drama.css";

const PAGE_SIZES = [24, 48, 96];
const PIPELINE = ["dramaUi.parseChapters", "drama.create.stepBuildAssets", "dramaUi.adaptEpisodes", "drama.create.stepGenerateVideos", "drama.create.stepAssembleFinal"] as const;
const STATUS_FILTERS: Array<{ value: DramaStatus | "all"; label: InterfaceMessageKey }> = [
    { value: "all", label: "previewAll" },
    { value: "running", label: "projectUi.summaryStageInProduction" },
    { value: "paused", label: "coverageUi.058" },
    { value: "completed", label: "agentChromeStatusCompleted" },
    { value: "draft", label: "canvasCompleteUi.notStarted" },
];
const ACCEPT = ".txt,.md,.markdown,text/plain,text/markdown";

export default function DramaListPage() {
    const { t } = useInterfaceTranslation();
    const navigate = useNavigate();
    const queryClient = useQueryClient();
    const { message, modal } = App.useApp();
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(PAGE_SIZES[0]);
    const [keyword, setKeyword] = useState("");
    const [status, setStatus] = useState<DramaStatus | "all">("all");
    const [dragging, setDragging] = useState(false);
    const fileRef = useRef<HTMLInputElement>(null);
    const search = useDeferredValue(keyword.trim());
    useEffect(() => setPage(1), [search, status, pageSize]);

    const query = useQuery({
        queryKey: ["dramas", { page, pageSize, search, status }],
        queryFn: ({ signal }) => listDramas({ page, pageSize, q: search || undefined, status: status === "all" ? undefined : status }, signal),
        placeholderData: keepPreviousData,
        refetchInterval: (state) => (state.state.data?.items.some((item) => item.status === "running") ? 8_000 : false),
    });
    const remove = useMutation({
        mutationFn: deleteDrama,
        onSuccess: () => {
            message.success(t("coverageUi.059"));
            void queryClient.invalidateQueries({ queryKey: ["dramas"] });
        },
        onError: (error) => message.error(error instanceof Error ? error.message : t("tasksUi.deleteFailed")),
    });
    const data = query.data;
    const counts = data?.statusCounts || {};
    const total = counts.all ?? 0;
    const filtered = Boolean(search || status !== "all");
    const openFile = (file: File) => navigate("/projects/new", { state: { file } });
    const confirmDelete = (item: DramaListItem) => {
        modal.confirm({
            title: t("coverageUi.060", { value0: item.project.name }),
            content: "小说原文、剧本、分镜与成片记录都会删除。此操作无法撤销。",
            okText: t("canvasLibraryDelete"),
            okButtonProps: { danger: true },
            cancelText: t("timelineCancel"),
            centered: true,
            onOk: () => remove.mutateAsync(item.project.id),
        });
    };
    // 整页都能拖入小说：列表页不再单独放一块上传区占位置。
    const dragProps = {
        onDragOver: (event: DragEvent) => { if (event.dataTransfer.types.includes("Files")) { event.preventDefault(); setDragging(true); } },
        onDragLeave: (event: DragEvent) => { if (event.currentTarget === event.target) setDragging(false); },
        onDrop: (event: DragEvent) => {
            event.preventDefault();
            setDragging(false);
            const file = event.dataTransfer.files?.[0];
            if (file) openFile(file);
        },
    };

    const actions = (
        <div className="collection-header-actions">
            <Link to="/projects/legacy"><Button icon={<BookOpenText />}>{t("coverageUi.061")}</Button></Link>
            {total ? <><Button icon={<ClipboardPaste />} onClick={() => navigate("/projects/new?paste=1")}>{t("coverageUi.062")}</Button>
            <Button type="primary" icon={<Plus />} onClick={() => fileRef.current?.click()}>{t("coverageUi.063")}</Button></> : null}
        </div>
    );

    return (
        <WorkspacePage className="studio-collection-page drama-library">
            <div className="drama-root" {...dragProps}>
                <div className="studio-band">
                    <PageHeader title={t("shortProjects")} description={t("coverageUi.064")} meta={<span className="app-projects-header-meta">{t("dramaUi.works", { count: total })}</span>} actions={actions} />
                    {total ? (
                        <CollectionToolbar label={t("coverageUi.066")} active={filtered} onReset={() => { setKeyword(""); setStatus("all"); }}>
                            <Input prefix={<Search />} value={keyword} allowClear placeholder={t("coverageUi.067")} aria-label={t("coverageUi.067")} onChange={(event) => setKeyword(event.target.value)} />
                            <div className="drama-library-status" role="radiogroup" aria-label={t("pluginUi.statusFilterAria")}>
                                {STATUS_FILTERS.map((item) => {
                                    const count = item.value === "all" ? total : counts[item.value] || 0;
                                    if (item.value !== "all" && !count && status !== item.value) return null;
                                    return (
                                        <button key={item.value} type="button" role="radio" aria-checked={status === item.value} className={`drama-library-status-item is-${item.value}`} onClick={() => setStatus(item.value)}>
                                            {item.value !== "all" ? <span className="drama-dot" /> : null}{t(item.label)}<b>{count}</b>
                                        </button>
                                    );
                                })}
                            </div>
                        </CollectionToolbar>
                    ) : null}
                </div>

                {query.isLoading ? <WorkspaceLoadingState label={t("coverageUi.068")} /> : query.isError && !data ? <WorkspaceErrorState description={t("coverageUi.069")} onRetry={() => void query.refetch()} /> : !total ? (
                    <UploadHero onPick={() => fileRef.current?.click()} onPaste={() => navigate("/projects/new?paste=1")} />
                ) : data?.items.length ? (
                    <>
                        <div className={`drama-library-grid ${query.isPlaceholderData ? "is-stale" : ""}`}>
                            {data.items.map((item) => <DramaCard key={item.project.id} item={item} onDelete={() => confirmDelete(item)} />)}
                        </div>
                        <PaginationBar current={page} pageSize={pageSize} total={data.total} pageSizeOptions={PAGE_SIZES} onChange={(next, size) => { setPage(next); setPageSize(size); }} />
                    </>
                ) : (
                    <WorkspaceState icon="projects" title={keyword ? t("coverageUi.070", { value0: keyword }) : t("coverageUi.071")} description={t("coverageUi.072")} action={<Button onClick={() => { setKeyword(""); setStatus("all"); }}>{t("pluginUi.clearFilters")}</Button>} />
                )}

                {dragging ? (
                    <div className="drama-library-drop" aria-hidden>
                        <div><FileUp className="size-8" /><strong>{t("coverageUi.073")}</strong><span>{t("coverageUi.074")}</span></div>
                    </div>
                ) : null}
                <input ref={fileRef} type="file" accept={ACCEPT} className="hidden" onChange={(event) => { const file = event.target.files?.[0]; if (file) openFile(file); event.target.value = ""; }} />
            </div>
        </WorkspacePage>
    );
}

/** 还没有作品时的上传引导；有作品后整页都可拖入，不再常驻占位。 */
function UploadHero({ onPick, onPaste }: { onPick: () => void; onPaste: () => void }) {
    const { t } = useInterfaceTranslation();
    return (
        <div className="drama-drop drama-library-hero">
            <span className="drama-drop-icon"><BookOpenText className="size-7" /></span>
            <h2>{t("coverageUi.075")}</h2>
            <p>{t("coverageUi.076")}</p>
            <div className="flex flex-wrap justify-center gap-2">
                <Button type="primary" size="large" icon={<FileUp className="size-4" />} onClick={onPick}>{t("coverageUi.077")}</Button>
                <Button size="large" icon={<ClipboardPaste className="size-4" />} onClick={onPaste}>{t("coverageUi.062")}</Button>
            </div>
            <div className="drama-drop-steps">{PIPELINE.map((step, index) => <span key={step}><b>{index + 1}</b>{t(step)}</span>)}</div>
        </div>
    );
}


function DramaCover({ item }: { item: DramaListItem }) {
    const covers = (item.coverResourceIds?.length ? item.coverResourceIds : item.coverResourceId ? [item.coverResourceId] : []).slice(0, 4);
    if (!covers.length) {
        return (
            <div className="drama-library-cover is-empty">
                <span className="drama-library-glyph">{item.project.name.slice(0, 1)}</span>
                <Clapperboard className="drama-library-empty-icon" />
            </div>
        );
    }
    return (
        <div className={`drama-library-cover is-${covers.length}`}>
            {covers.map((id) => <span key={id}><MediaThumb resourceId={id} alt="" /></span>)}
        </div>
    );
}

function DramaCard({ item, onDelete }: { item: DramaListItem; onDelete: () => void }) {
    const { t } = useInterfaceTranslation();
    const progress = item.episodeCount ? Math.round((item.doneCount / item.episodeCount) * 100) : 0;
    const needsAction = item.status === "paused" && Boolean(item.pauseReason);
    const stage = item.episodeCount ? t("dramaUi.completedEpisodes", { done: item.doneCount, total: item.episodeCount }) : item.status === "running" ? "正在改编小说" : item.status === "draft" ? "尚未开始" : "等待分集";
    return (
        <article className={`drama-library-card is-${item.status}`}>
            <Link to={`/dramas/${item.project.id}`} className="drama-library-open" aria-label={t("coverageUi.078", { value0: item.project.name })}>
                <DramaCover item={item} />
                <span className={`drama-chip drama-library-badge is-${needsAction ? "paused" : item.status}`}><span className="drama-dot" />{needsAction ? t("projectUi.needsAttention") : t(STATUS_LABEL[item.status])}</span>
                <div className="drama-library-body">
                    <h3 title={item.project.name}>{item.project.name}</h3>
                    <div className="drama-library-meta">
                        {item.styleName ? <span>{item.styleName}</span> : null}
                        <span>{item.aspectRatio}</span>
                        <RelativeTime value={item.updatedAt || item.project.updatedAt} />
                    </div>
                    <div className="drama-library-progress">
                        <span className="drama-library-progress-bar"><span style={progressFillStyle(Math.max(progress, item.episodeCount && progress === 0 ? 2 : progress))} /></span>
                        <span className="drama-library-progress-text"><b>{stage}</b>{item.spentMicrocredits ? <span>{formatCredits(item.spentMicrocredits)} {t("credits")}</span> : null}</span>
                    </div>
                    {needsAction ? <p className="drama-library-alert" title={item.pauseReason}>{item.pauseReason}</p> : null}
                </div>
            </Link>
            <div className="drama-library-menu">
                <Dropdown trigger={["click"]} placement="bottomRight" menu={{ items: [{ key: "open", icon: <ExternalLink className="size-3.5" />, label: <Link to={`/dramas/${item.project.id}`}>{t("coverageUi.079")}</Link> }, { type: "divider" }, { key: "delete", danger: true, icon: <Trash2 className="size-3.5" />, label: t("coverageUi.080"), onClick: onDelete }] }}>
                    <button type="button" className="product-icon-button" aria-label={t("projectUi.moreActionsForChapter", { title: item.project.name })}><MoreHorizontal /></button>
                </Dropdown>
            </div>
        </article>
    );
}
