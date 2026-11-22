import { StatusBadge } from "@/components/ui/base/badges";
import type { ReactNode } from "react";
import { useInterfaceTranslation } from "@/stores/use-interface-locale-store";

import type { ProjectDetail, ProjectUnit } from "@/services/api/projects";
import { normalizeAssetCategory, type AssetCategory } from "@/lib/asset-category";
import type { InterfaceMessageKey, InterfaceTranslate } from "@/lib/interface-locale";

export type ProjectDetailViewProps = {
    detail: ProjectDetail;
    refreshProject: () => void;
    onCreateCanvas: () => void;
};

export const categoryLabels: Record<AssetCategory, string> = {
    ark: "library.ark.title",
    character: "projectUi.assetCategoryCharacter" as InterfaceMessageKey,
    environment: "projectUi.assetCategoryEnvironment" as InterfaceMessageKey,
    prop: "projectUi.assetCategoryProp" as InterfaceMessageKey,
    material: "projectUi.assetCategoryMaterial" as InterfaceMessageKey,
    other: "projectUi.assetCategoryOther" as InterfaceMessageKey,
};

const mediaMessageKeys: Record<string, InterfaceMessageKey> = {
    image: "projectUi.mediaImage" as InterfaceMessageKey,
    video: "projectUi.mediaVideo" as InterfaceMessageKey,
    audio: "projectUi.mediaAudio" as InterfaceMessageKey,
    text: "projectUi.mediaText" as InterfaceMessageKey,
    model: "projectUi.mediaModel3d" as InterfaceMessageKey,
    entity: "projectUi.mediaCharacterCard" as InterfaceMessageKey,
};

const statusMessageKeys: Record<string, InterfaceMessageKey> = {
    active: "projectUi.statusActive" as InterfaceMessageKey,
    archived: "projectUi.summaryStageArchived" as InterfaceMessageKey,
    draft: "projectUi.statusDraft" as InterfaceMessageKey,
    ready: "projectUi.statusReady" as InterfaceMessageKey,
    completed: "projectUi.statusCompleted" as InterfaceMessageKey,
    review: "projectUi.statusReview" as InterfaceMessageKey,
    confirmed: "projectUi.statusConfirmed" as InterfaceMessageKey,
    pending: "projectUi.statusPending" as InterfaceMessageKey,
    pending_confirmation: "projectUi.statusPendingConfirmation" as InterfaceMessageKey,
    running: "projectUi.statusRunning" as InterfaceMessageKey,
    failed: "projectUi.statusFailed" as InterfaceMessageKey,
    ignored: "projectUi.statusIgnored" as InterfaceMessageKey,
    skipped: "projectUi.statusSkipped" as InterfaceMessageKey,
    cancelled: "projectUi.statusCancelled" as InterfaceMessageKey,
    succeeded: "projectUi.statusSucceeded" as InterfaceMessageKey,
    disabled: "projectUi.statusDisabled" as InterfaceMessageKey,
    idle: "projectUi.statusIdle" as InterfaceMessageKey,
    loading: "projectUi.statusLoading" as InterfaceMessageKey,
    queued: "projectUi.statusQueued" as InterfaceMessageKey,
    success: "projectUi.statusSuccess" as InterfaceMessageKey,
    error: "projectUi.statusError" as InterfaceMessageKey,
    deleted: "projectUi.statusDeleted" as InterfaceMessageKey,
    reserved: "projectUi.statusReserved" as InterfaceMessageKey,
    settled: "projectUi.statusSettled" as InterfaceMessageKey,
    refunded: "projectUi.statusRefunded" as InterfaceMessageKey,
    uncertain: "projectUi.statusUncertain" as InterfaceMessageKey,
};

export function categoryLabel(value: string, t: InterfaceTranslate) {
    return t(categoryLabels[normalizeAssetCategory(value)]);
}

export function statusLabel(value: string, t: InterfaceTranslate) {
    return t(statusMessageKeys[value] || ("projectUi.statusUnknown" as InterfaceMessageKey));
}

export function mediaLabel(value: string, t: InterfaceTranslate) {
    return t(mediaMessageKeys[value] || ("projectUi.mediaOther" as InterfaceMessageKey));
}

export function sourceTypeLabel(value: string, t: InterfaceTranslate) {
    const key = value === "blank" ? "projectUi.sourceBlank" : value === "novel" ? "projectUi.sourceNovel" : value === "text" ? "projectUi.sourceText" : "projectUi.sourceOther";
    return t(key as InterfaceMessageKey);
}

export function StatusPill({ status }: { status: string }) {
    const { t } = useInterfaceTranslation();
    const tone = status === "completed" || status === "confirmed" || status === "succeeded" ? "success" : status === "failed" ? "error" : status === "running" || status === "active" ? "loading" : status === "review" || status === "pending_confirmation" ? "warning" : "neutral";
    return <StatusBadge tone={tone} label={statusLabel(status, t)} className="m-0" />;
}

export function SectionTitle({ eyebrow, title, description, action }: { eyebrow?: string; title: string; description?: string; action?: ReactNode }) {
    return (
        <div className="flex flex-col gap-2 border-b border-border/70 pb-3 sm:flex-row sm:items-end sm:justify-between">
            <div className="min-w-0">
                {eyebrow ? <div className="mb-1 text-[var(--fs-tiny)] font-semibold text-foreground/40">{eyebrow}</div> : null}
                <h2 className="text-lg font-semibold tracking-normal">{title}</h2>
                {description ? <p className="mt-1 text-sm leading-5 text-foreground/55">{description}</p> : null}
            </div>
            {action ? <div className="shrink-0">{action}</div> : null}
        </div>
    );
}

export function MetricTile({ label, value, detail, accent = false }: { label: string; value: string | number; detail?: string; accent?: boolean }) {
    return (
        <div className={`overflow-hidden rounded-lg border px-3 py-3 ${accent ? "border-[color-mix(in_srgb,var(--workspace-accent)_30%,transparent)] bg-[var(--workspace-accent-soft)]" : "border-border/80 bg-background/70"}`}>
            <div className="text-xs text-foreground/50">{label}</div>
            <div className="mt-2 flex items-end gap-2"><strong className="text-2xl font-semibold tracking-normal">{value}</strong>{detail ? <span className="pb-0.5 text-xs text-foreground/45">{detail}</span> : null}</div>
        </div>
    );
}

export function UnitProgress({ unit }: { unit: ProjectUnit }) {
    const progress = unit.status === "completed" ? 100 : unit.status === "ready" ? 66 : 24;
    return <div className="h-1.5 w-20 overflow-hidden rounded-full bg-foreground/10"><div className="h-full rounded-full bg-[var(--workspace-accent)] transition-[width] duration-200" style={{ width: `${progress}%` }} /></div>;
}

export function formatTime(value: string | undefined, locale: string) {
    if (!value) return "-";
    return new Date(value).toLocaleString(locale, { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

export function formatCount(value: number, locale: string) {
    return new Intl.NumberFormat(locale).format(value);
}

export function textValue(value: unknown) {
    return typeof value === "string" ? value.trim() : "";
}
