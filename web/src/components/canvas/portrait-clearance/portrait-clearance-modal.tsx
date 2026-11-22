import { useInterfaceTranslation } from "@/stores/use-interface-locale-store";
import { Button, InputNumber, Popconfirm, Segmented, Select, Tag } from "antd";
import { AppModal } from "@/components/ui/product/app-modal";
import { Switch } from "@/components/ui/base/switch";
import { Callout } from "@/components/ui/product/callout";
import { StatusBadge } from "@/components/ui/base/badges";
import { CircleAlert, Download, History, Image as ImageIcon, Pause, Play, ScanFace, ShieldCheck } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import type { InterfaceMessageKey } from "@/lib/interface-locale";
import { createDefaultPortraitClearanceState, PORTRAIT_CLEARANCE_PLUGIN_ID, PORTRAIT_RISK_LABEL_KEYS, PORTRAIT_TASK_STAGE_LABEL_KEYS, type PortraitClearanceAnalysisMode, type PortraitClearanceMode, type PortraitClearanceNodeState } from "@/lib/portrait-clearance/contracts";
import { isPortraitImageInput, swapPortraitClearanceDirectBindings } from "@/lib/portrait-clearance/input-bindings";
import { portraitVisionModelError, portraitVisionModelLabel, portraitVisionModels, resolvePortraitVisionModel } from "@/lib/portrait-clearance/vision";
import { usePluginStore } from "@/stores/use-plugin-store";
import { useEffectiveConfig } from "@/stores/use-config-store";
import { CanvasNodeType, type CanvasNodeData } from "@/types/canvas";
import { cancelPortraitTask, createPortraitClearanceTask, deletePortraitTask, downloadPortraitReport, imageNodeDataUrl, installPortraitClearanceModels, listPortraitTasks, portraitOwnerScopeHash, readPortraitRuntimeStatus, readPortraitTaskImage, readPortraitTaskResult, retryPortraitTask, type PortraitRuntimeStatus, type PortraitRuntimeTask } from "@/services/portrait-clearance-runtime";
import type { PortraitFeatureKey, PortraitPairResult, PortraitRiskLevel } from "@/lib/portrait-clearance/contracts";

type RuntimeError = { kind: "raw"; message: string } | { kind: "translated"; key: InterfaceMessageKey };
class PortraitResultInvalidError extends Error {}

type PortraitClearanceModalProps = {
    projectId: string;
    node: CanvasNodeData | null;
    upstreamNodes: CanvasNodeData[];
    open: boolean;
    onClose: () => void;
    onUpdateState: (nodeId: string, state: PortraitClearanceNodeState) => void;
    onAddCandidate?: (candidate: { id: string; title: string; imageArtifactId: string }, dataUrl: string) => void | Promise<void>;
};

