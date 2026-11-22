import { Button } from "antd";
import { useQuery } from "@tanstack/react-query";
import { Clock3, Film, Layers3, PackageCheck } from "lucide-react";
import { Link } from "react-router";

import { ASSET_CATEGORIES } from "@/lib/asset-category";
import { listProjectAssetsPage, type ProjectDetail } from "@/services/api/projects";
import type { InterfaceMessageKey } from "@/lib/interface-locale";
import { useInterfaceTranslation } from "@/stores/use-interface-locale-store";

import { assetCategoryLabel, formatDuration, MetricCard, StageHeading } from "./workflow-shared";

export function StoryStage({ detail, projectId, unitId }: { detail: ProjectDetail; projectId: string; unitId: string }) {
    const unit = detail.units.find((item) => item.id === unitId)!;
    const { t } = useInterfaceTranslation();
    return <section className="mx-auto max-w-5xl"><StageHeading eyebrow={t("projectUi.storyStageEyebrow" as InterfaceMessageKey)} title={unit.title} description={t("projectUi.storyStageDescription" as InterfaceMessageKey)} /><div className="mt-6 rounded-xl border border-border/70 bg-surface p-5"><div className="mb-3 flex items-center justify-between"><span className="text-xs font-medium text-foreground/55">{t("projectUi.chapterOriginalText" as InterfaceMessageKey)}</span><Link to={`/projects/${projectId}/chapters/${unit.id}`}><Button size="small">{t("projectUi.editChapter" as InterfaceMessageKey)}</Button></Link></div><div className="max-h-[60vh] whitespace-pre-wrap text-sm leading-7 text-foreground/78">{unit.sourceText || t("projectUi.chapterBodyEmpty" as InterfaceMessageKey)}</div></div></section>;
}

export function AssetsStage({ detail, projectId, unitId }: { detail: ProjectDetail; projectId: string; unitId: string }) {
    const { locale, t } = useInterfaceTranslation();
    const candidates = detail.assetCandidates.filter((item) => !item.unitId || item.unitId === unitId);
    const assetCountsQuery = useQuery({ queryKey: ["project", projectId, "assets", "workflow-counts"], queryFn: () => listProjectAssetsPage(projectId, { page: 1, pageSize: 1 }) });
    const confirmedCounts = assetCountsQuery.data?.categoryCounts || {};
    return <section className="mx-auto max-w-6xl"><StageHeading eyebrow={t("projectUi.assetsStageEyebrow" as InterfaceMessageKey)} title={t("projectUi.assetsStageTitle" as InterfaceMessageKey)} description={t("projectUi.assetsStageDescription" as InterfaceMessageKey)} /><div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">{ASSET_CATEGORIES.map((category) => { const confirmed = confirmedCounts[category] || 0; const pending = candidates.filter((item) => item.category === category && item.status === "pending_confirmation").length; return <div key={category} className="border-t border-border/70 py-4"><div className="text-xs font-medium text-foreground/55">{assetCategoryLabel(category, t)}</div><div className="mt-3 text-2xl font-semibold">{assetCountsQuery.isLoading ? "—" : new Intl.NumberFormat(locale).format(confirmed)}</div><div className="mt-1 text-[var(--fs-micro)] text-foreground/42">{t("projectUi.confirmedAndPending" as InterfaceMessageKey, { confirmed: t("projectUi.confirmed" as InterfaceMessageKey), count: new Intl.NumberFormat(locale).format(pending), pending: t("projectUi.pending" as InterfaceMessageKey) })}</div></div>; })}</div><div className="mt-5 flex items-center justify-between border-y border-border/70 py-5"><div><h3 className="text-sm font-semibold">{t("projectUi.assetLibraryVersionMaintenance" as InterfaceMessageKey)}</h3><p className="mt-1 text-xs text-foreground/48">{t("projectUi.assetLibraryWorkflowHint" as InterfaceMessageKey)}</p></div><Link to={`/projects/${projectId}/assets`}><Button type="primary">{t("projectUi.openAssetLibrary" as InterfaceMessageKey)}</Button></Link></div></section>;
}

export function DeliveryStage({ detail, unitId }: { detail: ProjectDetail; unitId: string }) {
    const { locale, t } = useInterfaceTranslation();
    const shots = detail.shots.filter((item) => item.unitId === unitId);
    const readyVideos = shots.filter((shot) =>
        detail.shotArtifacts.some((item) => item.shotId === shot.id && item.type === "video" && item.selected && item.status === "ready"),
    );
    const stale = detail.shotArtifacts.filter((item) => item.unitId === unitId && item.status === "stale").length;

    return (
        <section className="mx-auto max-w-5xl">
            <StageHeading
                eyebrow={t("projectUi.deliveryStageEyebrow" as InterfaceMessageKey)}
                title={t("projectUi.deliveryStageTitle" as InterfaceMessageKey)}
                description={t("projectUi.deliveryStageDescription" as InterfaceMessageKey)}
            />
            <div className="mt-6 grid gap-4 sm:grid-cols-3">
                <MetricCard icon={<Film className="size-5" />} label={t("projectUi.readyVideos" as InterfaceMessageKey)} value={`${new Intl.NumberFormat(locale).format(readyVideos.length)} / ${new Intl.NumberFormat(locale).format(shots.length)}`} />
                <MetricCard
                    icon={<Clock3 className="size-5" />}
                    label={t("projectUi.totalDuration" as InterfaceMessageKey)}
                    value={formatDuration(shots.reduce((total, item) => total + item.durationMs, 0))}
                />
                <MetricCard icon={<Layers3 className="size-5" />} label={t("projectUi.staleArtifacts" as InterfaceMessageKey)} value={new Intl.NumberFormat(locale).format(stale)} />
            </div>
            <div className="mt-5 border-y border-border/70 py-5">
                <div className="flex items-start gap-3">
                    <PackageCheck className="mt-0.5 size-5 text-[var(--workspace-accent)]" />
                    <div>
                        <h3 className="text-sm font-semibold">{t("projectUi.plannedDeliveryContents" as InterfaceMessageKey)}</h3>
                        <p className="mt-1 text-xs leading-5 text-foreground/48">
                            {t("projectUi.plannedDeliveryFiles" as InterfaceMessageKey)}
                        </p>
                    </div>
                </div>
                <p className="mt-5 text-xs leading-5 text-foreground/48">
                    {t("projectUi.deliveryExportUnavailable" as InterfaceMessageKey)}
                </p>
            </div>
        </section>
    );
}
