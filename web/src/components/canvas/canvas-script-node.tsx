import { useInterfaceTranslation } from "@/stores/use-interface-locale-store";
import { Button, Input, InputNumber, Modal, Popover } from "antd";
import { CanvasAnchoredDropdown as Dropdown } from "./canvas-anchored-dropdown";
import { Tooltip } from "@/components/ui/base/tooltip";
import { useCallback, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";

import type { MenuProps } from "antd";
import { Check, Clapperboard, Expand, Film, Grid3X3, Image as ImageIcon, ListTree, Merge, MoreHorizontal, Plus, RefreshCw, Send, Square, Trash2, Video } from "lucide-react";

import { CanvasResourceMentionTextarea } from "@/components/canvas/canvas-resource-mention-textarea";
import { StoryboardAssetsCell } from "@/components/canvas/storyboard-assets-cell";
import { StoryboardReferenceCell } from "@/components/canvas/storyboard-reference-cell";
import "./canvas-script-node.css";
import { ModelPicker } from "@/components/model-picker";
import { buildGenerationConfig } from "@/lib/canvas/canvas-project-generation";
import { copyStoryboardRow } from "@/lib/canvas/canvas-node-copy";
import { storyboardCsv } from "@/lib/canvas/canvas-storyboard-export";
import { confirmStoryboardDialogueReferenceReview, dialogueLineReviewIssue, storyboardDialogueText, updateStoryboardDialogueLine } from "@/lib/canvas/canvas-storyboard-dialogue";
import { saveAs } from "file-saver";
import type { InterfaceTranslate } from "@/lib/interface-locale";
import type { StoryboardView } from "@/types/canvas";
import type { CanvasResourceReference } from "@/lib/canvas/canvas-resource-references";
import { type CanvasStoryboardPipelineProgress } from "@/lib/canvas/canvas-storyboard-progress";
import { generationErrorMessage } from "@/lib/generation-error";
import { generationTaskShowsProgress, generationTaskStageLabel } from "@/lib/generation-task-display";
import { navigateToSettings } from "@/lib/settings-navigation";
import { canvasThemes } from "@/lib/canvas-theme";
import { useEffectiveConfig } from "@/stores/use-config-store";
import { useActiveTheme } from "@/stores/canvas/use-canvas-theme-store";
import { STORYBOARD_COMPOSER_MIN_HEIGHT, STORYBOARD_HEADER_HEIGHT, STORYBOARD_ROW_HEIGHT, storyboardTableHeight } from "@/lib/canvas/canvas-storyboard-layout";
import type { CanvasGenerationBatch, CanvasGenerationBatchItem, CanvasNodeData, CanvasWorkspaceMode, StoryboardRow, StoryboardShotCount, StoryboardShotDuration, StoryboardVideoInputMode } from "@/types/canvas";
import type { TaskStatus } from "@/services/api/task-center";
import { CanvasNodeType } from "@/types/canvas";
import { Select } from "@/components/ui/base/select";
import { GenerationBatchDetails, StoryboardMiniPipeline, batchItemTone, batchRowTone, generationBatchItemLabel, generationBatchRowLabel, generationBatchSummary } from "./canvas-script-node-parts";
import "./canvas-script-editor.css";
export { CanvasScriptEditor } from "./canvas-script-editor";

const STORYBOARD_PROMPT_MIN_HEIGHT = 40;
const STORYBOARD_PROMPT_MAX_HEIGHT = 116;
const SCRIPT_GRID_TEMPLATE = "64px 76px minmax(300px, 1.55fr) minmax(220px, 1fr) 180px";
export function CanvasScriptNodeContent({
    node,
    nodes,
    batch,
    pipeline,
    scale,
    mentionReferences,
    onOpen,
    onCreateImageNodes,
    onCreateVideoNodes,
    onGenerateImages,
    onGenerateVideos,
    onVideoInputModeChange,
    onMergeVideos,
    onCreateActionBoards,
    onRetryBatch,
    onRetryBatchItem,
    onStopBatch,
    onAddRow,
    onRemoveRow,
    onUpdateRow,
    onPromptChange,
    onGenerateScript,
    onModelChange,
    onImageModelChange,
    onShotDurationChange,
    onShotCountChange,
    onComposerHeightChange,
    onConnectStart,
    onScrollTopChange,
    workspaceMode = "professional",
 onEditAssets}: {
    node: CanvasNodeData;
    nodes: CanvasNodeData[];
    batch?: CanvasGenerationBatch;
    pipeline: CanvasStoryboardPipelineProgress;
    scale: number;
    mentionReferences: CanvasResourceReference[];
    onOpen: () => void;
    onCreateImageNodes: () => void;
    onCreateVideoNodes: () => void;
    onGenerateImages: (rowIds: string[]) => void;
    onGenerateVideos: (rowIds: string[]) => void;
    onVideoInputModeChange: (mode: StoryboardVideoInputMode) => void;
    onMergeVideos: () => void;
    onCreateActionBoards: () => void;
    onRetryBatch: (batchId: string) => void;
    onRetryBatchItem: (batchId: string, itemId: string) => void;
    onStopBatch: (batchId: string) => void;
    onAddRow: () => void;
    onRemoveRow: (rowId: string) => void;
    onUpdateRow: (rowId: string, patch: Partial<StoryboardRow>) => void;
    onPromptChange: (prompt: string) => void;
    onGenerateScript: (prompt: string) => void;
    onModelChange: (model: string) => void;
    onImageModelChange: (model: string) => void;
    onShotDurationChange: (duration: StoryboardShotDuration) => void;
    onShotCountChange: (count: StoryboardShotCount) => void;
    onComposerHeightChange: (height: number) => void;
    onConnectStart: (event: ReactPointerEvent, rowId: string, handleType: "source" | "target") => void;
    onScrollTopChange: (scrollTop: number) => void;
    workspaceMode?: CanvasWorkspaceMode;

onEditAssets: (rowId: string) => void;}) {
    const { t } = useInterfaceTranslation();
    const theme = canvasThemes[useActiveTheme()];
    const effectiveConfig = useEffectiveConfig();
    const generationConfig = buildGenerationConfig(effectiveConfig, node, "text");
    const imageConfig = node.metadata?.storyboardImageDefaults
        ? buildGenerationConfig(
              effectiveConfig,
              {
                  ...node,
                  type: CanvasNodeType.Image,
                  metadata: { ...node.metadata.storyboardImageDefaults, generationMode: "image" },
              },
              "image",
          )
        : undefined;
    const simpleMode = workspaceMode === "simple";
    const rows = node.metadata?.storyboard?.rows || [];
    const [prompt, setPrompt] = useState(node.metadata?.composerContent || "");
    const [scrollTop, setScrollTop] = useState(0);
    const composerHeightChangeRef = useRef(onComposerHeightChange);
    const reportedComposerHeightRef = useRef<number | null>(null);
    const composerHeight = node.metadata?.storyboardComposerHeight || STORYBOARD_COMPOSER_MIN_HEIGHT;
    const tableHeight = storyboardTableHeight(node.height, composerHeight);
    const totalDuration = rows.reduce((sum, row) => sum + (Number(row.durationSeconds) || 0), 0);
    const shotDuration = node.metadata?.storyboardShotDuration || "auto";
    const shotCount = node.metadata?.storyboardShotCount || "auto";
    const videoInputMode = node.metadata?.storyboardVideoInputMode || "direct";
    const batchItemsByRowId = useMemo(() => {
        const itemsByRowId = new Map<string, CanvasGenerationBatchItem[]>();
        for (const item of batch?.items || []) {
            const items = itemsByRowId.get(item.rowId) || [];
            items.push(item);
            itemsByRowId.set(item.rowId, items);
        }
        return itemsByRowId;
    }, [batch?.items]);
    const batchSummary = batch ? generationBatchSummary(batch, t) : null;
    const hasFailedBatchItems = Boolean(batch?.items.some((item) => item.status === "failed"));
    const hasWaitingBatchItems = Boolean(batch?.items.some((item) => item.status === "waiting" || item.status === "submitting"));
    const hasActiveBatchItems = Boolean(batch?.items.some((item) => item.status === "waiting" || item.status === "submitting" || item.status === "queued" || item.status === "running"));
    const taskStatus = node.metadata?.taskStatus;
    const displayStatus: TaskStatus = taskStatus === "queued" || taskStatus === "succeeded" || taskStatus === "failed" || taskStatus === "cancelled" ? taskStatus : "running";
    const displayTask = node.metadata?.taskId
        ? {
              provider: node.metadata.taskProvider,
              status: displayStatus,
              stage: node.metadata.taskStage,
              officialStatus: node.metadata.taskOfficialStatus,
              errorCode: node.metadata.taskErrorCode,
          }
        : null;
    const taskFeedback =
        node.metadata?.status === "loading"
            ? displayTask
                ? `${generationTaskStageLabel(displayTask)}${generationTaskShowsProgress(displayTask) && typeof node.metadata.taskProgress === "number" ? ` · ${node.metadata.taskProgress}%` : ""}`
                : t("canvasScriptUi114")
            : node.metadata?.status === "error"
              ? generationErrorMessage(node.metadata.errorDetails)
              : "";
    const [batchDetailsOpen, setBatchDetailsOpen] = useState(false);
    const [moreMenuOpen, setMoreMenuOpen] = useState(false);
    const pipelineDisabled = !rows.length || node.metadata?.status === "loading" || hasActiveBatchItems;
    const missingImages = Math.max(0, pipeline.images.total - pipeline.images.created);
    const missingVideos = Math.max(0, pipeline.videos.total - pipeline.videos.created);
    const canMerge = pipeline.successfulVideoNodeIds.length >= 2 && pipeline.final.success === 0;
    const allRowIds = pipeline.rows.map((item) => item.row.id);
    const moreMenuItems: MenuProps["items"] = [
        { key: "generate-images", icon: <ImageIcon className="size-3.5" />, label: t("canvasScriptUi001"), disabled: pipelineDisabled || pipeline.images.incomplete === 0, onClick: () => onGenerateImages(allRowIds) },
        { key: "generate-videos", icon: <Video className="size-3.5" />, label: t("canvasScriptUi002"), disabled: pipelineDisabled || pipeline.videos.incomplete === 0, onClick: () => onGenerateVideos(allRowIds) },
        {
            key: "merge",
            icon: <Merge className="size-3.5" />,
            label: pipeline.final.success ? t("canvasScriptUi115") : pipeline.successfulVideoNodeIds.length >= 2 ? t("canvasScriptDyn001", { count: pipeline.successfulVideoNodeIds.length }) : t("canvasScriptUi116"),
            disabled: !canMerge,
            onClick: () => onMergeVideos(),
        },
        { type: "divider" },
        {
            key: "video-input",
            icon: <Film className="size-3.5" />,
            label: t("canvasScriptUi003"),
            children: [
                { key: "video-input-direct", label: videoInputMode === "direct" ? "✓ " + t("canvasScriptUi082") : t("canvasScriptUi082"), onClick: () => onVideoInputModeChange("direct") },
                { key: "video-input-keyframe", label: videoInputMode === "keyframe" ? "✓ " + t("canvasScriptUi083") : t("canvasScriptUi083"), onClick: () => onVideoInputModeChange("keyframe") },
            ],
        },
        ...(!simpleMode
            ? [
                  { type: "divider" as const },
                  {
                      key: "create-image-nodes",
                      icon: <Grid3X3 className="size-3.5" />,
                      label: missingImages ? t("canvasScriptDyn002", { count: missingImages }) : t("canvasScriptUi117"),
                      disabled: pipelineDisabled || missingImages === 0,
                      onClick: () => onCreateImageNodes(),
                  },
                  {
                      key: "create-video-nodes",
                      icon: <Film className="size-3.5" />,
                      label: missingVideos ? t("canvasScriptDyn003", { count: missingVideos }) : t("canvasScriptUi118"),
                      disabled: pipelineDisabled || missingVideos === 0,
                      onClick: () => onCreateVideoNodes(),
                  },
                  { key: "action-boards", icon: <Grid3X3 className="size-3.5" />, label: t("canvasScriptUi004"), disabled: !rows.length || hasActiveBatchItems, onClick: () => onCreateActionBoards() },
              ]
            : []),
        ...(batch
            ? [
                  { type: "divider" as const },
                  { key: "retry", icon: <RefreshCw className="size-3.5" />, label: t("canvasScriptUi005"), disabled: !hasFailedBatchItems, onClick: () => onRetryBatch(batch.id) },
                  { key: "stop", icon: <Square className="size-3.5" />, label: t("canvasScriptUi006"), disabled: !hasWaitingBatchItems, onClick: () => onStopBatch(batch.id) },
                  { key: "details", icon: <ListTree className="size-3.5" />, label: t("canvasScriptUi007"), onClick: () => setBatchDetailsOpen(true) },
              ]
            : []),
    ];
    const submitPrompt = () => {
        const value = prompt.trim();
        if (value && node.metadata?.status !== "loading") onGenerateScript(value);
    };
    useLayoutEffect(() => {
        composerHeightChangeRef.current = onComposerHeightChange;
    }, [onComposerHeightChange]);
    const resizePrompt = useCallback((contentHeight: number) => {
        const promptHeight = Math.min(STORYBOARD_PROMPT_MAX_HEIGHT, Math.max(STORYBOARD_PROMPT_MIN_HEIGHT, contentHeight));
        const composerHeight = promptHeight + 64;
        if (reportedComposerHeightRef.current === composerHeight) return;
        reportedComposerHeightRef.current = composerHeight;
        composerHeightChangeRef.current(composerHeight);
    }, []);

    if (node.metadata?.ltvStoryboardSource?.videoStory)
        return (
            <div className="flex h-full w-full flex-col overflow-hidden rounded-[17px]" style={{ color: theme.node.text, background: theme.node.panel }}>
                <div className="flex h-10 shrink-0 items-center gap-2 border-b px-4" style={{ borderColor: theme.node.stroke }}>
                    <Clapperboard className="size-4" />
                    <span className="min-w-0 flex-1 truncate text-sm font-semibold">{node.title || t("canvasScriptUi008")}</span>
                    <span className="text-xs">{t("canvasScriptDyn006", { count: rows.length, duration: totalDuration })}</span>
                    <Button size="small" onClick={onOpen}>
                        {t("canvasScriptUi011")}
                    </Button>
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto px-4 py-2" data-canvas-wheel-scroll onWheel={(event) => event.stopPropagation()}>
                    {rows.map((row) => (
                        <div key={row.id} className="border-b py-2 text-xs" style={{ borderColor: theme.node.stroke }}>
                            <span className="font-semibold">
                                {t("creationPageShot")} {row.shotNumber} · {row.videoReference?.startTime}–{row.videoReference?.endTime}s
                            </span>
                            <p className="mt-1 line-clamp-2">{row.plotDescription || row.videoMotionPrompt}</p>
                        </div>
                    ))}
                </div>
            </div>
        );

    return (
        <div className="relative flex h-full w-full flex-col overflow-visible" style={{ color: theme.node.text }} onDoubleClick={(event) => event.stopPropagation()}>
            <div className="relative flex h-10 shrink-0 items-center gap-2 rounded-t-[17px] border-b px-4" style={{ borderColor: theme.node.stroke, background: theme.node.panel }}>
                <Clapperboard className="size-4" />
                <span className="min-w-0 flex-1 truncate text-sm font-semibold" title={node.title || t("createScript")}>
                    {node.title || t("createScript")}
                </span>
                {taskFeedback ? (
                    <span className="min-w-0 max-w-[38%] truncate text-[var(--fs-label)] font-medium" title={taskFeedback} style={{ color: node.metadata?.status === "error" ? theme.accent.danger : theme.node.muted }}>
                        {taskFeedback}
                    </span>
                ) : batchSummary ? (
                    <span className="min-w-0 max-w-[42%] truncate text-[var(--fs-label)] font-medium" title={batchSummary} style={{ color: batch?.status === "partial_failed" ? theme.accent.danger : theme.node.muted }}>
                        {batchSummary}
                    </span>
                ) : null}
                <span className="text-[var(--fs-caption)] font-semibold tabular-nums" style={{ color: theme.node.muted }}>
                    {t("canvasScriptDyn005", { count: rows.length, duration: totalDuration })}
                </span>
                <Tooltip title={t("projectUi.fullscreenEdit")}>
                    <button
                        type="button"
                        className="grid size-7 place-items-center rounded outline-none transition hover:bg-black/5 focus-visible:ring-2 dark:hover:bg-white/10"
                        style={{ "--tw-ring-color": theme.node.muted } as CSSProperties}
                        onMouseDown={(event) => event.stopPropagation()}
                        onPointerDown={(event) => event.stopPropagation()}
                        onClick={(event) => {
                            event.stopPropagation();
                            onOpen();
                        }}
                        aria-label={t("projectUi.fullscreenEdit")}
                    >
                        <Expand className="size-3.5" />
                    </button>
                </Tooltip>
                <Dropdown open={moreMenuOpen} onOpenChange={setMoreMenuOpen} menu={{ items: moreMenuItems, onClick: () => setMoreMenuOpen(false) }} trigger={["click"]} placement="bottomRight">
                    <button
                        type="button"
                        className="grid size-7 place-items-center rounded outline-none transition hover:bg-black/5 focus-visible:ring-2 dark:hover:bg-white/10"
                        style={{ "--tw-ring-color": theme.node.muted } as CSSProperties}
                        onMouseDown={(event) => event.stopPropagation()}
                        onPointerDown={(event) => event.stopPropagation()}
                        onClick={(event) => {
                            event.stopPropagation();
                            setMoreMenuOpen(true);
                        }}
                        aria-label={t("canvasLibraryMore")}
                    >
                        <MoreHorizontal className="size-3.5" />
                    </button>
                </Dropdown>
            </div>
            {batch ? (
                <Modal title={t("canvasScriptUi012")} open={batchDetailsOpen} onCancel={() => setBatchDetailsOpen(false)} footer={null} width={560} centered destroyOnHidden>
                    <GenerationBatchDetails batch={batch} rows={rows} onRetryItem={(itemId) => onRetryBatchItem(batch.id, itemId)} />
                </Modal>
            ) : null}
            <StoryboardMiniPipeline pipeline={pipeline} theme={theme} rows={rows} />
            <div className="storyboard-header-gutter grid h-9 shrink-0 items-center border-b text-xs font-semibold" style={{ borderColor: theme.node.stroke, color: theme.node.muted, gridTemplateColumns: SCRIPT_GRID_TEMPLATE }}>
                <HeaderCell borderColor={theme.node.stroke} align="center">
                    {t("canvasScriptUi013")}
                </HeaderCell>
                <HeaderCell borderColor={theme.node.stroke} align="center">
                    {t("timelineDuration")}
                </HeaderCell>
                <HeaderCell borderColor={theme.node.stroke}>{t("canvasScriptUi014")}</HeaderCell>
                <HeaderCell borderColor={theme.node.stroke}>{t("canvasScriptUi015")}</HeaderCell>
                <span className="px-3">{t("canvasScriptUi016")}</span>
            </div>
            <div
                data-canvas-wheel-scroll
                data-canvas-wheel-intent
                tabIndex={0}
                role="region"
                aria-label={t("canvasScriptUi017")}
                className="storyboard-scrollbar min-h-0 flex-1 overflow-y-scroll overflow-x-hidden outline-none focus-visible:ring-1 focus-visible:ring-inset"
                style={{ "--tw-ring-color": theme.node.muted } as CSSProperties}
                onScroll={(event) => {
                    const next = event.currentTarget.scrollTop;
                    setScrollTop(next);
                    onScrollTopChange(next);
                }}
                onWheel={(event) => event.stopPropagation()}
            >
                {rows.length ? (
                    rows.map((row) => (
                        <div key={row.id} className="canvas-script-compact-row relative grid border-b" style={{ height: STORYBOARD_ROW_HEIGHT, borderColor: theme.node.stroke, gridTemplateColumns: SCRIPT_GRID_TEMPLATE }}>
                            <div className="flex flex-col items-center justify-center gap-0.5 border-r tabular-nums" style={{ color: theme.node.muted, borderColor: theme.node.stroke }}>
                                <div className="flex items-center gap-0.5">
                                    <span className="text-sm">{row.shotNumber}</span>
                                    <Dropdown trigger={["click"]} menu={{ items: [{ key: "delete", label: t("canvasScriptUi018"), icon: <Trash2 className="size-3.5" />, danger: true, disabled: rows.length <= 1, onClick: () => onRemoveRow(row.id) }] }}>
                                        <button
                                            type="button"
                                            className="grid size-5 place-items-center rounded outline-none opacity-45 transition hover:bg-black/5 hover:opacity-100 focus-visible:ring-2 dark:hover:bg-white/10"
                                            aria-label={t("canvasScriptDyn004", { shot: row.shotNumber })}
                                            onMouseDown={(event) => event.stopPropagation()}
                                            onPointerDown={(event) => event.stopPropagation()}
                                            onClick={(event) => event.stopPropagation()}
                                        >
                                            <MoreHorizontal className="size-3" />
                                        </button>
                                    </Dropdown>
                                </div>
                                {batchItemsByRowId.get(row.id) ? (
                                    <span className="max-w-14 truncate text-[var(--fs-micro)] leading-3" title={generationBatchRowLabel(batchItemsByRowId.get(row.id)!, t)}>
                                        {generationBatchRowLabel(batchItemsByRowId.get(row.id)!, t)}
                                    </span>
                                ) : null}
                            </div>
                            <CompactDurationInput value={row.durationSeconds} allowFractional={Boolean(node.metadata?.ltvStoryboardSource)} borderColor={theme.node.stroke} onChange={(durationSeconds) => onUpdateRow(row.id, { durationSeconds })} />
                            <CompactInput value={row.videoMotionPrompt} placeholder={t("canvasScriptUi019")} onChange={(value) => onUpdateRow(row.id, { videoMotionPrompt: value })} borderColor={theme.node.stroke} />
                            {row.dialogueLines?.length || row.voiceover ? (
                                <button
                                    type="button"
                                    className="h-full min-w-0 overflow-hidden px-3 text-left text-xs leading-5 hover:bg-black/5 focus-visible:outline-none focus-visible:ring-2 dark:hover:bg-white/10"
                                    title={t("canvasScriptUi020")}
                                    onMouseDown={(event) => event.stopPropagation()}
                                    onClick={(event) => {
                                        event.stopPropagation();
                                        onOpen();
                                    }}
                                >
                                    <span className="line-clamp-2 block whitespace-pre-wrap break-words">{storyboardDialogueText(row) || t("canvasScriptUi021")}</span>
                                    <span className="text-[var(--fs-micro)] opacity-65">{t("canvasScriptUi022")}</span>
                                </button>
                            ) : (
                                <CompactInput value={row.dialogue} placeholder={t("canvasScriptUi023")} onChange={(value) => onUpdateRow(row.id, { dialogue: value })} borderColor={theme.node.stroke} />
                            )}
                            <div className="flex h-full min-w-0 items-center px-3">
                                <StoryboardAssetsCell onEdit={() => onEditAssets(row.id)} disabled={node.metadata?.locked} bindings={row.assetBindings || []} nodes={nodes} generationReferences={row.generationReferenceNodeIds} />
                            </div>
                        </div>
                    ))
                ) : (
                    <button
                        type="button"
                        className="grid h-full min-h-36 w-full place-items-center"
                        onMouseDown={(event) => event.stopPropagation()}
                        onClick={(event) => {
                            event.stopPropagation();
                            onAddRow();
                        }}
                    >
                        <span className="flex flex-col items-center gap-2.5">
                            <span className="text-sm font-bold">{t("canvasScriptUi024")}</span>
                            <span className="text-[var(--fs-label)] font-medium" style={{ color: theme.node.faint }}>
                                {t("canvasScriptUi025")}
                            </span>
                        </span>
                    </button>
                )}
            </div>
            <div className="flex h-9 shrink-0 items-center justify-center border-b" style={{ borderColor: theme.node.stroke, background: theme.node.panel }}>
                <button
                    type="button"
                    className="inline-flex h-7 items-center gap-1 rounded px-2 text-xs font-medium outline-none transition hover:bg-black/5 focus-visible:ring-2 dark:hover:bg-white/10"
                    style={{ "--tw-ring-color": theme.node.muted } as CSSProperties}
                    onMouseDown={(event) => event.stopPropagation()}
                    onClick={(event) => {
                        event.stopPropagation();
                        onAddRow();
                    }}
                >
                    <Plus className="size-3.5" />
                    {t("canvasScriptUi026")}
                </button>
            </div>
            <div className="relative grid shrink-0 grid-rows-[minmax(0,1fr)_28px] gap-1.5 rounded-b-[17px] p-2.5" style={{ height: composerHeight, background: theme.node.panel }}>
                <CanvasResourceMentionTextarea
                    rows={1}
                    references={mentionReferences}
                    aria-label={t("canvasScriptUi027")}
                    containerClassName="h-full min-h-0 overflow-hidden"
                    className="thin-scrollbar h-full min-h-0 w-full touch-pan-y resize-none overflow-y-auto overflow-x-hidden overscroll-contain rounded-md border bg-transparent px-3 py-2 text-sm leading-5 outline-none transition placeholder:opacity-45 focus:ring-1"
                    style={{ borderColor: theme.node.stroke, color: theme.node.text, "--tw-ring-color": theme.node.muted } as CSSProperties}
                    value={prompt}
                    placeholder={t("canvasScriptUi028")}
                    onContentSizeChange={resizePrompt}
                    onChange={(value) => {
                        setPrompt(value);
                        onPromptChange(value);
                    }}
                    onKeyDown={(event) => {
                        if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
                            event.preventDefault();
                            submitPrompt();
                        }
                    }}
                    onMouseDown={(event) => event.stopPropagation()}
                    onPointerDown={(event) => event.stopPropagation()}
                    onWheel={(event) => event.stopPropagation()}
                />
                <div className="flex min-w-0 items-center justify-end gap-2" onMouseDown={(event) => event.stopPropagation()} onPointerDown={(event) => event.stopPropagation()}>
                    {imageConfig && (
                        <Tooltip title={t("canvasScriptUi029")}>
                            <div className="flex min-w-0 max-w-56 items-center gap-1">
                                <ImageIcon className="size-3.5 shrink-0" aria-hidden="true" />
                                <ModelPicker
                                    config={imageConfig}
                                    capability="image"
                                    value={node.metadata?.storyboardImageDefaults?.model || ""}
                                    className="!h-7 !min-w-0 !text-[var(--fs-tiny)]"
                                    placeholder={t("canvasScriptUi030")}
                                    showSelectedPrice={false}
                                    onChange={onImageModelChange}
                                    onMissingConfig={() => navigateToSettings({ continueCreation: true })}
                                />
                            </div>
                        </Tooltip>
                    )}
                    <Tooltip title={t("canvasScriptUi031")} placement="topLeft">
                        <div className="mr-auto min-w-36 max-w-56 flex-1">
                            <ModelPicker
                                className="!h-7 !w-full !min-w-0 !text-[var(--fs-tiny)] !font-normal [&_img]:!size-3 [&_.lucide]:!size-3"
                                fullWidth
                                config={generationConfig}
                                value={generationConfig.model}
                                capability="text"
                                placeholder={t("agentUiSelectTextModel")}
                                showSelectedPrice={false}
                                onChange={onModelChange}
                                onMissingConfig={() => navigateToSettings({ continueCreation: true })}
                            />
                        </div>
                    </Tooltip>
                    {simpleMode ? (
                        <span className="text-[var(--fs-label)]" style={{ color: theme.node.muted }}>
                            {t("canvasScriptUi032")}
                        </span>
                    ) : node.metadata?.ltvStoryboardSource ? (
                        <InputNumber
                            size="small"
                            className="w-28"
                            min={1}
                            max={512}
                            precision={0}
                            placeholder={t("canvasScriptUi033")}
                            aria-label={t("canvasScriptUi034")}
                            value={shotCount === "auto" ? null : Number(shotCount)}
                            disabled={node.metadata.status === "loading"}
                            onChange={(value) => onShotCountChange(value === null ? "auto" : (String(value) as StoryboardShotCount))}
                        />
                    ) : (
                        <Select<StoryboardShotCount>
                            className="min-w-24"
                            size="small"
                            value={shotCount}
                            disabled={node.metadata?.status === "loading"}
                            options={[{ value: "auto", label: t("canvasScriptUi033") }, ...Array.from({ length: 10 }, (_, index) => ({ value: String(index + 1) as StoryboardShotCount, label: t("canvasScriptDyn015", { count: index + 1 }) }))]}
                            popupMatchSelectWidth={false}
                            onChange={onShotCountChange}
                        />
                    )}
                    {simpleMode ? null : (
                        <Select<StoryboardShotDuration>
                            className="min-w-24"
                            size="small"
                            value={shotDuration}
                            disabled={node.metadata?.status === "loading"}
                            options={[
                                { value: "auto", label: t("canvasScriptUi035") },
                                { value: "5", label: t("canvasScriptUi036") },
                                { value: "10", label: t("canvasScriptUi037") },
                                { value: "15", label: t("canvasScriptUi038") },
                                { value: "30", label: t("canvasScriptUi039") },
                            ]}
                            popupMatchSelectWidth={false}
                            onChange={onShotDurationChange}
                        />
                    )}
                    <Button
                        shape="circle"
                        icon={<Send className="size-4" />}
                        disabled={!prompt.trim() || node.metadata?.status === "loading"}
                        loading={node.metadata?.status === "loading"}
                        style={{ background: theme.toolbar.itemHover, borderColor: theme.node.stroke, color: theme.node.text }}
                        onMouseDown={(event) => event.stopPropagation()}
                        onClick={submitPrompt}
                    />
                </div>
                <RowHandle side="left" top={composerHeight / 2} scale={scale} tone="idle" theme={theme} title={t("canvasScriptUi040")} onPointerDown={(event) => onConnectStart(event, "context", "target")} />
            </div>
            {rows.map((row, index) => {
                const top = STORYBOARD_HEADER_HEIGHT + index * STORYBOARD_ROW_HEIGHT + STORYBOARD_ROW_HEIGHT / 2 - scrollTop;
                if (top < STORYBOARD_HEADER_HEIGHT + 4 || top > STORYBOARD_HEADER_HEIGHT + tableHeight - 4) return null;
                return (
                    <div key={`ports-${row.id}`}>
                        <RowHandle side="left" top={top} scale={scale} tone={batchRowTone(batchItemsByRowId.get(row.id)) || row.status} theme={theme} onPointerDown={(event) => onConnectStart(event, row.id, "target")} />
                        <RowHandle side="right" top={top} scale={scale} tone={batchRowTone(batchItemsByRowId.get(row.id)) || row.status} theme={theme} onPointerDown={(event) => onConnectStart(event, row.id, "source")} />
                    </div>
                );
            })}
        </div>
    );
}

