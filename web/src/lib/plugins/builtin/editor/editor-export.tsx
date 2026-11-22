// 默认由后端 ffmpeg 渲染并把产物写入资源存储；浏览器 ffmpeg.wasm 只承担离线降级。
// 构建渲染计划时跳过已失去媒体来源的片段，避免悬空 nodeId 阻断其余有效片段导出。

import { useMemo, useState } from "react";
import { Download, Loader2, PackageOpen, Server } from "lucide-react";

import { useEditorHostContext, useEditorStoreContext } from "@/components/editor/editor-context";
import { buildTimelineRenderPlan, TIMELINE_STEP_MESSAGE_KEYS, type TimelineRenderSource } from "@/lib/timeline/timeline-to-ffmpeg";
import { exportTimelineToMp4, type TimelineExportProgress } from "@/lib/timeline/timeline-export";
import { resourceFileUrl } from "@/services/api/resources";
import { waitForGenerationTask } from "@/services/api/task-center";
import { createTimelineRenderTask, type TimelineRenderResult } from "@/services/api/timeline-tasks";
import type { TimelineProject } from "@/types/timeline";
import { useInterfaceTranslation } from "@/stores/use-interface-locale-store";

type ExportState = {
    phase: "idle" | "running" | "done" | "error";
    mode: "remote" | "local" | null;
    percent: number;
    detail: string;
    result: TimelineRenderResult | null;
};

/** 从时间线 clip 收集渲染源（按 nodeId 关联；directMedia 提供本地媒体定位）。 */
function collectRenderSources(project: TimelineProject): TimelineRenderSource[] {
    const seen = new Set<string>();
    const sources: TimelineRenderSource[] = [];
    const hiddenTracks = new Set(project.tracks.filter(track => track.visible === false).map(track => track.id));
    for (const clip of project.clips) {
        if (hiddenTracks.has(clip.trackId)) continue;
        if (clip.kind !== "video" && clip.kind !== "image" && clip.kind !== "audio") continue;
        const direct = clip.directMedia;
        if (!direct) continue;
        if (seen.has(clip.nodeId)) continue;
        seen.add(clip.nodeId);
        sources.push({
            nodeId: clip.nodeId,
            fileName: `input-${sources.length}.mp4`,
            durationMs: clip.durationMs,
            storageKey: direct.storageKey,
            url: direct.dataUrl ?? direct.url,
        });
    }
    return sources;
}

/** 服务端返回独立字幕文件，不把视频预览冒充字幕烧录结果。 */
export function EditorExportResult({ result }: { result: TimelineRenderResult }) {
    const { t } = useInterfaceTranslation();
    const fileName = result.fileName ?? "timeline.mp4";
    const subtitleName = `${fileName.replace(/\.[^.]+$/, "")}.srt`;
    return (
        <div className="mt-2 overflow-hidden rounded-md border border-[var(--previs-sequencer-border)] bg-[var(--previs-control-hover)]">
            <video src={resourceFileUrl(result.resourceId)} controls className="aspect-video w-full bg-black" />
            <div className="flex items-center justify-between gap-2 px-2 py-1.5 text-[11px] text-[var(--previs-dock-fg)]/80">
                <span className="truncate">{fileName}</span>
                <a href={resourceFileUrl(result.resourceId)} download={fileName}
                    className="flex shrink-0 items-center gap-1 text-[var(--previs-accent)] hover:underline">
                    <Download className="size-3" />{t("exportDownload")}
                </a>
            </div>
            {result.subtitleSrt && (
                <div className="px-2 pb-2 text-[11px] text-[var(--previs-dock-fg)]/80">
                    <p>{t("exportSubtitleSidecar")}</p>
                    <a href={`data:application/x-subrip;charset=utf-8,${encodeURIComponent(result.subtitleSrt)}`}
                        download={subtitleName}
                        className="mt-1 inline-flex items-center gap-1 text-[var(--previs-accent)] hover:underline">
                        <Download className="size-3" />{t("exportDownloadSubtitles")}
                    </a>
                </div>
            )}
        </div>
    );
}

