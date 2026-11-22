import { useInterfaceTranslation } from "@/stores/use-interface-locale-store";
import type { InterfaceTranslate, InterfaceLocale } from "@/lib/interface-locale";
import { useEffect, useState } from "react";
import { Button, Modal } from "antd";
import { XCircle } from "lucide-react";

import { CanvasImagePreview } from "@/components/canvas/canvas-image-preview";
import { TaskDetailItem } from "./canvas-project-feedback";
import { canCancelGenerationTask, generationTaskShowsProgress, generationTaskStageLabel } from "@/lib/generation-task-display";
import { formatTaskLog, type GenerationTask, type TaskLog } from "@/services/api/task-center";
import { CanvasNodeType, type CanvasNodeData } from "@/types/canvas";
import { VideoPlayer } from "@/components/video-player";
import { AppModal } from "@/components/ui/product/app-modal";
import { modelDisplayName, useEffectiveConfig } from "@/stores/use-config-store";
import { resolveMediaUrl } from "@/services/file-storage";

type CanvasProjectStatusDialogsProps = {
    theme: { node: { stroke: string; panel: string; muted: string; fill: string } };
    task: GenerationTask | null;
    taskLogs: TaskLog[];
    taskLoading: boolean;
    onCloseTask: () => void;
    onCancelTask?: (task: GenerationTask) => void;
    superResolveNode: CanvasNodeData | null;
    onCloseSuperResolve: () => void;
    previewNode: CanvasNodeData | null;
    onClosePreview: () => void;
    clearConfirmOpen: boolean;
    onCancelClear: () => void;
    onConfirmClear: () => void;
};

export function CanvasProjectStatusDialogs({ theme, task, taskLogs, taskLoading, superResolveNode, previewNode, clearConfirmOpen, onCloseTask, onCancelTask, onCloseSuperResolve, onClosePreview, onCancelClear, onConfirmClear }: CanvasProjectStatusDialogsProps) {
    const { t, locale } = useInterfaceTranslation();
    const config = useEffectiveConfig();
    return (
        <>
            <Modal title={t("workbenchUi.taskDetails")} open={Boolean(task)} footer={null} width="min(920px, calc(100vw - 32px))" onCancel={onCloseTask}>
                {task ? (
                    <div className="space-y-4 text-sm">
                        <div className="grid grid-cols-2 gap-3 rounded-lg border p-3" style={{ borderColor: theme.node.stroke, background: theme.node.panel }}>
                            <TaskDetailItem label={t("canvasUi.currentStage")} value={generationTaskStageLabel(task)} />
                            {generationTaskShowsProgress(task) ? <TaskDetailItem label={t("canvasUi.progress")} value={`${task.progress ?? 0}%`} /> : null}
                            <TaskDetailItem label={t("creationModelsShort")} value={task.model ? modelDisplayName(config, task.model) : t("canvasUi.defaultModel")} />
                            <TaskDetailItem label={t("agentRuntimeUiTaskIdLabel")} value={task.id} />
                            <TaskDetailItem label={t("workbenchUi.createdAt")} value={formatTaskTime(task.createdAt, t, locale)} />
                            <TaskDetailItem label={t("canvasUi.startedAt")} value={formatTaskTime(task.startedAt, t, locale)} />
                            <TaskDetailItem label={t("canvasUi.completedAt")} value={formatTaskTime(task.completedAt, t, locale)} />
                            <TaskDetailItem label={t("workbenchUi.elapsed")} value={formatTaskDuration(task, t)} />
                        </div>
                        <div>
                            <div className="mb-2 text-xs font-semibold" style={{ color: theme.node.muted }}>
                                {t("workflowUi.prompt")}
                            </div>
                            <div className="h-32 overflow-y-auto whitespace-pre-wrap rounded-lg p-3 text-xs leading-5" style={{ background: theme.node.fill }}>
                                {task.prompt || t("caseModelUnknown")}
                            </div>
                        </div>
                        <TaskGenerationParameters inputJson={task.inputJson} theme={theme} />
                        {onCancelTask && canCancelGenerationTask(task) ? (
                            <div className="flex justify-end">
                                <Button danger icon={<XCircle className="size-4" />} onClick={() => onCancelTask(task)}>
                                    {t("workbenchUi.cancelTask")}
                                </Button>
                            </div>
                        ) : null}
                        <div>
                            <div className="mb-2 text-xs font-semibold" style={{ color: theme.node.muted }}>
                                {t("canvasUi.taskLogs")}
                            </div>
                            <pre className="max-h-64 overflow-auto rounded-lg bg-neutral-950 p-3 text-[var(--fs-label)] leading-5 text-neutral-100">
                                {taskLoading ? t("canvasUi.loading") : taskLogs.length ? taskLogs.map((log) => `[${new Date(log.createdAt).toLocaleString()}] ${log.level.toUpperCase()} ${formatTaskLog(log)}`).join("\n") : t("canvasUi.noLogs")}
                            </pre>
                        </div>
                    </div>
                ) : null}
            </Modal>

            <Modal title={t("canvasUi.aiUpscale")} open={Boolean(superResolveNode?.metadata?.content)} centered footer={null} onCancel={onCloseSuperResolve}>
                <div className="py-8 text-center text-base font-medium">{t("canvasUi.notImplemented")}</div>
            </Modal>

            <AppModal
                title={t("canvasUi.videoPreview")}
                open={Boolean(previewNode?.type === CanvasNodeType.Video && (previewNode.metadata?.content || previewNode.metadata?.storageKey))}
                centered
                onCancel={onClosePreview}
                footer={null}
                width="min(1200px, calc(100vw - 32px))"
                flush
                styles={{ body: { display: "flex", justifyContent: "center", alignItems: "center", maxHeight: "84vh", overflow: "hidden", background: "var(--workspace-canvas-deep)" } }}
            >
                {previewNode?.type === CanvasNodeType.Video && (previewNode.metadata?.content || previewNode.metadata?.storageKey) ? (
                    <ResolvedCanvasVideoPreview node={previewNode} />
                ) : null}
            </AppModal>

            {previewNode?.type === CanvasNodeType.Image && (previewNode.metadata?.content || previewNode.metadata?.storageKey) ? (
                <CanvasImagePreview
                    src={previewNode.metadata.content}
                    storageKey={previewNode.metadata.storageKey}
                    alt={previewNode.title || t("contextImage")}
                    onClose={onClosePreview}
                />
            ) : null}

            <Modal
                title={t("canvasUi.clearCanvasConfirm")}
                open={clearConfirmOpen}
                centered
                onCancel={onCancelClear}
                footer={
                    <>
                        <Button onClick={onCancelClear}>{t("timelineCancel")}</Button>
                        <Button danger type="primary" onClick={onConfirmClear}>
                            {t("canvasHistoryClear")}
                        </Button>
                    </>
                }
            >
                <p className="text-sm opacity-60">{t("canvasUi.clearCanvasWarning")}</p>
            </Modal>
        </>
    );
}

