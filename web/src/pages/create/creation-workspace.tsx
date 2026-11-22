import { ImageSizePicker } from "@/components/image-size-picker";
import { workspaceTeamId } from "@/lib/workspace-routes";
import { ImageParameterFields } from "@/components/image-parameter-fields";
import { imageResolutionUsesQuality, imageSizePresets } from "@/lib/image-size-presets";
import { createPortal } from "react-dom";
import { lazy, Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ChangeEvent, type ComponentRef, type CSSProperties, type PointerEvent, type ReactNode, type RefObject } from "react";
import { Button, Popover } from "antd";
import { useWorkspaceTopBarMount } from "@/components/layout/workspace-top-bar-extension";
import { Tooltip } from "@/components/ui/base/tooltip";
import { Reorder, LayoutGroup, motion, useReducedMotion } from "motion/react";
import type { Transition } from "motion/react";
import { type ThinkingLevel, type ThinkingRequest } from "@/lib/text-thinking";
import { ThinkingLevelSlider } from "@/components/thinking-level-slider";
import { ArrowUp, ChevronDown, ChevronLeft, ChevronRight, Clapperboard, Clock3, Film, History, Image as ImageIcon, LoaderCircle, Maximize2, MessageSquareText, Minimize2, Paperclip, Plus, SlidersHorizontal, Trash2, Waves, X, Orbit, PenLine } from "lucide-react";

import { WorkingGlow } from "@/components/ai/working-indicator";
import { formatVideoResolutionLabel as videoResolutionLabel } from "@/lib/video-generation-options";
import { CanvasResourceMentionTextarea } from "@/components/canvas/canvas-resource-mention-textarea";
import { VoiceRecordingButton } from "@/components/conversation/voice-recording-button";
import { CreationSkillPicker } from "@/components/creation-skill-picker";
import type { Skill } from "@/services/api/skills";
import { HoverBorderGradient } from "@/components/ui/aceternity/hover-border-gradient";
import { SpotlightSurface } from "@/components/ui/aceternity/spotlight-surface";
import { ModelPicker } from "@/components/model-picker";
import { aceternityMotion } from "@/lib/aceternity-motion";
import { CreditSymbol, requestCreditCost } from "@/constant/credits";
import { ASSET_CATEGORY_LABELS } from "@/lib/asset-category";
import { formatShotOrdinal } from "@/lib/shot-label";
import { buildImageResolutionOptions, formatImageResolutionSize, supportsImageResolutionPresets } from "@/lib/image-resolution-tiers";
import { videoDurationOptions, type ImageCapabilityConfig, type VideoCapabilityConfig } from "@/lib/model-capabilities";
import { preserveVideoSettings as normalizeVideoValue } from "@/lib/media-settings";
import { mediaSettingIssues } from "@/lib/media-settings";
import { MediaSettingsNotice } from "@/components/media-settings-notice";
import { mergedImageCapabilityConfig, type ModelRequirements } from "@/lib/model-selection";
import { imageQualityDescription, imageQualityLabel } from "@/lib/image-quality";
import { modelQuoteDescription, modelQuoteRequest } from "@/lib/model-pricing";
import { quoteModel, type LogicalModelQuote } from "@/services/api/logical-models";
import { modelOptionName, resolveModelChannel, type AiConfig } from "@/stores/use-config-store";
import { useUserStore } from "@/stores/use-user-store";
import { useGenerationBatchLimit, batchQuoteTotal } from "@/lib/generation-batch-limit";
import type { PromptOptimizerProvider } from "@/lib/plugins/plugin-types";
import { type CreationReference } from "./creation-references";
import { hasCreationReferenceDrop, readCreationReferenceDrop, type CreationReferenceDrop } from "./creation-reference-drop";
import { creationAttachmentKind, creationUploadAccept, type CreationAttachment, type CreationMode } from "./creation-assets";
import { useInterfaceTranslation } from "@/stores/use-interface-locale-store";
import { countOptions, resolutionOptions, type CreationShotRailEntry } from "./creation-types";
import { creationMessageNeedsResultSync } from "./creation-conversations";
import "./creation-product.css";
import "./creation-scrollbars.css";
import { CreationAttachmentThumbnail, CreationMediaPreviewModal } from "./creation-workspace-messages";

export { CreationHistoryDrawer } from "./creation-workspace-history";
export { CreationMessageView } from "./creation-workspace-messages";
export { CreationEmptyBanner, CreationEmptySuggest, CreationFeaturedWorks } from "./creation-workspace-empty";

const CanvasPromptOptimizerDrawer = lazy(() => import("@/components/canvas/canvas-prompt-optimizer-drawer").then((module) => ({ default: module.CanvasPromptOptimizerDrawer })));

export const creationAssetCategoryLabels: Record<string, string> = { all: "全部素材", ...ASSET_CATEGORY_LABELS };

export function CreationWorkspaceToolbar({
    shots,
    onJumpToShot,
    onNewConversation,
    onOpenHistory,
    onContinueCanvas,
    openingCanvas,
}: {
    shots: CreationShotRailEntry[];
    onJumpToShot: (shot: CreationShotRailEntry) => void;
    onNewConversation: () => void;
    onOpenHistory: () => void;
    onContinueCanvas: () => void;
    openingCanvas: boolean;
}) {
    const { t } = useInterfaceTranslation();
    const [railOpen, setRailOpen] = useState(false);
    const railRef = useRef<HTMLDivElement>(null);
    useEffect(() => {
        if (!railOpen) return;
        const onPointerDown = (event: MouseEvent) => {
            if (railRef.current && !railRef.current.contains(event.target as Node)) setRailOpen(false);
        };
        window.addEventListener("mousedown", onPointerDown);
        return () => window.removeEventListener("mousedown", onPointerDown);
    }, [railOpen]);
    const mount = useWorkspaceTopBarMount();
    const toolbar = (
        <header className="creation-thread-toolbar">
            <div className="creation-toolbar-shots" ref={railRef}>
                <button type="button" className="creation-rail-trigger" aria-expanded={railOpen} aria-haspopup="listbox" onClick={() => setRailOpen((open) => !open)}>
                    <Clapperboard />
                    {t("creationPageShotTimeline")}{shots.length > 0 ? <em className="creation-rail-count">{shots.length}</em> : null}
                </button>
                {railOpen ? (
                    <div className="creation-rail-pop" role="listbox" aria-label={t("creationPageShotTimeline")}>
                        <div className="creation-rail-pop-head">
                            <span className="creation-rail-pop-title">
                                {t("creationPageShotTimeline")}<small>{shots.length ? t("creationPageShotCount", { count: shots.length }) : t("createUiEmptyRail")}</small>
                            </span>
                            <button type="button" className="creation-rail-pop-close" aria-label={t("creationPageCloseShotList")} onClick={() => setRailOpen(false)}>
                                <X />
                            </button>
                        </div>
                        {shots.length ? (
                            <ol className="creation-rail-list">
                                {shots.map((shot) => {
                                    const resultStatus = shot.result?.status;
                                    const resultNeedsSync = Boolean(shot.result && creationMessageNeedsResultSync(shot.result));
                                    const statusLabel = t(resultStatus === "done" ? "createUiCompleted" : resultNeedsSync ? "creationComposer.waitingForSync" : resultStatus === "error" ? "creationPageShotStatusGenerationFailed" : resultStatus === "pending" ? "composerGenerating" : resultStatus === "cancelled" ? "creationPageStopped" : "creationPageShotStatusQueued");
                                    return (
                                        <li key={shot.key}>
                                            <button
                                                type="button"
                                                role="option"
                                                aria-selected="false"
                                                className="creation-rail-row"
                                                onClick={() => {
                                                    setRailOpen(false);
                                                    onJumpToShot(shot);
                                                }}
                                            >
                                                <span className="creation-rail-row-shot">{formatShotOrdinal(shot.ordinal - 1)}</span>
                                                <span className="creation-rail-row-prompt">{shot.user.content || t("createUiVideoShot")}</span>
                                                <span className={`creation-rail-row-state is-${resultNeedsSync ? "sync" : resultStatus || "idle"}`}>{statusLabel}</span>
                                            </button>
                                        </li>
                                    );
                                })}
                            </ol>
                        ) : (
                            <p className="creation-rail-empty">{t("createUiFirstShotHint")}</p>
                        )}
                    </div>
                ) : null}
            </div>
            <div className="creation-toolbar-actions">
                <Button size="small" loading={openingCanvas} onClick={onContinueCanvas}>
                    {t("creationPageContinueInCanvas")}
                </Button>
                <Tooltip title={t("creationPageNewConversation")}>
                    <button type="button" aria-label={t("creationPageNewConversation")} className="creation-toolbar-action" onClick={onNewConversation}>
                        <Plus />
                    </button>
                </Tooltip>
                <Tooltip title={t("creationHistory")}>
                    <button type="button" aria-label={t("createUiViewHistory")} className="creation-toolbar-action" onClick={onOpenHistory}>
                        <History />
                    </button>
                </Tooltip>
            </div>
        </header>
    );
    if (mount) return createPortal(toolbar, mount);
    if (mount === null) return null;
    return toolbar;
}