export function PortraitClearanceModal({ projectId, node, upstreamNodes, open, onClose, onUpdateState, onAddCandidate }: PortraitClearanceModalProps) {
    const { locale, t } = useInterfaceTranslation();
    const effectiveConfig = useEffectiveConfig();
    const enabled = usePluginStore((state) => state.pluginStates[PORTRAIT_CLEARANCE_PLUGIN_ID]?.effectiveEnabled ?? Boolean(state.installations.find((item) => item.manifest.id === PORTRAIT_CLEARANCE_PLUGIN_ID)?.enabled));
    const state = node?.metadata?.portraitClearance || createDefaultPortraitClearanceState();
    const [starting, setStarting] = useState(false);
    const [installingModels, setInstallingModels] = useState(false);
    const [runtimeStatus, setRuntimeStatus] = useState<PortraitRuntimeStatus | null>(null);
    const [runtimeConnecting, setRuntimeConnecting] = useState(false);
    const [runtimeRetryNonce, setRuntimeRetryNonce] = useState(0);
    const [runtimeError, setRuntimeError] = useState<RuntimeError | null>(null);
    const [history, setHistory] = useState<PortraitRuntimeTask[]>([]);
    const [result, setResult] = useState<PortraitResultView | null>(null);
    const [reportFormat, setReportFormat] = useState<"json" | "md" | "html" | "docx">("html");
    const [busyAction, setBusyAction] = useState("");
    const imageInputs = useMemo(() => upstreamNodes.filter((item) => isPortraitImageInput(item)), [upstreamNodes]);
    const hasQuery = Boolean(state.inputBindings.some((binding) => binding.role === "query" && imageInputs.some((item) => item.id === binding.nodeId)));
    const hasReference = Boolean(state.inputBindings.some((binding) => binding.role === "reference" && imageInputs.some((item) => item.id === binding.nodeId)));
    const query = imageInputs.find((item) => state.inputBindings.some((binding) => binding.nodeId === item.id && binding.role === "query")) || imageInputs[0];
    const reference = imageInputs.find((item) => state.inputBindings.some((binding) => binding.nodeId === item.id && binding.role === "reference")) || imageInputs[1];
    const candidateNodes = useMemo(() => imageInputs.filter((item) => {
        if (item.id === query?.id) return false;
        const binding = state.inputBindings.find((candidate) => candidate.nodeId === item.id);
        return binding?.role === "candidate" || (!binding && state.mode === "network-search");
    }), [imageInputs, query?.id, state.inputBindings, state.mode]);
    const runtimeReady = Boolean(runtimeStatus?.ready);
    const selectedModel = state.analysisMode === "local-plus-vision" ? resolvePortraitVisionModel(effectiveConfig, state.modelPolicy) : "";
    const visionModelError = state.analysisMode === "local-plus-vision" ? portraitVisionModelError(effectiveConfig, state.modelPolicy) : "";
    const canStart = enabled && runtimeReady && !visionModelError && (state.mode === "network-search" ? hasQuery : hasQuery && hasReference);
    const runtimeErrorText = runtimeError?.kind === "translated" ? t(runtimeError.key) : runtimeError?.message || "";
    const rawRuntimeError = runtimeError?.kind === "raw" ? runtimeError.message : "";
    const setRuntimeErrorFrom = (error: unknown, fallbackKey: InterfaceMessageKey) => {
        if (error instanceof PortraitResultInvalidError) {
            setRuntimeError({ kind: "translated", key: "portraitClearanceUi.resultInvalid" });
            return;
        }
        setRuntimeError(error instanceof Error ? { kind: "raw", message: error.message } : { kind: "translated", key: fallbackKey });
    };

    useEffect(() => {
        if (!open || !enabled) return;
        let disposed = false;
        let retryTimer: number | undefined;
        let attempt = 0;
        const load = async () => {
            if (disposed) return;
            setRuntimeConnecting(true);
            try {
                const status = await readPortraitRuntimeStatus();
                if (disposed) return;
                setRuntimeStatus(status);
                setRuntimeError(null);
                attempt = 0;
            } catch (error) {
                if (disposed) return;
                setRuntimeStatus(null);
                setRuntimeErrorFrom(error, "portraitClearanceUi.engineUnavailable");
                attempt += 1;
                retryTimer = window.setTimeout(load, Math.min(5_000, 800 + attempt * 700));
            } finally {
                if (!disposed) setRuntimeConnecting(false);
            }
        };
        setRuntimeStatus(null);
        setRuntimeError(null);
        void load();
        return () => {
            disposed = true;
            if (retryTimer !== undefined) window.clearTimeout(retryTimer);
        };
    }, [enabled, open, runtimeRetryNonce]);

    useEffect(() => {
        if (!open || !node) return;
        let disposed = false;
        void listPortraitTasks({ projectId, nodeId: node.id, limit: 40 }).then((page) => { if (!disposed) setHistory(page.tasks); }).catch(() => { if (!disposed) setHistory([]); });
        return () => { disposed = true; };
    }, [node, open, projectId, state.activeTaskId]);

    useEffect(() => {
        if (!open || !node?.metadata?.portraitClearance?.lastResult?.taskId) return;
        let disposed = false;
        void readPortraitTaskResult(node.metadata.portraitClearance.lastResult.taskId).then((value) => {
            if (disposed) return;
            const parsed = parsePortraitResult(value);
            setResult(parsed);
            const lastResult = node.metadata?.portraitClearance?.lastResult;
            if (lastResult && (lastResult.comparedCount !== parsed.comparedCount || lastResult.highestRisk !== parsed.highestRisk)) {
                onUpdateState(node.id, { ...(node.metadata?.portraitClearance || createDefaultPortraitClearanceState()), lastResult: { ...lastResult, comparedCount: parsed.comparedCount, candidateCount: parsed.candidateCount, highestRisk: parsed.highestRisk, riskCounts: parsed.riskCounts } });
            }
        }).catch(() => { if (!disposed) setResult(null); });
        return () => { disposed = true; };
    }, [node, open]);

    const patchState = (patch: Partial<PortraitClearanceNodeState>) => {
        if (!node) return;
        onUpdateState(node.id, { ...state, ...patch, settings: { ...state.settings, ...(patch.settings || {}) } });
    };

    const startTask = async () => {
        if (!node || !canStart || starting) return;
        setStarting(true);
        setRuntimeError(null);
        try {
            const ownerScopeHash = await portraitOwnerScopeHash();
            const inputNodes = imageInputs.filter((item) => {
                const binding = state.inputBindings.find((candidate) => candidate.nodeId === item.id);
                if (state.mode === "direct-compare") return binding?.role === "query" || binding?.role === "reference" || (!binding && (item.id === query?.id || item.id === reference?.id));
                return binding?.role === "query" || binding?.role === "candidate" || (!binding && item.id === query?.id);
            });
            const inputs = await Promise.all(inputNodes.map(async (item) => {
                const binding = state.inputBindings.find((candidate) => candidate.nodeId === item.id);
                const role = binding?.role || (item.id === query?.id ? "query" : state.mode === "direct-compare" ? "reference" : "candidate");
                const file = await imageNodeDataUrl(item);
                return { ...file, nodeId: item.id, role };
            }));
            const inputBytes = inputs.reduce((total, item) => total + decodedDataUrlBytes(item.dataUrl), 0);
            if (inputBytes > 20 * 1024 * 1024) {
                setRuntimeError({ kind: "translated", key: "portraitClearanceUi.imagePayloadTooLarge" });
                return;
            }
            const task = await createPortraitClearanceTask({
                projectId,
                nodeId: node.id,
                ownerScopeHash,
                clientOperationId: `portrait-${node.id}-${Date.now()}`,
                mode: state.mode,
                analysisMode: state.analysisMode,
                ...(selectedModel ? { modelRef: selectedModel } : {}),
                settings: state.settings,
                inputs,
            });
            onUpdateState(node.id, {
                ...state,
                activeTaskId: task.taskId,
                task: { status: task.status, stage: task.stage, progress: task.progress, processedCandidates: task.processedCandidates, ...(task.totalCandidates === undefined ? {} : { totalCandidates: task.totalCandidates }), ...(task.errorCode ? { errorCode: task.errorCode } : {}), ...(task.errorMessage ? { errorMessage: task.errorMessage } : {}), updatedAt: task.updatedAt },
            });
        } catch (error) {
            setRuntimeErrorFrom(error, "portraitClearanceUi.taskCreateFailed");
        } finally {
            setStarting(false);
        }
    };

    const stopTask = async () => {
        if (!state.activeTaskId || busyAction) return;
        setBusyAction("stop");
        try {
            const task = await cancelPortraitTask(state.activeTaskId);
            // Keep the durable task id after stopping so the user can retry the same
            // local task without losing its downloaded candidates and audit trail.
            if (node) onUpdateState(node.id, { ...state, activeTaskId: state.activeTaskId, task: { status: task.status, stage: task.stage, progress: task.progress, processedCandidates: task.processedCandidates, ...(task.errorCode ? { errorCode: task.errorCode } : {}), ...(task.errorMessage ? { errorMessage: task.errorMessage } : {}), updatedAt: task.updatedAt } });
        } catch (error) {
            setRuntimeErrorFrom(error, "portraitClearanceUi.taskStopFailed");
        } finally {
            setBusyAction("");
        }
    };

    const retryTask = async () => {
        if (!node || !state.task || !state.task.errorCode || (!state.activeTaskId && !state.lastResult?.taskId)) return;
        const taskId = state.activeTaskId || state.lastResult?.taskId;
        if (!taskId || busyAction) return;
        setBusyAction("retry");
        try {
            const task = await retryPortraitTask(taskId);
            onUpdateState(node.id, { ...state, activeTaskId: task.taskId, task: { status: task.status, stage: task.stage, progress: task.progress, processedCandidates: task.processedCandidates, updatedAt: task.updatedAt }, lastResult: undefined });
        } catch (error) {
            setRuntimeErrorFrom(error, "workbenchUi.retryFailed");
        } finally {
            setBusyAction("");
        }
    };

    const exportReport = async () => {
        const taskId = state.lastResult?.taskId;
        if (!taskId || busyAction) return;
        setBusyAction("export");
        try {
            const artifactId = reportFormat === "json" ? "clearance-result.json" : `clearance-report.${reportFormat}` as "clearance-report.md" | "clearance-report.html" | "clearance-report.docx";
            const report = await downloadPortraitReport(taskId, artifactId);
            const extension = reportFormat;
            const blob = new Blob([report.bytes], { type: report.mimeType });
            const url = URL.createObjectURL(blob);
            const anchor = document.createElement("a");
            anchor.href = url;
            anchor.download = `portrait-clearance-${taskId}.${extension}`;
            anchor.click();
            URL.revokeObjectURL(url);
        } catch (error) {
            setRuntimeErrorFrom(error, "portraitClearanceUi.reportExportFailed");
        } finally {
            setBusyAction("");
        }
    };

    const removeHistory = async (taskId: string) => {
        if (busyAction) return;
        setBusyAction(`delete-${taskId}`);
        try {
            await deletePortraitTask(taskId);
            setHistory((current) => current.filter((item) => item.taskId !== taskId));
            if (state.lastResult?.taskId === taskId && node) onUpdateState(node.id, { ...state, lastResult: undefined });
        } catch (error) {
            setRuntimeErrorFrom(error, "portraitClearanceUi.localDataDeleteFailed");
        } finally {
            setBusyAction("");
        }
    };

    const openHistoryTask = async (task: PortraitRuntimeTask) => {
        if (!node || busyAction) return;
        setBusyAction(`open-${task.taskId}`);
        try {
            const value = parsePortraitResult(await readPortraitTaskResult(task.taskId));
            setResult(value);
            onUpdateState(node.id, { ...state, activeTaskId: undefined, task: { status: task.status, stage: task.stage, progress: task.progress, processedCandidates: task.processedCandidates, ...(task.totalCandidates === undefined ? {} : { totalCandidates: task.totalCandidates }), ...(task.errorCode ? { errorCode: task.errorCode } : {}), ...(task.errorMessage ? { errorMessage: task.errorMessage } : {}), updatedAt: task.updatedAt }, lastResult: { taskId: task.taskId, highestRisk: value.highestRisk, riskCounts: value.riskCounts, candidateCount: value.candidateCount, comparedCount: value.comparedCount, ...(task.modelRef ? { modelRef: task.modelRef } : {}), completedAt: task.completedAt || task.updatedAt, detailsAvailable: true } });
        } catch (error) {
            setRuntimeErrorFrom(error, "portraitClearanceUi.historyReadFailed");
        } finally {
            setBusyAction("");
        }
    };

    const installModels = async () => {
        if (installingModels) return;
        setInstallingModels(true);
        setRuntimeError(null);
        try {
            setRuntimeStatus(await installPortraitClearanceModels());
        } catch (error) {
            setRuntimeErrorFrom(error, "portraitClearanceUi.modelInstallFailed");
        } finally {
            setInstallingModels(false);
        }
    };

    return (
        <AppModal
            open={open}
            onCancel={onClose}
            footer={null}
            title={null}
            closable={false}
            width="min(1600px, calc(100vw - 32px))"
            centered
            destroyOnHidden={false}
            className="portrait-clearance-modal"
            flush
        >
            <div className="flex max-h-[calc(100dvh-32px)] min-h-[min(680px,calc(100dvh-32px))] flex-col overflow-hidden bg-background text-foreground">
                <header className="flex shrink-0 flex-wrap items-center gap-3 border-b px-5 py-4" style={{ borderColor: "var(--border)" }}>
                    <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-foreground text-background"><ScanFace className="size-5" aria-hidden="true" /></span>
                    <div className="min-w-0 flex-1">
                        <h2 className="truncate text-base font-semibold">{node?.title || t("coverageUi.479")}</h2>
                        <p className="mt-0.5 text-xs text-foreground/55">{t("coverageUi.480")}</p>
                    </div>
                    <Tag icon={enabled ? <ShieldCheck className="size-3" /> : <CircleAlert className="size-3" />} color={enabled ? "green" : "default"} style={enabled ? undefined : portraitRiskTagStyle("medium")} title={enabled ? t("coverageUi.481") : t("coverageUi.482")}>{enabled ? t("coverageUi.483") : t("coverageUi.484")}</Tag>
                    <Button aria-label={t("coverageUi.485")} onClick={onClose}>{t("canvasImportClose")}</Button>
                </header>

                <div className="min-h-0 flex-1 overflow-y-auto p-5" data-canvas-wheel-scroll style={{ scrollPaddingBottom: 96 }}>
                    <div className="grid gap-5 lg:grid-cols-[280px_minmax(0,1fr)]">
                        <aside className="flex min-w-0 flex-col gap-4">
                            <section className="rounded-xl border p-3" style={{ borderColor: "var(--border)" }}>
                                <div className="mb-2 text-xs font-semibold text-foreground/60">{t("coverageUi.486")}</div>
                                <Segmented
                                    block
                                    value={state.mode}
                                    disabled={!enabled}
                                    onChange={(value) => patchState({ mode: value as PortraitClearanceMode })}
                                    options={[{ value: "direct-compare", label: t("canvasPortraitUi005") }, { value: "network-search", label: t("canvasPortraitUi004") }]}
                                />
                            </section>

                            <section className="rounded-xl border p-3" style={{ borderColor: "var(--border)" }}>
                                <div className="mb-3 text-xs font-semibold text-foreground/60">{t("canvasArtCritiqueUi005")}</div>
                                <div className="space-y-2">
                                    <PortraitInputCard label={t("canvasPortraitUi001")} node={query} ready={hasQuery} />
                                    {state.mode === "direct-compare" ? <PortraitInputCard label={t("modelUi.referencePicture")} node={reference} ready={hasReference} /> : <PortraitCandidateStrip nodes={candidateNodes} />}
                                </div>
                                <p className="mt-3 text-xs leading-5 text-foreground/55">{t("coverageUi.487")}</p>
                                {state.mode === "direct-compare" ? <Button size="small" disabled={!enabled || !hasQuery || !hasReference} onClick={() => patchState({ inputBindings: swapPortraitClearanceDirectBindings(state.inputBindings) })}>{t("coverageUi.488")}</Button> : null}
                            </section>

                            <section className="rounded-xl border p-3" style={{ borderColor: "var(--border)" }}>
                                <div className="mb-3 text-xs font-semibold text-foreground/60">{t("coverageUi.489")}</div>
                                <label className="mb-3 block text-xs">{t("coverageUi.490")}<Select className="mt-1 w-full" value={state.analysisMode} disabled={!enabled} options={[{ value: "local-plus-vision", label: t("coverageUi.491") }, { value: "local-only", label: t("coverageUi.492") }]} onChange={(value) => patchState({ analysisMode: value as PortraitClearanceAnalysisMode })} /></label>
                                {state.analysisMode === "local-plus-vision" ? <label className="mb-3 block text-xs">{t("coverageUi.493")}<Select className="mt-1 w-full" value={state.modelPolicy.mode === "pinned" ? state.modelPolicy.modelRef : "project-default"} disabled={!enabled} options={[{ value: "project-default", label: t("coverageUi.494", { value0: portraitVisionModelLabel(effectiveConfig, effectiveConfig.textModel || effectiveConfig.model) }) }, ...portraitVisionModels(effectiveConfig).map((model) => ({ value: model, label: portraitVisionModelLabel(effectiveConfig, model) }))]} onChange={(value) => patchState({ modelPolicy: value === "project-default" ? { mode: "project-default" } : { mode: "pinned", modelRef: String(value) } })} /></label> : null}
                                <label className="mb-3 block text-xs">{t("coverageUi.495")}<Select className="mt-1 w-full" value={state.settings.dedupMode} disabled={!enabled} options={[{ value: "phash", label: t("coverageUi.496") }, { value: "arcface", label: t("coverageUi.497") }]} onChange={(value) => patchState({ settings: { ...state.settings, dedupMode: value as "phash" | "arcface" } })} /></label>
                                {state.analysisMode === "local-plus-vision" ? <label className="mb-3 block text-xs">{t("coverageUi.498")}<InputNumber className="mt-1 w-full" min={1} max={10} precision={0} value={state.settings.modelConcurrency} disabled={!enabled} onChange={(value) => patchState({ settings: { ...state.settings, modelConcurrency: Math.max(1, Math.min(10, Number(value) || 2)) } })} /></label> : null}
                                {state.mode === "network-search" ? <><label className="mb-3 block text-xs">{t("coverageUi.499")}<InputNumber className="mt-1 w-full" min={1} max={60} value={state.settings.maxCandidates} disabled={!enabled} onChange={(value) => patchState({ settings: { ...state.settings, maxCandidates: Math.max(1, Math.min(60, Number(value) || 30)) } })} /></label><label className="mb-3 block text-xs">{t("coverageUi.500")}<InputNumber className="mt-1 w-full" min={0} max={20} value={state.settings.searchScrolls} disabled={!enabled} onChange={(value) => patchState({ settings: { ...state.settings, searchScrolls: Math.max(0, Math.min(20, Number(value) || 0)) } })} /></label></> : null}
                                <div className="flex items-center justify-between gap-3 text-xs"><span>{t("coverageUi.501")}</span><Switch size="sm" checked={state.settings.showBrowserForDebug} disabled={!enabled} onChange={(checked) => patchState({ settings: { ...state.settings, showBrowserForDebug: checked } })} /></div>
                            </section>
                        </aside>

                        <main className="min-w-0 space-y-4">
                            {!runtimeReady && enabled ? <Callout tone={runtimeConnecting ? "info" : "warning"} title={runtimeConnecting ? t("coverageUi.502") : runtimeStatus ? t("coverageUi.503") : t("coverageUi.504")} action={runtimeConnecting ? null : runtimeStatus ? <Button size="small" icon={<Download className="size-3.5" />} loading={installingModels} onClick={() => void installModels()}>{installingModels ? t("coverageUi.505") : t("coverageUi.506")}</Button> : <Button size="small" onClick={() => setRuntimeRetryNonce((value) => value + 1)}>{t("coverageUi.507")}</Button>}>{runtimeConnecting ? t("coverageUi.508") : runtimeStatus ? (installingModels ? t("coverageUi.509") : runtimeErrorText || t("coverageUi.510")) : (runtimeError?.kind === "translated" ? runtimeErrorText : portraitRuntimeErrorMessage(rawRuntimeError)) || t("coverageUi.511")}</Callout> : null}
                            {runtimeReady && runtimeError ? <Callout tone="error" title={t("coverageUi.512")} onClose={() => setRuntimeError(null)}>{runtimeErrorText}</Callout> : null}
                            {state.mode === "network-search" && runtimeStatus?.browser.available === false ? <Callout tone="warning" title={t("coverageUi.513")}>{t("coverageUi.514")}</Callout> : null}

                            <section className="rounded-xl border p-4" style={{ borderColor: "var(--border)" }}>
                                <div className="flex flex-wrap items-center justify-between gap-3">
                                    <div><h3 className="text-sm font-semibold">{t("coverageUi.515")}</h3><p className="mt-1 text-xs text-foreground/55">{t("coverageUi.516")}</p></div>
                                    {state.task ? <StatusBadge tone={state.task.status === "failed" ? "error" : state.task.status === "cancelled" ? "warning" : state.task.status === "completed" ? "success" : "loading"} label={state.task.status === "failed" ? t("creationPageShotStatusFailed") : state.task.status === "cancelled" ? t("agentChromeStatusStopped") : t(PORTRAIT_TASK_STAGE_LABEL_KEYS[state.task.stage])} /> : null}
                                </div>
                                {state.task?.status === "failed" && state.task.errorMessage ? <Callout className="mt-4" tone="error" title={t("coverageUi.517")}>{state.task.errorMessage}</Callout> : null}
                                {state.lastResult ? <><div className="mt-4 grid gap-3 sm:grid-cols-4"><Metric label={t("coverageUi.518")} value={t(PORTRAIT_RISK_LABEL_KEYS[state.lastResult.highestRisk])} tone={portraitRiskTone(state.lastResult.highestRisk)} /><Metric label={t("coverageUi.519")} value={String(state.lastResult.candidateCount)} /><Metric label={t("coverageUi.520")} value={String(result?.comparedCount ?? state.lastResult.comparedCount)} /><Metric label={t("imageNodeUi.details")} value={state.lastResult.detailsAvailable ? t("settingsUi.available") : t("coverageUi.521")} /></div>{result ? <PortraitResultPanel result={result} taskId={state.lastResult.taskId} onAddCandidate={onAddCandidate} /> : <div className="mt-4 rounded-lg bg-foreground/[.03] p-3 text-xs text-foreground/55">{t("coverageUi.522")}</div>}</> : <div className="mt-4 grid min-h-44 place-items-center rounded-lg border border-dashed text-center text-sm text-foreground/45" style={{ borderColor: "var(--border)" }}><div><ScanFace className="mx-auto mb-2 size-8 opacity-45" /><p>{canStart ? t("coverageUi.523") : t("coverageUi.524")}</p><p className="mt-1 text-xs">{t("coverageUi.525")}</p></div></div>}
                            </section>

                            <section className="rounded-xl border p-4" style={{ borderColor: "var(--border)" }}>
                                <div className="mb-3 flex items-center gap-2"><History className="size-4" /><h3 className="text-sm font-semibold">{t("coverageUi.526")}</h3></div>
                                {history.length ? <div className="space-y-2">{history.map((item) => <div key={item.taskId} className="flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2 text-xs" style={{ borderColor: "var(--border)" }}><span className="min-w-24 font-medium">{item.mode === "direct-compare" ? t("canvasPortraitUi005") : t("canvasPortraitUi004")}</span><StatusBadge variant="filled" tone={item.status === "completed" ? "success" : item.status === "failed" ? "error" : item.status === "partial" ? "warning" : "loading"} label={t(PORTRAIT_TASK_STAGE_LABEL_KEYS[item.stage])} /><span className="text-foreground/55">{item.processedCandidates}{item.totalCandidates ? ` / ${item.totalCandidates}` : ""} {t("projectUi.itemUnit")}</span><span className="ml-auto text-foreground/45">{formatDate(item.updatedAt, locale, t("announcementTimelineUi.justNow"))}</span><Button size="small" type="link" onClick={() => void openHistoryTask(item)}>{t("storageUi.viewOrder")}</Button><Popconfirm title={t("coverageUi.527")} description={t("coverageUi.528")} onConfirm={() => void removeHistory(item.taskId)}><Button size="small" type="link" danger loading={busyAction === `delete-${item.taskId}`}>{t("canvasLibraryDelete")}</Button></Popconfirm></div>)}</div> : <div className="rounded-lg bg-foreground/[.03] p-3 text-xs leading-5 text-foreground/55">{t("coverageUi.529")}</div>}
                            </section>
                        </main>
                    </div>
                </div>

                <footer className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t px-5 py-3" style={{ borderColor: "var(--border)" }}>
                    <div className="flex items-center gap-2 text-xs text-foreground/55"><CircleAlert className="size-3.5" />{t("coverageUi.530")}</div>
                    <div className="flex flex-wrap items-center justify-end gap-2"><Select size="small" value={reportFormat} disabled={!state.lastResult || Boolean(busyAction)} options={[{ value: "html", label: t("coverageUi.531") }, { value: "md", label: t("coverageUi.532") }, { value: "docx", label: t("coverageUi.533") }, { value: "json", label: t("coverageUi.534") }]} onChange={(value) => setReportFormat(value as "json" | "md" | "html" | "docx")} /><Button icon={<Download className="size-3.5" />} loading={busyAction === "export"} disabled={!state.lastResult} onClick={() => void exportReport()}>{t("canvasLibraryExport")}</Button>{state.activeTaskId && state.task?.status !== "failed" && state.task?.status !== "cancelled" ? <Popconfirm title={t("coverageUi.535")} description={t("coverageUi.536")} onConfirm={() => void stopTask()}><Button danger icon={<Pause className="size-3.5" />} loading={busyAction === "stop"}>{t("coverageUi.537")}</Button></Popconfirm> : null}{state.task?.status === "failed" || state.task?.status === "cancelled" ? <Button icon={<Play className="size-3.5" />} loading={busyAction === "retry"} onClick={() => void retryTask()}>{t("authRetry")}</Button> : null}<Button type="primary" icon={<Play className="size-3.5" />} loading={starting} disabled={!canStart} onClick={() => void startTask()}>{t("coverageUi.538")}</Button></div>
                </footer>
            </div>
        </AppModal>
    );
}

