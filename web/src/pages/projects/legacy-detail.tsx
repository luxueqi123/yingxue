import { lazy, Suspense, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Alert, App } from "antd";
import { ArrowLeft, Plus } from "lucide-react";
import { Link, Navigate, useLocation, useNavigate, useParams } from "react-router";

import { getProjectCore, getProjectOverview, getProjectUnitWorkspace, linkCanvasUnit, listProjectUnits } from "@/services/api/projects";
import { WorkspacePage } from "@/components/layout/workspace-page";
import { WorkspaceErrorState, WorkspaceLoadingState } from "@/components/layout/workspace-state";
import { workspaceBackTarget } from "@/lib/workspace-navigation";
import type { ProjectDetail } from "@/services/api/projects";
import type { InterfaceMessageKey } from "@/lib/interface-locale";
import { useInterfaceTranslation } from "@/stores/use-interface-locale-store";

import { WorkflowChapterNavigator } from "./detail/workflow-chapter-navigator";

const ProjectAssetsView = lazy(() => import("./detail/assets"));
const ProjectCanvasesView = lazy(() => import("./detail/canvases"));
const ProjectChaptersView = lazy(() => import("./detail/chapters"));
const ProjectOverviewView = lazy(() => import("./detail/overview"));
const ProjectSettingsView = lazy(() => import("./detail/settings"));
const ProjectWorkflowView = lazy(() => import("./detail/workflow"));
const ProjectEditorView = lazy(() => import("./detail/editor"));

type DetailView = "overview" | "chapters" | "workflow" | "canvases" | "editor" | "assets" | "settings";

const views: Array<{ key: DetailView; labelKey: string }> = [
    { key: "overview", labelKey: "projectUi.tabOverview" },
    { key: "chapters", labelKey: "projectUi.tabChapters" },
    { key: "workflow", labelKey: "projectUi.tabWorkflow" },
    { key: "canvases", labelKey: "projectUi.tabCanvases" },
    { key: "editor", labelKey: "projectUi.tabEditor" },
    { key: "assets", labelKey: "projectUi.tabAssets" },
    { key: "settings", labelKey: "projectUi.tabSettings" },
];

