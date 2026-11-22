import type { ReactNode } from "react";
import { Check, CircleAlert } from "lucide-react";
import { Link } from "react-router";

import { StatusBadge } from "@/components/ui/base/badges";
import { normalizeAssetCategory, type AssetCategory } from "@/lib/asset-category";
import type { InterfaceMessageKey, InterfaceTranslate } from "@/lib/interface-locale";
import { useInterfaceTranslation } from "@/stores/use-interface-locale-store";
import type { ProjectDetail, ProjectShot, ShotArtifact, ShotRevision, WorkflowStep } from "@/services/api/projects";
import type { TaskStatus } from "@/services/api/task-center";

export type ShortDramaWorkflowStage = "story" | "assets" | "storyboard" | "previz" | "video" | "delivery";

export const workflowStages: Array<{ key: ShortDramaWorkflowStage; labelKey: InterfaceMessageKey; shortLabelKey: InterfaceMessageKey }> = [
    { key: "story", labelKey: "projectUi.workflowStageStory" as InterfaceMessageKey, shortLabelKey: "projectUi.workflowStageStoryShort" as InterfaceMessageKey },
    { key: "assets", labelKey: "projectUi.workflowStageAssets" as InterfaceMessageKey, shortLabelKey: "projectUi.workflowStageAssetsShort" as InterfaceMessageKey },
    { key: "storyboard", labelKey: "projectUi.workflowStageStoryboard" as InterfaceMessageKey, shortLabelKey: "projectUi.workflowStageStoryboardShort" as InterfaceMessageKey },
    { key: "previz", labelKey: "projectUi.workflowStagePreviz" as InterfaceMessageKey, shortLabelKey: "projectUi.workflowStagePrevizShort" as InterfaceMessageKey },
    { key: "video", labelKey: "projectUi.workflowStageVideo" as InterfaceMessageKey, shortLabelKey: "projectUi.workflowStageVideoShort" as InterfaceMessageKey },
    { key: "delivery", labelKey: "projectUi.workflowStageDelivery" as InterfaceMessageKey, shortLabelKey: "projectUi.workflowStageDeliveryShort" as InterfaceMessageKey },
];

export function WorkflowStageLink({ href, active, step, index, label, shortLabel }: { href: string; active: boolean; step?: WorkflowStep; index: number; label: string; shortLabel: string }) {
    const completed = step?.status === "completed" || step?.status === "skipped";
    const failed = step?.status === "failed";
    return (
        <Link to={href} className={`workflow-stage-link ${active ? "is-active" : ""}`} aria-current={active ? "step" : undefined}>
            <span className={`workflow-stage-index ${completed ? "is-completed" : failed ? "is-failed" : ""}`}>
                {completed ? <Check className="size-3" /> : failed ? <CircleAlert className="size-3" /> : index + 1}
            </span>
            <span className="sm:hidden">{shortLabel}</span>
            <span className="hidden sm:inline">{label}</span>
        </Link>
    );
}

export function StageHeading({ eyebrow, title, description }: { eyebrow: string; title: string; description: string }) {
    return <div><div className="text-[var(--fs-micro)] font-medium uppercase tracking-[.18em] text-[var(--workspace-accent)]">{eyebrow}</div><h2 className="mt-2 text-xl font-semibold tracking-tight text-foreground sm:text-2xl">{title}</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-foreground/50">{description}</p></div>;
}

export function MetricCard({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
    return <div className="rounded-xl border border-border/70 bg-surface p-5"><div className="text-foreground/35">{icon}</div><div className="mt-4 text-2xl font-semibold">{value}</div><div className="mt-1 text-xs text-foreground/45">{label}</div></div>;
}

export function ArtifactStatus({ artifact, taskStatus }: { artifact?: ShotArtifact; taskStatus?: TaskStatus; compact?: boolean }) {
    const { t } = useInterfaceTranslation();
    if (taskStatus === "queued" || taskStatus === "running" || (taskStatus === "succeeded" && !artifact)) {
        return <StatusBadge variant="filled" tone="loading" label={t("projectUi.statusGenerating" as InterfaceMessageKey)} />;
    }
    if (taskStatus === "failed") return <StatusBadge variant="filled" tone="error" label={t("projectUi.statusGenerationFailed" as InterfaceMessageKey)} />;
    if (!artifact) return <StatusBadge variant="filled" tone="neutral" label={t("projectUi.statusNotGenerated" as InterfaceMessageKey)} />;
    const tone = artifact.status === "ready" ? "success" : artifact.status === "failed" ? "error" : artifact.status === "stale" ? "warning" : "loading";
    const label = artifact.status === "ready" ? t("projectUi.statusGenerated" as InterfaceMessageKey) : artifact.status === "failed" ? t("projectUi.statusGenerationFailed" as InterfaceMessageKey) : artifact.status === "stale" ? t("projectUi.statusExpired" as InterfaceMessageKey) : t("projectUi.statusGenerating" as InterfaceMessageKey);
    return <StatusBadge variant="filled" tone={tone} label={label} />;
}

export function currentRevision(detail: ProjectDetail, shot?: ProjectShot): ShotRevision | undefined {
    if (!shot) return undefined;
    const revisions = detail.shotRevisions || [];
    return revisions.find((item) => item.id === shot.currentRevisionId)
        || revisions.filter((item) => item.shotId === shot.id).slice().sort((left, right) => right.version - left.version)[0];
}

export function currentArtifact(detail: ProjectDetail, shotId: string, type: string) {
    const artifacts = (detail.shotArtifacts || []).filter((item) => item.shotId === shotId && item.type === type).slice().sort((left, right) => right.version - left.version);
    return artifacts.find((item) => item.selected) || artifacts[0];
}

export function artifactTypeForStage(stage: ShortDramaWorkflowStage) {
    if (stage === "video") return "video";
    if (stage === "previz") return "action_board";
    return "storyboard";
}

export function assetCategoryLabel(category: string, t: InterfaceTranslate) {
    const categoryKeys: Record<AssetCategory, string> = {
        ark: "library.ark.title",
        character: "projectUi.assetCategoryCharacter" as InterfaceMessageKey,
        environment: "projectUi.assetCategoryEnvironment" as InterfaceMessageKey,
        prop: "projectUi.assetCategoryProp" as InterfaceMessageKey,
        material: "projectUi.assetCategoryMaterial" as InterfaceMessageKey,
        other: "projectUi.assetCategoryOther" as InterfaceMessageKey,
    };
    return t(categoryKeys[normalizeAssetCategory(category)]);
}

export function formatDuration(durationMs: number) {
    if (durationMs < 60_000) return `${Math.round(durationMs / 100) / 10}s`;
    const minutes = Math.floor(durationMs / 60_000);
    const seconds = Math.round((durationMs % 60_000) / 1000);
    return `${minutes}m ${seconds}s`;
}

export function stageActionLabel(step: WorkflowStep | undefined, t: InterfaceTranslate) {
    if (!step || step.status === "pending") return t("projectUi.workflowActionWaiting" as InterfaceMessageKey);
    if (step.status === "running" || step.status === "review") return t("projectUi.workflowActionComplete" as InterfaceMessageKey);
    if (step.status === "completed") return t("projectUi.workflowActionReopen" as InterfaceMessageKey);
    if (step.status === "failed") return t("projectUi.workflowActionRestart" as InterfaceMessageKey);
    return t("projectUi.workflowActionStart" as InterfaceMessageKey);
}