function decodedDataUrlBytes(dataUrl: string) {
    const payload = dataUrl.slice(dataUrl.indexOf(",") + 1).replace(/=+$/, "");
    return Math.floor(payload.length * 3 / 4);
}

function PortraitInputCard({ label, node, ready }: { label: string; node?: CanvasNodeData; ready: boolean }) {
    const { t } = useInterfaceTranslation();
    const preview = portraitNodePreview(node);
    return <div className="flex items-center gap-2 rounded-lg border p-2" style={{ borderColor: "var(--border)" }}>
        <div className="grid size-12 shrink-0 place-items-center overflow-hidden rounded-md bg-foreground/[.04]">
            {preview ? <img src={preview} alt="" className="size-full object-cover" loading="lazy" draggable={false} /> : <ImageIcon className="size-4 text-foreground/35" aria-hidden="true" />}
        </div>
        <div className="min-w-0 flex-1">
            <div className="text-xs font-medium">{label}</div>
            <div className="truncate text-[11px] text-foreground/50">{node?.title || (ready ? t("coverageUi.539") : t("coverageUi.540"))}</div>
        </div>
        <StatusBadge tone={ready ? "success" : "warning"} label={ready ? t("settingsUi.connected") : t("coverageUi.540")} />
    </div>;
}

function PortraitCandidateStrip({ nodes }: { nodes: CanvasNodeData[] }) {
    const { t } = useInterfaceTranslation();
    return <div className="rounded-lg border p-2" style={{ borderColor: "var(--border)" }}>
        <div className="mb-2 flex items-center justify-between gap-2 text-xs">
            <span className="font-medium">{t("canvasPortraitUi003")}</span>
            <Tag color={nodes.length ? "green" : "default"}>{nodes.length ? t("canvasUi.imageCount", { count: nodes.length }) : t("assetsUi.optional")}</Tag>
        </div>
        {nodes.length ? <div className="grid grid-cols-4 gap-1.5">{nodes.slice(0, 4).map((item, index) => {
            const preview = portraitNodePreview(item);
            return <div key={item.id} className="min-w-0">
                <div className="grid aspect-square place-items-center overflow-hidden rounded-md bg-foreground/[.04]">
                    {preview ? <img src={preview} alt="" className="size-full object-cover" loading="lazy" draggable={false} /> : <ImageIcon className="size-4 text-foreground/35" aria-hidden="true" />}
                </div>
                <div className="mt-1 truncate text-[10px] text-foreground/55" title={item.title || t("coverageUi.541", { value0: index + 1 })}>{item.title || t("coverageUi.541", { value0: index + 1 })}</div>
            </div>;
        })}</div> : <div className="rounded-md bg-foreground/[.03] px-2 py-2 text-[11px] text-foreground/50">{t("coverageUi.542")}</div>}
        {nodes.length > 4 ? <div className="mt-1 text-[10px] text-foreground/45">{t("coverageUi.349")} {nodes.length - 4} {t("coverageUi.543")}</div> : null}
    </div>;
}