export default function ProjectDetailPage() {
    const { projectId = "", view, chapterId, unitId, stage } = useParams();
    const navigate = useNavigate();
    const location = useLocation();
    const queryClient = useQueryClient();
    const { message } = App.useApp();
    const { t } = useInterfaceTranslation();
    const tRef = useRef(t);
    tRef.current = t;
    const activeView: DetailView = unitId || view === "workflow" ? "workflow" : chapterId ? "chapters" : views.some((item) => item.key === view) ? view as DetailView : "overview";
    const coreQuery = useQuery({
        queryKey: ["project", projectId, "core"],
        queryFn: () => getProjectCore(projectId),
        enabled: Boolean(projectId),
        refetchOnMount: "always",
    });
    const unitsQuery = useQuery({ queryKey: ["project", projectId, "units"], queryFn: () => listProjectUnits(projectId), enabled: Boolean(projectId) });
    const units = unitsQuery.data?.units || [];
    const firstUnitId = units.slice().sort((left, right) => left.position - right.position)[0]?.id || "";
    const requestedUnitId = chapterId || unitId || "";
    const activeUnitId = units.some((unit) => unit.id === requestedUnitId) ? requestedUnitId : firstUnitId;
    const overviewQuery = useQuery({ queryKey: ["project", projectId, "overview"], queryFn: () => getProjectOverview(projectId), enabled: Boolean(projectId) && activeView === "overview" });
    const workspaceQuery = useQuery({
        queryKey: ["project", projectId, "unit-workspace", activeUnitId],
        queryFn: () => getProjectUnitWorkspace(projectId, activeUnitId),
        enabled: Boolean(projectId && activeUnitId) && (activeView === "chapters" || activeView === "workflow"),
        refetchInterval: (query) => (query.state.data?.tasks || []).some((task) => task.clientContext?.shotId && (task.status === "queued" || task.status === "running")) ? 2_000 : false,
    });
    const project = coreQuery.data?.project;
    const workspace = workspaceQuery.data;
    const detail: ProjectDetail | undefined = project ? {
        project,
        units: workspace?.unit ? units.map((unit) => unit.id === workspace.unit.id ? workspace.unit : unit) : units,
        canvases: [],
        canvasUnitLinks: [],
        unitCanvasCounts: unitsQuery.data?.canvasCounts || {},
        assets: workspace?.assets || [],
        assetFolders: [],
        workflows: workspace?.workflows || [],
        shots: workspace?.shots || [],
        shotRevisions: workspace?.shotRevisions || [],
        shotArtifacts: workspace?.shotArtifacts || [],
        shotReferences: workspace?.shotReferences || [],
        assetCandidates: workspace?.assetCandidates || [],
        tasks: workspace?.tasks || [],
    } : undefined;
    const refreshProject = () => { void queryClient.invalidateQueries({ queryKey: ["project", projectId] }); void queryClient.invalidateQueries({ queryKey: ["projects"] }); };
    const createCanvas = async () => {
        if (detail?.project.status === "archived") { message.warning(tRef.current("projectUi.archivedProjectRestoreFirst" as InterfaceMessageKey)); return; }
        const activeChapterId = chapterId || sessionStorage.getItem(`project-active-chapter:${projectId}`) || "";
        const unit = activeView === "chapters"
            ? detail?.units.find((item) => item.id === activeChapterId) || detail?.units.slice().sort((left, right) => left.position - right.position)[0]
            : undefined;
        const shots = unit ? detail?.shots.filter((shot) => shot.unitId === unit.id) || [] : [];
        try {
            const [{ createCanvasProjectWithRemoteSync }, storyboard] = await Promise.all([
                import("@/services/user-data-sync"),
                unit && shots.length ? import("@/lib/canvas/project-chapter-storyboard") : Promise.resolve(null),
            ]);
            const seed = unit && shots.length ? storyboard?.upsertProjectChapterStoryboard([], [], { unit, shots }) : undefined;
            const initialContent = seed ? { nodes: seed.nodes, connections: seed.connections } : undefined;
            const title = unit ? `${unit.title} · ${tRef.current((shots.length ? "projectUi.storyboardCanvas" : "projectUi.canvas") as InterfaceMessageKey)}` : `${detail?.project.name || tRef.current("projectUi.project" as InterfaceMessageKey)} · ${tRef.current("projectUi.newCanvas" as InterfaceMessageKey)}`;
            const { id, syncError } = await createCanvasProjectWithRemoteSync(title, projectId, initialContent);
            if (syncError) {
                message.warning(syncError instanceof Error ? tRef.current("projectUi.canvasSavedLocallyLinkRetry" as InterfaceMessageKey, { error: syncError.message }) : tRef.current("projectUi.canvasSavedLocallyLinkRetryLater" as InterfaceMessageKey));
                navigate(`/canvas/${id}`, { state: { returnTo: location.pathname + location.search + location.hash, returnState: location.state } });
                return;
            }
            if (unit) {
                try {
                    await linkCanvasUnit(projectId, { canvasId: id, unitId: unit.id, role: "storyboard" });
                } catch (error) {
                    refreshProject();
                    message.error(error instanceof Error ? tRef.current("projectUi.canvasCreatedChapterLinkFailed" as InterfaceMessageKey, { error: error.message }) : tRef.current("projectUi.canvasCreatedChapterLinkFailedGeneric" as InterfaceMessageKey));
                    return;
                }
            }
            refreshProject();
            message.success(unit && shots.length ? tRef.current("projectUi.chapterCanvasCreatedWithShots" as InterfaceMessageKey, { count: shots.length }) : unit ? tRef.current("projectUi.chapterCanvasCreatedLinked" as InterfaceMessageKey) : tRef.current("projectUi.projectCanvasCreated" as InterfaceMessageKey));
            navigate(`/canvas/${id}`, { state: { returnTo: location.pathname + location.search + location.hash, returnState: location.state } });
        } catch (error) {
            message.error(error instanceof Error ? error.message : tRef.current("projectUi.canvasCreateFailed" as InterfaceMessageKey));
        }
    };
    const chapterHref = detail ? projectChapterHref(detail.units, projectId, chapterId) : `/projects/${projectId}/chapters`;
    const workflowHref = detail ? projectWorkflowHref(detail.units, projectId, unitId, stage) : `/projects/${projectId}/workflow`;
    if (coreQuery.isLoading || unitsQuery.isLoading) return <WorkspacePage><WorkspaceLoadingState label={t("projectUi.openingProjectWorkspace" as InterfaceMessageKey)} detail={t("projectUi.loadingProjectAndChapterIndex" as InterfaceMessageKey)} /></WorkspacePage>;
    if (coreQuery.isError || unitsQuery.isError || !detail) return <WorkspacePage><WorkspaceErrorState title={t("projectUi.projectUnavailable" as InterfaceMessageKey)} description={t("projectUi.projectUnavailableDescription" as InterfaceMessageKey)} actionLabel={t("projectUi.backToProjectCenter" as InterfaceMessageKey)} onRetry={() => navigate("/projects")} /></WorkspacePage>;
    if (!chapterId && !unitId && (!view || !views.some((item) => item.key === view))) return <Navigate to={`/projects/${projectId}/overview`} replace />;
    if (chapterId && !units.some((unit) => unit.id === chapterId)) return <Navigate to={firstUnitId ? `/projects/${projectId}/chapters/${firstUnitId}` : `/projects/${projectId}/chapters`} replace />;
    if (unitId && !units.some((unit) => unit.id === unitId)) return <Navigate to={firstUnitId ? `/projects/${projectId}/workflow/${firstUnitId}/${stage || "video"}` : `/projects/${projectId}/workflow`} replace />;
    if (activeView === "workflow" && !unitId && detail.units.length) return <Navigate to={`/projects/${projectId}/workflow/${detail.units.slice().sort((left, right) => left.position - right.position)[0].id}/video`} replace />;
    return (
        <WorkspacePage className="project-workbench-page !overflow-hidden" fluid>
            <div className="flex h-full min-h-0 flex-col">
                <ProjectWorkspaceHeader
                    detail={detail}
                    projectId={projectId}
                    activeView={activeView}
                    unitId={unitId}
                    stage={stage}
                    chapterHref={chapterHref}
                    workflowHref={workflowHref}
                    onCreateCanvas={createCanvas}
                    t={t}
                />
                {detail.project.status === "archived" ? <Alert type="warning" showIcon banner message={t("projectUi.archivedProjectBanner" as InterfaceMessageKey)} className="!border-x-0 !border-t-0" /> : null}
                <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
                    <div className={activeView === "chapters" || activeView === "workflow" || activeView === "editor" ? "min-h-0 flex-1" : "thin-scrollbar min-h-0 flex-1 overflow-y-auto px-3 py-5 sm:px-5 lg:px-8 lg:py-7"}>
                        <Suspense fallback={<WorkspaceLoadingState label={t("projectUi.preparingProjectView" as InterfaceMessageKey)} detail={t("projectUi.preparingProjectViewDetail" as InterfaceMessageKey)} />}>
                            <div className={activeView === "overview" ? "w-full" : activeView === "chapters" || activeView === "workflow" || activeView === "editor" ? "h-full w-full" : "w-full"}>
                                {activeView === "overview" ? overviewQuery.isLoading ? <WorkspaceLoadingState label={t("projectUi.loadingProductionProgress" as InterfaceMessageKey)} detail={t("projectUi.loadingProductionProgressDetail" as InterfaceMessageKey)} /> : overviewQuery.data ? <ProjectOverviewView detail={detail} overview={overviewQuery.data} refreshProject={refreshProject} onCreateCanvas={createCanvas} /> : <WorkspaceErrorState title={t("projectUi.overviewLoadFailed" as InterfaceMessageKey)} description={t("projectUi.tryAgainLater" as InterfaceMessageKey)} onRetry={() => void overviewQuery.refetch()} /> : null}
                                {activeView === "chapters" ? workspaceQuery.isLoading ? <WorkspaceLoadingState label={t("projectUi.loadingCurrentChapter" as InterfaceMessageKey)} detail={t("projectUi.loadingCurrentChapterDetail" as InterfaceMessageKey)} /> : workspaceQuery.isError ? <WorkspaceErrorState title={t("projectUi.chapterLoadFailed" as InterfaceMessageKey)} description={t("projectUi.chapterLoadFailedDescription" as InterfaceMessageKey)} onRetry={() => void workspaceQuery.refetch()} /> : <ProjectChaptersView detail={detail} refreshProject={refreshProject} onCreateCanvas={createCanvas} /> : null}
                                {activeView === "workflow" ? workspaceQuery.isLoading ? <WorkspaceLoadingState label={t("projectUi.loadingCurrentStoryboard" as InterfaceMessageKey)} detail={t("projectUi.loadingCurrentStoryboardDetail" as InterfaceMessageKey)} /> : workspaceQuery.isError ? <WorkspaceErrorState title={t("projectUi.workflowLoadFailed" as InterfaceMessageKey)} description={t("projectUi.workflowLoadFailedDescription" as InterfaceMessageKey)} onRetry={() => void workspaceQuery.refetch()} /> : <ProjectWorkflowView detail={detail} projectId={projectId} unitId={unitId || ""} stage={stage || "video"} /> : null}
                                {activeView === "canvases" ? <ProjectCanvasesView detail={detail} refreshProject={refreshProject} onCreateCanvas={createCanvas} /> : null}
                                {activeView === "assets" ? <ProjectAssetsView detail={detail} refreshProject={refreshProject} onCreateCanvas={createCanvas} /> : null}
                                {activeView === "settings" ? <ProjectSettingsView detail={detail} refreshProject={refreshProject} onCreateCanvas={createCanvas} /> : null}
                                {activeView === "editor" ? <ProjectEditorView detail={detail} /> : null}
                            </div>
                        </Suspense>
                    </div>
                </main>
            </div>
        </WorkspacePage>
    );
}