export function EditorExport() {
    const { locale, t } = useInterfaceTranslation();
    const { project } = useEditorStoreContext();
    const { projectId } = useEditorHostContext();
    const [state, setState] = useState<ExportState>({ phase: "idle", mode: null, percent: 0, detail: "", result: null });

    const sources = useMemo(() => (project ? collectRenderSources(project) : []), [project]);
    const { plan, planError } = useMemo(() => {
        try {
            return { plan: project ? buildTimelineRenderPlan(project, sources) : null, planError: "" };
        } catch (error) {
            return { plan: null, planError: error instanceof Error ? error.message : t("exportPlanInvalid") };
        }
    }, [project, sources, t]);

    // 主路径：提交后端渲染任务并轮询（服务端任务上限 60 分钟，前端多留余量）。
    const renderRemote = async () => {
        if (!project || sources.length === 0 || state.phase === "running") return;
        setState({ phase: "running", mode: "remote", percent: 0, detail: t("exportSubmitting"), result: null });
        try {
            const created = await createTimelineRenderTask({ projectId, timeline: project });
            const done = await waitForGenerationTask(created.id, {
                timeoutMs: 62 * 60 * 1000,
                intervalMs: 3000,
                onTaskUpdate: (task) =>
                    setState({
                        phase: "running",
                        mode: "remote",
                        percent: task.progress ?? 0,
                        detail: task.stage
                            ? `${task.stage}${task.progress ? ` · ${task.progress}%` : ""}`
                            : t("exportRendering"),
                        result: null,
                    }),
            });
            const parsed = JSON.parse(done.resultJson ?? "{}") as TimelineRenderResult;
            if (!parsed.resourceId) throw new Error(t("exportNoResult"));
            setState({
                phase: "done",
                mode: "remote",
                percent: 100,
                detail: t("exportRemoteComplete", { name: parsed.fileName ?? "timeline.mp4" }),
                result: parsed,
            });
        } catch (error) {
            setState({
                phase: "error",
                mode: "remote",
                percent: 0,
                detail: error instanceof Error ? error.message : t("exportRemoteFailed"),
                result: null,
            });
        }
    };

    // 降级路径：ffmpeg.wasm 浏览器本地合成（无后端/离线时可用）。
    const exportLocalMp4 = async () => {
        if (!project || sources.length === 0 || state.phase === "running") return;
        setState({ phase: "running", mode: "local", percent: 0, detail: t("exportPreparing"), result: null });
        try {
            const { blob, warnings } = await exportTimelineToMp4(project, sources, {
                locale,
                onProgress: (p: TimelineExportProgress) =>
                    setState({ phase: "running", mode: "local", percent: p.percent, detail: p.detail, result: null }),
            });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = "timeline-export.mp4";
            a.click();
            URL.revokeObjectURL(url);
            setState({ phase: "done", mode: "local", percent: 100, detail: warnings.length ? `导出完成，已开始下载；${warnings.join("；")}` : "导出完成，已开始下载", result: null });
        } catch (error) {
            setState({
                phase: "error",
                mode: "local",
                percent: 0,
                detail: error instanceof Error ? error.message : t("exportFailed"),
                result: null,
            });
        }
    };

    if (!project) return null;

    return (
        <div className="flex h-full flex-col bg-[var(--previs-sequencer-surface)]">
            <div className="director-scroll min-h-0 flex-1 overflow-y-auto p-3">
                <div className="mb-3 rounded-md border border-[var(--previs-sequencer-border)] bg-[var(--previs-control-hover)] p-2.5">
                    <div className="flex items-center justify-between">
                        <span className="text-xs font-medium text-[var(--previs-dock-fg-strong)]">{t("exportPlan")}</span>
                        <span className="text-[10px] text-[var(--previs-dock-fg)]/60">{plan ? t("exportStepCount", { count: plan.steps.length }) : "—"}</span>
                    </div>
                    {plan && plan.steps.length > 0 ? (
                        <ul className="mt-2 space-y-1">
                            {plan.steps.slice(0, 8).map((step, index) => (
                                <li key={index} className="flex items-center gap-2 text-[11px] text-[var(--previs-dock-fg)]/70">
                                    <span className="shrink-0 rounded bg-[var(--previs-dock-active-surface)] px-1 py-0.5 font-mono text-[9px] uppercase text-[var(--previs-dock-fg)]/80">
                                        {step.kind}
                                    </span>
                                    <span className="truncate">{locale === "zh-CN" ? step.description : t(TIMELINE_STEP_MESSAGE_KEYS[step.kind])}</span>
                                </li>
                            ))}
                            {plan.steps.length > 8 && (
                                <li className="pt-0.5 text-[10px] text-[var(--previs-dock-fg)]/50">{t("exportMoreSteps", { count: plan.steps.length })}</li>
                            )}
                        </ul>
                    ) : (
                        <p role={planError ? "alert" : undefined} className="mt-2 text-[11px] text-[var(--previs-dock-fg)]/55">{planError || t("exportEmpty")}</p>
                    )}
                </div>

                <div className="mb-3 flex items-center justify-between rounded-md border border-[var(--previs-sequencer-border)] bg-[var(--previs-control-hover)] px-2.5 py-2 text-[11px] text-[var(--previs-dock-fg)]/70">
                    <span className="flex items-center gap-1.5">
                        <PackageOpen className="size-3.5 text-[var(--previs-dock-fg)]/60" />
                        {t("exportSources")}
                    </span>
                    <span className="tabular-nums text-[var(--previs-dock-fg)]/80">{t("exportSourceCount", { count: sources.length })}</span>
                </div>

                <button
                    type="button"
                    onClick={renderRemote}
                    disabled={sources.length === 0 || state.phase === "running"}
                    className="flex w-full items-center justify-center gap-2 rounded-md bg-[var(--previs-accent)] px-2 py-1.5 text-xs font-medium text-[var(--previs-on-accent)] hover:bg-[var(--previs-accent-hover)] disabled:opacity-40"
                >
                    {state.phase === "running" && state.mode === "remote" ? (
                        <Loader2 className="size-3.5 animate-spin" />
                    ) : (
                        <Server className="size-3.5" />
                    )}
                    {state.phase === "running" && state.mode === "remote" ? t("exportRendering") : t("exportServerButton")}
                </button>

                <button
                    type="button"
                    onClick={exportLocalMp4}
                    disabled={sources.length === 0 || state.phase === "running"}
                    className="mt-1.5 flex w-full items-center justify-center gap-2 rounded-md border border-[var(--previs-sequencer-border)] px-2 py-1.5 text-xs text-[var(--previs-dock-fg)]/80 hover:bg-[var(--previs-control-hover)] disabled:opacity-40"
                >
                    {state.phase === "running" && state.mode === "local" ? (
                        <Loader2 className="size-3.5 animate-spin" />
                    ) : (
                        <Download className="size-3.5" />
                    )}
                    {state.phase === "running" && state.mode === "local" ? t("exportRunning") : t("exportLocalButton")}
                </button>

                {state.phase === "running" && (
                    <div className="mt-3">
                        <div className="mb-1 flex justify-between text-[10px] text-[var(--previs-dock-fg)]/70">
                            <span>{state.detail}</span>
                            <span className="tabular-nums">{state.percent}%</span>
                        </div>
                        <div className="h-1.5 overflow-hidden rounded-full bg-[var(--previs-control-hover)]">
                            <div
                                className="h-full rounded-full bg-[var(--previs-accent)] transition-all"
                                style={{ width: `${state.percent}%` }}
                            />
                        </div>
                    </div>
                )}

                {state.phase === "done" && state.result && state.mode === "remote" && (
                    <EditorExportResult result={state.result} />
                )}
                {state.phase === "done" && (!state.result || state.mode !== "remote") && (
                    <p className="mt-2 text-[11px] text-[var(--previs-success)]">{state.detail}</p>
                )}
                {state.phase === "error" && <p className="mt-2 text-[11px] text-[var(--previs-danger)]">{state.detail}</p>}

                <p className="mt-3 text-[11px] leading-relaxed text-[var(--previs-dock-fg)]/55">
                    {t("exportPanelHelp")}
                </p>
                {sources.length === 0 && (
                    <p className="mt-1 text-[11px] text-[var(--previs-dock-fg)]/55">{t("exportMissingSourcesHint")}</p>
                )}
            </div>
        </div>
    );
}