function portraitNodePreview(node?: CanvasNodeData) {
    if (!node || node.type !== CanvasNodeType.Image) return "";
    return node.metadata?.previewContent || node.metadata?.content || "";
}

type PortraitResultView = {
    taskId: string;
    mode: "direct-compare" | "network-search";
    highestRisk: PortraitRiskLevel;
    riskCounts: Partial<Record<PortraitRiskLevel, number>>;
    candidateCount: number;
    comparedCount: number;
    candidates: Array<{ id: string; title: string; imageArtifactId: string; source: "connected" | "baidu"; sourcePageUrl?: string; sourceDomain?: string; resultId?: string; originalRank: number }>;
    pairs: PortraitPairResult[];
    limitations: string[];
};

function PortraitResultPanel({ result, taskId, onAddCandidate }: { result: PortraitResultView; taskId: string; onAddCandidate?: PortraitClearanceModalProps["onAddCandidate"] }) {
    const { t } = useInterfaceTranslation();
    const sortedPairs = [...result.pairs].sort((left, right) => riskRank(right.riskLevel) - riskRank(left.riskLevel) || (right.overallSimilarity || 0) - (left.overallSimilarity || 0));
    return <div className="mt-4 space-y-3"><div className="flex flex-wrap gap-2">{Object.entries(result.riskCounts).map(([risk, count]) => <Tag key={risk} color="default" style={portraitRiskTagStyle(risk as PortraitRiskLevel)}>{t(PORTRAIT_RISK_LABEL_KEYS[risk as PortraitRiskLevel])} · {count}</Tag>)}</div><div className="grid gap-3 xl:grid-cols-2">{sortedPairs.map((pair) => <ResultPairCard key={pair.id} taskId={taskId} pair={pair} candidate={result.candidates.find((candidate) => candidate.resultId === pair.id)} onAddCandidate={onAddCandidate} />)}</div>{result.limitations.length ? <div className="rounded-lg bg-foreground/[.03] p-3 text-xs leading-5 text-foreground/60"><div className="mb-1 font-semibold text-foreground/75">{t("coverageUi.544")}</div>{result.limitations.map((item) => <div key={item}>· {item}</div>)}</div> : null}</div>;
}