function ResolvedCanvasVideoPreview({ node }: { node: CanvasNodeData }) {
    const { t } = useInterfaceTranslation();
    const [src, setSrc] = useState(node.metadata?.storageKey ? "" : node.metadata?.content || "");
    const [failed, setFailed] = useState(false);

    useEffect(() => {
        let cancelled = false;
        setSrc(node.metadata?.storageKey ? "" : node.metadata?.content || "");
        setFailed(false);
        void resolveMediaUrl(node.metadata?.storageKey, node.metadata?.content || "")
            .then((url) => {
                if (!cancelled) {
                    setSrc(url);
                    setFailed(!url);
                }
            })
            .catch(() => {
                if (!cancelled) setFailed(true);
            });
        return () => {
            cancelled = true;
        };
    }, [node.metadata?.content, node.metadata?.storageKey]);

    if (failed) return <div className="grid min-h-72 w-full place-items-center text-sm text-white/55">{t("canvasUi.videoUrlFailed")}</div>;
    if (!src) return <div className="grid min-h-72 w-full place-items-center text-sm text-white/55">{t("canvasUi.loadingVideo")}</div>;
    return <VideoPlayer src={src} mimeType={node.metadata?.mimeType} title={node.title || t("canvasUi.videoPreview")} hasAudio={typeof node.metadata?.hasAudio === "boolean" ? node.metadata.hasAudio : undefined} className="max-h-[84vh] max-w-full bg-black" />;
}