type ComposerProps = {
    variant: "empty" | "thread";
    mode: CreationMode;
    prompt: string;
    setPrompt: (value: string) => void;
    busy: boolean;
    generationActive: boolean;
    referenceReplacementBusy: boolean;
    uploading: boolean;
    uploadFailures: { file: File; error: string }[];
    inputIssues: string[];
    submissionBlocked: boolean;
    onAddFiles: (files: File[]) => void;
    onRetryUploads: () => void;
    onDismissUploadFailure: (file: File) => void;
    fileInputRef: RefObject<HTMLInputElement | null>;
    onFileChange: (event: ChangeEvent<HTMLInputElement>) => void;
    referenceDropBusy: boolean;
    onReferenceDrop: (drop: CreationReferenceDrop) => void;
    attachments: CreationAttachment[];
    referenceImageSize?: { width: number; height: number };
    maxReferences: number;
    references: CreationReference[];
    onRemoveAttachment: (id: string) => void;
    onClearAttachments: () => void;
    onClearComposer: () => void;
    onReorderAttachments: (attachments: CreationAttachment[]) => void;
    onReplaceAttachment: (targetAttachmentId: string, replacement: CreationAttachment) => void;
    onReplaceReferenceFiles: (targetAttachmentId: string, files: File[]) => Promise<void> | void;
    onOpenLibrary: () => void;
    onSelectSkill: (skill: Skill) => Promise<void>;
    skillPickerOpen: boolean;
    onSkillPickerOpenChange: (open: boolean) => void;
    onRequireLogin?: () => void;
    onModeChange: (mode: CreationMode) => void;
    model: string;
    modelRequirements: ModelRequirements;
    videoProfile: VideoCapabilityConfig;
    imageProfile: ImageCapabilityConfig;
    config: AiConfig;
    onModelChange: (value: string) => void;
    ratio: string;
    setRatio: (value: string) => void;
    seconds: string;
    setSeconds: (value: string) => void;
    quality: string;
    setQuality: (value: string) => void;
    imageResolution: string;
    setImageResolution: (value: string) => void;
    imageParameters?: string;
    setImageParameters: (value: string) => void;
    setTransparentBackground: (value: string) => void;
    videoQuality: string;
    setVideoQuality: (value: string) => void;
    count: string;
    setCount: (value: string) => void;
    textStreaming: boolean;
    setTextStreaming: (value: boolean) => void;
    /** 当前模型可选的思考档位；为空时不显示思考控件。 */
    textThinkingLevels: ThinkingLevel[];
    /** 当前生效档位；空字符串表示跟随模型默认且模型没有声明默认值。 */
    textThinkingLevel: ThinkingLevel | "";
    textThinkingRequest: ThinkingRequest;
    setTextThinkingLevel: (value: ThinkingRequest) => void;
    promptOptimizerProvider: PromptOptimizerProvider | null;
    composerFocusRef: RefObject<HTMLTextAreaElement | null>;
    onPromptFocus: () => void;
    placeholderOverride?: string;
    onSubmit: () => void;
};

type CreationReferenceFilter = "all" | "image" | "video" | "audio" | "file";

export function partitionReferenceImageDropFiles(files: readonly File[], targetReferenceId: string | undefined, references: readonly CreationReference[]) {
    const target = references.find((reference) => reference.id === targetReferenceId);
    if (target?.kind !== "image" || !target.attachmentId) return undefined;
    const replacementIndex = files.findIndex((file) => file.type.startsWith("image/"));
    if (replacementIndex < 0) return undefined;
    return { replacementFile: files[replacementIndex], attachmentFiles: files.filter((_, index) => index !== replacementIndex) };
}

const CREATION_PROMPT_MIN_HEIGHT = 48;
const CREATION_PROMPT_MAX_HEIGHT = 300;

function clampCreationPromptHeight(height: number) {
    return Math.min(CREATION_PROMPT_MAX_HEIGHT, Math.max(CREATION_PROMPT_MIN_HEIGHT, Math.ceil(height)));
}