function ProjectWorkspaceHeader({ detail, projectId, activeView, unitId, stage, chapterHref, workflowHref, onCreateCanvas, t }: { detail: ProjectDetail; projectId: string; activeView: DetailView; unitId?: string; stage?: string; chapterHref: string; workflowHref: string; onCreateCanvas: () => void; t: (key: InterfaceMessageKey) => string }) {
    const back = workspaceBackTarget(useLocation().state, "/projects/legacy");
    const archived = detail.project.status === "archived";
    const createCanvasLabel = t((activeView === "chapters" && detail.units.length ? "projectUi.createCurrentChapterCanvas" : "projectUi.createProjectCanvas") as InterfaceMessageKey);
    return (
        <header className="project-workspace-header">
            <div className="project-workspace-identity">
                <Link to={back.to} state={back.state} replace className="project-workspace-back" aria-label={t("projectUi.backToProjectList" as InterfaceMessageKey)}>
                    <ArrowLeft />
                    <span className="sr-only">{t("projectUi.back" as InterfaceMessageKey)}</span>
                </Link>
                <div className="project-workspace-title">
                    <h1 title={detail.project.name}>{detail.project.name}</h1>
                    <span className={`project-workspace-status ${archived ? "is-archived" : "is-active"}`}>{t((archived ? "projectUi.summaryStageArchived" : "projectUi.statusActive") as InterfaceMessageKey)}</span>
                </div>
            </div>
            <nav className="project-workspace-tabs" aria-label={t("projectUi.projectNavigation" as InterfaceMessageKey)}>
                {views.map((item) => {
                    const active = item.key === activeView;
                    const href = item.key === "chapters" ? chapterHref : item.key === "workflow" ? workflowHref : `/projects/${projectId}/${item.key}`;
                    return (
                        <Link
                            key={item.key}
                            to={href}
                            aria-current={active ? "page" : undefined}
                            className={`project-workspace-tab ${active ? "is-active" : ""}`}
                        >
                            {t(item.labelKey as InterfaceMessageKey)}
                        </Link>
                    );
                })}
            </nav>
            <div className="project-workspace-actions">
                {activeView === "workflow" ? (
                    <WorkflowChapterNavigator projectId={projectId} units={detail.units} unitId={unitId} stage={stage} />
                ) : (
                    <button type="button" onClick={onCreateCanvas} className="project-workspace-create" aria-label={createCanvasLabel} title={createCanvasLabel}>
                        <Plus />
                        <span>{t("projectUi.newCanvas" as InterfaceMessageKey)}</span>
                    </button>
                )}
            </div>
        </header>
    );
}

function projectWorkflowHref(units: Array<{ id: string; position: number }>, projectId: string, routeUnitId?: string, routeStage?: string) {
    const targetId = [routeUnitId, sessionStorage.getItem(`project-active-chapter:${projectId}`) || ""].find((id) => id && units.some((unit) => unit.id === id)) || units.slice().sort((left, right) => left.position - right.position)[0]?.id;
    return targetId ? `/projects/${projectId}/workflow/${targetId}/${routeStage || "video"}` : `/projects/${projectId}/workflow`;
}

function projectChapterHref(units: Array<{ id: string; position: number }>, projectId: string, routeChapterId?: string) {
    const rememberedId = sessionStorage.getItem(`project-active-chapter:${projectId}`) || "";
    const targetId = [routeChapterId, rememberedId].find((id) => id && units.some((unit) => unit.id === id)) || units.slice().sort((left, right) => left.position - right.position)[0]?.id;
    return targetId ? `/projects/${projectId}/chapters/${targetId}` : `/projects/${projectId}/chapters`;
}