function CompactInput({ value, placeholder, borderColor, onChange }: { value: string; placeholder: string; borderColor: string; onChange: (value: string) => void }) {
    return (
        <textarea
            className="thin-scrollbar h-full w-full resize-none overflow-y-auto overflow-x-hidden whitespace-pre-wrap break-words border-r bg-transparent px-4 py-2.5 text-xs leading-5 outline-none transition placeholder:opacity-35 focus:bg-black/[0.02] dark:focus:bg-white/[0.025]"
            style={{ borderColor }}
            value={value}
            placeholder={placeholder}
            onChange={(event) => onChange(event.target.value)}
            onMouseDown={(event) => event.stopPropagation()}
            onPointerDown={(event) => event.stopPropagation()}
        />
    );
}

function CompactDurationInput({ value, allowFractional, borderColor, onChange }: { value: number; allowFractional: boolean; borderColor: string; onChange: (value: number) => void }) {
    const { t } = useInterfaceTranslation();
    return (
        <label className="flex h-full items-center justify-center gap-1 border-r text-xs tabular-nums text-foreground/60" style={{ borderColor }}>
            <input
                type="number"
                min={allowFractional ? 0 : 1}
                max={60}
                step={allowFractional ? "any" : 1}
                value={value}
                className="w-9 bg-transparent text-right outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]"
                aria-label={t("canvasScriptUi088")}
                onChange={(event) => {
                    const next = event.target.valueAsNumber;
                    if (Number.isFinite(next) && next > 0 && next <= 60) onChange(next);
                }}
                onMouseDown={(event) => event.stopPropagation()}
                onPointerDown={(event) => event.stopPropagation()}
            />
            {t("createUiSecondUnit")}
        </label>
    );
}