export function CreationComposer(props: ComposerProps) {
    const { t, locale } = useInterfaceTranslation();
    const [referenceDragOver, setReferenceDragOver] = useState(false);
    const [previewUrl, setPreviewUrl] = useState("");
    const [previewType, setPreviewType] = useState<"image" | "video">("image");
    const [promptOptimizerOpen, setPromptOptimizerOpen] = useState(false);
    const [promptHeight, setPromptHeight] = useState(CREATION_PROMPT_MIN_HEIGHT);
    const [referenceFilter, setReferenceFilter] = useState<CreationReferenceFilter>("all");
    const [canDragReferences, setCanDragReferences] = useState(false);
    const [dropTargetReferenceId, setDropTargetReferenceId] = useState<string | null>(null);
    const attachmentTrackRef = useRef<HTMLUListElement>(null);
    const cardDragRef = useRef<{ startX: number; startY: number; moved: boolean } | null>(null);
    const suppressAttachmentClickRef = useRef(false);
    const [trackState, setTrackState] = useState({ canScrollLeft: false, canScrollRight: false, isExpanded: true, isDragging: false });
    const previousAttachmentCountRef = useRef(0);
    const interactionBusy = props.busy || props.referenceReplacementBusy || props.uploading || props.referenceDropBusy;
    // 创作页张数等于拆单数，上限按账号同时任务数，硬上限仍为 15。
    const imageBatchLimit = Math.min(15, useGenerationBatchLimit());
    const settingsError = mediaSettingIssues(props.config, props.mode, props.model)
        .map((item) => item.message)
        .join("；");
    const canSubmit = Boolean(props.prompt.trim()) && !interactionBusy && !settingsError && !props.submissionBlocked;
    const creditsEnabled = useUserStore((state) => state.features.creditsEnabled);
    const userId = useUserStore((state) => state.user?.id);
    const priceChannel = resolveModelChannel(props.config, props.model);
    const imageTaskCount = Math.max(1, Math.min(imageBatchLimit, Math.floor(Number(props.count)) || 1));
    const quoteRequirements = useMemo(() => (props.mode === "image" ? { ...props.modelRequirements, options: { ...props.modelRequirements.options, count: 1 } } : props.modelRequirements), [props.mode, props.modelRequirements]);
    const quoteRequest = useMemo(() => modelQuoteRequest(props.config, props.model, props.mode, quoteRequirements), [props.config, props.mode, props.model, quoteRequirements]);
    const [routeQuote, setRouteQuote] = useState<LogicalModelQuote | null>(null);
    const canOptimizePrompt = Boolean(props.promptOptimizerProvider) && (props.mode === "image" || props.mode === "video");
    const optimizerReferences = props.references.filter((reference) => reference.active && reference.kind !== "skill");
    const credits = requestCreditCost({
        channelMode: priceChannel.scope === "system" ? "remote" : "local",
        modelCosts: priceChannel.modelCosts,
        model: modelOptionName(props.model),
        count: props.mode === "image" ? imageTaskCount : 1,
        seconds: props.mode === "video" ? props.seconds : 1,
        capability: props.mode,
        config: props.config,
        requirements: props.modelRequirements,
    });
    useEffect(() => {
        if (!userId || !creditsEnabled || !quoteRequest) {
            setRouteQuote(null);
            return;
        }
        const controller = new AbortController();
        setRouteQuote(null);
        quoteModel(quoteRequest, controller.signal)
            .then(({ quote }) => setRouteQuote(quote))
            .catch(() => {
                if (!controller.signal.aborted) setRouteQuote(null);
            });
        return () => controller.abort();
    }, [creditsEnabled, quoteRequest, userId]);
    const generationCredits = routeQuote ? batchQuoteTotal(routeQuote.amountMicrocredits, props.mode === "image" ? imageTaskCount : 1) : credits;
    const showCost = creditsEnabled && generationCredits !== null && generationCredits !== undefined;
    const formattedCredits = generationCredits?.toLocaleString(locale, { maximumFractionDigits: 6 });
    const workingLabel = props.uploading ? t("composerUploading") : props.referenceReplacementBusy ? t("nativeControls.composerReplacing") : props.generationActive ? t("composerGenerating") : t("composerProcessing");
    const actionLabel = interactionBusy || (props.generationActive && !canSubmit) ? workingLabel : showCost ? t(!userId || routeQuote?.estimated ? "composerSendCost" : "creationComposer.sendExactCost", { credits: formattedCredits! }) : t("composerSend");
    // Send-button working state must span the WHOLE generation (not just the
    // submit-lock window): spinner + glow stay while a message is pending and
    // the composer is empty; typing a next prompt returns the arrow so the
    // user knows a new send is possible.
    const showWorkingSpinner = interactionBusy || (props.generationActive && !canSubmit);
    const showWorkingGlow = props.generationActive && !canSubmit;
    const placeholder = t(props.mode === "text" ? "composerTextPlaceholder" : props.mode === "image" ? "composerImagePlaceholder" : "composerVideoPlaceholder");
    const emptyPlaceholder = t("composerEmptyPlaceholder");
    const imageReferencesSupported = props.imageProfile.references.maxImages > 0;
    const referencesSupported = props.mode === "image" ? imageReferencesSupported : props.mode !== "video" || props.maxReferences > 0;
    const canAddMoreReferences = referencesSupported && props.attachments.length < props.maxReferences;
    const addReferenceLabel = interactionBusy ? t(props.uploading ? "nativeControls.composerUploadingReferences" : props.referenceReplacementBusy ? "nativeControls.composerReplacingReferences" : props.generationActive ? "nativeControls.composerGeneratingReferences" : "nativeControls.composerProcessingReferences") : canAddMoreReferences ? t("composerAddReferences") : t("create.page.referenceLimitExceeded");
    const handlePromptContentSizeChange = useCallback((naturalHeight: number) => {
        const nextHeight = clampCreationPromptHeight(naturalHeight);
        setPromptHeight((currentHeight) => (currentHeight === nextHeight ? currentHeight : nextHeight));
    }, []);
    const referenceCounts = useMemo(
        () =>
            props.attachments.reduce(
                (counts, attachment) => {
                    const kind = creationAttachmentKind(attachment);
                    counts[kind] += 1;
                    return counts;
                },
                { image: 0, video: 0, audio: 0, file: 0 },
            ),
        [props.attachments],
    );
    const visibleAttachments = useMemo(() => (referenceFilter === "all" ? props.attachments : props.attachments.filter((attachment) => creationAttachmentKind(attachment) === referenceFilter)), [props.attachments, referenceFilter]);
    const imageSettingsSupported = props.imageProfile.size.parameter !== "none" || props.imageProfile.quality.supported || imageBatchLimit > 1;
    const updateTrackScrollState = useCallback(() => {
        const track = attachmentTrackRef.current;
        if (!track) return;
        setTrackState((current) => ({
            ...current,
            canScrollLeft: track.scrollLeft > 1,
            canScrollRight: track.scrollLeft + track.clientWidth < track.scrollWidth - 1,
        }));
    }, []);
    const setReferencePanelExpanded = useCallback((isExpanded: boolean) => {
        setTrackState((current) => ({ ...current, isExpanded }));
        if (!isExpanded) setReferenceFilter("all");
    }, []);
    useEffect(() => {
        const hadAttachments = previousAttachmentCountRef.current > 0;
        if (!props.attachments.length) setReferencePanelExpanded(false);
        else if (!hadAttachments) setReferencePanelExpanded(true);
        previousAttachmentCountRef.current = props.attachments.length;
        updateTrackScrollState();
    }, [props.attachments.length, setReferencePanelExpanded, updateTrackScrollState]);
    useEffect(() => {
        const query = window.matchMedia("(hover: hover) and (pointer: fine)");
        const update = () => setCanDragReferences(query.matches);
        update();
        query.addEventListener("change", update);
        return () => query.removeEventListener("change", update);
    }, []);
    useEffect(() => {
        const frame = window.requestAnimationFrame(updateTrackScrollState);
        return () => window.cancelAnimationFrame(frame);
    }, [referenceFilter, trackState.isExpanded, updateTrackScrollState, visibleAttachments.length]);
    const beginCardDrag = (event: PointerEvent<HTMLElement>) => {
        if (event.button !== 0 || interactionBusy || !trackState.isExpanded) return;
        if ((event.target as HTMLElement).closest(".creation-reference-card-remove")) return;
        cardDragRef.current = { startX: event.clientX, startY: event.clientY, moved: false };
    };
    const endCardDrag = (event: PointerEvent<HTMLElement>) => {
        const drag = cardDragRef.current;
        if (!drag) return;
        cardDragRef.current = null;
        if (drag.moved) {
            suppressAttachmentClickRef.current = true;
            window.setTimeout(() => {
                suppressAttachmentClickRef.current = false;
            }, 0);
        }
        if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
        setTrackState((current) => ({ ...current, isDragging: false }));
    };
    const moveCardDrag = (event: PointerEvent<HTMLElement>) => {
        const drag = cardDragRef.current;
        if (!drag || drag.moved) return;
        if (Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) <= 4) return;
        drag.moved = true;
        setTrackState((current) => ({ ...current, isDragging: true, isExpanded: true }));
    };
    const previewAttachment = (type: "image" | "video", url: string) => {
        if (suppressAttachmentClickRef.current || cardDragRef.current?.moved) return;
        setPreviewType(type);
        setPreviewUrl(url);
    };
    const reorderVisibleAttachments = useCallback(
        (next: CreationAttachment[]) => {
            if (referenceFilter === "all") {
                props.onReorderAttachments(next);
                return;
            }
            const visibleIds = new Set(visibleAttachments.map((attachment) => attachment.id));
            const reordered = [...next];
            props.onReorderAttachments(props.attachments.map((attachment) => (visibleIds.has(attachment.id) ? reordered.shift() || attachment : attachment)));
        },
        [props.attachments, props.onReorderAttachments, referenceFilter, visibleAttachments],
    );
    useEffect(() => {
        if (!canOptimizePrompt) setPromptOptimizerOpen(false);
    }, [canOptimizePrompt]);

    const scrollAttachmentTrack = (direction: -1 | 1) => {
        const track = attachmentTrackRef.current;
        if (!track) return;
        track.scrollBy({ left: direction * Math.max(track.clientWidth * 0.72, 120), behavior: "smooth" });
        window.setTimeout(updateTrackScrollState, 180);
    };
    const imageReferenceAtPoint = (x: number, y: number) => {
        for (const element of document.elementsFromPoint(x, y)) {
            const chip = element.closest<HTMLElement>("[data-mention-reference-id]");
            const referenceId = chip?.dataset.mentionReferenceId;
            const reference = referenceId ? props.references.find((item) => item.id === referenceId) : undefined;
            if (reference?.kind === "image" && reference.attachmentId) return reference;
        }
        return undefined;
    };
    const embedded = props.variant === "empty";
    const surface = (
        <SpotlightSurface
            className={`creation-chat-composer is-${props.variant}${referenceDragOver ? " is-reference-drag-over" : ""}`}
            contentClassName="contents"
            spotlightColor={"var(--creation-composer-spotlight, color-mix(in srgb, var(--user-ink) 12%, transparent))"}
            spotlightRadius={280}
            onDragOver={(event) => {
                if (!hasCreationReferenceDrop(event.dataTransfer)) return;
                if (event.defaultPrevented) {
                    setReferenceDragOver(false);
                    return;
                }
                event.preventDefault();
                event.dataTransfer.dropEffect = interactionBusy ? "none" : "copy";
                setReferenceDragOver(!interactionBusy);
            }}
            onDragLeave={(event) => {
                if (!(event.relatedTarget instanceof Node) || !event.currentTarget.contains(event.relatedTarget)) setReferenceDragOver(false);
            }}
            onDrop={(event) => {
                setReferenceDragOver(false);
                // 引用标签已处理的文件替换不能再追加一遍。
                if (event.defaultPrevented || !hasCreationReferenceDrop(event.dataTransfer)) return;
                event.preventDefault();
                event.stopPropagation();
                if (interactionBusy) return;
                const drop = readCreationReferenceDrop(event.dataTransfer);
                if (!drop) return;
                if (drop.kind === "files") {
                    const target = imageReferenceAtPoint(event.clientX, event.clientY);
                    const partition = partitionReferenceImageDropFiles(drop.files, target?.id, props.references);
                    if (partition && target?.attachmentId) {
                        void props.onReplaceReferenceFiles(target.attachmentId, [partition.replacementFile, ...partition.attachmentFiles]);
                        return;
                    }
                }
                props.onReferenceDrop(drop);
            }}
            onPaste={(event) => {
                const files = Array.from(event.clipboardData.files);
                if (!files.length || interactionBusy) return;
                event.preventDefault();
                props.onAddFiles(files);
            }}
        >

            {referenceDragOver || props.referenceDropBusy ? (
                <div className="creation-reference-drop-hint" role="status">
                    {props.referenceDropBusy ? "正在添加参考图…" : "松开添加参考图"}
                </div>
            ) : null}
            <div className="creation-chat-writing-surface">
                <div className="creation-chat-editor">
                    <input ref={props.fileInputRef} type="file" hidden accept={creationUploadAccept(props.mode)} multiple onChange={props.onFileChange} />
                    <div className="creation-chat-editor-input" style={props.variant === "empty" ? { height: promptHeight } : undefined}>
                        <CanvasResourceMentionTextarea
                            ref={props.composerFocusRef}
                            value={props.prompt}
                            references={props.references}
                            mentionMenuWidth={400}
                            sendOnEnter
                            onFocus={props.onPromptFocus}
                            onChange={props.setPrompt}
                            onSubmit={() => { if (canSubmit) props.onSubmit(); }}
                            onContentSizeChange={props.variant === "empty" ? handlePromptContentSizeChange : undefined}
                            containerClassName={`creation-chat-mention-container${props.variant === "empty" ? " h-full" : ""}`}
                            className="creation-chat-mention-editor creation-scrollbar"
                            style={{ color: "var(--creation-text)" }}
                            placeholder={props.placeholderOverride || (props.variant === "empty" ? emptyPlaceholder : placeholder)}
                            aria-label={t("composerPromptLabel")}
                            spellCheck
                            disabled={interactionBusy}
                            activeDropReferenceId={dropTargetReferenceId}
                            onReferenceFilesDrop={(reference, files) => {
                                const target = props.references.find((item) => item.id === reference.id);
                                if (target?.attachmentId) props.onReplaceReferenceFiles(target.attachmentId, files);
                            }}
                        />
                    </div>
                    {props.attachments.length ? (
                        <div className={`creation-reference-panel${trackState.isExpanded ? " is-expanded" : ""}`} aria-busy={interactionBusy}>
                            {trackState.isExpanded ? (
                                <div className="creation-reference-panel-header">
                                    <div className="creation-reference-filter-tabs" role="group" aria-label={t("createUiReferenceFilter")}>
                                        {(
                                            [
                                                { id: "all", label: t("previewAll"), count: props.attachments.length },
                                                { id: "image", label: t("previewAssetImage"), count: referenceCounts.image },
                                                { id: "video", label: t("previewAssetVideo"), count: referenceCounts.video },
                                                { id: "audio", label: t("previewAssetAudio"), count: referenceCounts.audio },
                                                { id: "file", label: t("createUiFile"), count: referenceCounts.file },
                                            ] as const
                                        ).map((filter) => (
                                            <button key={filter.id} type="button" aria-pressed={referenceFilter === filter.id} className={referenceFilter === filter.id ? "is-active" : undefined} onClick={() => setReferenceFilter(filter.id)}>
                                                {filter.label}
                                                {filter.count ? ` (${filter.count})` : ""}
                                            </button>
                                        ))}
                                    </div>
                                    <div className="creation-reference-panel-actions">
                                        {props.attachments.length ? (
                                            <button type="button" onClick={props.onClearAttachments} disabled={interactionBusy}>
                                                {t("createUiClearAllMedia")}
                                            </button>
                                        ) : null}
                                        <Tooltip title={t("createUiCollapseMediaPanel")}>
                                            <button type="button" className="creation-reference-panel-collapse" onClick={() => setReferencePanelExpanded(false)} aria-label={t("createUiCollapseMediaPanel")}>
                                                <Minimize2 aria-hidden="true" />
                                            </button>
                                        </Tooltip>
                                    </div>
                                </div>
                            ) : null}
                            <div className="creation-reference-track-wrapper">
                                <div className="creation-reference-stack-shell">
                                    {trackState.canScrollLeft ? (
                                        <button type="button" className="creation-reference-track-button is-left" onClick={() => scrollAttachmentTrack(-1)} aria-label={t("composerReferenceLeft")} title={t("composerReferenceLeft")}>
                                            <ChevronLeft aria-hidden="true" />
                                        </button>
                                    ) : null}
                                    <Reorder.Group<CreationAttachment[]>
                                        as="ul"
                                        ref={attachmentTrackRef}
                                        className={`creation-reference-track${trackState.isExpanded ? " is-expanded" : ""}${trackState.isDragging ? " is-dragging" : ""}${visibleAttachments.length ? "" : " is-empty"}`}
                                        axis="x"
                                        values={visibleAttachments}
                                        onReorder={reorderVisibleAttachments}
                                        layoutScroll
                                        role="list"
                                        aria-label={t("composerReferenceTrack")}
                                        onScroll={updateTrackScrollState}
                                    >
                                        {visibleAttachments.map((item) => (
                                            <Reorder.Item<CreationAttachment>
                                                key={item.id}
                                                value={item}
                                                layout="position"
                                                drag={trackState.isExpanded && canDragReferences && !interactionBusy}
                                                className="creation-reference-stack-card"
                                                onPointerDown={beginCardDrag}
                                                onPointerMove={moveCardDrag}
                                                onPointerUp={endCardDrag}
                                                onPointerCancel={endCardDrag}
                                                onDragStart={() => {
                                                    setDropTargetReferenceId(null);
                                                    setTrackState((current) => ({ ...current, isDragging: true, isExpanded: true }));
                                                }}
                                                onDrag={(_, info) => {
                                                    if (creationAttachmentKind(item) !== "image") return;
                                                    const target = imageReferenceAtPoint(info.point.x, info.point.y);
                                                    setDropTargetReferenceId(target?.attachmentId !== item.id ? target?.id || null : null);
                                                }}
                                                onDragEnd={(_, info) => {
                                                    const target = creationAttachmentKind(item) === "image" ? imageReferenceAtPoint(info.point.x, info.point.y) : undefined;
                                                    setDropTargetReferenceId(null);
                                                    setTrackState((current) => ({ ...current, isDragging: false, isExpanded: true }));
                                                    if (target?.attachmentId && target.attachmentId !== item.id) props.onReplaceAttachment(target.attachmentId, item);
                                                }}
                                            >
                                                <CreationAttachmentThumbnail item={item} onPreview={previewAttachment} onRemove={props.onRemoveAttachment} />
                                            </Reorder.Item>
                                        ))}
                                        {!visibleAttachments.length && props.attachments.length ? <li className="creation-reference-filter-empty">{t("createUiNoReferenceType")}</li> : null}
                                        {referencesSupported ? (
                                            <li className="creation-reference-add-slot">
                                                <Tooltip title={addReferenceLabel}>
                                                    <button type="button" className="creation-reference-add-button" onClick={props.onOpenLibrary} disabled={interactionBusy || !canAddMoreReferences} aria-label={addReferenceLabel}>
                                                        <Plus aria-hidden="true" />
                                                        <span>{t("composerReferences")}</span>
                                                    </button>
                                                </Tooltip>
                                            </li>
                                        ) : null}
                                    </Reorder.Group>
                                    {trackState.canScrollRight ? (
                                        <button type="button" className="creation-reference-track-button is-right" onClick={() => scrollAttachmentTrack(1)} aria-label={t("composerReferenceRight")} title={t("composerReferenceRight")}>
                                            <ChevronRight aria-hidden="true" />
                                        </button>
                                    ) : null}
                                    {!trackState.isExpanded && props.attachments.length ? (
                                        <Tooltip title={t("createUiViewAll")}>
                                            <button type="button" className="creation-reference-panel-expand" onClick={() => setReferencePanelExpanded(true)} aria-label={t("createUiViewAllReferences", { count: props.attachments.length })} aria-expanded="false">
                                                <Maximize2 aria-hidden="true" />
                                            </button>
                                        </Tooltip>
                                    ) : null}
                                </div>
                            </div>
                        </div>
                    ) : null}
                </div>
            </div>
            {props.uploading || props.uploadFailures.length || props.inputIssues.length ? <div className="creation-input-status" aria-live="polite">
                {props.uploading ? <span>{t("composerUploadWait")}</span> : null}
                {props.inputIssues.map(issue => <p key={issue} role="alert">{issue}</p>)}
                {props.uploadFailures.map((item, index) => <p key={`${item.file.name}:${index}`} role="alert"><span>{item.file.name}：{item.error}</span><button type="button" onClick={() => props.onDismissUploadFailure(item.file)} aria-label={t("composerRemoveFailed", { name: item.file.name })}><X size={13} /></button></p>)}
                {props.uploadFailures.length ? <button type="button" disabled={props.uploading} onClick={props.onRetryUploads}>{t("composerRetryUploads")}</button> : null}
            </div> : null}
            <footer className="creation-chat-dock">
                <div className="creation-chat-controls">
                    <CreationSkillPicker disabled={interactionBusy} open={props.skillPickerOpen} onOpenChange={props.onSkillPickerOpenChange} onSelect={props.onSelectSkill} onRequireLogin={props.onRequireLogin} />
                    {props.variant === "thread" && !workspaceTeamId ? <ModePicker mode={props.mode} onModeChange={props.onModeChange} /> : null}
                    <Tooltip title={t("composerUploadLocal")}>
                        <button type="button" className="creation-chat-control" disabled={interactionBusy || !canAddMoreReferences} onClick={() => props.onRequireLogin ? props.onRequireLogin() : props.fileInputRef.current?.click()} aria-label={t("composerUploadLocal")}>
                            <Paperclip /><span>{t("composerAttachment")}</span>
                        </button>
                    </Tooltip>
                    {referencesSupported && !props.attachments.length ? (
                        <Tooltip title={addReferenceLabel}>
                            <button type="button" className="creation-chat-control" onClick={props.onOpenLibrary} disabled={interactionBusy || !canAddMoreReferences} aria-label={addReferenceLabel}>
                                <Plus aria-hidden="true" />
                                <span>{t("composerReferences")}</span>
                            </button>
                        </Tooltip>
                    ) : null}
                    <VoiceRecordingButton className="creation-voice-trigger" disabled={interactionBusy} onTranscribed={(text) => props.setPrompt(props.prompt.trim() ? `${props.prompt} ${text}` : text)} />
                    {canOptimizePrompt ? (
                        <Tooltip title={t("composerOptimizeHint")}>
                            <button type="button" className="creation-chat-control" onClick={() => setPromptOptimizerOpen(true)} aria-label={t("composerOptimize")} aria-expanded={promptOptimizerOpen} aria-haspopup="dialog">
                                <PenLine />
                                <span>{t("composerOptimizeShort")}</span>
                            </button>
                        </Tooltip>
                    ) : null}
                    <ModelPicker
                        config={props.config}
                        value={props.model}
                        onChange={props.onModelChange}
                        capability={props.mode}
                        requirements={props.modelRequirements}
                        className="creation-model-picker"
                        placeholder={t("composerSelectModel", { mode: t(props.mode === "text" ? "composerModeText" : props.mode === "image" ? "composerModeImage" : "composerModeVideo") })}
                        showSelectedPrice={false}
                        showOptionPrices
                        variant="creation"
                    />
                    {props.mode === "video" || (props.mode === "image" && imageSettingsSupported) ? <GenerationSettingsMenu {...props} /> : null}
                    {props.mode === "video" ? <DurationMenu profile={props.videoProfile} seconds={props.seconds} onChange={props.setSeconds} /> : null}
                    {props.mode === "text" ? (
                        <>
                            <Tooltip title={t(interactionBusy ? "createUiSwitchNextSend" : props.textStreaming ? "createUiStreamingOn" : "createUiStreamingOff")}>
                                <button type="button" className="creation-chat-control" aria-pressed={props.textStreaming} disabled={interactionBusy} onClick={() => props.setTextStreaming(!props.textStreaming)}>
                                    <Waves />
                                    <span>{t("createUiStreaming")}</span>
                                    {props.textStreaming ? <span className="size-1.5 rounded-full bg-blue-400 shrink-0 shadow-sm" /> : null}
                                </button>
                            </Tooltip>
                            <ThinkingControl levels={props.textThinkingLevels} value={props.textThinkingRequest} resolvedLevel={props.textThinkingLevel} onChange={props.setTextThinkingLevel} disabled={interactionBusy} />
                        </>
                    ) : null}
                    {props.prompt.trim() || props.attachments.length || props.references.some((reference) => reference.active) ? (
                        <Tooltip title={t("composerClear")}>
                            <button type="button" className="creation-chat-control is-clear" onClick={props.onClearComposer} disabled={interactionBusy} aria-label={t("composerClear")}>
                                <Trash2 />
                                <span>{t("composerClearShort")}</span>
                            </button>
                        </Tooltip>
                    ) : null}
                </div>
                <Button
                    type="text"
                    className={`creation-submit ${showCost ? "has-cost" : ""}`}
                    disabled={interactionBusy || !canSubmit}
                    style={
                        {
                            position: "relative",
                            color: "var(--user-ink)",
                        } as CSSProperties
                    }
                    onClick={interactionBusy ? undefined : props.onSubmit}
                    aria-label={actionLabel}
                    title={!canSubmit && !interactionBusy ? t("createUiEnterIdeaToGenerate") : actionLabel}
                >
                    {showWorkingGlow ? <WorkingGlow active color="var(--creation-text)" radius="var(--button-radius)" /> : null}
                    {showCost ? (
                        <span className="creation-submit-cost" title={routeQuote ? modelQuoteDescription(routeQuote) : undefined}>
                            <CreditSymbol />
                            <span>{routeQuote?.estimated ? t("createUiEstimatedCredits", { credits: formattedCredits! }) : formattedCredits}</span>
                        </span>
                    ) : null}
                    <span className="creation-submit-action" aria-hidden>
                        {showWorkingSpinner ? <LoaderCircle className="size-4 animate-spin" /> : <ArrowUp className="size-4" />}
                        <span>{showWorkingSpinner ? workingLabel : t("composerStart")}</span>
                    </span>
                </Button>
            </footer>
            {props.mode === "image" || props.mode === "video" ? (
                <MediaSettingsNotice
                    config={{ ...props.config, model: props.model }}
                    capability={props.mode}
                    onChange={(field, value) => {
                        if (field === "size") props.setRatio(value);
                        else if (field === "quality") props.setQuality(value);
                        else if (field === "imageResolution") props.setImageResolution(value);
                        else if (field === "imageParameters") props.setImageParameters(value);
                        else if (field === "count") props.setCount(value);
                        else if (field === "videoSeconds") props.setSeconds(value);
                        else if (field === "vquality") props.setVideoQuality(value);
                    }}
                />
            ) : null}
            <CreationMediaPreviewModal url={previewUrl} type={previewType} onClose={() => setPreviewUrl("")} />
        </SpotlightSurface>
    );
    const composer = embedded ? (
        surface
    ) : (
        <HoverBorderGradient as="div" duration={2.2} containerClassName="creation-composer-shell" className="creation-composer-shell-inner">
            {surface}
        </HoverBorderGradient>
    );

    if (!promptOptimizerOpen) return composer;

    return (
        <Suspense fallback={composer}>
            <CanvasPromptOptimizerDrawer
                open={promptOptimizerOpen}
                prompt={props.prompt}
                generationMode={props.mode === "video" ? "video" : "image"}
                targetModel={modelOptionName(props.model) || props.model}
                targetProtocol={priceChannel.modelCosts?.find((item) => item.model === modelOptionName(props.model))?.protocol || priceChannel.interfaceType}
                config={props.config}
                optimizerModel={props.config.textModel}
                references={optimizerReferences}
                provider={props.promptOptimizerProvider}
                onClose={() => setPromptOptimizerOpen(false)}
                onApply={props.setPrompt}
            >
                {composer}
            </CanvasPromptOptimizerDrawer>
        </Suspense>
    );
}

