import { ArrowRight, BookOpenText, CheckCircle2, CircleAlert, Clapperboard, Clock3, Film, PackageCheck, PlaySquare, Scissors, UsersRound } from "lucide-react";
import { Link } from "react-router";

import { WorkspaceState } from "@/components/layout/workspace-state";
import type { ProjectStageCell, ProjectWorkbenchAction } from "@/lib/project-workbench";
import type { ProjectOverview, ProjectOverviewMetrics } from "@/services/api/projects";
import type { InterfaceMessageKey, InterfaceTranslate } from "@/lib/interface-locale";
import { useInterfaceTranslation } from "@/stores/use-interface-locale-store";

import { formatTime, type ProjectDetailViewProps } from "./shared";

export default function ProjectOverviewView({ detail, overview }: ProjectDetailViewProps & { overview: ProjectOverview }) {
    const { locale, t } = useInterfaceTranslation();
    const { project } = detail;
    const metrics = overview.metrics;
    const completedUnits = metrics.completedUnitCount;
    const attentionCount = metrics.pendingCandidateCount + metrics.staleArtifactCount;
    const completion = metrics.unitCount ? Math.round((completedUnits / metrics.unitCount) * 100) : 0;
    const firstUnitId = detail.units.slice().sort((left, right) => left.position - right.position)[0]?.id || overview.units[0]?.unit.id;
    const workflowHref = (targetStage: string) => firstUnitId ? `/projects/${project.id}/workflow/${firstUnitId}/${targetStage}` : `/projects/${project.id}/chapters`;
    const stage = overviewStage(metrics, t);
    const actions = overviewActions(project.id, metrics, firstUnitId, t).slice(0, 3);
    const primaryAction = actions[0];
    const secondaryActions = actions.slice(1);
    const unitStages = overview.units.map((item) => ({
        unit: item.unit,
        content: stageCell(item.unit.wordCount > 0, item.unit.wordCount > 0 ? t("projectUi.stageWordCount" as InterfaceMessageKey, { count: formatCompactCount(item.unit.wordCount, locale, t) }) : t("projectUi.stageContentPending" as InterfaceMessageKey)),
        assets: stageCell(item.candidateCount === 0 && item.shotCount > 0, item.candidateCount ? t("projectUi.stageCandidatesPending" as InterfaceMessageKey, { count: item.candidateCount }) : item.shotCount ? t("projectUi.stageAssetsConfirmed" as InterfaceMessageKey) : t("projectUi.stageAssetsNotSplit" as InterfaceMessageKey), item.candidateCount > 0),
        storyboard: stageCell(item.shotCount > 0, item.shotCount ? t("projectUi.stageShotCount" as InterfaceMessageKey, { count: item.shotCount }) : t("projectUi.stageStoryboardPending" as InterfaceMessageKey)),
        canvas: stageCell(item.canvasCount > 0, item.canvasCount ? t("projectUi.stageCanvasCount" as InterfaceMessageKey, { count: item.canvasCount }) : t("projectUi.stageCanvasUnlinked" as InterfaceMessageKey)),
    }));
    const productionSteps = [
        { id: "story", icon: BookOpenText, label: t("projectUi.productionStepStory" as InterfaceMessageKey), description: t("projectUi.productionStepStoryDescription" as InterfaceMessageKey), metric: t("projectUi.metricChaptersAndWords" as InterfaceMessageKey, { chapters: metrics.unitCount, words: formatCompactCount(metrics.totalWordCount, locale, t) }), href: `/projects/${project.id}/chapters`, complete: metrics.unitCount > 0 },
        { id: "assets", icon: UsersRound, label: t("projectUi.productionStepAssets" as InterfaceMessageKey), description: t("projectUi.productionStepAssetsDescription" as InterfaceMessageKey), metric: t("projectUi.metricAssets" as InterfaceMessageKey, { count: metrics.assetCount }), href: `/projects/${project.id}/assets`, complete: metrics.assetCount > 0 },
        { id: "storyboard", icon: Clapperboard, label: t("projectUi.productionStepStoryboard" as InterfaceMessageKey), description: t("projectUi.productionStepStoryboardDescription" as InterfaceMessageKey), metric: t("projectUi.metricShotsAndImages" as InterfaceMessageKey, { shots: metrics.shotCount, images: metrics.readyStoryboardCount }), href: workflowHref("storyboard"), complete: metrics.shotCount > 0 },
        { id: "previz", icon: PlaySquare, label: t("projectUi.productionStepPreviz" as InterfaceMessageKey), description: t("projectUi.productionStepPrevizDescription" as InterfaceMessageKey), metric: t("projectUi.metricReadyShots" as InterfaceMessageKey, { ready: metrics.readyPrevizCount, total: metrics.shotCount || 0 }), href: workflowHref("previz"), complete: metrics.shotCount > 0 && metrics.readyPrevizCount === metrics.shotCount },
        { id: "video", icon: Film, label: t("projectUi.productionStepVideo" as InterfaceMessageKey), description: t("projectUi.productionStepVideoDescription" as InterfaceMessageKey), metric: t("projectUi.metricReadyShots" as InterfaceMessageKey, { ready: metrics.readyVideoCount, total: metrics.shotCount || 0 }), href: workflowHref("video"), complete: metrics.shotCount > 0 && metrics.readyVideoCount === metrics.shotCount },
        { id: "editor", icon: Scissors, label: t("projectUi.productionStepEditor" as InterfaceMessageKey), description: t("projectUi.productionStepEditorDescription" as InterfaceMessageKey), metric: metrics.renderSucceededCount > 0 ? t("projectUi.metricRenderedVideos" as InterfaceMessageKey, { count: metrics.renderSucceededCount }) : metrics.shotCount > 0 && metrics.readyVideoCount === metrics.shotCount ? t("projectUi.metricReadyToEdit" as InterfaceMessageKey) : t("projectUi.metricShotsRemaining" as InterfaceMessageKey, { count: Math.max(0, metrics.shotCount - metrics.readyVideoCount) }), href: `/projects/${project.id}/editor`, complete: metrics.renderSucceededCount > 0 },
        { id: "delivery", icon: PackageCheck, label: t("projectUi.productionStepDelivery" as InterfaceMessageKey), description: t("projectUi.productionStepDeliveryDescription" as InterfaceMessageKey), metric: metrics.readyVideoCount && metrics.readyVideoCount === metrics.shotCount ? t("projectUi.metricReadyToDeliver" as InterfaceMessageKey) : t("projectUi.metricShotsRemaining" as InterfaceMessageKey, { count: Math.max(0, metrics.shotCount - metrics.readyVideoCount) }), href: workflowHref("delivery"), complete: metrics.shotCount > 0 && metrics.readyVideoCount === metrics.shotCount },
    ];
    const gaps = [
        metrics.unitCount === 0 ? t("projectUi.gapNoChapters" as InterfaceMessageKey) : metrics.unitsWithoutText ? t("projectUi.gapUnitsWithoutText" as InterfaceMessageKey, { count: metrics.unitsWithoutText }) : t("projectUi.gapChapterTextReady" as InterfaceMessageKey),
        metrics.pendingCandidateCount ? t("projectUi.gapAssetsAwaitingConfirmation" as InterfaceMessageKey, { count: metrics.pendingCandidateCount }) : metrics.assetCount ? t("projectUi.gapProjectAssetsReady" as InterfaceMessageKey) : t("projectUi.gapNoCharacterAssets" as InterfaceMessageKey),
        metrics.shotCount ? metrics.readyVideoCount === metrics.shotCount ? t("projectUi.gapAllVideosGenerated" as InterfaceMessageKey) : t("projectUi.gapVideosRemaining" as InterfaceMessageKey, { count: metrics.shotCount - metrics.readyVideoCount }) : t("projectUi.gapNoStoryboardShots" as InterfaceMessageKey),
    ];

    return (
        <div className="space-y-8">
            <section className="project-overview-focus">
                <div className="grid lg:grid-cols-[minmax(0,1fr)_308px]">
                    <div className="project-overview-primary">
                        <div className="project-overview-eyebrow">
                            <span>{t("projectUi.currentTask" as InterfaceMessageKey)}</span>
                            <span className="project-overview-eyebrow-divider" aria-hidden>/</span>
                            <span className="project-overview-eyebrow-stage">{stage.label}</span>
                            {attentionCount ? <span className="project-overview-eyebrow-badge">{t("projectUi.itemsNeedAttention" as InterfaceMessageKey, { count: attentionCount })}</span> : null}
                        </div>
                        <h2 className="project-overview-title">{primaryAction.title}</h2>
                        <p className="project-overview-description">{primaryAction.description}</p>
                        <div className="project-overview-cta">
                            {/* 主按钮走 --btn-solid-* 配对色：原先是 bg-[--workspace-accent] + text-white，
                                而暗色下该 accent 是 #f5f5f5，等于白底白字。 */}
                            <Link to={primaryAction.href} className="project-overview-cta-primary">
                                <span className="truncate">{primaryAction.actionLabel}</span><ArrowRight className="size-4 shrink-0" />
                            </Link>
                            {secondaryActions[0] ? <Link to={secondaryActions[0].href} className="project-overview-cta-secondary">{t("projectUi.continueNextStep" as InterfaceMessageKey)}<ArrowRight className="size-3.5" /></Link> : null}
                        </div>
                    </div>

                    <aside className="project-overview-status" aria-label={t("projectUi.projectProgress" as InterfaceMessageKey)}>
                        <div className="project-overview-progress">
                            <div className="project-overview-progress-head">
                                <span className="project-overview-status-label">{t("projectUi.chapterProgress" as InterfaceMessageKey)}</span>
                                <span className="project-overview-progress-percent">{t("projectUi.percentComplete" as InterfaceMessageKey, { percent: completion })}</span>
                            </div>
                            <div className="project-overview-progress-count">{completedUnits}<span>/ {metrics.unitCount}</span></div>
                            <div className="project-overview-progress-track" aria-label={t("projectUi.chapterCompletion" as InterfaceMessageKey, { percent: completion })}><div style={{ width: `${completion}%` }} /></div>
                        </div>
                        <dl className="project-overview-facts">
                            <ProjectFact label={t("projectUi.currentStage" as InterfaceMessageKey)} value={stage.label} />
                            <ProjectFact label={t("projectUi.storyboardShots" as InterfaceMessageKey)} value={t("projectUi.shotCount" as InterfaceMessageKey, { count: metrics.shotCount })} />
                            <ProjectFact label={t("projectUi.projectCanvases" as InterfaceMessageKey)} value={t("projectUi.canvasCount" as InterfaceMessageKey, { count: metrics.canvasCount })} />
                            <ProjectFact label={t("projectUi.needsAttention" as InterfaceMessageKey)} value={t("projectUi.itemCount" as InterfaceMessageKey, { count: attentionCount })} attention={attentionCount > 0} />
                        </dl>
                        {secondaryActions.length ? (
                            <div className="project-overview-next">
                                <span className="project-overview-status-label">{t("projectUi.upNext" as InterfaceMessageKey)}</span>
                                <div className="mt-2 space-y-0.5">{secondaryActions.map((action) => <SecondaryAction key={action.id} action={action} />)}</div>
                            </div>
                        ) : null}
                    </aside>
                </div>
            </section>

            <section className="project-standard-flow">
                <div className="project-standard-flow-head"><div><span>{t("projectUi.standardProductionFlow" as InterfaceMessageKey)}</span><h2>{t("projectUi.productionFlowTitle" as InterfaceMessageKey)}</h2><p>{t("projectUi.productionFlowDescription" as InterfaceMessageKey)}</p></div><Link to={primaryAction.href}>{t("projectUi.continueCurrentTask" as InterfaceMessageKey)}<ArrowRight /></Link></div>
                <div className="project-standard-flow-track">
                    {productionSteps.map((step, index) => { const Icon = step.icon; return <Link key={step.id} to={step.href} className={step.complete ? "is-complete" : ""}><span className="project-standard-flow-index">{step.complete ? <CheckCircle2 /> : index + 1}</span><span className="project-standard-flow-icon"><Icon /></span><strong>{step.label}</strong><p>{step.description}</p><em>{step.metric}</em><ArrowRight className="project-standard-flow-arrow" /></Link>; })}
                </div>
                <div className="project-standard-flow-footer"><div><strong>{t("projectUi.currentProductionChecks" as InterfaceMessageKey)}</strong>{gaps.map((gap, index) => <span key={gap}><i className={index === 2 && metrics.readyVideoCount !== metrics.shotCount ? "is-attention" : ""} />{gap}</span>)}</div><div><strong>{t("projectUi.quickLinks" as InterfaceMessageKey)}</strong><Link to={`/projects/${project.id}/chapters`}>{t("projectUi.organizeChapters" as InterfaceMessageKey)}</Link><Link to={`/projects/${project.id}/assets`}>{t("projectUi.confirmAssets" as InterfaceMessageKey)}</Link><Link to={workflowHref("video")}>{t("projectUi.continueShotProduction" as InterfaceMessageKey)}</Link></div></div>
            </section>

            <section>
                <div className="project-pipeline-head">
                    <div className="min-w-0">
                        <h2 className="project-pipeline-title">{t("projectUi.chapterProgress" as InterfaceMessageKey)}</h2>
                        <p className="project-pipeline-hint">{t("projectUi.chapterPipelineHint" as InterfaceMessageKey)}</p>
                    </div>
                    <Link to={`/projects/${project.id}/chapters`} className="project-pipeline-more">{t("projectUi.viewAllChapters" as InterfaceMessageKey)}<ArrowRight className="size-3.5" /></Link>
                </div>

                {unitStages.length ? (
                    <div className="project-pipeline-surface">
                        {unitStages.map((item) => (
                            <Link key={item.unit.id} to={`/projects/${project.id}/chapters/${item.unit.id}`} className="project-pipeline-row group">
                                <span className="project-pipeline-chapter">
                                    <span className="project-pipeline-index">{String(item.unit.position + 1).padStart(2, "0")}</span>
                                    <span className="min-w-0"><span className="project-pipeline-chapter-title">{item.unit.title}</span><span className="project-pipeline-chapter-time">{t("projectUi.updatedAt" as InterfaceMessageKey, { time: formatTime(item.unit.updatedAt, locale) })}</span></span>
                                </span>
                                <StagePipeline content={item.content} assets={item.assets} storyboard={item.storyboard} canvas={item.canvas} t={t} />
                                <ArrowRight className="project-pipeline-arrow size-4" />
                            </Link>
                        ))}
                    </div>
                ) : <div className="project-pipeline-surface p-2"><WorkspaceState icon="projects" compact title={t("projectUi.gapNoChapters" as InterfaceMessageKey)} description={t("projectUi.chapterPipelineEmptyDescription" as InterfaceMessageKey)} /></div>}
            </section>
        </div>
    );
}

