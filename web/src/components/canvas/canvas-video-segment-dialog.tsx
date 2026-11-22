import { useInterfaceTranslation } from "@/stores/use-interface-locale-store";
import { useEffect, useMemo, useRef, useState } from "react";
import { App, Button, Input, InputNumber, Modal, Segmented } from "antd";
import { AudioLines, Check, ListVideo, Plus, Scissors, SkipBack, SkipForward, Trash2 } from "lucide-react";
import { nanoid } from "nanoid";
import { ModelPicker } from "@/components/model-picker";
import { canvasThemes } from "@/lib/canvas-theme";
import { buildTimelineImportSegments, type CanvasTimelineSegmentItem } from "@/lib/canvas/canvas-video-timeline-segments";
import { listVideoReferenceModels } from "@/lib/canvas/canvas-video-regeneration";
import { modelCapabilityConfigFor } from "@/lib/model-capabilities";
import { modelRequestOptions, resolveCompatibleModel, type ModelRequirements } from "@/lib/model-selection";
import { navigateToSettings } from "@/lib/settings-navigation";
import { useActiveTheme } from "@/stores/canvas/use-canvas-theme-store";
import { resolveVideoMediaUrl } from "@/services/file-storage";
import { modelDisplayName, type AiConfig } from "@/stores/use-config-store";
import { type CanvasConnection, type CanvasNodeData, type CanvasVideoEditOperation } from "@/types/canvas";
import type { TimelineProject } from "@/types/timeline";
import { Select } from "@/components/ui/base/select";
export type CanvasVideoSegmentItem = CanvasTimelineSegmentItem;
export type CanvasVideoSegmentParams = {
    mode: "audio" | "video";
    action?: "extract" | "create-generation-nodes";
    startMs: number;
    endMs: number;
    prompt?: string;
    segments?: CanvasVideoSegmentItem[];
    model?: string;
    operation?: CanvasVideoEditOperation;
};
type CanvasVideoSegmentDialogProps = {
    node: CanvasNodeData;
    nodes: CanvasNodeData[];
    connections: CanvasConnection[];
    open: boolean;
    mode: "audio" | "video";
    config: AiConfig;
    timeline?: TimelineProject | null;
    onClose: () => void;
    onConfirm: (params: CanvasVideoSegmentParams) => void;
};
const MIN_SEGMENT_MS = 100;
export function CanvasVideoSegmentDialog({ node, nodes, connections, open, mode, config, timeline, onClose, onConfirm }: CanvasVideoSegmentDialogProps) {
    const { t } = useInterfaceTranslation();
    const { message } = App.useApp();
    const theme = canvasThemes[useActiveTheme()];
    const videoRef = useRef<HTMLVideoElement>(null);
    const segmentsSeededRef = useRef(false);
    const [videoUrl, setVideoUrl] = useState("");
    const [videoError, setVideoError] = useState(false);
    const [durationMs, setDurationMs] = useState(0);
    const [startSec, setStartSec] = useState(0);
    const [endSec, setEndSec] = useState(0);
    const [prompt, setPrompt] = useState("");
    const [segments, setSegments] = useState<CanvasVideoSegmentItem[]>([]);
    const [model, setModel] = useState("");
    const [operation, setOperation] = useState<CanvasVideoEditOperation>("extend");
    const [videoAction, setVideoAction] = useState<"extract" | "create-generation-nodes">("extract");
    const eligibleModels = useMemo(() => listVideoReferenceModels(config), [config]);
    // 打开弹窗时解析视频地址，读取时长并初始化起止时间。
    useEffect(() => {
        if (!open) return;
        let cancelled = false;
        setVideoUrl("");
        setVideoError(false);
        setDurationMs(0);
        setStartSec(0);
        setEndSec(0);
        setPrompt("");
        setSegments([]);
        setVideoAction("extract");
        segmentsSeededRef.current = false;
        const defaultModel = config.videoModel || config.model || "";
        const initialModel = eligibleModels.includes(defaultModel) ? defaultModel : eligibleModels[0] || defaultModel;
        setModel(initialModel);
        const profile = initialModel ? modelCapabilityConfigFor(config, initialModel).video : undefined;
        setOperation(profile?.operations.includes("extend") ? "extend" : (profile?.operations[0] as CanvasVideoEditOperation | undefined) || "extend");
        const storageKey = node.metadata?.storageKey || "";
        const fallback = node.metadata?.content || "";
        void resolveVideoMediaUrl(storageKey, fallback)
            .then((url) => {
                if (!cancelled) {
                    setVideoUrl(url);
                    setVideoError(!url);
                }
            })
            .catch(() => {
                if (!cancelled) setVideoError(true);
            });
        return () => {
            cancelled = true;
        };
    }, [open, node.id, node.metadata?.storageKey, node.metadata?.content]);
    // 视频模式等待时长元数据就绪后，默认放入一个完整时长的片段。
    useEffect(() => {
        if (!open || mode !== "video" || segmentsSeededRef.current || !durationMs) return;
        segmentsSeededRef.current = true;
        setSegments([{ id: nanoid(), startMs: 0, endMs: durationMs, sourceNodeId: node.id }]);
    }, [durationMs, mode, open]);
    const isVideoMode = mode === "video";
    const createsGenerationNodes = videoAction === "create-generation-nodes";
    const durationSec = durationMs > 0 ? durationMs / 1000 : 0;
    const hasTimelineVideoClips = Boolean(timeline?.clips.some((clip) => clip.kind === "video"));
    const hasPrompt = Boolean(prompt.trim());
    const modelRequirements = useMemo<ModelRequirements>(
        () => ({
            capability: "video",
            input: { textCount: createsGenerationNodes && hasPrompt ? 1 : 0, imageCount: 0, videoCount: createsGenerationNodes ? 1 : 0, audioCount: 0, characterCount: 0 },
            videoOperation: operation,
            videoSeconds: config.videoSeconds,
            options: modelRequestOptions(config, "video"),
        }),
        [config.videoSeconds, createsGenerationNodes, hasPrompt, operation],
    );
    const resolvedModel = resolveCompatibleModel(config, model, modelRequirements) || model;
    const videoProfile = useMemo(() => (resolvedModel ? modelCapabilityConfigFor(config, resolvedModel).video : undefined), [config, resolvedModel]);
    const defaultModel = config.videoModel || config.model || "";
    const defaultModelSupported = eligibleModels.includes(defaultModel);
    const hasEligibleModels = eligibleModels.length > 0;
    const firstEligibleModel = eligibleModels[0] || "";
    // 切换模型后保持所选模式仍然有效，优先回退到“视频续写”。
    useEffect(() => {
        if (!videoProfile?.operations.length || videoProfile.operations.includes(operation)) return;
        setOperation(videoProfile.operations.includes("extend") ? "extend" : (videoProfile.operations[0] as CanvasVideoEditOperation));
    }, [operation, videoProfile]);
    const operationOptions = (videoProfile?.operations || []).map((value) => {
        const operation = value as CanvasVideoEditOperation;
        return { value: operation, label: videoOperationLabel(operation, t) };
    });
    const rangeMs = useMemo(() => {
        const start = Math.max(0, Math.round((startSec || 0) * 1000));
        const end = durationMs > 0 ? Math.min(durationMs, Math.round((endSec || 0) * 1000)) : Math.round((endSec || 0) * 1000);
        return { startMs: start, endMs: Math.max(start, end) };
    }, [durationMs, endSec, startSec]);
    const addManualSegment = () => {
        const last = segments[segments.length - 1];
        const maxEndMs = durationMs || last?.endMs || 0;
        const startMs = last ? Math.min(maxEndMs, last.endMs) : 0;
        const endMs = Math.max(startMs + MIN_SEGMENT_MS, maxEndMs);
        setSegments((current) => [...current, { id: nanoid(), startMs, endMs, sourceNodeId: node.id }]);
    };
    const importTimelineSegments = () => {
        try {
            const result = buildTimelineImportSegments(node, nodes, connections, timeline, durationMs);
            if (!result.ok) {
                message.warning(result.error);
                return;
            }
            setSegments(result.segments);
            setPrompt((current) => current || `按时间线截取的 ${result.segments.length} 段视频，保持画面主体与镜头，重新生成每一段`);
            message.success(t("canvasVideoDyn001", { count: result.segments.length }));
        } catch (error) {
            console.warn("时间线片段导入失败", error);
            message.warning(t("canvasVideoSegmentUi001"));
        }
    };
    const updateSegment = (id: string, patch: Partial<Pick<CanvasVideoSegmentItem, "startMs" | "endMs">>) => {
        setSegments((current) => current.map((item) => (item.id === id ? { ...item, ...patch } : item)));
    };
    const removeSegment = (id: string) => {
        setSegments((current) => current.filter((item) => item.id !== id));
    };
    const handleConfirm = () => {
        if (isVideoMode) {
            if (createsGenerationNodes && !model) {
                message.warning(t("canvasVideoSegmentUi002"));
                return;
            }
            if (!segments.length) {
                message.warning(t("canvasVideoSegmentUi003"));
                return;
            }
            for (const segment of segments) {
                if (segment.endMs - segment.startMs < MIN_SEGMENT_MS) {
                    message.warning(t("canvasVideoSegmentUi004"));
                    return;
                }
            }
            onConfirm({
                mode: "video",
                action: videoAction,
                startMs: 0,
                endMs: 0,
                segments: segments.map(({ id, startMs, endMs, sourceNodeId, sourceStorageKey, sourceUrl }) => ({ id, startMs, endMs, sourceNodeId, sourceStorageKey, sourceUrl })),
                model: createsGenerationNodes ? resolvedModel : undefined,
                operation: createsGenerationNodes ? operation : undefined,
                prompt: createsGenerationNodes ? prompt.trim() : undefined,
            });
            return;
        }
        if (!durationMs) {
            message.warning(t("canvasVideoSegmentUi005"));
            return;
        }
        if (rangeMs.endMs - rangeMs.startMs < MIN_SEGMENT_MS) {
            message.warning(t("canvasVideoSegmentUi004"));
            return;
        }
        onConfirm({ mode: "audio", startMs: rangeMs.startMs, endMs: rangeMs.endMs });
    };
    const title = (
        <div className="flex min-w-0 items-center gap-2">
            <span className="grid size-8 shrink-0 place-items-center rounded-lg" style={{ background: theme.accent.primarySoft, color: theme.accent.primary }}>
                {isVideoMode ? <Scissors className="size-4" /> : <AudioLines className="size-4" />}
            </span>
            <div className="min-w-0">
                <div className="truncate font-semibold leading-6">{isVideoMode ? t("canvasVideoSegmentUi006") : t("canvasVideoSegmentUi007")}</div>
                <div className="truncate text-xs opacity-45">{node.title || t("contextVideoNode")}</div>
            </div>
        </div>
    );
    return (
        <Modal title={title} open={open} onCancel={onClose} footer={null} width={680} centered destroyOnHidden>
            <div className="space-y-4">
                <div className="flex min-h-0 items-center justify-center overflow-hidden rounded-xl border bg-black" style={{ borderColor: theme.toolbar.border }}>
                    {videoUrl ? (
                        <video
                            ref={videoRef}
                            src={videoUrl}
                            controls
                            playsInline
                            preload="metadata"
                            className="block max-h-[var(--video-segment-preview-max-height)] w-full"
                            onLoadedMetadata={(event) => {
                                const video = event.currentTarget;
                                if (Number.isFinite(video.duration) && video.duration > 0) {
                                    const totalMs = Math.round(video.duration * 1000);
                                    setDurationMs(totalMs);
                                    setEndSec(totalMs / 1000);
                                }
                            }}
                            onError={() => setVideoError(true)}
                        />
                    ) : (
                        <div className="grid h-40 w-full place-items-center text-xs opacity-60">{videoError ? t("canvasSubtitleUi012") : t("canvasUi.loadingVideo")}</div>
                    )}
                </div>

                {isVideoMode ? (
                    <div className="space-y-2">
                        {createsGenerationNodes && !defaultModelSupported ? (
                            <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2 text-xs" style={{ background: theme.accent.primarySoft + "1a", borderColor: theme.accent.primarySoft, color: theme.node.muted }}>
                                <span className="min-w-0 flex-1">
                                    {hasEligibleModels && defaultModel
                                        ? t("canvasVideoDyn002", { model: modelDisplayName(config, defaultModel), target: modelDisplayName(config, firstEligibleModel) })
                                        : t("canvasVideoDyn003", { target: modelDisplayName(config, firstEligibleModel) })}
                                </span>
                                {!hasEligibleModels ? (
                                    <Button size="small" type="primary" onClick={() => navigateToSettings({ section: "channels", continueCreation: true })}>
                                        {t("canvasVideoSegmentUi009")}
                                    </Button>
                                ) : null}
                            </div>
                        ) : null}

                        <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="flex items-center gap-2 text-sm">
                                <span className="opacity-60">{t("timelineDuration")}</span>
                                <span>{durationSec ? formatSegmentTime(durationSec) : t("canvasImportUnknown")}</span>
                                <span className="opacity-60">{t("canvasUi.selected")}</span>
                                <span>{t("canvasVideoDyn010", { count: segments.length })}</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <Button size="small" icon={<Plus className="size-3.5" />} disabled={!durationSec} onClick={addManualSegment}>
                                    {t("canvasVideoSegmentUi011")}
                                </Button>
                                <Button size="small" icon={<ListVideo className="size-3.5" />} disabled={!hasTimelineVideoClips} onClick={importTimelineSegments}>
                                    {t("canvasVideoSegmentUi012")}
                                </Button>
                            </div>
                        </div>

                        {segments.length ? (
                            <div className="thin-scrollbar max-h-56 space-y-2 overflow-y-auto pr-1">
                                {segments.map((segment, index) => (
                                    <div key={segment.id} className="rounded-lg border px-2 py-2" style={{ borderColor: theme.toolbar.border }}>
                                        <div className="grid grid-cols-[auto_1fr_1fr_auto] items-center gap-2">
                                            <span className="w-14 shrink-0 text-xs font-medium">
                                                {t("projectUi.editorClipCount")} {index + 1}
                                            </span>
                                            <div className="flex min-w-0 items-center gap-1">
                                                <span className="shrink-0 text-xs opacity-60">{t("timelineStart")}</span>
                                                <InputNumber
                                                    size="small"
                                                    min={0}
                                                    max={Math.max(0, durationSec - 0.1)}
                                                    step={0.1}
                                                    value={segment.startMs / 1000}
                                                    onChange={(value) => updateSegment(segment.id, { startMs: Math.round((value ?? 0) * 1000) })}
                                                    className="w-full"
                                                    aria-label={t("canvasVideoDyn005", { index: index + 1 })}
                                                />
                                            </div>
                                            <div className="flex min-w-0 items-center gap-1">
                                                <span className="shrink-0 text-xs opacity-60">{t("canvasVideoSegmentUi013")}</span>
                                                <InputNumber
                                                    size="small"
                                                    min={0}
                                                    max={Math.max(0, durationSec)}
                                                    step={0.1}
                                                    value={segment.endMs / 1000}
                                                    onChange={(value) => updateSegment(segment.id, { endMs: Math.round((value ?? 0) * 1000) })}
                                                    className="w-full"
                                                    aria-label={t("canvasVideoDyn006", { index: index + 1 })}
                                                />
                                            </div>
                                            <Button size="small" type="text" danger icon={<Trash2 className="size-3.5" />} aria-label={t("canvasVideoDyn007", { index: index + 1 })} onClick={() => removeSegment(segment.id)} />
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="rounded-lg border border-dashed px-3 py-3 text-xs opacity-55" style={{ borderColor: theme.toolbar.border }}>
                                {t("canvasVideoSegmentUi014")}
                            </div>
                        )}

                        <div className="rounded-xl px-3 py-2" style={{ background: theme.toolbar.itemHover }}>
                            <div className="mb-2 flex items-center justify-between gap-3">
                                <div>
                                    <div className="text-sm font-medium">{t("canvasVideoSegmentUi015")}</div>
                                    <div className="mt-0.5 text-xs opacity-45">{t("canvasVideoSegmentUi016")}</div>
                                </div>
                                <Segmented
                                    size="small"
                                    value={videoAction}
                                    options={[
                                        { label: t("canvasVideoSegmentUi017"), value: "extract" },
                                        { label: t("canvasVideoSegmentUi018"), value: "create-generation-nodes" },
                                    ]}
                                    onChange={(value) => setVideoAction(value as "extract" | "create-generation-nodes")}
                                />
                            </div>
                        </div>

                        {createsGenerationNodes ? (
                            <>
                                <div className="grid gap-3 md:grid-cols-2">
                                    <label className="block min-w-0">
                                        <div className="mb-2 text-sm font-medium">{t("canvasVideoSegmentUi019")}</div>
                                        <ModelPicker config={config} value={resolvedModel} onChange={setModel} capability="video" requirements={modelRequirements} fullWidth onMissingConfig={() => message.warning(t("canvasVideoSegmentUi020"))} />
                                    </label>
                                    <label className="block min-w-0">
                                        <div className="mb-2 text-sm font-medium">{t("previewParamMode")}</div>
                                        <Select className="w-full" size="small" value={operation} options={operationOptions} placeholder={t("canvasVideoSegmentUi021")} onChange={(value) => setOperation(value as CanvasVideoEditOperation)} />
                                    </label>
                                </div>

                                <label className="block">
                                    <div className="mb-2 text-sm font-medium">{t("canvasPrevisUi168")}</div>
                                    <Input.TextArea autoSize={{ minRows: 2, maxRows: 4 }} value={prompt} placeholder={t("canvasVideoSegmentUi022")} onChange={(event) => setPrompt(event.target.value)} />
                                    <div className="mt-1 text-xs opacity-45">{t("canvasVideoSegmentUi023")}</div>
                                </label>
                            </>
                        ) : (
                            <div className="text-xs opacity-45">{t("canvasVideoSegmentUi024")}</div>
                        )}
                    </div>
                ) : (
                    <div className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-lg border px-3 py-2 text-sm" style={{ borderColor: theme.toolbar.border }}>
                        <div className="flex items-center gap-2">
                            <span className="opacity-60">{t("timelineDuration")}</span>
                            <span>{durationSec ? formatSegmentTime(durationSec) : t("canvasImportUnknown")}</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <span className="opacity-60">{t("timelineStart")}</span>
                            <InputNumber size="small" min={0} max={Math.max(0, durationSec - 0.1)} step={0.1} value={startSec} onChange={(value) => setStartSec(value ?? 0)} className="w-28" aria-label={t("canvasVideoSegmentUi025")} />
                            <Button
                                size="small"
                                type="text"
                                icon={<SkipBack className="size-3.5" />}
                                aria-label={t("canvasVideoSegmentUi026")}
                                onClick={() => {
                                    if (videoRef.current) videoRef.current.currentTime = startSec;
                                }}
                            />
                        </div>
                        <div className="flex items-center gap-2">
                            <span className="opacity-60">{t("canvasVideoSegmentUi013")}</span>
                            <InputNumber size="small" min={0} max={Math.max(0, durationSec)} step={0.1} value={endSec} onChange={(value) => setEndSec(value ?? 0)} className="w-28" aria-label={t("canvasVideoSegmentUi027")} />
                            <Button
                                size="small"
                                type="text"
                                icon={<SkipForward className="size-3.5" />}
                                aria-label={t("canvasVideoSegmentUi028")}
                                onClick={() => {
                                    if (videoRef.current) videoRef.current.currentTime = endSec;
                                }}
                            />
                        </div>
                        <div className="flex items-center gap-2">
                            <span className="opacity-60">{t("projectUi.editorClipCount")}</span>
                            <span>{formatSegmentTime((rangeMs.endMs - rangeMs.startMs) / 1000)}</span>
                        </div>
                        <Button
                            size="small"
                            disabled={!durationSec}
                            onClick={() => {
                                setStartSec(0);
                                setEndSec(durationSec);
                            }}
                        >
                            {t("canvasVideoSegmentUi029")}
                        </Button>
                        <div className="w-full text-xs opacity-45">{t("canvasVideoSegmentUi030")}</div>
                    </div>
                )}

                <div className="flex items-center justify-end gap-2">
                    <Button onClick={onClose}>{t("timelineCancel")}</Button>
                    <Button type="primary" icon={<Check className="size-4" />} disabled={isVideoMode ? !segments.length : !durationSec} onClick={handleConfirm}>
                        {isVideoMode ? (createsGenerationNodes ? t("canvasVideoDyn008", { count: segments.length }) : t("canvasVideoDyn009", { count: segments.length })) : t("canvasVideoSegmentUi031")}
                    </Button>
                </div>
            </div>
        </Modal>
    );
}
function videoOperationLabel(operation: CanvasVideoEditOperation, t: ReturnType<typeof useInterfaceTranslation>["t"]) {
    const labels: Record<CanvasVideoEditOperation, Parameters<typeof t>[0]> = {
        text_to_video: "canvasVideoOperationTextToVideo",
        image_to_video: "canvasVideoOperationImageToVideo",
        reference_to_video: "canvasVideoOperationReferenceToVideo",
        extend: "canvasVideoOperationExtend",
        inpaint: "canvasVideoOperationInpaint",
        replace_element: "canvasVideoOperationReplaceElement",
        camera_motion: "canvasVideoOperationCameraMotion",
        style_transfer: "canvasVideoOperationStyleTransfer",
        audio_to_video: "canvasVideoOperationAudioToVideo",
        compare_versions: "canvasVideoOperationCompareVersions",
        concat: "canvasVideoOperationConcat",
        enhance: "画质增强",
        depth: "相对深度",
    };
    return t(labels[operation]);
}
function formatSegmentTime(seconds: number) {
    const total = Math.max(0, seconds);
    const hours = Math.floor(total / 3600);
    const minutes = Math.floor((total % 3600) / 60);
    const rawSeconds = total % 60;
    const secs = rawSeconds % 1 === 0 ? String(Math.floor(rawSeconds)).padStart(2, "0") : rawSeconds.toFixed(1).padStart(4, "0");
    return hours > 0 ? `${hours}:${String(minutes).padStart(2, "0")}:${secs}` : `${minutes}:${secs}`;
}