const PORTRAIT_FEATURES = [
    { key: "face_shape", labelKey: "coverageUi.545" },
    { key: "facial_layout", labelKey: "coverageUi.546" },
    { key: "eyes_brows", labelKey: "coverageUi.547" },
    { key: "nose_mouth", labelKey: "coverageUi.548" },
    { key: "hair_hairline", labelKey: "coverageUi.549" },
    { key: "distinctive_features", labelKey: "coverageUi.550" },
] as const satisfies readonly { key: PortraitFeatureKey; labelKey: string }[];
const PORTRAIT_FEATURE_SIMILARITY_LABEL_KEYS = {
    high: "portraitClearanceUi.similarityHigh",
    medium: "portraitClearanceUi.similarityMedium",
    low: "portraitClearanceUi.similarityLow",
    none: "portraitClearanceUi.similarityNone",
} as const;

function ResultPairCard({ taskId, pair, candidate, onAddCandidate }: { taskId: string; pair: PortraitPairResult; candidate?: PortraitResultView["candidates"][number]; onAddCandidate?: PortraitClearanceModalProps["onAddCandidate"] }) {
    const { t } = useInterfaceTranslation();
    const [image, setImage] = useState("");
    useEffect(() => {
        const controller = new AbortController();
        void readPortraitTaskImage(taskId, pair.comparisonImageId, controller.signal)
            .then((value) => setImage(value.dataUrl))
            .catch((error) => {
                if (controller.signal.aborted) return;
                // 结果正文仍可阅读，但图片读取失败必须留下任务与图片上下文，不能静默伪装成“尚未加载”。
                console.warn("读取肖像对比图片失败", { taskId, imageId: pair.comparisonImageId, error });
            });
        return () => controller.abort();
    }, [pair.comparisonImageId, taskId]);
    const vision = pair.visionComparison;
    return <article className="overflow-hidden rounded-lg border" style={{ borderColor: "var(--border)" }}>
        <div className="flex gap-3 p-3">
            <div className="grid size-24 shrink-0 place-items-center overflow-hidden rounded-md bg-foreground/[.04]">{image ? <img src={image} alt="" className="size-full object-contain" /> : <ScanFace className="size-6 opacity-35" />}</div>
            <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2"><span className="truncate text-sm font-semibold">{candidate?.title || pair.comparisonImageId}</span><Tag color="default" style={portraitRiskTagStyle(pair.riskLevel)}>{t(PORTRAIT_RISK_LABEL_KEYS[pair.riskLevel])}</Tag><StatusBadge variant="filled" tone={pair.status === "failed" ? "error" : pair.status === "partial" ? "warning" : "success"} label={pair.status === "failed" ? t("coverageUi.551") : pair.status === "partial" ? t("coverageUi.552") : t("storageUi.done")} /></div>
                <div className="mt-1 text-xs text-foreground/55">{candidate?.sourceDomain || pair.source} · {pair.analysisPath === "unable" ? t("coverageUi.553") : t("portraitClearanceUi.analysisPath", { value0: pair.analysisPath })}{pair.overallSimilarity === undefined ? "" : t("coverageUi.554", { value0: pair.overallSimilarity.toFixed(4) })}</div>
                <div className="mt-1 flex flex-wrap gap-2">{candidate?.sourcePageUrl ? <button type="button" className="text-xs text-[var(--workspace-accent)] underline" onClick={() => window.open(candidate.sourcePageUrl, "_blank", "noopener,noreferrer")}>{t("coverageUi.555")}</button> : null}{onAddCandidate && candidate && image ? <button type="button" className="text-xs text-[var(--workspace-accent)] underline" onClick={() => void onAddCandidate({ id: candidate.id, title: candidate.title, imageArtifactId: candidate.imageArtifactId }, image)}>{t("creationPageAddToCanvas")}</button> : null}</div>
            </div>
        </div>
        <div className="border-t px-3 py-2 text-xs leading-5" style={{ borderColor: "var(--border)" }}>
            <div><span className="text-foreground/50">{t("coverageUi.556")}</span>{t("coverageUi.557")} {pair.localPrecheck.facesA} / {pair.localPrecheck.facesB} {t("coverageUi.558")} {pair.localPrecheck.qualityA.grade} / {pair.localPrecheck.qualityB.grade}{pair.localPrecheck.faceSimilarity === undefined ? "" : ` · ArcFace ${pair.localPrecheck.faceSimilarity.toFixed(4)}`}</div>
            {pair.localPrecheck.reliabilityIssues.length ? <div className="mt-1 text-foreground/55"><span className="text-foreground/50">{t("coverageUi.559")}</span>{pair.localPrecheck.reliabilityIssues.join("；")}</div> : null}
            {pair.error ? <div className="mt-1 text-red-600"><span className="font-medium">{t("coverageUi.560")}</span>{pair.error.message}</div> : null}
            {vision ? <>
                <div className="mt-2 flex flex-wrap items-center gap-2"><span className="font-medium">{t("coverageUi.561")}</span><StatusBadge variant="filled" tone={vision.status === "success" ? "success" : "warning"} label={vision.status === "success" ? t("agentChromeStatusCompleted") : t("coverageUi.562")} />{vision.manualReviewRecommended ? <StatusBadge variant="filled" tone="warning" label={t("coverageUi.563")} /> : null}</div>
                <div className="mt-2 overflow-x-auto rounded-md border" style={{ borderColor: "var(--border)" }}><table className="w-full min-w-[520px] text-left text-[11px]"><thead className="bg-foreground/[.04]"><tr><th className="px-2 py-1.5 font-medium">{t("coverageUi.564")}</th><th className="px-2 py-1.5 font-medium">{t("coverageUi.565")}</th><th className="px-2 py-1.5 font-medium">{t("coverageUi.566")}</th></tr></thead><tbody>{PORTRAIT_FEATURES.map(({ key, labelKey }) => { const feature = vision.featureComparison[key]; return <tr key={key} className="border-t" style={{ borderColor: "var(--border)" }}><td className="px-2 py-1.5">{t(labelKey)}</td><td className="px-2 py-1.5"><Tag color="default" style={portraitFeatureSimilarityStyle(feature.similarity)}>{t(PORTRAIT_FEATURE_SIMILARITY_LABEL_KEYS[feature.similarity])}</Tag></td><td className="px-2 py-1.5 text-foreground/60">{feature.note || "-"}</td></tr>; })}</tbody></table></div>
                <div className="mt-2"><span className="text-foreground/50">{t("coverageUi.567")}</span>{vision.basis.join("；") || t("tasksUi.noneValue")}</div>
            </> : <div className="mt-1 text-foreground/55">{pair.basis.join("；") || t("coverageUi.568")}</div>}
        </div>
    </article>;
}