function formatCompactCount(value: number, locale: string, t: InterfaceTranslate) {
    return value >= 10_000 ? t("projectUi.compactTenThousands" as InterfaceMessageKey, { value: Math.round(value / 1_000) / 10 }) : value.toLocaleString(locale);
}

function ProjectFact({ label, value, attention = false }: { label: string; value: string; attention?: boolean }) {
    return <div className="min-w-0"><dt>{label}</dt><dd className={attention ? "is-attention" : ""}>{value}</dd></div>;
}

function SecondaryAction({ action }: { action: ProjectWorkbenchAction }) {
    const Icon = action.tone === "danger" ? CircleAlert : action.tone === "attention" ? Clock3 : CheckCircle2;
    return <Link to={action.href} className="project-overview-next-item group"><Icon className={`size-3.5 shrink-0 ${action.tone === "danger" ? "text-foreground/80" : action.tone === "attention" ? "text-foreground/60" : "text-foreground/30"}`} /><span className="min-w-0 flex-1 truncate">{action.title}</span><ArrowRight className="size-3 shrink-0 text-foreground/25 transition group-hover:text-foreground/55" /></Link>;
}

function StagePipeline({ content, assets, storyboard, canvas, t }: { content: ProjectStageCell; assets: ProjectStageCell; storyboard: ProjectStageCell; canvas: ProjectStageCell; t: InterfaceTranslate }) {
    const stages = [{ label: t("projectUi.stageContent" as InterfaceMessageKey), cell: content }, { label: t("projectUi.stageAssets" as InterfaceMessageKey), cell: assets }, { label: t("projectUi.stageStoryboard" as InterfaceMessageKey), cell: storyboard }, { label: t("projectUi.stageCanvas" as InterfaceMessageKey), cell: canvas }];
    return (
        <span className="project-pipeline-stages">
            {stages.map(({ label, cell }) => <StageStep key={label} label={label} cell={cell} />)}
        </span>
    );
}