const creationModeItems: { mode: CreationMode; icon: ReactNode; label: string }[] = [
    { mode: "video", icon: <Film />, label: "creationTabVideo" },
    { mode: "image", icon: <ImageIcon />, label: "creationTabImage" },
    { mode: "text", icon: <MessageSquareText />, label: "creationTabText" },
];

type CreationModeKey = CreationMode | "agent";

const homeModeOptions: { mode: CreationModeKey; icon: ReactNode; label: string }[] = workspaceTeamId ? creationModeItems.filter((item) => item.mode === "text") : [...creationModeItems, { mode: "agent", icon: <Orbit />, label: "Agent" }];

const folderTabLeadingSpring = { type: "spring", stiffness: 540, damping: 42, mass: 0.6 } as const;
const folderTabTrailingSpring = { type: "spring", stiffness: 280, damping: 32, mass: 0.8 } as const;

export function CreationModeCard({ mode, agentActive, onModeChange, onAgentSelect, children }: { mode: CreationMode; agentActive: boolean; onModeChange: (mode: CreationMode) => void; onAgentSelect: () => void; children: ReactNode }) {
    const { t } = useInterfaceTranslation();
    const reducedMotion = useReducedMotion();
    const activeKey: CreationModeKey = agentActive ? "agent" : mode;
    const activeIndex = homeModeOptions.findIndex((item) => item.mode === activeKey);
    const [slide, setSlide] = useState({ index: activeIndex, direction: 0 });
    if (slide.index !== activeIndex) setSlide({ index: activeIndex, direction: Math.sign(activeIndex - slide.index) });
    const step = 100 / homeModeOptions.length;
    const tabTransition: Transition = reducedMotion
        ? { duration: 0 }
        : {
              left: slide.direction < 0 ? folderTabLeadingSpring : folderTabTrailingSpring,
              right: slide.direction > 0 ? folderTabLeadingSpring : folderTabTrailingSpring,
          };
    return (
        <HoverBorderGradient as="div" duration={2.2} containerClassName="creation-mode-card" className="creation-mode-card-inner">
            <div className="creation-mode-folder" role="group" aria-label={t("creationModes")} data-active-mode={activeKey} style={{ "--creation-mode-count": homeModeOptions.length } as CSSProperties}>
                <motion.span className="creation-mode-folder-tab" aria-hidden initial={false} animate={{ left: `${activeIndex * step}%`, right: `${(homeModeOptions.length - 1 - activeIndex) * step}%` }} transition={tabTransition}>
                    <CreationModeFolderWing side="start" />
                    <CreationModeFolderWing side="end" />
                </motion.span>
                {homeModeOptions.map(({ mode: next, icon, label }) => (
                    <button
                        key={next}
                        type="button"
                        className="creation-mode-folder-button"
                        data-mode={next}
                        aria-pressed={activeKey === next}
                        aria-label={next === "agent" ? label : t("creationGenerate", { mode: t(label) })}
                        onClick={() => {
                            if (next === activeKey) return;
                            if (next === "agent") onAgentSelect();
                            else onModeChange(next);
                        }}
                    >
                        {icon}
                        <span>{next === "agent" ? label : t(label)}</span>
                        {next === "agent" && <i className="creation-mode-spark" aria-hidden />}
                    </button>
                ))}
            </div>
            <div className="creation-mode-panel">{children}</div>
        </HoverBorderGradient>
    );
}

