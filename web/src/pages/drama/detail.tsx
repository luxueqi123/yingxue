import { useInterfaceTranslation } from "@/stores/use-interface-locale-store";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { App, Button } from "antd";
import { ArrowLeft, CheckCheck, Clapperboard, Film, Inbox, Pause, Pencil, Play, ScrollText, Settings2, Sparkles, UsersRound } from "lucide-react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router";

import { WorkspacePage } from "@/components/layout/workspace-page";
import { WorkspaceErrorState, WorkspaceLoadingState } from "@/components/layout/workspace-state";
import { approveDramaEpisode, deleteDramaShot, generateDramaSegments, insertDramaShot, pauseDrama, reprocessDramaSegmentVideo, regenerateDramaCast, releaseDramaMedia, renameDramaEpisode, rescriptDramaEpisode, retryFailedDrama, startDrama, updateDramaSegment, updateDramaSegmentReferences, writeDramaSegmentPrompts, updateDramaShot, type DramaInboxItem, type DramaJob, type DramaModelChoice, type DramaSegment, type DramaShot, type DramaShotPatch } from "@/services/api/drama";

import { formatCount, formatDuration, sourceFormatOf, StagePips, STAGE_LABEL, STATUS_LABEL } from "./drama-shared";
import { CastPanel, InboxPanel, SettingsPanel } from "./studio/panels";
import { EpisodeRail } from "./studio/episode-rail";
import { AddEpisodeModal } from "./studio/episode-source";
import { FinalView } from "./studio/final-view";
import { StudioGenesis } from "./studio/genesis";
import { SegmentDialog } from "./studio/segment-dialog";
import { QueueBar } from "./studio/queue-bar";
import { ScriptView } from "./studio/script-view";
import { Storyboard, type EpisodeEmpty } from "./studio/storyboard";
import { isTypingTarget, useDramaCast, useDramaEpisode, useDramaInvalidate, useDramaSummary } from "./studio/use-studio";
import { progressFillStyle } from "@/lib/drama/progress-fill";
import "./drama.css";

type Tab = "board" | "script" | "final";
type StudioView = "production" | "cast" | "inbox" | "settings";