function StageStep({ label, cell }: { label: string; cell: ProjectStageCell }) {
    return (
        <span className={`project-pipeline-stage is-${cell.state}`}>
            <span className="project-pipeline-stage-label">{label}</span>
            <span className="project-pipeline-stage-track" />
            <span className="project-pipeline-stage-value">{cell.label}</span>
        </span>
    );
}

function overviewStage(metrics: ProjectOverviewMetrics, t: InterfaceTranslate) {
    if (!metrics.unitCount) return { label: t("projectUi.summaryStagePrepareStory" as InterfaceMessageKey), detail: t("projectUi.stageAddOrImportChapters" as InterfaceMessageKey) };
    if (metrics.pendingCandidateCount) return { label: t("projectUi.stageAssetConfirmation" as InterfaceMessageKey), detail: t("projectUi.stageItemsAwaitingConfirmation" as InterfaceMessageKey, { count: metrics.pendingCandidateCount }) };
    if (!metrics.shotCount || metrics.unitsWithoutShots) return { label: t("projectUi.stageStoryboardPreparation" as InterfaceMessageKey), detail: t("projectUi.stageUnitsNeedStoryboards" as InterfaceMessageKey, { count: metrics.unitsWithoutShots || metrics.unitCount }) };
    if (metrics.readyVideoCount < metrics.shotCount) return { label: t("projectUi.stageShotProduction" as InterfaceMessageKey), detail: t("projectUi.stageVideosReadyCount" as InterfaceMessageKey, { ready: metrics.readyVideoCount, total: metrics.shotCount }) };
    return { label: t("projectUi.stageDeliveryReview" as InterfaceMessageKey), detail: t("projectUi.stageVideosReady" as InterfaceMessageKey) };
}