function CreationModeFolderWing({ side }: { side: "start" | "end" }) {
    return (
        <svg className={`creation-mode-folder-wing is-${side}`} viewBox="0 0 30 48" preserveAspectRatio="none" aria-hidden focusable="false">
            <path d="M30 0H28C14 0 14 48 0 48H30Z" />
        </svg>
    );
}

function CreationModeTabs({ mode, onModeChange, orientation = "horizontal" }: { mode: CreationMode; onModeChange: (mode: CreationMode) => void; orientation?: "horizontal" | "vertical" }) {
    const { t } = useInterfaceTranslation();
    const reducedMotion = useReducedMotion();
    const indicator = (pressed: boolean) => (pressed ? <motion.span layoutId={`creation-mode-indicator-${orientation}`} className="creation-mode-indicator" aria-hidden transition={reducedMotion ? { duration: 0 } : aceternityMotion.spring.dock} /> : null);
    return (
        <LayoutGroup id={`creation-mode-tabs-${orientation}`}>
            <div className="creation-mode-tabs" role="group" aria-label={t("creationModes")} data-active-mode={mode} data-orientation={orientation} style={{ gridTemplateColumns: orientation === "vertical" ? "minmax(0, 1fr)" : "repeat(3, minmax(0, 1fr))" }}>
                {creationModeItems.map((item) => (
                    <button key={item.mode} type="button" className="creation-mode-button" data-mode={item.mode} aria-pressed={item.mode === mode} aria-label={t("creationGenerate", { mode: t(item.label) })} onClick={() => onModeChange(item.mode)}>
                        {indicator(item.mode === mode)}
                        {item.icon}
                        <span>{t(item.label)}</span>
                    </button>
                ))}
            </div>
        </LayoutGroup>
    );
}