function HeaderCell({ children, borderColor, align = "left" }: { children: ReactNode; borderColor: string; align?: "left" | "center" }) {
    return (
        <span className={`flex h-full items-center border-r px-4 ${align === "center" ? "justify-center text-center" : "justify-start"}`} style={{ borderColor }}>
            {children}
        </span>
    );
}

function RowHandle({
    side,
    top,
    scale,
    tone,
    theme,
    title,
    onPointerDown,
}: {
    side: "left" | "right";
    top: number;
    scale: number;
    tone?: StoryboardRow["status"];
    theme: (typeof canvasThemes)[keyof typeof canvasThemes];
    title?: string;
    onPointerDown: (event: ReactPointerEvent) => void;
}) {
    const { t } = useInterfaceTranslation();
    const color = tone === "loading" ? theme.accent.primary : tone === "error" ? theme.accent.danger : tone === "success" ? theme.node.activeStroke : theme.node.muted;
    const inverseHitScale = 1 / Math.max(scale, 0.05);
    return (
        <button
            type="button"
            aria-label={t("canvasScriptDyn014", { label: title || (side === "left" ? t("studioUi.input") : t("studioUi.output")) })}
            title={title || `${side === "left" ? t("canvasScriptUi089") : t("canvasScriptUi090")}`}
            className={`canvas-connection-handle absolute z-[var(--node-z-handle)] flex -translate-y-1/2 cursor-pointer items-center justify-center rounded-full outline-none focus-visible:ring-2 ${side === "left" ? "left-0 -translate-x-1/2" : "right-0 translate-x-1/2"}`}
            style={{ top, width: 32 * inverseHitScale, height: 32 * inverseHitScale, "--tw-ring-color": theme.accent.primary } as CSSProperties}
            onPointerDown={onPointerDown}
        >
            <span className="block size-2.5 rounded-full border-2 shadow-sm transition-transform hover:scale-110" style={{ boxSizing: "border-box", borderColor: theme.node.panel, background: color }} />
        </button>
    );
}