function overviewActions(projectId: string, metrics: ProjectOverviewMetrics, firstUnitId: string | undefined, t: InterfaceTranslate): ProjectWorkbenchAction[] {
    const projectRoot = `/projects/${projectId}`;
    const workflowHref = firstUnitId ? `${projectRoot}/workflow/${firstUnitId}/video` : `${projectRoot}/chapters`;
    if (!metrics.unitCount) {
        return [{ id: "add-story", title: t("projectUi.actionAddFirstChapter" as InterfaceMessageKey), description: t("projectUi.actionAddFirstChapterDescription" as InterfaceMessageKey), href: `${projectRoot}/chapters`, actionLabel: t("projectUi.actionAddChapter" as InterfaceMessageKey), tone: "default" }];
    }
    const actions: ProjectWorkbenchAction[] = [];
    if (metrics.unitsWithoutText) {
        actions.push({ id: "complete-story", title: t("projectUi.actionCompleteChapterText" as InterfaceMessageKey, { count: metrics.unitsWithoutText }), description: t("projectUi.actionCompleteChapterTextDescription" as InterfaceMessageKey), href: `${projectRoot}/chapters`, actionLabel: t("projectUi.actionOrganizeChapters" as InterfaceMessageKey), tone: "attention" });
    }
    if (metrics.pendingCandidateCount) {
        actions.push({ id: "confirm-assets", title: t("projectUi.actionConfirmAssetCandidates" as InterfaceMessageKey, { count: metrics.pendingCandidateCount }), description: t("projectUi.actionConfirmAssetCandidatesDescription" as InterfaceMessageKey), href: `${projectRoot}/assets`, actionLabel: t("projectUi.actionConfirm" as InterfaceMessageKey), tone: "attention" });
    }
    if (!metrics.shotCount || metrics.unitsWithoutShots) {
        actions.push({ id: "create-storyboards", title: t("projectUi.actionCreateChapterStoryboards" as InterfaceMessageKey, { count: metrics.unitsWithoutShots || metrics.unitCount }), description: t("projectUi.actionCreateChapterStoryboardsDescription" as InterfaceMessageKey), href: firstUnitId ? `${projectRoot}/chapters/${firstUnitId}` : `${projectRoot}/chapters`, actionLabel: t("projectUi.actionCreateStoryboards" as InterfaceMessageKey), tone: "default" });
    }
    if (metrics.shotCount && metrics.readyVideoCount < metrics.shotCount) {
        actions.push({ id: "continue-video", title: t("projectUi.actionContinueShotVideos" as InterfaceMessageKey, { count: metrics.shotCount - metrics.readyVideoCount }), description: t("projectUi.actionContinueShotVideosDescription" as InterfaceMessageKey), href: workflowHref, actionLabel: t("projectUi.actionContinueProduction" as InterfaceMessageKey), tone: metrics.staleArtifactCount ? "attention" : "default" });
    }
    if (!metrics.canvasCount) {
        actions.push({ id: "create-canvas", title: t("projectUi.actionCreateFirstCanvas" as InterfaceMessageKey), description: t("projectUi.actionCreateFirstCanvasDescription" as InterfaceMessageKey), href: `${projectRoot}/canvases`, actionLabel: t("projectUi.actionViewCanvases" as InterfaceMessageKey), tone: "default" });
    }
    if (!actions.length) {
        actions.push({ id: "review-delivery", title: t("projectUi.actionReviewDelivery" as InterfaceMessageKey), description: t("projectUi.actionReviewDeliveryDescription" as InterfaceMessageKey), href: workflowHref, actionLabel: t("projectUi.actionCheckDelivery" as InterfaceMessageKey), tone: "default" });
    }
    return actions;
}

function stageCell(complete: boolean, label: string, attention = false): ProjectStageCell {
    return { label, state: attention ? "attention" : complete ? "completed" : "idle" };
}