function ModePicker({ mode, onModeChange }: { mode: CreationMode; onModeChange: (mode: CreationMode) => void }) {
    return <CreationModeTabs mode={mode} onModeChange={onModeChange} />;
}

function GenerationSettingsMenu(props: ComposerProps) {
    const { t } = useInterfaceTranslation();
    const [open, setOpen] = useState(false);
    const imageBatchLimit = Math.min(15, useGenerationBatchLimit());
    const triggerRef = useRef<HTMLButtonElement>(null);
    const popoverRef = useRef<ComponentRef<typeof Popover>>(null);
    const [availableHeight, setAvailableHeight] = useState<number>();
    const measureAvailableHeight = useCallback(() => {
        const bounds = triggerRef.current?.getBoundingClientRect();
        if (!bounds) return;
        const viewport = window.visualViewport?.height ?? window.innerHeight;
        if (bounds.bottom <= 0 || bounds.top >= viewport) {
            setOpen(false);
            return;
        }
        setAvailableHeight(Math.max(80, Math.min(viewport * 0.65, Math.max(bounds.top, viewport - bounds.bottom) - 24)));
    }, []);
    useLayoutEffect(() => {
        if (open) popoverRef.current?.forceAlign();
    }, [open, availableHeight]);
    useLayoutEffect(() => {
        if (!open) return;
        const realign = () => {
            measureAvailableHeight();
            popoverRef.current?.forceAlign();
        };
        realign();
        const resizeObserver = new ResizeObserver(realign);
        if (triggerRef.current) resizeObserver.observe(triggerRef.current);
        window.addEventListener("resize", realign);
        window.addEventListener("scroll", realign, true);
        window.visualViewport?.addEventListener("resize", realign);
        return () => {
            resizeObserver.disconnect();
            window.removeEventListener("resize", realign);
            window.removeEventListener("scroll", realign, true);
            window.visualViewport?.removeEventListener("resize", realign);
        };
    }, [open, measureAvailableHeight]);
    const activeQualityOptions = props.imageProfile.quality.values.map(value => ({ value, label: imageQualityLabel(value, t), description: imageQualityDescription(value, t) }));
    const qualityLabel = imageQualityLabel(props.quality, t) || t("createUiAutoQuality");
    // 尺寸/比例/分辨率选项取同显示名分组内全部模型的并集，路由模型只决定发送参数。
    const mergedProfile = mergedImageCapabilityConfig(props.config, props.model || props.config.imageModel);
    const usesImageResolutionPicker = props.mode === "image" && supportsImageResolutionPresets(mergedProfile.size);
    const imageResolutionOptions = usesImageResolutionPicker ? buildImageResolutionOptions(mergedProfile.size.values) : [];
    const ratios = props.videoProfile.ratios;
    const referenceImageSize = props.mode === "image" && mergedProfile.size.allowCustom ? props.referenceImageSize : undefined;
    const referenceImageSizeValue = referenceImageSize ? String(referenceImageSize.width) + "x" + String(referenceImageSize.height) : "";
    const referenceImageSizeLabel = referenceImageSize ? String(referenceImageSize.width) + " × " + String(referenceImageSize.height) : "";
    const referenceImageSizeSelected = Boolean(referenceImageSizeValue && props.ratio === referenceImageSizeValue);
    const resolutions = props.mode === "video" ? props.videoProfile.resolutions.map((value) => ({ value: value.replace(/p$/i, ""), label: videoResolutionLabel(value) })) : resolutionOptions;
    const selectReferenceImageSize = () => {
        if (!referenceImageSizeValue) return;
        props.setRatio(referenceImageSizeValue);
    };
    const videoResolutionSupported = props.mode === "video" && resolutions.length > 0;
    const imageSummary = [
        ...(mergedProfile.size.parameter !== "none" ? [referenceImageSizeSelected ? referenceImageSizeLabel : usesImageResolutionPicker ? formatImageResolutionSize(props.ratio, imageResolutionOptions) : props.ratio] : []),
        ...(props.imageProfile.quality.supported ? [qualityLabel] : []),
        ...(imageBatchLimit > 1 ? [props.count] : []),
    ].join(" · ");
    const videoRatioSupported = props.mode === "video" && ratios.length > 0;
    const summary = props.mode === "video" ? [...(videoRatioSupported ? [props.ratio] : []), ...(videoResolutionSupported ? [videoResolutionLabel(props.videoQuality)] : [])].join(" · ") : imageSummary;
    const panel =
        props.mode === "image" && props.imageProfile.parameters ? (
            <div className="creation-parameter-menu overflow-y-auto" style={{ maxHeight: availableHeight }}>
                <ImageParameterFields
                    profile={props.imageProfile}
                    countLimit={imageBatchLimit}
                    config={{ size: props.ratio, quality: props.quality, imageResolution: props.imageResolution, imageParameters: props.imageParameters, count: props.count, transparentBackground: props.config.transparentBackground }}
                    onChange={(key, value) => {
                        const setters = {
                            size: props.setRatio,
                            quality: props.setQuality,
                            imageResolution: props.setImageResolution,
                            imageParameters: props.setImageParameters,
                            count: props.setCount,
                            transparentBackground: props.setTransparentBackground,
                        };
                        setters[key](value);
                    }}
                />
            </div>
        ) : (
            <div className="creation-parameter-menu overflow-y-auto" style={{ maxHeight: availableHeight }}>
                {props.mode === "image" ? (
                    <ImageSizePicker
                        profile={mergedProfile}
                        size={props.ratio}
                        quality={props.quality}
                        imageResolution={props.imageResolution}
                        onChange={(size, quality, resolution) => {
                            props.setRatio(size);
                            if (quality) props.setQuality(quality);
                            if (resolution) props.setImageResolution(resolution);
                        }}
                    />
                ) : videoRatioSupported ? (
                    <SettingSection title={t("createUiAspect")} value={props.ratio}>
                        <div className="creation-choice-grid is-ratio">
                            {ratios.map((value) => (
                                <button key={value} type="button" aria-pressed={value === props.ratio} className={value === props.ratio ? "is-selected" : ""} onClick={() => props.setRatio(value)}>
                                    <span className="creation-ratio-preview">
                                        <span style={ratioPreviewStyle(value)} />
                                    </span>
                                    <span>{value}</span>
                                </button>
                            ))}
                        </div>
                    </SettingSection>
                ) : null}
                {props.mode === "image" && referenceImageSizeValue ? (
                    <button type="button" className="creation-custom-trigger" onClick={selectReferenceImageSize}>
                        {t("createUiReferenceSize", { size: referenceImageSizeLabel })}
                    </button>
                ) : null}
                {props.mode === "video" ? (
                    videoResolutionSupported ? (
                        <SettingSection title={t("createUiVideoQuality")} value={videoResolutionLabel(props.videoQuality)}>
                            <div className="creation-choice-grid is-resolution">
                                {resolutions.map((option) => (
                                    <button key={option.value} type="button" aria-pressed={option.value === props.videoQuality} className={option.value === props.videoQuality ? "is-selected" : ""} onClick={() => props.setVideoQuality(option.value)}>
                                        {option.label}
                                    </button>
                                ))}
                            </div>
                        </SettingSection>
                    ) : null
                ) : (
                    <>
                        {props.imageProfile.quality.supported && !imageResolutionUsesQuality(mergedProfile) ? (
                            <SettingSection title={t(activeQualityOptions.some((item) => item.value === "1k" || item.value === "2k") ? "createUiResolution" : "createUiImageQuality")} value={qualityLabel}>
                                <div className="creation-choice-grid is-quality">
                                    {activeQualityOptions.map((option) => (
                                        <button key={option.value} type="button" aria-pressed={option.value === props.quality} className={option.value === props.quality ? "is-selected" : ""} onClick={() => props.setQuality(option.value)}>
                                            <span>{option.label}</span>
                                            <small>{option.description}</small>
                                        </button>
                                    ))}
                                </div>
                            </SettingSection>
                        ) : null}
                        {imageBatchLimit > 1 ? (
                            <SettingSection title={t("createUiOutputCount")} value={props.count}>
                                <div className="creation-parameter-content">
                                    <div className="creation-choice-grid is-count">
                                        {countOptions
                                            .filter((option) => Number(option) <= imageBatchLimit)
                                            .map((option) => (
                                                <button key={option} type="button" aria-pressed={option === props.count} className={option === props.count ? "is-selected" : ""} onClick={() => props.setCount(option)}>
                                                    {option}
                                                </button>
                                            ))}
                                    </div>
                                    <label className="creation-custom-value">
                                        <span>{t("createUiCustom")}</span>
                                        <input
                                            inputMode="numeric"
                                            pattern="[0-9]*"
                                            value={props.count}
                                            onChange={(event) => props.setCount(String(Math.max(1, Math.min(imageBatchLimit, Number(event.target.value) || 1))))}
                                            aria-label={t("createUiCountAria", { max: imageBatchLimit })}
                                        />
                                        <em>{t("createUiImageUnit")}</em>
                                    </label>
                                </div>
                            </SettingSection>
                        ) : null}
                    </>
                )}
            </div>
        );
    return (
        <Popover
            ref={popoverRef}
            open={open}
            onOpenChange={next => { if (next) measureAvailableHeight(); setOpen(next); }}
            trigger="click"
            placement="bottom"
            align={{ overflow: { adjustX: true, adjustY: true, shiftX: true, shiftY: true } }}
            arrow={false}
            classNames={{ root: "creation-control-popover", container: "creation-control-popover-surface", content: "creation-control-popover-content" }}
            content={panel}
        >
            <button ref={triggerRef} type="button" className="creation-chat-control" aria-label={t("createUiSettingsSummary", { summary })}>
                <SlidersHorizontal />
                <span>{summary}</span>
                <ChevronDown className={open ? "is-open" : ""} />
            </button>
        </Popover>
    );
}

