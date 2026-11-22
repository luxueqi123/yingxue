import { useInterfaceTranslation } from "@/stores/use-interface-locale-store";
import type { InterfaceTranslate, InterfaceMessageKey } from "@/lib/interface-locale";
import { interfaceTranslator } from "@/lib/interface-locale";
import { currentLocale } from "@/i18n";
// 分镜脚本节点的流水线状态条、生成批次详情与编辑器小控件。
import { type CanvasStoryboardPipelineProgress, pipelineStatusLabel, type StoryboardPipelineStage } from "@/lib/canvas/canvas-storyboard-progress";
import { canvasThemes } from "@/lib/canvas-theme";
import { type CanvasGenerationBatch, type CanvasGenerationBatchItem, type CanvasGenerationBatchItemStatus, type CanvasNodeStatus, type StoryboardRow } from "@/types/canvas";
import { Fragment, useEffect, useState } from "react";
import { Image } from "antd";
import { generationErrorMessage, isContentModerationError } from "@/lib/generation-error";
import { Tooltip } from "@/components/ui/base/tooltip";
import { RefreshCw } from "lucide-react";
export function generationBatchRowLabel(items: CanvasGenerationBatchItem[], t: InterfaceTranslate) {
    if (items.length === 1) return generationBatchItemLabel(items[0], t);
    const count = (...statuses: CanvasGenerationBatchItemStatus[]) => items.filter((item) => statuses.includes(item.status)).length;
    const parts = [`${t("projectUi.statusSuccess")} ${count("succeeded")}/${items.length}`];
    const counts: Array<[string, number]> = [
        [t("projectUi.statusFailed"), count("failed")],
        [t("projectUi.statusGenerating"), count("submitting", "queued", "running")],
        [t("projectUi.generationStatusWaiting"), count("waiting")],
        [t("agentChromeStatusStopped"), count("cancelled")],
        [t("helperUi.costUncertain"), items.filter((item) => item.costUncertain).length],
        [t("helperUi.moderationChange"), items.filter((item) => isContentModerationError(item.errorDetails)).length],
    ];
    for (const [label, total] of counts) if (total) parts.push(`${label} ${total}`);
    return parts.join(" · ");
}
export function batchRowTone(items?: CanvasGenerationBatchItem[]): CanvasNodeStatus | undefined {
    if (!items?.length) return undefined;
    const tones = items.map(batchItemTone);
    return tones.includes("error") ? "error" : tones.includes("loading") ? "loading" : tones.includes("idle") ? "idle" : "success";
}
export function VideoStoryFramePreview({ value, shotNumber }: { value: unknown; shotNumber: string | number }) {
    const { t } = useInterfaceTranslation();
    const [failed, setFailed] = useState(false);
    useEffect(() => setFailed(false), [value]);
    let valid = false;
    try {
        valid = typeof value === "string" && new URL(value).protocol === "https:";
    } catch {
        /* Show a visible empty state below. */
    }
    if (!valid) return <span>{value ? t("completeUi.201") : t("completeUi.202")}</span>;
    if (failed) return <span>{t("completeUi.203")}</span>;
    return <Image width={140} height={80} src={value as string} alt={t("completeUi.204", { value0: shotNumber })} loading="lazy" style={{ objectFit: "contain" }} onError={() => setFailed(true)} />;
}
export function storyboardStepState(stage: StoryboardPipelineStage): "done" | "current" | "error" | "idle" {
    if (stage.failed > 0 && stage.success === 0) return "error";
    if (stage.success > 0) return "done";
    if (stage.loading > 0 || stage.incomplete > 0) return "current";
    return "idle";
}
export function StoryboardMiniPipeline({ pipeline, theme, rows }: { pipeline: CanvasStoryboardPipelineProgress; theme: (typeof canvasThemes)[keyof typeof canvasThemes]; rows: StoryboardRow[] }) {
    const { t } = useInterfaceTranslation();
    const steps: Array<{ key: string; label: string; state: "done" | "current" | "error" | "idle"; hint: string }> = [
        { key: "script", label: t("settingsMemoryCategoryStoryboard"), state: rows.length > 0 ? "done" : "idle", hint: rows.length > 0 ? t("canvasScriptDyn015", { count: rows.length }) : t("canvasScriptUi024") },
        { key: "images", label: t("completeUi.205"), state: storyboardStepState(pipeline.images), hint: pipelineStatusLabel(pipeline.images, t) },
        { key: "videos", label: t("contextVideo"), state: storyboardStepState(pipeline.videos), hint: pipelineStatusLabel(pipeline.videos, t) },
        {
            key: "final",
            label: t("entryMergeFilm"),
            state: pipeline.final.success > 0 ? "done" : pipeline.final.failed > 0 ? "error" : pipeline.final.loading > 0 || pipeline.successfulVideoNodeIds.length >= 2 ? "current" : "idle",
            hint: pipelineStatusLabel(pipeline.final, t),
        },
    ];
    return (
        <div
            className="flex h-9 shrink-0 items-center justify-center overflow-hidden border-b px-4"
            style={{ borderColor: theme.node.stroke, background: theme.node.fill }}
            onMouseDown={(event) => event.stopPropagation()}
            onPointerDown={(event) => event.stopPropagation()}
        >
            {steps.map((step, index) => (
                <Fragment key={step.key}>
                    {index > 0 ? <span className="mx-2 h-px min-w-3.5 flex-1 max-w-20" style={{ background: theme.node.stroke }} /> : null}
                    <span
                        className="flex items-center gap-2 whitespace-nowrap text-[var(--fs-tiny)]"
                        title={step.hint}
                        style={{
                            color: step.state === "done" ? theme.node.muted : step.state === "current" ? theme.accent.primary : step.state === "error" ? theme.accent.danger : theme.node.faint,
                            fontWeight: step.state === "current" || step.state === "error" ? 700 : 500,
                        }}
                    >
                        <span
                            className="size-2 shrink-0 rounded-full"
                            style={{
                                background: step.state === "done" ? theme.node.activeStroke : step.state === "current" ? theme.accent.primary : step.state === "error" ? theme.accent.danger : theme.node.stroke,
                                boxShadow: step.state === "current" ? `0 0 0 3px ${theme.accent.primarySoft}` : undefined,
                            }}
                        />
                        {step.label}
                    </span>
                </Fragment>
            ))}
        </div>
    );
}
export function GenerationBatchDetails({ batch, rows, onRetryItem }: { batch: CanvasGenerationBatch; rows: StoryboardRow[]; onRetryItem: (itemId: string) => void }) {
    const { t } = useInterfaceTranslation();
    const shotByRowId = new Map(rows.map((row) => [row.id, row.shotNumber]));
    const rowCounts = new Map<string, number>();
    const rowOutputIndexes = new Map<string, number>();
    for (const item of batch.items) rowCounts.set(item.rowId, (rowCounts.get(item.rowId) || 0) + 1);
    return (
        <div className="w-80" onMouseDown={(event) => event.stopPropagation()} onClick={(event) => event.stopPropagation()}>
            <div className="mb-2 flex items-center justify-between gap-3">
                <span className="text-sm font-semibold">
                    {generationBatchModeLabel(batch, t)} · {t("imageNodeUi.details")}
                </span>
                <span className="text-xs text-foreground/50">
                    {batch.items.length} {t("projectUi.itemUnit")}
                </span>
            </div>
            <div className="thin-scrollbar max-h-72 overflow-y-auto">
                {batch.items.map((item) => {
                    const requiresPromptChange = isContentModerationError(item.errorDetails);
                    const outputIndex = (rowOutputIndexes.get(item.rowId) || 0) + 1;
                    rowOutputIndexes.set(item.rowId, outputIndex);
                    const label = t("completeUi.206", { value0: shotByRowId.get(item.rowId) || "--", value1: (rowCounts.get(item.rowId) || 0) > 1 ? t("completeUi.207", { value0: outputIndex }) : "" });
                    return (
                        <div key={item.id} className="flex min-h-9 items-center gap-2 border-t border-foreground/10 py-2 first:border-t-0">
                            <span className="max-w-[45%] shrink-0 text-xs font-medium">{label}</span>
                            <span className="min-w-0 flex-1 truncate text-xs text-foreground/60" title={item.errorDetails ? generationErrorMessage(item.errorDetails) : undefined}>
                                {generationBatchItemLabel(item, t)}
                                {item.retryCount ? t("completeUi.208", { value0: item.retryCount }) : ""}
                            </span>
                            {item.status === "failed" ? (
                                <Tooltip title={requiresPromptChange ? t("completeUi.209", { value0: label }) : t("completeUi.210", { value0: label })}>
                                    <button
                                        type="button"
                                        className="grid size-7 shrink-0 place-items-center rounded outline-none transition hover:bg-black/5 focus-visible:ring-2 dark:hover:bg-white/10"
                                        onClick={() => onRetryItem(item.id)}
                                        aria-label={t("completeUi.211", { value0: label })}
                                    >
                                        <RefreshCw className="size-3.5" />
                                    </button>
                                </Tooltip>
                            ) : null}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
export function generationBatchModeLabel(batch: CanvasGenerationBatch, t: InterfaceTranslate) {
    return t(batch.mode === "storyboard_video" ? "navVideo" : batch.mode === "storyboard_image" ? "helperUi.storyboardImages" : "helperUi.actionBoards");
}
export function generationBatchSummary(batch: CanvasGenerationBatch, t: InterfaceTranslate = interfaceTranslator(currentLocale())) {
    const count = (status: CanvasGenerationBatchItemStatus) => batch.items.filter((item) => item.status === status).length;
    const generating = count("submitting") + count("queued") + count("running");
    const stopped = count("cancelled");
    return [
        generationBatchModeLabel(batch, t),
        t(batch.status === "completed" ? "projectUi.statusCompleted" : batch.status === "cancelled" ? "agentChromeStatusStopped" : "projectUi.statusGenerating"),
        `${t("projectUi.statusSuccess")} ${count("succeeded")}/${batch.items.length}`,
        `${t("projectUi.statusFailed")} ${count("failed")}`,
        `${t("projectUi.statusGenerating")} ${generating}`,
        `${t("projectUi.generationStatusWaiting")} ${count("waiting")}`,
        ...(stopped ? [`${t("agentChromeStatusStopped")} ${stopped}`] : []),
    ].join(" · ");
}
export function generationBatchItemLabel(item: CanvasGenerationBatchItem, t: InterfaceTranslate = interfaceTranslator(currentLocale())) {
    if (item.costUncertain) return t("helperUi.costUncertain");
    if (isContentModerationError(item.errorDetails)) return t("helperUi.moderationChange");
    const labels: Record<CanvasGenerationBatchItemStatus, InterfaceMessageKey> = {
        waiting: "projectUi.generationStatusWaiting",
        submitting: "helperUi.submitting",
        queued: "coverageUi.223",
        running: "projectUi.statusGenerating",
        succeeded: "projectUi.statusSuccess",
        failed: "projectUi.statusFailed",
        cancelled: "agentChromeStatusStopped",
    };
    return t(labels[item.status]);
}
export function batchItemTone(item?: CanvasGenerationBatchItem): CanvasNodeStatus | undefined {
    if (!item) return undefined;
    if (item.status === "succeeded") return "success";
    if (item.status === "failed" || item.status === "cancelled") return "error";
    if (item.status === "waiting") return "idle";
    return "loading";
}