function TaskGenerationParameters({ inputJson, theme }: { inputJson?: string; theme: CanvasProjectStatusDialogsProps["theme"] }) {
    const { t } = useInterfaceTranslation();
    const fields = taskParameterRows(inputJson, t);
    return (
        <div>
            <div className="mb-2 text-xs font-semibold" style={{ color: theme.node.muted }}>{t("workbenchUi.generationParameters")}</div>
            {fields.length ? (
                <div className="grid grid-cols-2 gap-x-5 gap-y-1 rounded-lg border p-3 sm:grid-cols-3" style={{ borderColor: theme.node.stroke, background: theme.node.panel }}>
                    {fields.map((field) => <TaskDetailItem key={field.label} label={field.label} value={field.value} />)}
                </div>
            ) : (
                <div className="rounded-lg p-3 text-xs" style={{ background: theme.node.fill, color: theme.node.muted }}>{t("canvasUi.noParameterHistory")}</div>
            )}
        </div>
    );
}

function taskParameterRows(inputJson: string | undefined, t: InterfaceTranslate) {
    if (!inputJson) return [] as Array<{ label: string; value: string }>;
    let input: Record<string, unknown>;
    try {
        const parsed: unknown = JSON.parse(inputJson);
        input = asRecord(parsed);
    } catch {
        return [] as Array<{ label: string; value: string }>;
    }
    const config = asRecord(input.config);
    const rows: Array<{ label: string; value: string }> = [];
    const add = (label: string, value: unknown) => {
        if (value === undefined || value === null || value === "") return;
        rows.push({ label, value: String(value) });
    };
    add(t("tasksUi.parameterSizeAspect"), config.size);
    add(t("tasksUi.parameterResolution"), config.vquality || config.quality);
    add(t("tasksUi.parameterDuration"), config.videoSeconds === undefined ? undefined : t("assetsUi.durationSeconds", { seconds: String(config.videoSeconds) }));
    add(t("tasksUi.parameterGenerationCount"), config.count);
    add(t("tasksUi.parameterGenerateAudio"), booleanLabel(config.videoGenerateAudio, t));
    add(t("tasksUi.parameterWatermark"), booleanLabel(config.videoWatermark, t));
    add(t("tasksUi.parameterVoice"), config.audioVoice);
    add(t("tasksUi.parameterAudioFormat"), config.audioFormat);
    add(t("tasksUi.parameterAudioSpeed"), config.audioSpeed);
    addReference(t("tasksUi.parameterReferenceImages"), input.referenceImages, t("contextImage"));
    addReference(t("tasksUi.parameterReferenceVideos"), input.referenceVideos, t("contextVideo"));
    addReference(t("tasksUi.parameterReferenceAudios"), input.referenceAudios, t("createAudio"));
    return rows;

    function addReference(label: string, value: unknown, kind: string) {
        if (!Array.isArray(value) || !value.length) return;
        const names = value
            .map((item) => (typeof item === "object" && item !== null && "name" in item ? String((item as { name?: unknown }).name || "") : ""))
            .filter(Boolean);
        const suffix = names.length ? `（${names.slice(0, 3).join("、")}${names.length > 3 ? "…" : ""}）` : "";
        rows.push({ label, value: t("helperUi.referenceCount", { count: value.length, kind, names: suffix }) });
    }
}

function asRecord(value: unknown): Record<string, unknown> {
    return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function booleanLabel(value: unknown, t: InterfaceTranslate) {
    if (value === true || value === "true") return t("skillsUi.enabled");
    if (value === false || value === "false") return t("skillsUi.disabled");
    return "";
}

function formatTaskTime(value: string | undefined, t: InterfaceTranslate, locale: InterfaceLocale) {
    if (!value) return t("pluginUi.notRecorded");
    const timestamp = Date.parse(value);
    return Number.isFinite(timestamp) ? new Date(timestamp).toLocaleString(locale) : value;
}

function formatTaskDuration(task: GenerationTask, t: InterfaceTranslate) {
    const start = Date.parse(task.startedAt || task.createdAt);
    const end = task.completedAt ? Date.parse(task.completedAt) : task.status === "queued" || task.status === "running" ? Date.now() : Number.NaN;
    if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return t(task.completedAt ? "pluginUi.notRecorded" : "helperUi.notCompleted");
    const milliseconds = Math.max(0, end - start);
    const totalSeconds = Math.round(milliseconds / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return minutes ? t("tasksUi.durationMinutesSeconds", { minutes, seconds }) : t("tasksUi.durationSeconds", { seconds });
}