function SettingSection({ title, value, children }: { title: string; value?: string; children: ReactNode }) {
    return (
        <section className="creation-parameter-section">
            <header>
                <h3>{title}</h3>
                {value ? <span>{value}</span> : null}
            </header>
            {children}
        </section>
    );
}

// 首页与 Agent 共用离散档位滑条，保留模型默认意图，不把它提前固化为某个档位。
function ThinkingControl({ levels, value, resolvedLevel, onChange, disabled }: { levels: ThinkingLevel[]; value: ThinkingRequest; resolvedLevel: ThinkingLevel | ""; onChange: (value: ThinkingRequest) => void; disabled: boolean }) {
    if (!levels.length) return null;
    return (
        <div className="creation-thinking-inline">
            <ThinkingLevelSlider levels={levels} value={value} resolvedLevel={resolvedLevel} onChange={onChange} disabled={disabled} />
        </div>
    );
}

function DurationMenu({ profile, seconds, onChange, protocol }: { profile: VideoCapabilityConfig; seconds: string; onChange: (value: string) => void; protocol?: string }) {
    const { t } = useInterfaceTranslation();
    const [open, setOpen] = useState(false);
    const value = Number(normalizeVideoValue(profile, { seconds }, protocol).seconds);
    const presets = profile.duration.selection === "enum" ? videoDurationOptions(profile) : [];
    const fallbackPreset = presets.length ? presets : [profile.duration.default];
    const min = profile.duration.selection === "range" ? profile.duration.min || 1 : Math.min(...fallbackPreset);
    const max = profile.duration.selection === "range" ? Math.max(min, profile.duration.max || min) : Math.max(...fallbackPreset);
    const step = Math.max(1, profile.duration.step || 1);
    const durationControl =
        profile.duration.selection === "range" ? (
            <>
                <input className="h-8 w-full" style={{ accentColor: "var(--creation-text)" }} type="range" min={min} max={max} step={step} value={value} aria-label={t("createUiDurationSecondsLabel")} onChange={(event) => onChange(event.target.value)} />
                <div className="flex justify-between px-0.5 text-[var(--fs-tiny)] text-[var(--creation-muted)]">
                    <span>{min}s</span>
                    <span>{max}s</span>
                </div>
                <label className="creation-custom-value is-duration">
                    <span>{t("createUiCustomDuration")}</span>
                    <span className="creation-duration-custom-field">
                        <input
                            type="number"
                            min={min}
                            max={max}
                            step={step}
                            inputMode="numeric"
                            value={seconds}
                            onFocus={(event) => event.currentTarget.select()}
                            onBlur={() => onChange(String(value))}
                            onChange={(event) => onChange(event.target.value)}
                            aria-label={t("createUiCustomDurationLabel")}
                        />
                        <em>{t("createUiSecondUnit")}</em>
                    </span>
                </label>
            </>
        ) : (
            <div className="creation-duration-choices">
                {presets.map((item) => (
                    <button key={item} type="button" className={item === value ? "is-selected" : ""} onClick={() => onChange(String(item))}>
                        {item}s
                    </button>
                ))}
            </div>
        );
    return (
        <Popover
            open={open}
            onOpenChange={setOpen}
            trigger="click"
            placement="bottom"
            arrow={false}
            classNames={{ root: "creation-control-popover", container: "creation-control-popover-surface", content: "creation-control-popover-content" }}
            content={
                <div className="creation-duration-menu">
                    <div className="creation-duration-heading">
                        <span>{t("previewParamDuration")}</span>
                        <strong>{t("createUiDurationValue", { count: value })}</strong>
                    </div>
                    {durationControl}
                </div>
            }
        >
            <button type="button" className="creation-chat-control is-duration" aria-label={t("createUiDurationAria", { count: value })}>
                <Clock3 />
                <span>{value}s</span>
                <ChevronDown className={open ? "is-open" : ""} />
            </button>
        </Popover>
    );
}

function ratioPreviewStyle(value: string) {
    const [width, height] = value.replace("x", ":").split(":").map(Number);
    if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return { width: 10, height: 10 };
    // 画幅容器的可用空间是 14×10；同时计算宽高，避免 CSS 的 max-width/max-height 把宽银幕比例压扁。
    const scale = Math.min(14 / width, 10 / height);
    return { width: Math.max(4, Math.round(width * scale)), height: Math.max(4, Math.round(height * scale)) };
}