function parsePortraitResult(value: unknown): PortraitResultView {
    if (!isRecord(value) || typeof value.taskId !== "string" || !["direct-compare", "network-search"].includes(String(value.mode)) || typeof value.highestRisk !== "string" || !isRecord(value.riskCounts) || typeof value.candidateCount !== "number" || typeof value.comparedCount !== "number" || !Array.isArray(value.candidates) || !Array.isArray(value.pairs) || !Array.isArray(value.limitations)) throw new PortraitResultInvalidError();
    return { taskId: value.taskId, mode: value.mode as PortraitResultView["mode"], highestRisk: value.highestRisk as PortraitRiskLevel, riskCounts: value.riskCounts as PortraitResultView["riskCounts"], candidateCount: value.candidateCount, comparedCount: value.comparedCount, candidates: value.candidates.filter(isCandidate), pairs: value.pairs as PortraitPairResult[], limitations: value.limitations.filter((item): item is string => typeof item === "string") };
}

function isCandidate(value: unknown): value is PortraitResultView["candidates"][number] {
    return isRecord(value) && typeof value.id === "string" && typeof value.title === "string" && typeof value.imageArtifactId === "string" && (value.source === "connected" || value.source === "baidu") && typeof value.originalRank === "number";
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function riskRank(value: PortraitRiskLevel) {
    return ({ unable_to_determine: 0, low: 1, low_to_medium: 2, medium: 3, high: 4 } as Record<PortraitRiskLevel, number>)[value];
}

function formatDate(value: string, locale: string, justNow: string) {
    const time = Date.parse(value);
    return Number.isFinite(time) ? new Intl.DateTimeFormat(locale, { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(time) : justNow;
}

function portraitRuntimeErrorMessage(message: string) {
    if (!message || /会话|session|scope|权限|重新建立|尚未建立/i.test(message)) return "";
    return message;
}

function portraitRiskTone(risk: PortraitRiskLevel) {
    if (risk === "high") return "var(--status-error)";
    if (risk === "medium" || risk === "low_to_medium") return "var(--status-warning)";
    if (risk === "low") return "var(--status-success)";
    return "var(--foreground-muted)";
}

function portraitRiskTagStyle(risk: PortraitRiskLevel) {
    const tone = risk === "high" ? "var(--status-error)" : risk === "medium" || risk === "low_to_medium" ? "var(--status-warning)" : risk === "low" ? "var(--status-success)" : "var(--foreground-muted)";
    return { color: tone, backgroundColor: `color-mix(in oklch, ${tone} 18%, transparent)`, borderColor: `color-mix(in oklch, ${tone} 42%, transparent)` };
}

function portraitFeatureSimilarityStyle(similarity: "high" | "medium" | "low" | "none") {
    const tone = similarity === "high" ? "var(--status-error)" : similarity === "medium" ? "var(--status-warning)" : similarity === "low" ? "var(--status-success)" : "var(--foreground-muted)";
    return { color: tone, backgroundColor: `color-mix(in oklch, ${tone} 18%, transparent)`, borderColor: `color-mix(in oklch, ${tone} 42%, transparent)` };
}

function Metric({ label, value, tone }: { label: string; value: string; tone?: string }) {
    const toneStyle = tone ? { background: `color-mix(in oklch, ${tone} 10%, transparent)`, borderColor: `color-mix(in oklch, ${tone} 35%, var(--border))` } : undefined;
    return <div className="rounded-lg border bg-foreground/[.04] p-3" style={toneStyle}><div className="text-xs text-foreground/50">{label}</div><div className="mt-1 text-sm font-semibold" style={tone ? { color: tone } : undefined}>{value}</div></div>;
}