export default function DramaStudioPage() {
    const { t } = useInterfaceTranslation();
    const { projectId = "", episodeId: routeEpisodeId = "" } = useParams();
    const navigate = useNavigate();
    const { message, modal } = App.useApp();
    const [searchParams, setSearchParams] = useSearchParams();
    const tab = (["board", "script", "final"].includes(searchParams.get("tab") || "") ? searchParams.get("tab") : "board") as Tab;
    const shotParam = searchParams.get("shot") || "";
    const view = (["cast", "inbox", "settings"].includes(searchParams.get("view") || "") ? searchParams.get("view") : "production") as StudioView;
    const castFocus = searchParams.get("cast") || "";
    const [renaming, setRenaming] = useState(false);
    const [adding, setAdding] = useState(false);
    const invalidate = useDramaInvalidate(projectId);

    const summaryQuery = useDramaSummary(projectId);
    const summary = summaryQuery.data;
    const episodes = summary?.episodes || [];
    const episodeId = episodes.some((episode) => episode.id === routeEpisodeId) ? routeEpisodeId : (episodes.find((episode) => episode.stage === "review") || episodes.find((episode) => episode.stage !== "done") || episodes[0])?.id || "";
    const episodeRow = episodes.find((episode) => episode.id === episodeId);
    const awaitingCount = episodes.filter((episode) => episode.awaitingMedia).length;
    const running = summary?.production.status === "running";
    const episodeQuery = useDramaEpisode(projectId, episodeId, Boolean(running || (summary?.jobCounts.running || 0) > 0));
    const detail = episodeQuery.data?.episode.id === episodeId ? episodeQuery.data : undefined;
    const { cast, byId: castById } = useDramaCast(projectId, Boolean(running));
    const shots = useMemo(() => detail?.shots || [], [detail]);
    const currentShot = shots.find((shot) => shot.id === shotParam);

    const setParams = useCallback((patch: Record<string, string | null>) => {
        const next = new URLSearchParams(searchParams);
        for (const [key, value] of Object.entries(patch)) {
            if (value) next.set(key, value);
            else next.delete(key);
        }
        setSearchParams(next, { replace: true });
    }, [searchParams, setSearchParams]);
    const selectEpisode = useCallback((id: string) => {
        navigate({ pathname: `/dramas/${projectId}/e/${id}`, search: tab === "board" ? "" : `?tab=${tab}` });
    }, [navigate, projectId, tab]);
    const segmentParam = searchParams.get("segment");
    const openSegmentIndex = segmentParam !== null && /^\d+$/.test(segmentParam) ? Number(segmentParam) : undefined;
    // 剧情段弹窗的打开状态放在地址里，刷新或从待处理跳转都能直接回到同一段、同一镜头。
    const openSegment = useCallback((index: number | null, shotId?: string) => setParams({ segment: index === null ? null : String(index), shot: index === null ? null : shotId || null }), [setParams]);
    const openView = useCallback((next: StudioView, extra: Record<string, string | null> = {}) => setParams({ view: next === "production" ? null : next, cast: null, ...extra }), [setParams]);

    // [ / ] 切换上一集 / 下一集。
    useEffect(() => {
        const onKey = (event: KeyboardEvent) => {
            if (isTypingTarget(event.target) || event.metaKey || event.ctrlKey || event.altKey) return;
            if (event.key !== "[" && event.key !== "]") return;
            const index = episodes.findIndex((episode) => episode.id === episodeId);
            const next = episodes[index + (event.key === "]" ? 1 : -1)];
            if (next) selectEpisode(next.id);
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [episodeId, episodes, selectEpisode]);

    const errorMessage = (error: unknown, fallback: string) => message.error(error instanceof Error ? error.message : fallback);
    const toggleRun = useMutation({
        mutationFn: () => (running ? pauseDrama(projectId) : startDrama(projectId)),
        onSuccess: () => { invalidate(episodeId); message.success(running ? "已暂停，正在运行的任务完成后停止" : "已继续制作"); },
        onError: (error) => errorMessage(error, "操作失败"),
    });
    const patchShot = useMutation({
        mutationFn: ({ shot, patch }: { shot: DramaShot; patch: DramaShotPatch }) => updateDramaShot(projectId, shot.id, patch),
        onSuccess: () => { invalidate(episodeId); message.success(t("coverageUi.001")); },
        onError: (error) => errorMessage(error, "保存失败"),
    });
    const insertShot = useMutation({
        mutationFn: ({ shot, position }: { shot: DramaShot; position: "before" | "after" }) => insertDramaShot(projectId, shot.id, position),
        onSuccess: ({ shot }) => { invalidate(episodeId); setParams({ shot: shot.id }); message.success(t("coverageUi.002")); },
        onError: (error) => errorMessage(error, "插入失败"),
    });
    const removeShot = useMutation({
        mutationFn: (shot: DramaShot) => deleteDramaShot(projectId, shot.id),
        onSuccess: () => { invalidate(episodeId); setParams({ shot: null }); message.success(t("coverageUi.003")); },
        onError: (error) => errorMessage(error, "删除失败"),
    });
    const saveSegment = useMutation({
        mutationFn: ({ segment, override }: { segment: DramaSegment; override: string }) => updateDramaSegment(projectId, episodeId, segment.index, override),
        onSuccess: (_, { override }) => { invalidate(episodeId); message.success(override ? "已保存完整视频提示词" : "已恢复模型撰写的版本"); },
        onError: (error) => errorMessage(error, "保存失败"),
    });
    const saveReferences = useMutation({
        mutationFn: ({ segment, castIds }: { segment: DramaSegment; castIds: string[] | null }) => updateDramaSegmentReferences(projectId, episodeId, segment.index, castIds === null ? { autoReferences: true } : { referenceCastIds: castIds, autoReferences: false }),
        onSuccess: (_, { castIds }) => { invalidate(episodeId); message.success(castIds ? "已更新本段参考图；参考图编号变了，请重新撰写视频提示词" : "已恢复按镜头自动取参考图"); },
        onError: (error) => errorMessage(error, "保存失败"),
    });
    const writeSegment = useMutation({
        mutationFn: (indexes: number[]) => writeDramaSegmentPrompts(projectId, episodeId, indexes),
        onSuccess: (result) => { invalidate(episodeId); message.success(t("coverageUi.004", { value0: result.queued })); },
        onError: (error) => errorMessage(error, "操作失败"),
    });
    const approve = useMutation({
        mutationFn: () => approveDramaEpisode(projectId, episodeId),
        onSuccess: () => { invalidate(episodeId); message.success(episodeRow?.number === 1 && summary?.production.settings.reviewMode === "sample" ? "样片已确认，全剧开始自动制作" : "已通过，开始生成视频"); },
        onError: (error) => errorMessage(error, "操作失败"),
    });
    const generateSegments = useMutation({
        mutationFn: ({ segments, videoModel }: { segments: number[]; videoModel?: DramaModelChoice }) => generateDramaSegments(projectId, episodeId, segments, videoModel),
        onSuccess: (result, { segments }) => {
            invalidate(episodeId);
            const label = segments.length > 1 ? `${segments.length} 段` : `第 ${segments[0] + 1} 段`;
            message.success(t("coverageUi.005", { value0: label, value1: result.queued }));
        },
        onError: (error) => errorMessage(error, "生成失败"),
    });
    const reprocessSegment = useMutation({
        mutationFn: (segmentIndex: number) => reprocessDramaSegmentVideo(projectId, episodeId, segmentIndex),
        onSuccess: (_, segmentIndex) => { invalidate(episodeId); message.success(t("coverageUi.006", { value0: segmentIndex + 1 })); },
        onError: (error) => { invalidate(episodeId); errorMessage(error, "重新处理失败"); },
    });
    const rescript = useMutation({
        mutationFn: () => rescriptDramaEpisode(projectId, episodeId),
        onSuccess: () => { invalidate(episodeId); setParams({ shot: null, segment: null }); message.success(running ? "正在重新改编本集" : "已继续制作，正在重新改编本集"); },
        // 剧本已重置但恢复制作被拒（如预算或模型不可用）时，也要刷新到真实状态。
        onError: (error) => { invalidate(episodeId); errorMessage(error, "操作失败"); },
    });
    const retry = useMutation({
        mutationFn: () => retryFailedDrama(projectId),
        onSuccess: (result) => { invalidate(episodeId); message.success(t("coverageUi.007", { value0: result.segments + result.casts })); },
        onError: (error) => errorMessage(error, "重试失败"),
    });
    // 收件箱按组重试：设定重做参考图（不连带剧情段），剧情段失败统一重新排队。
    const [retryingGroup, setRetryingGroup] = useState("");
    const retryGroup = useMutation({
        mutationFn: async ({ items }: { key: string; items: DramaInboxItem[] }) => {
            const castIds = items.filter((item) => item.kind === "cast_failed" && item.castId).map((item) => item.castId!);
            await Promise.all(castIds.map((id) => regenerateDramaCast(projectId, id, false)));
            if(items.some(item=>item.kind==="segment_failed")) await retryFailedDrama(projectId);
            return items.length;
        },
        onMutate: ({ key }) => setRetryingGroup(key),
        onSettled: () => setRetryingGroup(""),
        onSuccess: (count) => { invalidate(episodeId); message.success(t("coverageUi.007", { value0: count })); },
        onError: (error) => errorMessage(error, "重试失败"),
    });
    // 手动模式：先看剧本、设定与段提示词，确认后再逐集或全部开始生成参考图与段视频。
    const release = useMutation({
        mutationFn: ({ target, episodeIds }: { target: "assets" | "episodes" | "all"; episodeIds?: string[] }) => releaseDramaMedia(projectId, target, episodeIds),
        onSuccess: (_, { target }) => {
            invalidate(episodeId);
            message.success(target === "assets" ? "开始生成角色、道具与场景参考图" : target === "all" ? "全部集开始生成参考图与段视频" : "本集开始生成参考图与段视频");
        },
        onError: (error) => errorMessage(error, "操作失败"),
    });
    const confirmReleaseAll = () => modal.confirm({
        title: t("coverageUi.008", { value0: awaitingCount }),
        content: "会生成角色、道具与场景参考图，并按剧情段为这些集生成带对白与音效的视频，按实际用量计费。建议先挑一集生成，确认画风与角色形象后再全部开始。",
        okText: "全部开始",
        cancelText: "再看看",
        centered: true,
        onOk: () => release.mutateAsync({ target: "all" }),
    });
    const rename = useMutation({
        mutationFn: (title: string) => renameDramaEpisode(projectId, episodeId, title),
        onSuccess: () => { invalidate(episodeId); setRenaming(false); },
        onError: (error) => errorMessage(error, "重命名失败"),
    });
    const busy = approve.isPending || rescript.isPending || generateSegments.isPending || release.isPending || insertShot.isPending || removeShot.isPending || saveReferences.isPending;

    const openInbox = (item: DramaInboxItem) => {
        if (item.castId) { openView("cast", { cast: item.castId }); return; }
        if (item.kind === "paused") { openView("settings"); return; }
        if (item.episodeId) navigate({ pathname: `/dramas/${projectId}/e/${item.episodeId}`, search: item.kind==="segment_failed" ? `?segment=${item.segmentIndex}` : "" });
    };
    const jumpToJob = (job: DramaJob) => {
        if (job.episodeId) navigate({ pathname: `/dramas/${projectId}/e/${job.episodeId}`, search: "" });
    };

    if (summaryQuery.isLoading) return <WorkspacePage><WorkspaceLoadingState label={t("coverageUi.009")} /></WorkspacePage>;
    if (summaryQuery.isError || !summary) return <WorkspacePage><WorkspaceErrorState title={t("coverageUi.010")} description={t("coverageUi.011")} actionLabel="返回作品列表" onRetry={() => navigate("/projects")} /></WorkspacePage>;

    const { production } = summary;
    const doneEpisodes = episodes.filter((episode) => episode.stage === "done" && !episode.finalStale).length;
    const progress = episodes.length ? doneEpisodes / episodes.length : 0;
    const aspectRatio = production.settings.aspectRatio;
    const sampleReview=production.settings.reviewMode==="sample"&&!production.sampleApproved&&detail?.episode.number===1&&detail.episode.stage==="done"&&!detail.episode.finalStale;
 const reviewing=sampleReview||(production.settings.reviewMode==="every"&&detail?.episode.stage==="review");
    // 手动模式下流水线可能在“运行”却无事可做：明确告诉用户在等他放行。
    const waitingForMedia = awaitingCount > 0 && !(summary.jobCounts.running || summary.jobCounts.queued) && production.status === "running";
    // 本集还没有镜头时按真实状态说明：失败、暂停、未开始、排队都不能显示成“正在编写”。
    const episodeEmpty: EpisodeEmpty = detail?.episode.error
        ? { title: t("coverageUi.012"), text: "失败原因见上方提示。可以直接重新改编本集，或在底部队列全部重试。", active: false, action: <Button type="primary" loading={rescript.isPending} onClick={() => rescript.mutate()}>{t("coverageUi.013")}</Button> }
        : production.status === "paused"
          ? { title: t("coverageUi.014"), text: "继续制作后会立即为本集编写剧本与分镜。", active: false, action: <Button type="primary" icon={<Play className="size-4" />} loading={toggleRun.isPending} onClick={() => toggleRun.mutate()}>{t("projectUi.actionContinueProduction")}</Button> }
          : production.status === "draft"
            ? { title: t("coverageUi.015"), text: "点击右上角“开始制作”后按集编写剧本与分镜。", active: false }
            : detail?.episode.stage === "queued"
              ? { title: t("coverageUi.016"), text: "同时只改编少量集，前面的集写完剧本后会自动开始本集。", active: false }
              : { title: t("coverageUi.017"), text: "剧本按剧情段切分，每段生成一个带对白和镜头切换的视频。", active: true };
    const sampleWaiting = production.settings.reviewMode === "sample" && !production.sampleApproved && episodeRow && episodeRow.number !== 1 && ["prompts","review","video"].includes(episodeRow.stage);

    return (
        <WorkspacePage className="!overflow-hidden" fluid scroll={false}>
            <div className="drama-root drama-studio">
                <header className="drama-topbar">
                    <Link to="/projects"><Button type="text" shape="circle" icon={<ArrowLeft className="size-4" />} aria-label={t("drama.create.backToProjects")} /></Link>
                    <div className="drama-topbar-title">
                        <h1 title={summary.project.name}>{summary.project.name}</h1>
                        {waitingForMedia ? <span className="drama-chip is-ready"><span className="drama-dot" />{t("coverageUi.018")}</span> : <span className={`drama-chip is-${production.status}`}><span className="drama-dot" />{t(STATUS_LABEL[production.status])}</span>}
                    </div>
                    {episodes.length ? (
                        <div className="drama-topbar-progress">
                            <span className="drama-meter" aria-label={t("coverageUi.019", { value0: Math.round(progress * 100) })}><span style={progressFillStyle(Math.max(progress * 100, 2))} /></span>
                            <span>{doneEpisodes}/{episodes.length} {t("coverageUi.020")}{production.planDone ? "" : t("coverageUi.021")}</span>
                            <span>· {formatCount(production.chapterCount)} {t("coverageUi.022")}</span>
                        </div>
                    ) : null}
                    <nav className="drama-nav" aria-label={t("coverageUi.023")}>
                        <button type="button" className="drama-nav-item" aria-current={view === "production" ? "page" : undefined} onClick={() => openView("production")}><Clapperboard className="size-4" />{t("coverageUi.024")}</button>
                        <button type="button" className="drama-nav-item" aria-current={view === "cast" ? "page" : undefined} onClick={() => openView("cast")}><UsersRound className="size-4" />{t("coverageUi.025")}{summary.castCount ? <span className="drama-nav-count">{summary.castCount}</span> : null}</button>
                        <button type="button" className="drama-nav-item" aria-current={view === "inbox" ? "page" : undefined} onClick={() => openView("inbox")}><Inbox className="size-4" />{t("projectUi.pending")}{summary.inbox.length ? <span className="drama-nav-count is-alert">{summary.inbox.length > 99 ? "99+" : summary.inbox.length}</span> : null}</button>
                        <button type="button" className="drama-nav-item" aria-current={view === "settings" ? "page" : undefined} onClick={() => openView("settings")}><Settings2 className="size-4" />{t("settings")}</button>
                    </nav>
                    <div className="drama-topbar-actions">
                        {awaitingCount ? <Button icon={<Sparkles className="size-4" />} loading={release.isPending && release.variables?.target === "all"} onClick={confirmReleaseAll}>{t("coverageUi.026")} {awaitingCount} {t("drama.create.episodeCountUnit")}</Button> : null}
                        {production.status !== "completed" ? (
                            <Button type={running ? "default" : "primary"} icon={running ? <Pause className="size-4" /> : <Play className="size-4" />} loading={toggleRun.isPending} onClick={() => toggleRun.mutate()}>{running ? t("assetsUi.pausePreview") : production.status === "draft" ? t("coverageUi.027") : t("projectUi.actionContinueProduction")}</Button>
                        ) : null}
                    </div>
                </header>

                {view === "cast" ? <CastPanel projectId={projectId} cast={cast} ratios={{ character: production.settings.assets.characterRatio }} focusId={castFocus} retrying={retry.isPending} assetsPending={production.settings.mediaMode === "manual" && !production.assetsReleased} releasing={release.isPending && release.variables?.target === "assets"} onReleaseAssets={() => release.mutate({ target: "assets" })} onFocus={(id) => setParams({ cast: id })} onRetry={() => retry.mutate()} onChanged={() => invalidate(episodeId)} />
                : view === "inbox" ? <InboxPanel items={summary.inbox} castById={castById} retrying={retry.isPending} retryingGroup={retryingGroup} releasing={release.isPending} onRetryAll={() => retry.mutate()} onRetryGroup={(key, items) => retryGroup.mutate({ key, items })} onOpen={openInbox} onOpenSettings={() => openView("settings")} onReleaseAll={confirmReleaseAll} />
                : view === "settings" ? <SettingsPanel projectId={projectId} summary={summary} cast={cast} onChanged={() => invalidate(episodeId)} />
                : !episodes.length ? <StudioGenesis summary={summary} /> : (
                    <div className={`drama-body is-inspector-hidden ${openSegmentIndex !== undefined ? "is-covered" : ""}`}>
                        <EpisodeRail episodes={episodes} currentId={episodeId} planning={!production.planDone} onSelect={selectEpisode} onAdd={() => setAdding(true)} />
                        <main className="drama-main">
                            {episodeRow ? (
                                <div className="drama-ep-header">
                                    <div className="drama-ep-heading">
                                        <div className="drama-eyebrow">{t("dramaUi.episodeNumber", { number: episodeRow.number })} · {t(STAGE_LABEL[episodeRow.stage])}</div>
                                        {renaming ? (
                                            <div className="drama-title-editor">
                                                <input className="drama-title-input" autoFocus defaultValue={episodeRow.title} maxLength={60} aria-label={t("coverageUi.030")} disabled={rename.isPending}
                                                    onFocus={(event) => event.currentTarget.select()}
                                                    onBlur={(event) => { const title = event.target.value.trim(); if (title && title !== episodeRow.title) rename.mutate(title); else setRenaming(false); }}
                                                    onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); if (event.key === "Escape") setRenaming(false); }} />
                                                <span className="drama-title-hint">{t("coverageUi.031")}</span>
                                            </div>
                                        ) : (
                                            <h2 title={episodeRow.title}>{episodeRow.title}<button type="button" className="drama-title-edit" aria-label={t("coverageUi.032")} onClick={() => setRenaming(true)}><Pencil className="size-3.5" /></button></h2>
                                        )}
                                        <p>
                                            <span>{t("dramaUi.shots", { count: episodeRow.shotCount })}</span>
                                            {episodeRow.durationMs ? <span>{formatDuration(episodeRow.durationMs)}</span> : null}
                                            <StagePips episode={episodeRow} size="md" />
                                        </p>
                                    </div>
                                    <div className="drama-tabs" role="tablist" aria-label={t("coverageUi.034")}>
                                        <button type="button" role="tab" className="drama-tab" aria-selected={tab === "script"} onClick={() => setParams({ tab: "script" })}><ScrollText className="size-3.5" />{t("previewScripts")}</button>
                                        <button type="button" role="tab" className="drama-tab" aria-selected={tab === "board"} onClick={() => setParams({ tab: null })}><Clapperboard className="size-3.5" />{t("settingsMemoryCategoryStoryboard")}</button>
                                        <button type="button" role="tab" className="drama-tab" aria-selected={tab === "final"} onClick={() => setParams({ tab: "final" })}><Film className="size-3.5" />{t("previewFilms")}</button>
                                    </div>
                                </div>
                            ) : null}
                            <div className="drama-banners">
                            {production.status === "paused" ? (
                                <div className="drama-banner">
                                    <div className="drama-banner-text"><strong>{t("coverageUi.035")}</strong><span title={production.pauseReason || undefined}>{production.pauseReason || t("coverageUi.036")}</span></div>
                                    <Button size="small" type="primary" icon={<Play className="size-3.5" />} loading={toggleRun.isPending} onClick={() => toggleRun.mutate()}>{t("projectUi.actionContinueProduction")}</Button>
                                </div>
                            ) : null}
                            {episodeRow?.awaitingMedia ? (
                                <div className="drama-banner is-ready">
                                    <Sparkles className="size-5 shrink-0 text-[var(--workspace-accent)]" />
                                    <div className="drama-banner-text">
                                        <strong>{t("coverageUi.037")}</strong>
                                        <span>{t("coverageUi.038")}</span>
                                    </div>
                                    <div className="flex shrink-0 gap-2">
                                        {tab !== "script" ? <Button onClick={() => setParams({ tab: "script" })}>{t("coverageUi.039")}</Button> : null}
                                        <Button type="primary" icon={<Sparkles className="size-4" />} loading={release.isPending && release.variables?.target === "episodes"} onClick={() => release.mutate({ target: "episodes", episodeIds: [episodeRow.id] })}>{t("coverageUi.040")}</Button>
                                    </div>
                                </div>
                            ) : null}
                            {reviewing ? (
                                <div className="drama-banner is-info">
                                    <CheckCheck className="size-5 shrink-0 text-[var(--workspace-accent)]" />
                                    <div className="drama-banner-text">
                                        <strong>{sampleReview ? t("coverageUi.041") : t("coverageUi.042")}</strong>
                                        <span>{sampleReview ? t("coverageUi.043") : t("coverageUi.044")}</span>
                                    </div>
                                    <Button type="primary" loading={approve.isPending} onClick={() => approve.mutate()}>{sampleReview ? t("coverageUi.045") : t("coverageUi.046")}</Button>
                                </div>
                            ) : null}
                            {sampleWaiting ? <div className="drama-banner is-info"><div className="drama-banner-text"><strong>{t("coverageUi.047")}</strong><span>{t("coverageUi.048")}</span></div><Button size="small" onClick={() => selectEpisode(episodes[0].id)}>{t("coverageUi.049")}</Button></div> : null}
                            {detail?.episode.error ? (
                                <div className="drama-banner is-error">
                                    <div className="drama-banner-text"><strong>{t("coverageUi.050")}</strong><span>{detail.episode.error}</span></div>
                                    <span className="text-[var(--fs-tiny)] text-foreground/50">{t("coverageUi.051")}</span>
                                </div>
                            ) : null}
                            </div>
                            <div className="drama-scroll thin-scrollbar">
                                {!detail ? <WorkspaceLoadingState label={t("coverageUi.052")} rows={2} /> : tab === "board" ? (
                                    <Storyboard
                                        shots={shots}
                                        segments={detail.segments}
                                        aspectRatio={aspectRatio}
                                        castById={castById}
                                        defaultVideoModel={production.settings.models.video}
                                        busy={busy}
                                        keyboardEnabled={openSegmentIndex === undefined && view === "production"}
                                        onOpen={openSegment}
                                        onGenerate={(segments, videoModel) => generateSegments.mutate({ segments, videoModel })}
                                        onReprocess={(index) => reprocessSegment.mutate(index)}
                                        reprocessing={reprocessSegment.isPending ? reprocessSegment.variables : undefined}
                                        onWritePrompts={(indexes) => writeSegment.mutate(indexes)}
                                        empty={episodeEmpty}
                                    />
                                ) : tab === "script" ? (
                                    <ScriptView
                                        projectId={projectId}
                                        detail={detail}
                                        storyboard={production.settings.storyboard}
                                        currentId={currentShot?.id || ""}
                                        busy={busy}
                                        onCurrent={(id) => setParams({ shot: id })}
                                        onRescript={() => rescript.mutate()}
                                        onPatchShot={(shot, patch) => patchShot.mutate({ shot, patch })}
                                        onInsertShot={(shot, position) => insertShot.mutate({ shot, position })}
                                        onDeleteShot={(shot) => removeShot.mutate(shot)}
                                        onSourceSaved={(again) => { invalidate(episodeId); if (again) rescript.mutate(); }}
                                        empty={episodeEmpty}
                                    />
                                ) : (
                                    <FinalView title={summary.project.name} detail={detail} aspectRatio={aspectRatio} onOpenSegment={(index) => setParams({ tab: null, segment: String(index), shot: null })} />
                                )}
                            </div>
                        </main>
                        <SegmentDialog
                            detail={tab === "board" ? detail : undefined}
                            segmentIndex={openSegmentIndex}
                            shotId={currentShot?.id}
                            castById={castById}
                            aspectRatio={aspectRatio}
                            busy={busy}
                            writing={writeSegment.isPending}
                            onClose={() => openSegment(null)}
                            onNavigate={openSegment}
                            onPatchShot={(shot, patch) => patchShot.mutate({ shot, patch })}
                            onSavePrompt={(segment, override) => saveSegment.mutate({ segment, override })}
                            onSaveReferences={(segment, castIds) => saveReferences.mutate({ segment, castIds })}
                            onWritePrompt={(segment) => writeSegment.mutate([segment.index])}
                            onGenerate={(segment, videoModel) => generateSegments.mutate({ segments: [segment.index], videoModel })}
                            reprocessing={reprocessSegment.isPending}
                            onReprocess={(segment) => reprocessSegment.mutate(segment.index)}
                            defaultVideoModel={production.settings.models.video}
                            onOpenCast={(id) => openView("cast", { cast: id, segment: null, shot: null })}
                        />
                    </div>
                )}

                <QueueBar projectId={projectId} summary={summary} retrying={retry.isPending} onRetry={() => retry.mutate()} onJump={jumpToJob} />
                <AddEpisodeModal
                    open={adding}
                    projectId={projectId}
                    nextNumber={(episodes[episodes.length - 1]?.number || 0) + 1}
                    defaultFormat={sourceFormatOf(episodes[episodes.length - 1]?.sourceFormat)}
                    blockedReason={production.planDone ? undefined : t("coverageUi.053")}
                    onClose={() => setAdding(false)}
                    onAdded={(id) => { setAdding(false); invalidate(id); selectEpisode(id); }}
                />
            </div>
        </WorkspacePage>
    );
}
