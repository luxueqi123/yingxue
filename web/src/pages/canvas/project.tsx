import { workspacePath, workspaceTeamId } from "@/lib/workspace-routes";
import { CanvasGestureRenderWindow } from "./canvas-gesture-render-window";
import { CanvasNodeResizeMotionProvider } from "@/components/canvas/canvas-node-resize-motion";
import { useCanvasImageLayerGroups } from "./use-canvas-image-layer-groups";
import { useCanvasImageLayerMaterials } from "./use-canvas-image-layer-materials";
import { getResource } from "@/services/api/resources";
import { CanvasDramaSidebar } from "@/components/canvas/canvas-drama-sidebar";
import { CanvasDramaAdoptModal } from "@/components/canvas/canvas-drama-adopt-modal";
import { canvasStoryboardToDramaSource } from "@/lib/canvas/drama-canvas-projection";
import { CanvasVideoEnhanceDialog } from "@/components/canvas/canvas-video-enhance-dialog";
import { CanvasViewport } from "@/components/canvas/canvas-viewport";
import { StoryboardAssetPickerModal } from "@/components/canvas/storyboard-asset-picker-modal";
import { bindingForConnectedNode, replaceStoryboardRowAssets, storyboardRowReferenceNodeIds } from "@/lib/canvas/canvas-storyboard-materializer";
import { normalizeStoryboardAssetBindings } from "@/lib/canvas/canvas-storyboard-assets";
import { normalizeAssetCategory } from "@/lib/asset-category";
import { filterBatchCellConnections, reconcileBatchCellConnections, syncBatchColumnReferences, type BatchScroll } from "@/lib/canvas/canvas-batch-references";
import { useCanvasBatchReferences } from "./use-canvas-batch-references";
import { useCanvasImageRotation } from "./use-canvas-image-rotation";
import { buildImageToPrevisAgentPrompt, buildImageToPrevisDisplayText } from "@/lib/canvas/image-to-previs-agent";
import type { CloudAgentMessagePresentation } from "@/services/cloud-agent-conversations";
import { CanvasDramaEmptyState } from "@/components/canvas/canvas-short-drama-entry";
import { canvasNodeCanResyncTask } from "@/lib/canvas/canvas-task-state";
import type { TimelineProject } from "@/types/timeline";
import { useInterfaceTranslation } from "@/stores/use-interface-locale-store";
import { CanvasWorkspacePanel } from "@/components/canvas/canvas-workspace-panel";
import { canvasToolLabels, readCanvasToolLaunch, type CanvasToolLaunch } from "@/lib/canvas/canvas-tool-launch";
import { isCanvasNodeGenerating } from "@/lib/canvas/canvas-node-task-state";
import { createCanvasStateWriter } from "@/lib/canvas/canvas-editor-state";
import { canCancelGenerationTask } from "@/lib/generation-task-display";
import { generationErrorMessage } from "@/lib/generation-error";
import { lazy, Suspense, useCallback, useDeferredValue, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { MouseEvent as ReactMouseEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useParams, useSearchParams, useLocation } from "react-router";
import { loadAssetsForUse, saveRemoteUserDataNow } from "@/services/user-data-sync";
import { canvasAssetHandoffIds } from "@/lib/canvas/canvas-asset-handoff";
import { canDownloadCanvasNodeMedia } from "@/lib/canvas/canvas-media-download";
import { useEffectiveConfig } from "@/stores/use-config-store";
import { createCanvasGenerationLiveProjectAdapter, registerCanvasGenerationLiveProject } from "@/services/canvas-generation-consumer";
import { getActiveUserScope } from "@/lib/user-scope";
import { getResourceAccess, resolveResourceAccessURL, resourceFileUrl, resourceIdFromStorageKey, syncResourceToArkPrivateAsset } from "@/services/api/resources";
import { uploadImage } from "@/services/image-storage";
import { imageMetadata } from "@/lib/canvas/canvas-generation-task-sync";
import { isCanvasImageSourceNode } from "@/lib/canvas/canvas-image-source";
import copyToClipboard from "copy-to-clipboard";
import { saveAs } from "file-saver";
import { serializeSrtEntries } from "@/lib/timeline/srt-parser";
import { nanoid } from "nanoid";
import { canvasAppearanceBaseTheme, canvasAppearanceForTheme, DEFAULT_CANVAS_BACKGROUND_MODE, normalizeCanvasAppearance, resolveCanvasAppearance, writeCanvasAppearanceDefault, type CanvasAppearance } from "@/lib/canvas/canvas-appearance";
import { canvasThemes, type CanvasBackgroundMode } from "@/lib/canvas-theme";
import { persistCanvasMediaPerformanceMode, readCanvasMediaPerformanceMode } from "@/lib/canvas/canvas-performance-mode";
import { filterCanvasDisplayConnections, persistCanvasHideNodeConnections, readCanvasHideNodeConnections } from "@/lib/canvas/canvas-connection-visibility";
import { summarizeCanvasContext } from "@/lib/canvas/canvas-context-summary";
import { bindLtvCurrentReferences } from "@/lib/canvas/ltv-runtime-references";
import { refreshCanvasCharacterReferenceNodes } from "@/lib/canvas/canvas-character-reference";
import { flushAssetStorePersistence, useAssetStore, type ImageAsset } from "@/stores/use-asset-store";
import { flushCanvasStorePersistence, useCanvasStore } from "@/stores/canvas/use-canvas-store";
import { consumeCanvasCreationBrief, readCanvasCreationBrief, type CanvasCreationBriefPrefill } from "@/lib/canvas/canvas-creation-brief";
import { ensureCanvasNodeAsset } from "@/services/project-asset-sync";
import { useCanvasThemeStore, useCanvasThemeScope } from "@/stores/canvas/use-canvas-theme-store";
import { useUserStore } from "@/stores/use-user-store";
import { App, Button, Modal } from "antd";
import { ArrowLeftRight } from "lucide-react";
import { AppModal } from "@/components/ui/product/app-modal";
import { getNodeSpec } from "@/constant/canvas";
import { CanvasConfigComposer } from "@/components/canvas/canvas-config-composer";
import { CanvasConfigNodePanel } from "@/components/canvas/canvas-config-node-panel";
import { useGlobalAgentStore } from "@/stores/use-global-agent-store";
import { CanvasActiveTaskPanel } from "@/components/canvas/canvas-active-task-panel";
import { CanvasCollaborationLayer } from "@/components/canvas/canvas-collaboration-layer";
import { CanvasProjectSidebar } from "@/components/canvas/canvas-project-sidebar";
import { CanvasProjectAssetModal, projectCharacterToInsertPayload } from "@/components/canvas/canvas-project-asset-modal";
import { CanvasCharacterLibraryModal } from "@/components/canvas/canvas-character-library-modal";
import { CanvasPoseLibraryModal } from "@/components/canvas/canvas-pose-library-modal";
import { CanvasCharacterReferenceNodeContent } from "@/components/canvas/canvas-character-reference-node";
import { CanvasCharacterReferenceModal } from "@/components/canvas/canvas-character-reference-modal";
import { WorkspaceState } from "@/components/layout/workspace-state";
import { resolveProjectCanvasStyle } from "@/components/canvas/canvas-style-picker-modal";
import { createStyleProfileSnapshot, resolveStyleProfile, serializeStyleProfile } from "@/lib/canvas/style-profile";
import { CanvasNodeToolbar, CanvasNodeInfoModal } from "@/components/canvas/canvas-node-toolbar";
import { CanvasSubtitleDialog } from "@/components/canvas/canvas-subtitle-dialog";
import { CanvasVideoFrameDialog } from "@/components/canvas/canvas-video-frame-dialog";
import { CanvasVideoSegmentDialog } from "@/components/canvas/canvas-video-segment-dialog";
import { CanvasTimelineDialog } from "@/components/canvas/canvas-timeline-dialog";
import { syncNodeSubtitlesToTimeline } from "@/lib/timeline/timeline-build";
import { CanvasVideoDepthDialog } from "@/components/canvas/canvas-video-depth-dialog";
import { listVideoProcessingModels } from "@/lib/canvas/canvas-video-processing";
import { CanvasNodeAnglePanel } from "@/components/canvas/canvas-node-angle-dialog";
import { CanvasNodeLightingPanel } from "@/components/canvas/canvas-node-lighting-dialog";
import { CanvasNodeSearchModal } from "@/components/canvas/canvas-node-search-modal";
import { CanvasStylePickerModal } from "@/components/canvas/canvas-style-picker-modal";
import { CanvasFileDropOverlay } from "@/components/canvas/canvas-file-drop-overlay";
import { CanvasUploadModal } from "@/components/canvas/canvas-upload-modal";
import { CanvasPanoramaConfigModal } from "@/components/canvas/canvas-panorama-config-modal";
import { InfiniteCanvas } from "@/components/canvas/infinite-canvas";
import { Minimap } from "@/components/canvas/canvas-mini-map";
import { CanvasNodePromptPanel, type CanvasNodeGenerationMode } from "@/components/canvas/canvas-node-prompt-panel";
import { handleListGenerate } from "./list-mode-generator";
import { CanvasToolbar } from "@/components/canvas/canvas-toolbar";
import { useCanvasCreateCommands } from "@/components/canvas/use-canvas-create-commands";
import { AssetPickerModal, type InsertAssetPayload } from "@/components/canvas/asset-picker-modal";
import { getProject, listCharacters, type ProjectAsset, getCharacter } from "@/services/api/projects";
import { CanvasZoomControls } from "@/components/canvas/canvas-zoom-controls";
import { persistCanvasAgentCameraFollow, readCanvasAgentCameraFollow } from "@/lib/canvas/canvas-agent-camera-follow";
import { CanvasShareModal } from "@/components/canvas/canvas-share-modal";
import { CanvasScriptEditor, CanvasScriptNodeContent } from "@/components/canvas/canvas-script-node";
import { CanvasBatchTableNodeContent } from "@/components/canvas/canvas-batch-table-node";
import { BatchGenerationSettingsDialog } from "@/components/canvas/batch-generation-settings-dialog";
import { batchReferenceColumns, promoteLegacyBatchTableSize } from "@/lib/canvas/canvas-batch-table";
import { storyboardMinNodeHeight } from "@/lib/canvas/canvas-storyboard-layout";
import { CanvasPrevisNodePanel } from "@/components/canvas/previs/canvas-previs-node-panel";
import { CanvasPrevisTemplateModal } from "@/components/canvas/previs/canvas-previs-template-modal";
import { CanvasVersionCompareModal } from "@/components/canvas/canvas-version-compare-modal";
import { useFocusMode } from "@/hooks/use-focus-mode";
import { connectCanvasTextMention } from "@/lib/canvas/canvas-text-mention";
import { writeCanvasNodePrompt } from "@/lib/canvas/canvas-node-prompt";
import {
    applyCanvasConnectionPromptSync,
    buildCanvasAgentMentionReferences,
    canvasResourceMentionToken,
    buildCanvasNodeMentionReferenceMap,
    buildCanvasResourceReferences,
    getContextResourceNodes,
    normalizeCanvasNodeMentionTokens,
    reorderCanvasResourceConnections,
    replaceCanvasReferenceMentions,
    type CanvasResourceReference,
} from "@/lib/canvas/canvas-resource-references";
import { CanvasConnectionCreateMenu, CanvasNodePanelOverlay } from "@/components/canvas/canvas-workspace-overlays";
import { CanvasOverlayLayerContainer, CanvasOverlayLayerProvider } from "@/components/canvas/canvas-overlay-layer";
import { CanvasLeaferGraphicsLayer } from "@/components/canvas/canvas-leafer-graphics-layer";
import { CanvasFreeformEmptyState, CanvasLinkedProjectEmptyState, CanvasShortDramaEmptyState, CanvasShortDramaGuide, CanvasStoryInputNodeContent, CanvasStylePlaceholderNodeContent } from "@/components/canvas/canvas-short-drama-entry";
import { resolveCanvasEmptyStateKind } from "@/lib/canvas/canvas-starter";
import { failedImageBatchChildren, markImageBatchRetrying, reconcileImageBatchRoot, restoreUnsubmittedImageBatchChild } from "@/lib/canvas/canvas-image-batch-retry";
import { cinematicStoryboardColumns, createCanvasNode, getInputSummary, isHiddenBatchChild } from "@/lib/canvas/canvas-project-domain";
import { buildVideoRemakeDraft } from "@/lib/canvas/canvas-video-remake";
import { findAvailableGenerationGroupPosition } from "@/lib/canvas/canvas-generation-layout";
import { IMAGE_NODE_MAX_SIZE } from "@/lib/canvas/canvas-node-size";
import { bindStoryboardKeyframes, storyboardKeyframeTime, storyboardRowsFromBatchTable } from "@/lib/canvas/canvas-batch-storyboard";
import { stampCanvasNodeChanges, updateCanvasNode, updateCanvasNodes } from "@/lib/canvas/canvas-node-timestamps";
import { canvasAssetHandoffAttempt, finalizeCanvasAssetHandoff, uninsertedCanvasAssetHandoffPayloads } from "@/lib/canvas/canvas-asset-handoff";
import { expandBatchSourceNodeIds } from "@/lib/canvas/canvas-batch-connection";
import { isFrameNode } from "@/lib/canvas/canvas-frame";
import { deriveStoryboardPipelineProgress } from "@/lib/canvas/canvas-storyboard-progress";
import { storyboardRowImageOutputs } from "@/lib/canvas/canvas-storyboard-outputs";
import { CanvasOperationChangeToast, CanvasMergeStatusToast, CanvasUploadStatusToast } from "./canvas-project-feedback";
import { getGenerationCount } from "@/lib/canvas/canvas-project-generation";
import { canvasReferenceImageDimensions } from "@/lib/canvas/canvas-reference-image-size";
import { cancelGenerationTask } from "@/services/api/task-center";
import { CanvasSyncStatus } from "./canvas-sync-status";
import { CanvasVersionHistory, useCanvasVersionHistory } from "./canvas-version-history";
import { CanvasVersionPreview } from "./canvas-version-preview";
import { CanvasProjectHeading, CanvasTopBar, type CanvasProjectView } from "./canvas-project-top-bar";
import { CanvasAssetView } from "@/components/canvas/canvas-asset-view";
import { CanvasMediaVersionModal } from "@/components/canvas/canvas-media-version-modal";
import { hasMediaVersionHistory } from "@/lib/canvas/canvas-media-versions";
import type { CanvasAssetVersion } from "@/lib/canvas/canvas-asset-catalog";
import { CanvasFocusModeBar } from "@/components/canvas/canvas-focus-mode-bar";
import { CanvasProjectContextMenu } from "./canvas-project-context-menu";
import { CanvasProjectMediaDialogs } from "./canvas-project-media-dialogs";
import { CanvasProjectSelectionToolbar } from "./canvas-project-selection-toolbar";
import { CanvasProjectStatusDialogs } from "./canvas-project-status-dialogs";
import { CanvasProjectWorldLayers } from "./canvas-project-world-layers";
import { CanvasNodeActionContext, type CanvasNodeActionContextValue } from "@/components/canvas/canvas-node-action-context";
import { bringCanvasNodeToFront, type CanvasNodeStackOrder } from "@/lib/canvas/canvas-node-stack-order";
import { AiArtCritiqueModal } from "@/components/canvas/art-critique/ai-art-critique-modal";
import { CanvasNodeGraphContext, type CanvasNodeGraphContextValue } from "@/components/canvas/canvas-node-graph-context";
import { CanvasRefreshShell } from "./canvas-refresh-shell";
import { queryGenerationTask } from "@/services/api/task-center";
import type { CanvasImageEmotionPayload } from "@/components/canvas/canvas-node-emotion-panel";
import { CanvasEmotionWorkspace } from "@/components/canvas/canvas-emotion-workspace";
import { removeCanvasDrawing } from "@/lib/canvas/canvas-drawing-storage";
import { useCanvasConnectionController } from "./use-canvas-connection-controller";
import { useCanvasOperationHistory } from "./use-canvas-operation-history";
import { useCanvasAssistantVisibility } from "./use-canvas-assistant-visibility";
import { type AgentInsertedNode } from "@/stores/use-global-agent-store";
import { type CanvasAgentMode } from "@/components/canvas/canvas-agent-chat-ui";
import { useCanvasActiveTasks } from "./use-canvas-active-tasks";
import { AssistantPanelColumn, getPanelWidthBounds } from "./canvas-assistant-panel-column";
import { CanvasAssistantPanel } from "@/components/canvas/canvas-assistant-panel";
import { CanvasLocalAgentPanel } from "@/components/canvas/canvas-local-agent-panel";
import { shouldAutoConnectCanvasRuntime } from "@/lib/canvas/local-runtime-connection";
import { readLocalRuntimeBootstrapState } from "@/services/local-runtime-bootstrap";
import { useCanvasStyleWorkflow } from "./use-canvas-style-workflow";
import { useCanvasPrevis } from "./use-canvas-previs";
import { useCanvasGeneration } from "./use-canvas-generation";
import { useCanvasGenerationBatches } from "./use-canvas-generation-batches";
import { useCanvasBatchTable } from "./use-canvas-batch-table";
import { useCanvasGenerationExecutor, type CanvasNodeGenerationOptions } from "./use-canvas-generation-executor";
import { useCanvasGenerationRetry } from "./use-canvas-generation-retry";
import { useCanvasHistory } from "./use-canvas-history";
import { useCanvasKeyboard } from "./use-canvas-keyboard";
import { useCanvasMediaTools } from "./use-canvas-media-tools";
import { useCanvasNodeEditor } from "./use-canvas-node-editor";
import { useCanvasNodeOperations } from "./use-canvas-node-operations";
import { useCanvasProjectLifecycle } from "./use-canvas-project-lifecycle";
import { applyCanvasImport } from "./canvas-import-save";
import { waitForCanvasSync } from "@/lib/canvas/sync-recovery";
import { useCanvasRenderModel } from "./use-canvas-render-model";
import { useCanvasSelectionController } from "./use-canvas-selection-controller";
import { useCanvasShortDrama } from "./use-canvas-short-drama";
import { useCanvasDrama, type UseCanvasDramaInput } from "./use-canvas-drama";
import { useCanvasStoryboard } from "./use-canvas-storyboard";
import { useCanvasUpload } from "./use-canvas-upload";
import { useCanvasTimelineAssetInsert } from "./use-canvas-timeline-asset-insert";
import { useCanvasViewportController } from "./use-canvas-viewport-controller";
import {
    CanvasNodeType,
    type CanvasAssistantSession,
    type CanvasConnection,
    type CanvasFolderStyle,
    type CanvasFolderTheme,
    type CanvasNodeData,
    type CanvasNodeMetadata,
    type CanvasMediaPerformanceMode,
    type StoryboardColumn,
    type StoryboardShotCount,
    type StoryboardShotDuration,
    type CanvasWorkspaceMode,
    type CanvasToolMode,
    type ContextMenuState,
    type Position,
    type ViewportTransform,
} from "@/types/canvas";
import { ART_CRITIQUE_NODE_TYPE } from "@/lib/art-critique/contracts";
import { copyImageToSystemClipboard } from "./canvas-clipboard";

const CanvasPrevisWorkbench = lazy(() => import("@/components/canvas/previs/canvas-previs-workbench").then((module) => ({ default: module.CanvasPrevisWorkbench })));
const CanvasDrawingEditorModal = lazy(() => import("@/components/canvas/canvas-drawing-editor-modal").then((module) => ({ default: module.CanvasDrawingEditorModal })));

const CanvasTextEditorModal = lazy(() => import("@/components/canvas/canvas-text-editor-modal").then((module) => ({ default: module.CanvasTextEditorModal })));

const LibTVImportDialog = lazy(() => import("./components/libtv-import-dialog").then((module) => ({ default: module.LibTVImportDialog })));

const TapNowImportDialog = lazy(() => import("./components/tapnow-import-dialog").then((module) => ({ default: module.TapNowImportDialog })));

const CanvasImageCompareModal = lazy(() => import("@/components/canvas/canvas-image-compare-modal").then((module) => ({ default: module.CanvasImageCompareModal })));

const NODE_STATUS_SUCCESS = "success" as const;
const EMPTY_RESOURCE_REFERENCES: CanvasResourceReference[] = [];

function visibleGenerationBatch(node: CanvasNodeData) {
    const batches = node.metadata?.generationBatches || [];
    for (let index = batches.length - 1; index >= 0; index -= 1) {
        if (batches[index].status === "queued" || batches[index].status === "running") return batches[index];
    }
    return batches.at(-1);
}

export default function CanvasPage() {
    useCanvasThemeScope();
    const [mounted, setMounted] = useState(false);
    const { id } = useParams<{ id: string }>();
    const userId = useUserStore((state) => state.user?.id || "guest");

    useEffect(() => {
        setMounted(true);
    }, []);

    if (!mounted) return <CanvasRefreshShell />;

    // A different project must not autosave the previous project's mounted state.
    return <InfiniteCanvasPage key={JSON.stringify([userId, id])} />;
}

function InfiniteCanvasPage() {
    const { t } = useInterfaceTranslation();
    // 命令式确认必须走 App.useApp().modal；静态 Modal.confirm 拿不到主题和 App 上下文。
    const { message, modal } = App.useApp();
    const queryClient = useQueryClient();
    const navigate = useNavigate();

    const params = useParams<{ id: string }>();
    const [searchParams, setSearchParams] = useSearchParams();
    const location = useLocation();
    const projectId = params.id || "";
    const canvasStorageScope = getActiveUserScope();
    const containerRef = useRef<HTMLDivElement>(null);
    const didInitialCenterRef = useRef(false);
    const toolbarHideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const assetHandoffRef = useRef("");
    const briefHandoffRef = useRef("");
    const briefConsumptionRef = useRef<{ key: string; pending: Promise<void> } | null>(null);
    const briefProjectRef = useRef({ projectId, scope: canvasStorageScope });
    briefProjectRef.current = { projectId, scope: canvasStorageScope };

    const effectiveConfig = useEffectiveConfig();
    const assets = useAssetStore((state) => state.assets);
    const assetsHydrated = useAssetStore((state) => state.hydrated);
    const cleanupAssetImages = useAssetStore((state) => state.cleanupImages);
    const colorTheme = useCanvasThemeStore((state) => state.theme);
    const setTheme = useCanvasThemeStore((state) => state.setTheme);
    const theme = canvasThemes[colorTheme];
    const defaultDrawingEngine = useUserStore((state) => state.drawingEngine.defaultEngine);
    const shortDramaEnabled = useUserStore((state) => state.features.shortDramaEnabled) && !workspaceTeamId;
    const previsOnboardingScope = useUserStore((state) => state.user?.id?.trim() || "");
    const nodesRef = useRef<CanvasNodeData[]>([]);
    const [nodes, setNodesState] = useState<CanvasNodeData[]>([]);
    const setNodes = useMemo(() => createCanvasStateWriter(nodesRef, setNodesState, stampCanvasNodeChanges), []);
    // Content updates already stamp their changed nodes; publish their snapshots
    // synchronously too, so a React updater replay cannot rewind the save ref.
    const setContentNodes = useMemo(() => createCanvasStateWriter(nodesRef, setNodesState), []);
    const [nodeStackOrder, setNodeStackOrder] = useState<CanvasNodeStackOrder>([]);
    const bringNodeToFront = useCallback((nodeId: string) => {
        setNodeStackOrder((current) => bringCanvasNodeToFront(current, nodeId));
    }, []);
    const [connections, setConnectionsState] = useState<CanvasConnection[]>([]);
    const connectionsRef = useRef<CanvasConnection[]>([]);
    const setConnections = useMemo(() => createCanvasStateWriter(connectionsRef, setConnectionsState), []);
    const [chatSessions, setChatSessions] = useState<CanvasAssistantSession[]>([]);
    const [activeChatId, setActiveChatId] = useState<string | null>(null);
    const [viewport, setViewport] = useState<ViewportTransform>({ x: 0, y: 0, k: 1 });
    const [size, setSize] = useState({ width: 1200, height: 720 });
    const [selectedNodeIds, setSelectedNodeIds] = useState<Set<string>>(new Set());
    const [selectedConnectionId, setSelectedConnectionId] = useState<string | null>(null);
    const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
    const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
    // 每次发送带递增 id：重复发送同一节点时文本相同，仍需触发一次追加。
    const [agentPrefillRequest, setAgentPrefillRequest] = useState<{ id: number; text: string } | null>(null);
    const [isMiniMapOpen, setIsMiniMapOpen] = useState(false);
    const [canvasAppearance, setCanvasAppearance] = useState<CanvasAppearance>(() => canvasAppearanceForTheme(colorTheme));
    const [backgroundMode, setBackgroundMode] = useState<CanvasBackgroundMode>(DEFAULT_CANVAS_BACKGROUND_MODE);
    const [showImageInfo, setShowImageInfo] = useState(false);
    const [canvasTool, setCanvasTool] = useState<CanvasToolMode>("box-select");
    const [mediaPerformanceMode, setMediaPerformanceMode] = useState<CanvasMediaPerformanceMode>(readCanvasMediaPerformanceMode);
    const [hideNodeConnections, setHideNodeConnections] = useState(readCanvasHideNodeConnections);
    const [agentFollowCamera] = useState(readCanvasAgentCameraFollow);
    const [projectLoaded, setProjectLoaded] = useState(false);
    useLayoutEffect(() => {
        if (!projectLoaded) return;
        const nextNodes = syncBatchColumnReferences(nodesRef.current, connectionsRef.current);
        const nextConnections = reconcileBatchCellConnections(nextNodes, connectionsRef.current);
        if (nextNodes !== nodesRef.current) setNodes(nextNodes);
        if (nextConnections !== connectionsRef.current) setConnections(nextConnections);
    }, [projectLoaded, nodes, connections, setNodes, setConnections]);
    const workspaceMode: CanvasWorkspaceMode = "professional";
    const [clearConfirmOpen, setClearConfirmOpen] = useState(false);
    const [shareModalOpen, setShareModalOpen] = useState(false);
    const [tapNowImportOpen, setTapNowImportOpen] = useState(false);
    const [nodeSearchOpen, setNodeSearchOpen] = useState(false);
    const [toolbarNodeId, setToolbarNodeId] = useState<string | null>(null);
    const [arkPrivateAssetUploadNodeId, setArkPrivateAssetUploadNodeId] = useState<string | null>(null);
    const [nodeImageSettingsOpen, setNodeImageSettingsOpen] = useState(false);
    const [dialogNodeId, setDialogNodeId] = useState<string | null>(null);
    const [textEditorNodeId, setTextEditorNodeId] = useState<string | null>(null);
    const [characterReferenceNodeId, setCharacterReferenceNodeId] = useState<string | null>(null);
    const [characterLibraryOpen, setCharacterLibraryOpen] = useState(false);
    const [characterLibraryPosition, setCharacterLibraryPosition] = useState<Position | undefined>();
    const [drawingNodeId, setDrawingNodeId] = useState<string | null>(null);
    const [pendingHomeTool, setPendingHomeTool] = useState<Exclude<CanvasToolLaunch, "director"> | null>(null);
    const [stylePickerOpen, setStylePickerOpen] = useState(false);
    // 姿势库：null 表示未打开，position 为右键菜单落点，缺省插到视口中心。
    const [poseLibraryRequest, setPoseLibraryRequest] = useState<{ position?: Position } | null>(null);
    // 新建世界引擎镜头先选模板，缺省插入视口中心。
    const [previsTemplateRequest, setPrevisTemplateRequest] = useState<{ position?: Position } | null>(null);
    const [infoNodeId, setInfoNodeId] = useState<string | null>(null);
    const [subtitleNodeId, setSubtitleNodeId] = useState<string | null>(null);
    const [timelineNodeId, setTimelineNodeId] = useState<string | null>(null);
    const [comparedImageIds, setComparedImageIds] = useState<string[] | null>(null);
    const [superResolveNodeId, setSuperResolveNodeId] = useState<string | null>(null);
    const [previewNodeId, setPreviewNodeId] = useState<string | null>(null);
    const [scriptEditorNodeId, setScriptEditorNodeId] = useState<string | null>(null);
    const [artCritiqueNodeId, setArtCritiqueNodeId] = useState<string | null>(null);
    const artCritiqueRunningRef = useRef(false);
    const [artCritiqueStartRequest, setArtCritiqueStartRequest] = useState<{ nodeId: string; id: string; restart: boolean } | null>(null);
    const [scriptScrollTopById, setScriptScrollTopById] = useState<Record<string, number>>({});
    const [batchScrollById, setBatchScrollById] = useState<Record<string, BatchScroll>>({});

    const [previsNodeId, setPrevisNodeId] = useState<string | null>(null);
    const [versionCompareRootId, setVersionCompareRootId] = useState<string | null>(null);
    const [mediaVersionNodeId, setMediaVersionNodeId] = useState<string | null>(null);
    const [dramaPrevisEntry, setDramaPrevisEntry] = useState<{ nodeId: string; mode: "layout" | "animate" } | null>(null);
    const [libTVImportOpen, setLibTVImportOpen] = useState(false);
    const [titleEditing, setTitleEditing] = useState(false);
    const [titleDraft, setTitleDraft] = useState("");
    const [shortcutRequestNonce, setShortcutRequestNonce] = useState(0);
    const [cinematicAgentEntry, setCinematicAgentEntry] = useState(false);
    const codexAutoConnect = shouldAutoConnectCanvasRuntime(searchParams);
    const codexCompactAgent = codexAutoConnect && readLocalRuntimeBootstrapState().legacyDeepLinkRejected;
    const [creationBrief, setCreationBrief] = useState<(CanvasCreationBriefPrefill & { projectId: string }) | null>(null);
    // 面板初始宽度根据视口宽度动态选择，避免小屏幕上初始就过宽
    const [assistantWidth, setAssistantWidth] = useState(() => {
        const vw = typeof window !== "undefined" ? window.innerWidth : 1280;
        if (vw < 768) return 300;
        if (vw < 1024) return 360;
        if (vw <= 1520) return 340;
        return 400;
    });
    // 窗口跨越断点时把面板宽度 clamp 到当前断点的合理区间，避免宽屏值在窄屏挤压画布
    useEffect(() => {
        const clamp = () => {
            const { min, max } = getPanelWidthBounds();
            setAssistantWidth((prev) => (prev < min ? min : prev > max ? max : prev));
        };
        window.addEventListener("resize", clamp);
        return () => window.removeEventListener("resize", clamp);
    }, []);
    const { assistantClosing, assistantMounted, assistantOpen, closeAgent, openAgent: openAssistant } = useCanvasAssistantVisibility();
    const agentMentionReferences = useMemo(() => buildCanvasAgentMentionReferences(nodes), [nodes]);

    const savedProject = useCanvasStore((state) => state.projects.some((project) => project.id === projectId));
    const { tasks: activeTasks } = useCanvasActiveTasks(projectId, projectLoaded && savedProject);
    const { focusMode, enterFocusMode, exitFocusMode, toggleFocusMode } = useFocusMode();
    const canvasView: CanvasProjectView = searchParams.get("view") === "assets" && !focusMode ? "assets" : "canvas";
    const [focusDockRevealed, setFocusDockRevealed] = useState(false);

    useEffect(() => {
        persistCanvasMediaPerformanceMode(mediaPerformanceMode);
    }, [mediaPerformanceMode]);

    useEffect(() => {
        persistCanvasHideNodeConnections(hideNodeConnections);
    }, [hideNodeConnections]);

    useEffect(() => {
        persistCanvasAgentCameraFollow(agentFollowCamera);
    }, [agentFollowCamera]);

    useEffect(() => {
        didInitialCenterRef.current = false;
        setNodeStackOrder([]);
    }, [projectId]);

    useEffect(() => {
        const nodeIds = new Set(nodes.map((node) => node.id));
        setNodeStackOrder((current) => {
            const next = current.filter((nodeId) => nodeIds.has(nodeId));
            return next.length === current.length ? current : next;
        });
    }, [nodes]);

    const chatSessionsRef = useRef(chatSessions);
    const activeChatIdRef = useRef(activeChatId);
    const selectedNodeIdsRef = useRef(selectedNodeIds);
    const viewportRef = useRef(viewport);
    const [workspaceOpen, setWorkspaceOpen] = useState(false);
    const [storyboardAssetTarget, setStoryboardAssetTarget] = useState<{ nodeId: string; rowId: string } | null>(null);

    const generateNodeRef = useRef<((nodeId: string, mode: CanvasNodeGenerationMode, prompt: string, options?: CanvasNodeGenerationOptions) => Promise<void>) | null>(null);

    useEffect(() => {
        if (!projectId) return;
        return registerCanvasGenerationLiveProject({
            scope: canvasStorageScope,
            projectId,
            adapter: createCanvasGenerationLiveProjectAdapter({ nodesRef, connectionsRef, chatSessionsRef, activeChatIdRef, setNodes, setConnections, setChatSessions, setActiveChatId }),
        });
    }, [canvasStorageScope, projectId]);

    const resolvedCanvasAppearance = useMemo(() => resolveCanvasAppearance(canvasAppearance, colorTheme), [canvasAppearance, colorTheme]);
    const applyCanvasAppearance = useCallback(
        (next: CanvasAppearance) => {
            const fallback = canvasAppearanceBaseTheme(next, colorTheme);
            const normalized = normalizeCanvasAppearance(next, fallback);
            setCanvasAppearance(normalized);
            setTheme(canvasAppearanceBaseTheme(normalized, fallback));
        },
        [colorTheme, setTheme],
    );
    const saveCanvasAppearanceDefault = useCallback(
        (next: CanvasAppearance) => {
            writeCanvasAppearanceDefault({ appearance: next, backgroundMode });
            message.success(t("canvasToolsUi.savedDefaultAppearance"));
        },
        [backgroundMode, message, t],
    );

    const { getHistoryCleanupContext, historyPausedRef, historyState, redoCanvas, resetHistory, undoCanvas } = useCanvasHistory({
        projectLoaded,
        nodes,
        connections,
        chatSessions,
        activeChatId,
        canvasAppearance,
        backgroundMode,
        showImageInfo,
        setNodes,
        setConnections,
        setChatSessions,
        setActiveChatId,
        applyCanvasAppearance,
        setBackgroundMode,
        setShowImageInfo,
        setSelectedNodeIds,
        setSelectedConnectionId,
        setContextMenu,
    });

    const cleanupCanvasFiles = useCallback(
        (extra?: unknown) => {
            cleanupAssetImages({ extra, ...getHistoryCleanupContext() });
        },
        [cleanupAssetImages, getHistoryCleanupContext],
    );

    const {
        loadError,
        retryLoad,
        addedSkills,
        agentFocus,
        persistLocalEdits,
        clearCanvasFiles,
        createAndOpenProject,
        currentProject,
        deleteCurrentProject,
        renameCurrentProject,
        reloadLatestCanvasProject,
        restoreCanvasProjectVersion,
        saveCanvasProject,
        forceSaveCanvasProject,
        updateProject,
    } = useCanvasProjectLifecycle({
        projectId,
        projectLoaded,
        nodes,
        connections,
        chatSessions,
        activeChatId,
        canvasAppearance,
        backgroundMode,
        showImageInfo,
        viewport,
        nodesRef,
        connectionsRef,
        chatSessionsRef,
        activeChatIdRef,
        viewportRef,
        historyPausedRef,
        setNodes,
        setConnections,
        setChatSessions,
        setActiveChatId,
        setCanvasAppearance,
        setBackgroundMode,
        setShowImageInfo,
        setViewport,
        setProjectLoaded,
        resetHistory,
        cleanupAssetImages,
        cleanupCanvasFiles,
    });

    const versions = useCanvasVersionHistory(projectId, restoreCanvasProjectVersion);
    const openVersions = () => {
        closeAgent();
        setVersionCompareRootId(null);
        versions.show();
    };
    const openAgent = useCallback(() => {
        if (workspaceTeamId) {
            void message.info("当前空间尚未开放 Agent");
            return;
        }
        versions.close();
        openAssistant();
    }, [message, versions.close, openAssistant]);

    const sendSelectionToAgent = useCallback(
        (nodeId?: string) => {
            const ids = nodeId ? [nodeId] : Array.from(selectedNodeIdsRef.current);
            const references = ids.map((id) => agentMentionReferences.find((reference) => reference.nodeId === id)).filter((reference): reference is CanvasResourceReference => Boolean(reference));
            if (!references.length) return;
            if (nodeId && !selectedNodeIdsRef.current.has(nodeId)) {
                const selection = new Set([nodeId]);
                selectedNodeIdsRef.current = selection;
                setSelectedNodeIds(selection);
            }
            const text = `${references.map(canvasResourceMentionToken).join(" ")} `;
            setAgentPrefillRequest((current) => ({ id: (current?.id ?? 0) + 1, text }));
            openAgent();
            setContextMenu(null);
        },
        [agentMentionReferences, openAgent],
    );
    // 修复素材关联仍遵守当前画布版本，不能替用户确认覆盖云端的新内容。
    const confirmForceSaveCanvas = useCallback(() => {
        modal.confirm({
            title: t("canvasToolsUi.repairAssetBindings"),
            content: "核对画布媒体与素材库的关联，补齐缺失素材后保存。若云端已有新版本，会保留本地草稿并提示加载最新版。",
            okText: "修复并保存",
            cancelText: t("timelineCancel"),
            onOk: () => forceSaveCanvasProject(),
        });
    }, [forceSaveCanvasProject, modal, t]);

    const sendImageToPrevisAgent = useCallback(
        (node: CanvasNodeData) => {
            if (node.type !== CanvasNodeType.Image) return;
            const reference = agentMentionReferences.find((item) => item.nodeId === node.id && item.kind === "image");
            if (!reference) {
                message.warning("这张图片暂时没有可供 Agent 引用的画布资源");
                return;
            }
            if (!selectedNodeIdsRef.current.has(node.id)) {
                const selection = new Set([node.id]);
                selectedNodeIdsRef.current = selection;
                setSelectedNodeIds(selection);
            }
            setAgentPrefillRequest((current) => ({
                id: (current?.id ?? 0) + 1,
                text: buildImageToPrevisAgentPrompt(reference),
                displayText: buildImageToPrevisDisplayText(),
                canvasReferenceNodeId: reference.nodeId,
                autoSubmit: true,
                requiresVision: true,
            }));
            openAgent();
            setContextMenu(null);
        },
        [agentMentionReferences, message, openAgent],
    );
    const applyImportedCanvas = useCallback(
        async (importedNodes: CanvasNodeData[], importedConnections: CanvasConnection[]) => {
            return applyCanvasImport(importedNodes, importedConnections, {
                canvasId: projectId,
                read: () => ({ nodes: nodesRef.current, connections: connectionsRef.current }),
                write: ({ nodes, connections }) => {
                    nodesRef.current = nodes;
                    connectionsRef.current = connections;
                    setNodes(nodes);
                    setConnections(connections);
                },
                persistLocal: async () => {
                    await persistLocalEdits();
                    await waitForCanvasSync(flushAssetStorePersistence());
                },
                syncRemote: () => saveRemoteUserDataNow(projectId),
            });
        },
        [persistLocalEdits, projectId, setConnections, setNodes],
    );
    const linkedProjectId = shortDramaEnabled ? currentProject?.projectId || "" : "";
    const linkedProjectQuery = useQuery({ queryKey: ["project", linkedProjectId], queryFn: () => getProject(linkedProjectId), enabled: Boolean(linkedProjectId) });
    const refetchLinkedProject = linkedProjectQuery.refetch;
    const archiveNodesToLinkedFolder = useCallback(
        (folder: CanvasNodeData, droppedNodes: CanvasNodeData[]) => {
            const folderId = folder.metadata?.folder?.assetFolderId;
            const domainProjectId = folder.metadata?.folder?.projectId || linkedProjectId;
            if (!folderId || !domainProjectId || !droppedNodes.length) return;
            void Promise.all(droppedNodes.map((node) => ensureCanvasNodeAsset({ canvasId: projectId, domainProjectId, folderId, node, source: "canvas-manual" })))
                .then((results) => {
                    const archivedByNodeId = new Map(droppedNodes.map((node, index) => [node.id, { assetId: results[index].assetId, content: node.metadata?.content, previousAssetId: node.metadata?.assetId }]));
                    setNodes((current) =>
                        current.map((node) => {
                            const archived = archivedByNodeId.get(node.id);
                            if (!archived || node.metadata?.content !== archived.content || node.metadata?.assetId !== archived.previousAssetId) return node;
                            return { ...node, metadata: { ...node.metadata, assetId: archived.assetId } };
                        }),
                    );
                    void refetchLinkedProject();
                    message.success(t("followupUi.archivedNamed", { name: folder.title }));
                })
                .catch((error) => message.error(error instanceof Error ? error.message : "素材归档失败"));
        },
        [linkedProjectId, message, projectId, refetchLinkedProject, setNodes],
    );
    useEffect(() => {
        if (!projectLoaded || !linkedProjectQuery.data) return;
        setNodes((current) => refreshCanvasCharacterReferenceNodes(current, linkedProjectQuery.data.assets));
    }, [linkedProjectQuery.data, projectLoaded, setNodes]);
    const canvasCharacterIds = useMemo(() => {
        const ids = new Set<string>();
        for (const node of nodes) {
            const assetId = node.metadata?.workflowKind === "character" ? node.metadata.characterAssetId?.trim() : "";
            if (assetId) ids.add(assetId);
        }
        return [...ids].sort();
    }, [nodes]);
    const characterCardsQuery = useQuery({ queryKey: ["characters", "canvas-refresh", canvasCharacterIds], queryFn: () => listCharacters({ ids: canvasCharacterIds }), enabled: projectLoaded && canvasCharacterIds.length > 0 });
    useEffect(() => {
        if (!projectLoaded || !characterCardsQuery.data) return;
        const assets = characterCardsQuery.data.characters.map((item) => ({ ...item.asset, character: item.character })) as ProjectAsset[];
        setNodes((current) => refreshCanvasCharacterReferenceNodes(current, assets));
    }, [characterCardsQuery.data, projectLoaded, setNodes]);
    const canvasContext = useMemo(() => summarizeCanvasContext(nodes, selectedNodeIds, linkedProjectQuery.data?.units), [linkedProjectQuery.data?.units, nodes, selectedNodeIds]);
    // 扩展节点（对比/图表/调色）要读自己的上游才能渲染，经 Context 下发；
    // 取上游复用 canvas-resource-references 的实现，别在这里另写一份。必须 memo——
    // 每帧新对象会让所有节点跟着重渲染，错题本里多条崩溃都出在画布高频更新。
    const nodeGraphContext = useMemo<CanvasNodeGraphContextValue>(() => ({ getUpstreamNodes: (nodeId: string) => getContextResourceNodes(nodeId, nodes, connections) }), [connections, nodes]);

    const { resyncGenerationTaskNode, applyGenerationTaskResult, bindGenerationTask, finishGenerationRequest, openNodeTaskDetails, runningNodeId, setRunningNodeId, setTaskDetail, startGenerationRequest, taskDetail, taskDetailLoading, taskDetailLogs } =
        useCanvasGeneration({
            projectId,
            domainProjectId: linkedProjectId,
            projectLoaded,
            nodes,
            nodesRef,
            setNodes,
        });

    const cancelCanvasTask = useCallback(
        (task: import("@/services/api/task-center").GenerationTask) => {
            if (!canCancelGenerationTask(task)) {
                message.info(t("canvasToolsUi.cannotCancelSubmitted"));
                return;
            }
            modal.confirm({
                title: t("canvasToolsUi.cancelGeneration"),
                content: "任务会立即停止本地执行；如果已经提交到上游，系统会继续核对取消结果和积分状态。",
                okText: t("workbenchUi.cancelTask"),
                okButtonProps: { danger: true },
                cancelText: "继续等待",
                onOk: async () => {
                    const latestTask = taskDetail?.id === task.id ? taskDetail : task;
                    if (!canCancelGenerationTask(latestTask)) {
                        message.info(t("canvasToolsUi.cannotCancelSubmitted"));
                        return;
                    }
                    try {
                        const next = await cancelGenerationTask(task.id);
                        const node = nodesRef.current.find((item) => item.metadata?.taskId === task.id);
                        if (node) bindGenerationTask(node.id, next);
                        setTaskDetail((current) => (current?.id === task.id ? next : current));
                        await queryClient.invalidateQueries({ queryKey: ["canvas-active-tasks", projectId] });
                        message.success(t("canvasToolsUi.taskCancelled"));
                    } catch (error) {
                        message.error(error instanceof Error ? error.message : t("workbenchUi.cancelFailed"));
                    }
                },
            });
        },
        [bindGenerationTask, message, modal, nodesRef, projectId, queryClient, setTaskDetail, taskDetail, t],
    );

    useEffect(() => {
        const sessionId = searchParams.get("conversation");
        if (!projectLoaded || !sessionId) return;
        if (!chatSessions.some((session) => session.id === sessionId)) {
            message.warning(t("canvasToolsUi.sessionNotFound"));
        } else {
            activeChatIdRef.current = sessionId;
            setActiveChatId(sessionId);
            openAgent();
        }
        const next = new URLSearchParams(searchParams);
        next.delete("conversation");
        setSearchParams(next, { replace: true });
    }, [projectLoaded, chatSessions, searchParams, setSearchParams, openAgent, message]);

    useEffect(() => {
        const briefId = searchParams.get("brief");
        if (projectLoaded && currentProject?.id === projectId && currentProject.agentDraft?.scope === canvasStorageScope && (briefId || currentProject.agentDraft.prompt.trim())) {
            const draftKey = `${canvasStorageScope}:${projectId}:conversation`;
            if (briefHandoffRef.current === draftKey) return;
            briefHandoffRef.current = draftKey;
            setCinematicAgentEntry(false);
            openAgent();
            if (briefId)
                setSearchParams(
                    (current) => {
                        const next = new URLSearchParams(current);
                        next.delete("brief");
                        return next;
                    },
                    { replace: true },
                );
            return;
        }
        if (!projectLoaded || currentProject?.id !== projectId || !briefId) return;
        const handoffKey = `${canvasStorageScope}:${projectId}:${briefId}`;
        if (briefHandoffRef.current === handoffKey) return;
        if (useUserStore.getState().user?.id !== canvasStorageScope) return;
        briefHandoffRef.current = handoffKey;
        try {
            const draft = readCanvasCreationBrief(nodesRef.current, briefId, canvasStorageScope);
            if (!draft) {
                message.warning(t("canvasToolsUi.briefAlreadyRestored"));
                return;
            }
            // References are attached by the assistant; entering a project is not a node edit.
            const selection = new Set<string>();
            selectedNodeIdsRef.current = selection;
            setSelectedNodeIds(selection);
            setSelectedConnectionId(null);
            setCinematicAgentEntry(false);
            setCreationBrief({ ...draft, projectId });
            openAgent();
        } catch (error) {
            message.error(error instanceof Error ? error.message : "简报恢复失败，请重试。");
        }
    }, [canvasStorageScope, currentProject?.id, currentProject?.agentDraft, message, openAgent, projectId, projectLoaded, searchParams, setSearchParams]);

    const handleCreationBriefConsumed = useCallback(
        (draft: CanvasCreationBriefPrefill): Promise<void> => {
            const key = `${projectId}:${draft.scope}:${draft.id}`;
            if (briefConsumptionRef.current?.key === key) return briefConsumptionRef.current.pending;
            const isCurrent = () => briefProjectRef.current.projectId === projectId && briefProjectRef.current.scope === draft.scope && getActiveUserScope() === draft.scope && useUserStore.getState().user?.id === draft.scope;
            const pending = consumeCanvasCreationBrief(draft, {
                isCurrent,
                readNodes: () => nodesRef.current,
                writeNodes: (next) => {
                    nodesRef.current = next;
                    setNodes(next);
                    updateProject(projectId, { nodes: next });
                },
                persist: async () => {
                    if (!(await saveCanvasProject())) throw new Error("简报已预填，恢复状态未能保存。请重试保存后继续。");
                },
            })
                .then(() => {
                    if (!isCurrent()) return;
                    setCreationBrief(null);
                    setSearchParams(
                        (current) => {
                            const next = new URLSearchParams(current);
                            if (next.get("brief") === draft.id) next.delete("brief");
                            return next;
                        },
                        { replace: true },
                    );
                })
                .finally(() => {
                    if (briefConsumptionRef.current?.pending === pending) briefConsumptionRef.current = null;
                });
            briefConsumptionRef.current = { key, pending };
            return pending;
        },
        [projectId, saveCanvasProject, setNodes, setSearchParams, updateProject],
    );

    useEffect(() => {
        if (!projectLoaded || searchParams.get("agent") !== "1") return;
        openAgent();
        const next = new URLSearchParams(searchParams);
        next.delete("agent");
        setSearchParams(next, { replace: true });
    }, [projectLoaded, searchParams, setSearchParams, openAgent]);

    useEffect(() => {
        const tool = readCanvasToolLaunch(searchParams);
        if (!projectLoaded || currentProject?.id !== projectId || !tool) return;
        if (tool === "director") setPrevisTemplateRequest({});
        else setPendingHomeTool(tool);
        // Consume intent before any node is created: refresh/cancel must not duplicate it.
        setSearchParams(
            (current) => {
                const next = new URLSearchParams(current);
                next.delete("tool");
                return next;
            },
            { replace: true },
        );
    }, [currentProject?.id, projectId, projectLoaded, searchParams, setSearchParams]);

    // 沉浸专注进入时收起智能体与小地图、重置 Dock 唤出态；仅响应「进入」瞬间，避免关闭专注内主动唤出的面板。
    const prevFocusModeRef = useRef(focusMode);
    useEffect(() => {
        const enteredFocus = focusMode && !prevFocusModeRef.current;
        prevFocusModeRef.current = focusMode;
        if (!enteredFocus) return;
        closeAgent();
        setIsMiniMapOpen(false);
        setFocusDockRevealed(false);
    }, [closeAgent, focusMode]);

    useEffect(() => {
        if (!dialogNodeId) setNodeImageSettingsOpen(false);
    }, [dialogNodeId]);

    useLayoutEffect(() => {
        chatSessionsRef.current = chatSessions;
        activeChatIdRef.current = activeChatId;
        selectedNodeIdsRef.current = selectedNodeIds;
    }, [activeChatId, chatSessions, selectedNodeIds]);

    useLayoutEffect(() => {
        viewportRef.current = viewport;
    }, [viewport]);

    useEffect(() => {
        if (!projectLoaded) return;
        const el = containerRef.current;
        if (!el) return;

        const updateSize = () => {
            const rect = el.getBoundingClientRect();
            setSize((current) => (current.width === rect.width && current.height === rect.height ? current : { width: rect.width, height: rect.height }));
            if (!didInitialCenterRef.current) {
                didInitialCenterRef.current = true;
                const current = viewportRef.current;
                if (current.x === 0 && current.y === 0 && current.k === 1) {
                    const centered = { x: rect.width / 2, y: rect.height / 2, k: 1 };
                    viewportRef.current = centered;
                    setViewport(centered);
                }
            }
        };

        updateSize();
        const resizeObserver = new ResizeObserver(updateSize);
        resizeObserver.observe(el);
        return () => resizeObserver.disconnect();
    }, [projectLoaded]);

    const {
        fitCanvasContent,
        fitCanvasSelection,
        focusCanvasImageNode,
        focusCanvasNode,
        getCanvasCenter,
        handleCanvasDoubleClick,
        handleViewportChange,
        handleViewportPreviewChange,
        previewViewport,
        screenToCanvas,
        setZoomScale,
        zoomCanvasIn,
        zoomCanvasOut,
        zoomToActualSize,
    } = useCanvasViewportController({
        agentFocus,
        agentFollowCamera,
        containerRef,
        size,
        viewportRef,
        nodesRef,
        selectedNodeIdsRef,
        setViewport,
        setSelectedNodeIds,
        setSelectedConnectionId,
        setContextMenu,
        setDialogNodeId,
        setToolbarNodeId,
    });
    const dramaFocusRef = useRef<(nodeIds: string[]) => void>(() => {});
    const focusDramaNodes = useCallback((nodeIds: string[]) => dramaFocusRef.current(nodeIds), []);
    const dramaPrevisRef = useRef<UseCanvasDramaInput["openPrevis"]>(async () => {
        throw new Error("预演台尚未就绪，请稍后重试");
    });
    const openDramaPrevis = useCallback<UseCanvasDramaInput["openPrevis"]>((request, editor) => dramaPrevisRef.current(request, editor), []);
    const drama = useCanvasDrama({
        canvasId: projectId,
        dramaId: linkedProjectId,
        projectLoaded,
        nodes,
        nodesRef,
        connectionsRef,
        setNodes,
        setConnections,
        focusNodes: focusDramaNodes,
        openPrevis: openDramaPrevis,
        searchParams,
        setSearchParams,
    });

    useEffect(() => {
        const project = linkedProjectQuery.data?.project;
        const preset = resolveProjectCanvasStyle(project?.stylePresetId, project?.styleProfileJson);
        if (!projectLoaded || !preset) return;
        const profile = resolveStyleProfile(project?.stylePresetId, project?.styleProfileJson, preset.profile || createStyleProfileSnapshot(preset));
        if (!profile) return;
        const current = nodesRef.current.find((node) => node.type === CanvasNodeType.Text && node.metadata?.workflowKind === "styleboard");
        const nextMetadata = {
            content: profile.prompt,
            prompt: profile.prompt,
            status: NODE_STATUS_SUCCESS,
            workflowKind: "styleboard" as const,
            workflowTitle: t("entryProjectStyle"),
            workflowDescription: profile.description,
            stylePresetId: profile.presetId,
            styleProfileJson: serializeStyleProfile(profile),
            fontSize: 14,
            locked: true,
        };
        if (current) {
            if (current.metadata?.stylePresetId === profile.presetId && current.metadata?.content === profile.prompt && current.metadata?.styleProfileJson === nextMetadata.styleProfileJson && current.metadata?.locked) return;
            setNodes((nodes) => nodes.map((node) => (node.id === current.id ? { ...node, title: `项目画风 · ${profile.title}`, metadata: { ...node.metadata, ...nextMetadata } } : node)));
            return;
        }
        const node = createCanvasNode(CanvasNodeType.Text, getCanvasCenter(), nextMetadata);
        node.title = `项目画风 · ${profile.title}`;
        node.width = 420;
        node.height = 240;
        setNodes((nodes) => [...nodes, node]);
    }, [getCanvasCenter, linkedProjectQuery.data?.project, projectLoaded, setNodes]);

    const {
        assetPickerOpen,
        closeUploadModal,
        closeAssetPicker,
        createVideoNodeFromBlob,
        createAssetPayloadNode,
        createImageAssetNode,
        fileDropActive,
        handleAssetsInsert,
        handleDrop,
        handleFileDragEnter,
        handleFileDragLeave,
        handleFileDragOver,
        handleImageInputChange,
        handleProjectAssetsInsert,
        handleProjectChapterInsert,
        handleUploadFiles,
        handleUploadRequest,
        imageInputRef,
        openAssetsAtPosition,
        pasteSystemClipboard,
        replaceNodeMedia,
        createFileNode,
        startUploadStatus,
        uploadModalOpen,
        uploadTimelineMedia,
        uploadStatus,
    } = useCanvasUpload({
        canvasId: projectId,
        domainProjectId: linkedProjectId,
        nodesRef,
        selectedNodeIdsRef,
        getCanvasCenter,
        screenToCanvas,
        setNodes,
        setSelectedNodeIds,
        setSelectedConnectionId,
        setContextMenu,
        setDialogNodeId,
    });
    const replaceCanvasNodeMedia = useCallback((node: CanvasNodeData) => handleUploadRequest(node.id), [handleUploadRequest]);
    const remakeVideo = useCallback(
        (source: CanvasNodeData) => {
            try {
                const draft = buildVideoRemakeDraft(source.id, nodesRef.current, connectionsRef.current, effectiveConfig);
                setNodes(draft.nodes);
                setConnections(draft.connections);
                focusCanvasNode(draft.target.id);
            } catch (error) {
                message.error(generationErrorMessage(error));
            }
        },
        [connectionsRef, effectiveConfig, focusCanvasNode, message, nodesRef, setConnections, setNodes],
    );
    const { actions: batchReferences, pickerModal: batchReferencePickerModal } = useCanvasBatchReferences({ nodesRef, connectionsRef, setNodes, setConnections, createFileNode });
    const { rotateImageNode, rotatingNodeId } = useCanvasImageRotation({ projectId, nodesRef, setNodes, setConnections, setSelectedNodeIds, readOnly: false });
    const {
        timelineAddNodeRef,
        timelineMediaAddRef,
        assetInsertScope,
        projectAssetScope,
        projectAssetOpen,
        projectAssetInitialCategory,
        projectAssetInitialFolderId,
        projectAssetInsertPosition,
        handleLibraryAssetsInsert,
        handleTimelineProjectAssetsInsert,
        openProjectAssets,
        openCanvasAssetLibrary,
        openTimelineAssetLibrary,
        closeProjectAssets,
    } = useCanvasTimelineAssetInsert({
        linkedProjectId,
        refetchLinkedProject,
        handleAssetsInsert,
        handleProjectAssetsInsert,
        openAssetsAtPosition,
    });
    const openCharacterLibrary = useCallback((position?: Position) => {
        setCharacterLibraryPosition(position);
        setCharacterLibraryOpen(true);
        setContextMenu(null);
    }, []);
    const openPoseLibrary = useCallback((position?: Position) => {
        setPoseLibraryRequest({ position });
        setContextMenu(null);
    }, []);
    const selectedCharacterImage = nodes.find((node) => selectedNodeIds.has(node.id) && node.type === CanvasNodeType.Image && resourceIdFromStorageKey(node.metadata?.storageKey));
    const selectedCharacterAudio = nodes.find((node) => selectedNodeIds.has(node.id) && node.type === CanvasNodeType.Audio && resourceIdFromStorageKey(node.metadata?.storageKey));

    useEffect(() => {
        if (!projectLoaded || searchParams.get("mode") !== "handoff") return;
        void loadAssetsForUse(canvasAssetHandoffIds(searchParams)).catch((error) => message.error(error instanceof Error ? error.message : "转入素材读取失败"));
    }, [projectLoaded, searchParams, message]);

    useEffect(() => {
        if (!projectLoaded || !assetsHydrated || searchParams.get("mode") !== "handoff") return;
        const attempt = canvasAssetHandoffAttempt(assets, searchParams);
        const { assetIds, payloads } = attempt;
        if (!assetIds.length) return;
        const assetReadiness = assetIds
            .map((assetId) => {
                const asset = assets.find((candidate) => candidate.id === assetId);
                return `${assetId}:${asset?.kind || "missing"}`;
            })
            .join("|");
        const handoffKey = `${projectId}:${assetReadiness}`;
        if (assetHandoffRef.current === handoffKey) return;
        assetHandoffRef.current = handoffKey;

        if (attempt.kind === "retry") return;
        const pendingPayloads = uninsertedCanvasAssetHandoffPayloads(nodesRef.current, payloads);
        const persistHandoff = async (createdNodes: CanvasNodeData[]) => {
            const finalized = await finalizeCanvasAssetHandoff({
                searchParams,
                currentNodes: nodesRef.current,
                createdNodes,
                persist: async (nextNodes) => {
                    nodesRef.current = nextNodes;
                    updateProject(projectId, { nodes: nextNodes });
                    await flushCanvasStorePersistence();
                    await saveRemoteUserDataNow(projectId);
                },
            });
            setSearchParams(finalized.searchParams, { replace: true, state: location.state });
        };
        const ownerId = useUserStore.getState().user?.id;
        const insertion = Promise.all(
            pendingPayloads.map(async (payload) => {
                if (payload.kind !== "character" || !payload.assetId) return payload;
                const detail = await getCharacter(payload.assetId);
                return projectCharacterToInsertPayload({ ...detail.asset, character: detail.character });
            }),
        ).then((resolved) => {
            if (!ownerId || useUserStore.getState().user?.id !== ownerId) throw new Error("账号已切换，请重新转入素材");
            return resolved.length ? handleProjectAssetsInsert(resolved) : ([] as CanvasNodeData[]);
        });
        void insertion.then(persistHandoff).catch((error) => {
            assetHandoffRef.current = "";
            message.error(error instanceof Error ? error.message : "转入素材失败");
        });
    }, [assets, assetsHydrated, handleProjectAssetsInsert, location.state, message, nodesRef, projectId, projectLoaded, searchParams, setSearchParams, updateProject]);

    const {
        activeLayerGroupIds,
        angleNodeId,
        lightingNodeId,
        emotionNodeId,
        annotationNodeId,
        annotationEditNodeId,
        createImageReversePromptNodes,
        openPortraitTextureEditor,
        cropImageNode,
        cropNodeId,
        closeFrameDialog,
        closeSegmentDialog,
        extractAudioFromVideo,
        extractVideoFrames,
        extractingVideoFramesNodeId,
        frameDialogNodeId,
        generateNineGridNode,
        generateAngleNode,
        generateLightingNode,
        openPanoramaConfig,
        createPanoramaViewerWithConfig,
        addPanoramaCaptureNode,
        panoramaConfigNodeId,
        setPanoramaConfigNodeId,
        generateEmotionNode,
        handleSegmentConfirm,
        regionEditImageNode,
        regionEditNodeId,
        imageEditNodeId,
        imageEditPreset,
        layerDecompositionNodeId,
        textEditNodeId,
        mergeSelectedVideos,
        mergeVideosByIds,
        mergeVideoProgress,
        saveAnnotatedImageNode,
        segmentDialogMode,
        segmentDialogNodeId,
        segmentRunningMode,
        setFrameDialogNodeId,
        setSegmentDialogNodeId,
        setAngleNodeId,
        setLightingNodeId,
        setEmotionNodeId,
        setAnnotationNodeId,
        setAnnotationEditNodeId,
        setCropNodeId,
        setRegionEditNodeId,
        setImageEditNodeId,
        setImageEditPreset,
        openBackgroundRemoval,
        openLayerDecomposition,
        decomposeImageLayers,
        setLayerDecompositionNodeId,
        setTextEditNodeId,
        openTextEditNode,
        openAnnotationEditNode,
        detectImageText,
        editTextImageNode,
        editAnnotatedImageNode,
        editImageNode,
        setUpscaleNodeId,
        splitImageNode,
        openVideoFrameExtractor,
        openVideoSegmentExtractor,
        upscaleImageNode,
        upscaleNodeId,
        videoProcessingDialog,
        setVideoProcessingDialog,
        openVideoProcessing,
        processVideoNode,
    } = useCanvasMediaTools({
        applyGenerationTaskResult,
        projectId,
        domainProjectId: linkedProjectId,
        nodesRef,
        connectionsRef,
        selectedNodeIdsRef,
        setNodes,
        setConnections,
        setSelectedNodeIds,
        setSelectedConnectionId,
        setDialogNodeId,
        setContextMenu,
        setHoveredNodeId,
        setToolbarNodeId,
        setRunningNodeId,
        startUploadStatus,
        startGenerationRequest,
        finishGenerationRequest,
        bindGenerationTask,
    });
    useCanvasImageLayerGroups({ projectId, enabled: projectLoaded, nodes, nodesRef, setNodes, runningNodeId, activeLayerGroupIds });
    const extractLayerMaterials = useCanvasImageLayerMaterials({ projectId, domainProjectId: currentProject?.projectId, enabled: projectLoaded, nodes, nodesRef, setNodes, setConnections });

    const handleNodesDeleted = useCallback(
        (removedIds: Set<string>, nextNodes: CanvasNodeData[], removedNodes: CanvasNodeData[]) => {
            const clearDeletedId = (current: string | null) => (current && removedIds.has(current) ? null : current);
            setHoveredNodeId(clearDeletedId);
            setToolbarNodeId(clearDeletedId);
            setDialogNodeId(clearDeletedId);
            setTextEditorNodeId(clearDeletedId);
            setCharacterReferenceNodeId(clearDeletedId);
            setDrawingNodeId(clearDeletedId);
            setInfoNodeId(clearDeletedId);
            setFrameDialogNodeId(clearDeletedId);
            setSegmentDialogNodeId(clearDeletedId);
            setVideoProcessingDialog((current) => (current && removedIds.has(current.nodeId) ? null : current));
            setCropNodeId(clearDeletedId);
            setRegionEditNodeId(clearDeletedId);
            setAnnotationNodeId(clearDeletedId);
            setUpscaleNodeId(clearDeletedId);
            setAngleNodeId(clearDeletedId);
            setLightingNodeId(clearDeletedId);
            setEmotionNodeId(clearDeletedId);
            setSuperResolveNodeId(clearDeletedId);
            setPreviewNodeId(clearDeletedId);
            setRunningNodeId(clearDeletedId);
            setScriptEditorNodeId(clearDeletedId);
            setArtCritiqueNodeId(clearDeletedId);
            setPrevisNodeId(clearDeletedId);
            setVersionCompareRootId(clearDeletedId);
            setScriptScrollTopById((current) => Object.fromEntries(Object.entries(current).filter(([id]) => !removedIds.has(id))));
            setContextMenu((current) => (current?.type === "node" && removedIds.has(current.nodeId) ? null : current));
            const removedDrawingIds = removedNodes.flatMap((node) => (node.type === CanvasNodeType.Drawing && node.metadata?.drawingId ? [node.metadata.drawingId] : []));
            if (removedDrawingIds.length) {
                void Promise.all(removedDrawingIds.map((drawingId) => removeCanvasDrawing(projectId, drawingId))).catch(() => message.warning(t("canvasToolsUi.drawingCacheCleanupFailed")));
            }
            cleanupCanvasFiles({ projectId, nodes: nextNodes, chatSessions });
        },
        [
            chatSessions,
            cleanupCanvasFiles,
            message,
            projectId,
            setAngleNodeId,
            setAnnotationNodeId,
            setArtCritiqueNodeId,
            setCropNodeId,
            setEmotionNodeId,
            setFrameDialogNodeId,
            setLightingNodeId,
            setRegionEditNodeId,
            setSegmentDialogNodeId,
            setVideoProcessingDialog,
            setUpscaleNodeId,
            setRunningNodeId,
            t,
        ],
    );

    const {
        alignSelectedNodes,
        autoArrangeCanvasNodes,
        arrangeSelectedNodes,
        spreadSelectedNodes,
        copyNodesToClipboard,
        copySelectedNodes,
        createFolder,
        createFrameAroundSelection,
        createNode,
        createReferenceGroup,
        createStoryboardGroup,
        deleteConnection,
        deleteNodes,
        duplicateNode,
        hasCopiedNodes,
        pasteCopiedNodes,
        restoreCopiedNodesFromText,
        releaseCopiedNodesPastePriority,
        setPrimaryVersion,
        adoptNodeMediaVersion,
        deleteNodeMediaVersion,
        extractNodeMediaVersion,
        shouldPreferCopiedNodes,
        toggleNodeLocked,
    } = useCanvasNodeOperations({
        projectId,
        defaultDrawingEngine,
        nodesRef,
        connectionsRef,
        selectedNodeIdsRef,
        getCanvasCenter,
        setNodes,
        setConnections,
        setSelectedNodeIds,
        setSelectedConnectionId,
        setContextMenu,
        setDialogNodeId,
        onNodesDeleted: handleNodesDeleted,
    });

    const handleBindCaseReferences = useCallback(
        (targetNodeId: string, prompt: string) => {
            const readBinding = () => {
                const currentNodes = nodesRef.current;
                const target = currentNodes.find((node) => node.id === targetNodeId);
                if (!target?.metadata?.ltvReferencePlan) throw new Error("案例节点已变化，请重新打开节点。");
                const references = buildCanvasNodeMentionReferenceMap(currentNodes, connectionsRef.current, [target]).get(targetNodeId) || [];
                const normalizedPrompt = normalizeCanvasNodeMentionTokens(prompt, references);
                return {
                    references,
                    plan: bindLtvCurrentReferences(
                        normalizedPrompt,
                        references.map((ref) => ref.nodeId),
                        currentNodes,
                        target.metadata.ltvReferencePlan,
                    ),
                };
            };
            try {
                const candidate = readBinding();
                modal.confirm({
                    title: t("canvasToolsUi.updateCaseBindings"),
                    content: (
                        <div className="space-y-3">
                            <p>{t("canvasToolsUi.referenceOrderHelp")}</p>
                            <div className="max-h-64 overflow-y-auto">
                                {candidate.references.length
                                    ? candidate.references.map((ref) => (
                                          <div key={ref.nodeId}>
                                              {ref.label} · {ref.title}
                                          </div>
                                      ))
                                    : t("canvasToolsUi.noReferences")}
                            </div>
                        </div>
                    ),
                    okText: "确认绑定",
                    cancelText: t("timelineCancel"),
                    onOk: () => {
                        try {
                            const latest = readBinding();
                            if (JSON.stringify(latest.plan) !== JSON.stringify(candidate.plan)) throw new Error("参考内容在确认期间发生变化，请重新打开绑定窗口。");
                            const nextNodes = nodesRef.current.map((node) => {
                                if (node.id !== targetNodeId) return node;
                                const updated = writeCanvasNodePrompt(node, latest.plan.prompt);
                                return { ...updated, metadata: { ...updated.metadata, ltvReferencePlan: latest.plan } };
                            });
                            nodesRef.current = nextNodes;
                            setNodes(nextNodes);
                            message.success(t("canvasToolsUi.bindingsUpdated"));
                        } catch (error) {
                            message.error(error instanceof Error ? error.message : "参考绑定失败");
                            return Promise.reject(error);
                        }
                    },
                });
            } catch (error) {
                message.error(error instanceof Error ? error.message : "参考绑定失败");
            }
        },
        [connectionsRef, message, modal, nodesRef, setNodes, t],
    );

    const handleReplaceNodeReference = useCallback(
        (targetNodeId: string, oldReference: { id: string; nodeId?: string; label?: string; title?: string }, sourceNodeId: string) => {
            const sourceNode = nodesRef.current.find((n) => n.id === sourceNodeId);
            if (!sourceNode || sourceNode.id === oldReference.nodeId) return;

            const previousNodes = nodesRef.current;
            const previousConnections = connectionsRef.current;

            const configNodeId = previousConnections.find((c) => c.fromNodeId === targetNodeId && previousNodes.find((n) => n.id === c.toNodeId)?.type === CanvasNodeType.Config)?.toNodeId;
            const receiverId = configNodeId || targetNodeId;

            let rewired = false;
            const nextConnections = previousConnections.map((c) => {
                if (!rewired && c.fromNodeId === oldReference.nodeId && (c.toNodeId === targetNodeId || c.toNodeId === configNodeId)) {
                    rewired = true;
                    return { ...c, fromNodeId: sourceNodeId };
                }
                return c;
            });

            if (!rewired) {
                nextConnections.push({
                    id: nanoid(),
                    fromNodeId: sourceNodeId,
                    toNodeId: receiverId,
                });
            }

            const nextReferencesMap = buildCanvasNodeMentionReferenceMap(previousNodes, nextConnections, previousNodes);
            const targetNextReferences = nextReferencesMap.get(targetNodeId) || [];
            const newRef = targetNextReferences.find((r) => r.nodeId === sourceNodeId);

            const targetNode = previousNodes.find((n) => n.id === targetNodeId);
            let nextNodes = previousNodes;
            if (targetNode && newRef) {
                const currentPrompt = targetNode.metadata?.composerContent ?? targetNode.metadata?.prompt ?? "";
                const replacementToken = `@${newRef.label}`;
                const updatedPrompt = replaceCanvasReferenceMentions(currentPrompt, oldReference, replacementToken, sourceNode.title ? sourceNode.title : newRef.label);

                nextNodes = previousNodes.map((n) => (n.id === targetNodeId ? writeCanvasNodePrompt(n, updatedPrompt) : n));
            }

            nodesRef.current = nextNodes;
            connectionsRef.current = nextConnections;
            setNodes(nextNodes);
            setConnections(nextConnections);
            message.success(t("followupUi.referenceReplaced", { before: oldReference.label || t("modelUi.referencePicture"), after: sourceNode.title || t("contextImage") }));
        },
        [connectionsRef, message, nodesRef, setConnections, setNodes, t],
    );

    const handleReplaceNodeReferenceFiles = useCallback(
        async (targetNodeId: string, oldReference: { id: string; nodeId?: string; label?: string; title?: string }, files: File[]) => {
            const file = files.find((f) => f.type.startsWith("image/"));
            if (!file || !oldReference.nodeId) return;
            const target = nodesRef.current.find((node) => node.id === targetNodeId);
            if (target?.metadata?.videoRemake) {
                const area = findAvailableGenerationGroupPosition(nodesRef.current, { x: target.position.x - IMAGE_NODE_MAX_SIZE.width - 96, y: target.position.y }, IMAGE_NODE_MAX_SIZE);
                const newImageId = await createFileNode(file, { x: area.x + IMAGE_NODE_MAX_SIZE.width / 2, y: area.y + IMAGE_NODE_MAX_SIZE.height / 2 }, undefined, { preserveSelection: true });
                if (!newImageId) return;
                if (!connectionsRef.current.some((edge) => edge.toNodeId === targetNodeId && edge.fromNodeId === oldReference.nodeId)) {
                    message.warning("新图片已加入画布。原引用已变化，请重新连接");
                    return;
                }
                handleReplaceNodeReference(targetNodeId, oldReference, newImageId);
                return;
            }
            if (await replaceNodeMedia(oldReference.nodeId, file)) message.success("参考图片已替换");
        },
        [connectionsRef, createFileNode, handleReplaceNodeReference, message, nodesRef, replaceNodeMedia, t],
    );

    const {
        cancelPendingConnectionCreate,
        closeConnectionCreateMenu,
        connectionTargetNodeId,
        connectionApproach,
        connectionReplaceHover,
        connectingParams,
        createConnectedNode,
        getConnectionCreateDisabledReason,
        handleConnectStart,
        handleConnectDrop,
        handleBatchConnectionTargetClick,
        batchConnectionPreview,
        beginBatchConnectionMode,
        startBatchConnection,
        mouseWorld,
        pendingConnectionCreate,
    } = useCanvasConnectionController({
        batchScrollById,
        onBatchCellConnect: batchReferences.connectCell,
        projectId,
        config: effectiveConfig,
        defaultDrawingEngine,
        nodesRef,
        connectionsRef,
        viewportRef,
        scriptScrollTopById,
        screenToCanvas,
        setNodes,
        setConnections,
        setSelectedNodeIds,
        setSelectedConnectionId,
        setContextMenu,
        setDialogNodeId,
        setDrawingNodeId,
        onReplaceReference: handleReplaceNodeReference,
    });

    // 选中背板等同于选中其内部素材：单独点中背板也能直接拖出连线。
    const batchSourceNodeIds = useMemo(() => expandBatchSourceNodeIds(selectedNodeIds, nodes), [nodes, selectedNodeIds]);
    const batchSourceNodeIdsRef = useRef(batchSourceNodeIds);
    batchSourceNodeIdsRef.current = batchSourceNodeIds;

    const handleCanvasSelectionStart = useCallback(() => {
        setContextMenu(null);
    }, []);

    const handleNodeInteractionStart = useCallback((selectionModifier: boolean) => {
        setContextMenu(null);
        setHoveredNodeId(null);
        setToolbarNodeId(null);
        if (selectionModifier) setDialogNodeId(null);
    }, []);

    const handleSelectedNodeClick = useCallback(
        (node: CanvasNodeData) => {
            // Selection is transient, but the LibTV-style paint order survives
            // deselection so a clicked lower node stays above its neighbours.
            if (node.type !== CanvasNodeType.Frame) bringNodeToFront(node.id);
            if (node.type === CanvasNodeType.Drawing) {
                setDialogNodeId(null);
                setDrawingNodeId(node.id);
            } else if (node.type === CanvasNodeType.Script) {
                setDialogNodeId(null);
            } else if (node.type === CanvasNodeType.Text && node.metadata?.workflowKind === "character" && (node.metadata.characterAssetId || node.metadata.officialAssetId)) {
                setDialogNodeId(null);
                setCharacterReferenceNodeId(node.id);
            } else if (node.type === CanvasNodeType.Text) {
                setDialogNodeId(node.id);
            } else if (node.type === CanvasNodeType.Frame) {
                setDialogNodeId((current) => (current === node.id ? current : null));
            } else if (node.type === ART_CRITIQUE_NODE_TYPE) {
                setDialogNodeId(null);
                setArtCritiqueNodeId(node.id);
            } else if (node.type === CanvasNodeType.Panorama) {
                // 全景节点是纯查看器，没有可编辑提示词，不弹提示词面板。
                setDialogNodeId(null);
            } else {
                // 选择参考媒体时保留当前工作流配置面板，避免点击图片后配置“返回/消失”。
                // 没有工作流配置面板时，媒体节点仍按原逻辑打开自己的面板。
                setDialogNodeId((current) => {
                    const currentNode = current ? nodesRef.current.find((item) => item.id === current) : undefined;
                    return currentNode?.type === CanvasNodeType.Config ? current : node.id;
                });
            }
        },
        [bringNodeToFront, nodesRef],
    );

    const handleNodeBringToFront = useCallback(
        (nodeId: string) => {
            const node = nodesRef.current.find((item) => item.id === nodeId);
            if (node && node.type !== CanvasNodeType.Frame) bringNodeToFront(nodeId);
        },
        [bringNodeToFront, nodesRef],
    );

    const handleNodeDragEnd = useCallback(
        (nodeId: string) => {
            const node = nodesRef.current.find((item) => item.id === nodeId);
            if (
                !node ||
                node.type === CanvasNodeType.Frame ||
                node.type === CanvasNodeType.Script ||
                node.type === CanvasNodeType.Drawing ||
                node.type === CanvasNodeType.Panorama ||
                node.type === ART_CRITIQUE_NODE_TYPE ||
                (node.metadata?.workflowKind === "character" && (node.metadata.characterAssetId || node.metadata.officialAssetId))
            ) {
                setDialogNodeId(null);
                return;
            }
            // A drag selects a new node even though it is not a click. Keep the
            // generation editor bound to the node most recently moved so a stale
            // panel from the previous node cannot reappear after mouse-up.
            setDialogNodeId(node.id);
        },
        [nodesRef],
    );

    const handleCanvasDeselect = useCallback(() => {
        setContextMenu(null);
        setHoveredNodeId(null);
        setToolbarNodeId(null);
        setDialogNodeId(null);
    }, []);

    const { cancelSelectionBox, deselectCanvas, dragPreview, frameDropTargetId, handleCanvasMouseDown, handleNodeMouseDown, isNodeDragging, nodeDraggingRef, selectionBoundsElementRef, selectionBox } = useCanvasSelectionController({
        containerRef,
        nodesRef,
        viewportRef,
        selectedNodeIdsRef,
        historyPausedRef,
        screenToCanvas,
        setNodes,
        setSelectedNodeIds,
        setSelectedConnectionId,
        cancelPendingConnectionCreate,
        onCanvasSelectionStart: handleCanvasSelectionStart,
        onNodeInteractionStart: handleNodeInteractionStart,
        onNodeBringToFront: handleNodeBringToFront,
        onNodeClick: handleSelectedNodeClick,
        onNodeDragEnd: handleNodeDragEnd,
        onBatchConnectionTarget: handleBatchConnectionTargetClick,
        onLinkedFolderDrop: archiveNodesToLinkedFolder,
        onDeselect: handleCanvasDeselect,
    });

    const keepNodeToolbar = useCallback(
        (nodeId: string) => {
            if (nodeDraggingRef.current || nodeImageSettingsOpen) return;
            if (toolbarHideTimerRef.current) {
                clearTimeout(toolbarHideTimerRef.current);
                toolbarHideTimerRef.current = null;
            }
            setToolbarNodeId(nodeId);
        },
        [nodeImageSettingsOpen],
    );

    const hideNodeToolbar = useCallback(() => {
        if (toolbarHideTimerRef.current) clearTimeout(toolbarHideTimerRef.current);
        toolbarHideTimerRef.current = setTimeout(() => {
            setToolbarNodeId(null);
            toolbarHideTimerRef.current = null;
        }, 120);
    }, []);

    const {
        collapsingBatchIds,
        downloadNodeImage,
        downloadNodesMedia,
        handleConfigNodeChange,
        handleFolderStyleChange,
        handleFolderThemeChange,
        handleFontSizeChange,
        handleNodeContentChange,
        handleNodePromptChange,
        handleNodeResize,
        handleNodeTitleChange,
        openingBatchIds,
        saveNodeAsset,
        setBatchPrimary,
        toggleBatchExpanded,
        toggleFrameCollapsed,
        toggleNodeFreeResize,
    } = useCanvasNodeEditor({
        config: effectiveConfig,
        canvasId: projectId,
        canvasTitle: currentProject?.title || t("canvasHistoryUntitled"),
        domainProjectId: linkedProjectId,
        nodesRef,
        setNodes,
        setSelectedNodeIds,
        setSelectedConnectionId,
        setDialogNodeId,
        setToolbarNodeId,
        setHoveredNodeId,
    });

    const handleRemoveNodeReference = useCallback(
        (targetNodeId: string, reference: CanvasResourceReference) => {
            const referenceNodeId = reference.nodeId;
            if (!referenceNodeId) return;
            // 生成节点可能通过配置节点接收参考，只移除参考来源边，保留目标到配置节点的主链。
            const previousNodes = nodesRef.current;
            const previousConnections = connectionsRef.current;
            const configNodeId = previousConnections.find((connection) => {
                if (connection.fromNodeId !== targetNodeId) return false;
                return previousNodes.find((node) => node.id === connection.toNodeId)?.type === CanvasNodeType.Config;
            })?.toNodeId;
            const removedConnectionIds = new Set(previousConnections.filter((connection) => connection.fromNodeId === referenceNodeId && (connection.toNodeId === targetNodeId || connection.toNodeId === configNodeId)).map((connection) => connection.id));
            if (!removedConnectionIds.size) return;
            const nextConnections = previousConnections.filter((connection) => !removedConnectionIds.has(connection.id));
            const nextNodes = applyCanvasConnectionPromptSync(previousNodes, previousConnections, previousNodes, nextConnections);
            if (nextNodes !== previousNodes) {
                nodesRef.current = nextNodes;
                setNodes(nextNodes);
            }
            connectionsRef.current = nextConnections;
            setConnections(nextConnections);
            setSelectedConnectionId((current) => (current && removedConnectionIds.has(current) ? null : current));
        },
        [connectionsRef, nodesRef, setConnections, setNodes, setSelectedConnectionId],
    );

    const handleReorderNodeReferences = useCallback(
        (targetNodeId: string, orderedNodeIds: string[]) => {
            const previousNodes = nodesRef.current;
            const previousConnections = connectionsRef.current;
            const nextConnections = reorderCanvasResourceConnections(targetNodeId, orderedNodeIds, previousNodes, previousConnections);
            if (nextConnections === previousConnections) return;
            const nextNodes = applyCanvasConnectionPromptSync(previousNodes, previousConnections, previousNodes, nextConnections);
            if (nextNodes !== previousNodes) {
                nodesRef.current = nextNodes;
                setNodes(nextNodes);
            }
            connectionsRef.current = nextConnections;
            setConnections(nextConnections);
        },
        [connectionsRef, nodesRef, setConnections, setNodes],
    );

    const handleProjectFolderInsert = useCallback(
        (folderId: string) => {
            const folder = linkedProjectQuery.data?.assetFolders.find((item) => item.id === folderId);
            if (!folder || !linkedProjectId) throw new Error("素材文件夹已不存在，请刷新后重试");
            const style: CanvasFolderStyle = folder.style === "stacked" || folder.style === "midnight" || folder.style === "paper" || folder.style === "cinema" || folder.style === "compact" ? folder.style : "glass";
            const theme: CanvasFolderTheme = folder.theme === "obsidian" || folder.theme === "ember" || folder.theme === "pearl" ? folder.theme : "aurora";
            createFolder(projectAssetInsertPosition, { id: folder.id, projectId: linkedProjectId, title: folder.name, style, theme, createdAt: folder.createdAt });
        },
        [createFolder, linkedProjectId, linkedProjectQuery.data?.assetFolders, projectAssetInsertPosition],
    );

    const handleFrameToggle = useCallback(
        (nodeId: string) => {
            const node = nodesRef.current.find((item) => item.id === nodeId);
            const linkedFolderId = node?.metadata?.folder?.assetFolderId;
            if (linkedFolderId) {
                openProjectAssets("all", node ? { x: node.position.x + node.width + 40, y: node.position.y } : undefined, "canvas", linkedFolderId);
                return;
            }
            toggleFrameCollapsed(nodeId);
        },
        [nodesRef, openProjectAssets, toggleFrameCollapsed],
    );

    const linkedFolderPreviewNodesById = useMemo(() => {
        const result = new Map<string, CanvasNodeData[]>();
        const localById = new Map(assets.map((asset) => [asset.id, asset]));
        for (const asset of linkedProjectQuery.data?.assets || []) {
            if (!asset.folderId) continue;
            const local = localById.get(asset.id);
            const characterCover = asset.character?.representations.find((item) => item.role === "turnaround_sheet") || asset.character?.representations.find((item) => item.role === "primary") || asset.character?.representations[0];
            const type = asset.category === "character" || asset.mediaType === "image" ? CanvasNodeType.Image : asset.mediaType === "video" ? CanvasNodeType.Video : asset.mediaType === "audio" ? CanvasNodeType.Audio : CanvasNodeType.Text;
            const remoteResourceId = resourceIdFromStorageKey(asset.storageKey);
            const storageKey = characterCover ? `resource:${characterCover.resourceId}` : local?.kind === "image" || local?.kind === "video" || local?.kind === "audio" ? local.data.storageKey : remoteResourceId ? asset.storageKey : undefined;
            const content = characterCover
                ? resourceFileUrl(characterCover.resourceId)
                : local?.kind === "image"
                  ? local.data.dataUrl || local.coverUrl
                  : local?.kind === "video" || local?.kind === "audio"
                    ? local.data.url
                    : local?.kind === "text"
                      ? local.data.content
                      : remoteResourceId
                        ? resourceFileUrl(remoteResourceId)
                        : asset.previewText || "";
            const preview: CanvasNodeData = { id: asset.id, type, title: asset.title, position: { x: 0, y: 0 }, width: 240, height: 160, metadata: { assetId: asset.id, content, storageKey } };
            const current = result.get(asset.folderId) || [];
            current.push(preview);
            result.set(asset.folderId, current);
        }
        return result;
    }, [assets, linkedProjectQuery.data?.assets]);

    useEffect(() => {
        const folders = linkedProjectQuery.data?.assetFolders;
        if (!folders?.length) return;
        const byId = new Map(folders.map((folder) => [folder.id, folder]));
        setNodes((current) => {
            let changed = false;
            const next = current.map((node) => {
                const folderId = node.metadata?.folder?.assetFolderId;
                const folder = folderId ? byId.get(folderId) : undefined;
                if (!folder) return node;
                const style: CanvasFolderStyle = folder.style === "stacked" || folder.style === "midnight" || folder.style === "paper" || folder.style === "cinema" || folder.style === "compact" ? folder.style : "glass";
                const theme: CanvasFolderTheme = folder.theme === "obsidian" || folder.theme === "ember" || folder.theme === "pearl" ? folder.theme : "aurora";
                if (node.title === folder.name && node.metadata?.folder?.style === style && node.metadata?.folder?.theme === theme) return node;
                changed = true;
                return { ...node, title: folder.name, metadata: { ...node.metadata, folder: { ...node.metadata!.folder!, style, theme, themeCover: undefined } } };
            });
            return changed ? next : current;
        });
    }, [linkedProjectQuery.data?.assetFolders, setNodes]);

    const {
        activePrevisScene,
        activeNodeId,
        activeScriptNode,
        activeStylePresetId,
        angleNode,
        lightingNode,
        emotionNode,
        annotationNode,
        batchChildCountById,
        batchMotionById,
        configInputsById,
        connectionLayerBounds,
        contextMenuNode,
        cropNode,
        displayConnections,
        queryGesturePreview,
        frameChildrenById,
        infoNode,
        regionEditNode,
        imageEditNode,
        mentionReferencesByNodeId,
        nodeById,
        nodeRenderLODById,
        previewNode,
        reduceMediaEffects,
        relatedHighlight,
        resourceReferenceByNodeId,
        selectedNodeBounds,
        selectedVideoNodes,
        skillMentionReferences,
        superResolveNode,
        toolbarNode,
        upscaleNode,
        versionCompareNodes,
        candidateNodes,
        immediateRenderNodeIds,
        renderViewBounds,
    } = useCanvasRenderModel({
        nodes,
        connections,
        assets,
        viewport,
        viewportSize: size,
        mediaPerformanceMode,
        selectedNodeIds,
        hoveredNodeId,
        dragPreview,
        collapsingBatchIds,
        addedSkills,
        previsScenes: currentProject?.previsScenes,
        infoNodeId,
        cropNodeId,
        regionEditNodeId,
        imageEditNodeId,
        annotationNodeId,
        splitNodeId: null,
        upscaleNodeId,
        superResolveNodeId,
        angleNodeId,
        lightingNodeId,
        emotionNodeId,
        previewNodeId,
        contextMenu,
        versionCompareRootId,
        previsNodeId,
        scriptEditorNodeId,
        dialogNodeId,
    });
    // 单独选中背板时没有多选包围框，用背板自身的范围承载批量连线手柄。
    const singleSelectedFrame = selectedNodeIds.size === 1 ? nodeById.get([...selectedNodeIds][0]) : undefined;
    const batchConnectionBounds = useMemo(() => {
        if (selectedNodeBounds) return selectedNodeBounds;
        if (!isFrameNode(singleSelectedFrame) || !batchSourceNodeIds.length) return null;
        return { left: singleSelectedFrame.position.x, top: singleSelectedFrame.position.y, width: singleSelectedFrame.width, height: singleSelectedFrame.height, count: 1 };
    }, [batchSourceNodeIds.length, selectedNodeBounds, singleSelectedFrame]);

    const filterSceneConnections = useCallback(
        (entries: typeof displayConnections) =>
            filterBatchCellConnections(
                filterCanvasDisplayConnections(entries, {
                    enabled: hideNodeConnections,
                    hoveredNodeId,
                    selectedNodeIds,
                    activeNodeId,
                    selectedConnectionId,
                }),
                batchScrollById,
                selectedConnectionId,
            ),
        [activeNodeId, batchScrollById, hideNodeConnections, hoveredNodeId, selectedConnectionId, selectedNodeIds],
    );
    useEffect(() => {
        setNodes((current) => {
            let changed = false;
            const next = current.map((node) => {
                const references = mentionReferencesByNodeId.get(node.id);
                const savedPrompt = node.metadata?.composerContent ?? node.metadata?.prompt;
                if (!references?.length || !savedPrompt?.includes("@[node:")) return node;
                const normalizedPrompt = normalizeCanvasNodeMentionTokens(savedPrompt, references);
                if (normalizedPrompt === savedPrompt) return node;
                changed = true;
                return {
                    ...node,
                    metadata: node.metadata?.composerContent !== undefined ? { ...node.metadata, composerContent: normalizedPrompt } : { ...node.metadata, prompt: normalizedPrompt },
                };
            });
            return changed ? next : current;
        });
    }, [mentionReferencesByNodeId, setNodes]);
    const dialogNode = dialogNodeId ? nodeById.get(dialogNodeId) || null : null;
    // dragPreview is published on the same pointer-down frame as isNodeDragging.
    // Treat either signal as moving so floating editors disappear before the
    // first preview transform is painted and never affect drag layout.
    const isCanvasNodeMoving = isNodeDragging || Boolean(dragPreview?.nodeIds.size);
    const subtitleNode = subtitleNodeId ? nodeById.get(subtitleNodeId) || null : null;
    const timelineNode = timelineNodeId ? nodeById.get(timelineNodeId) || null : null;
    const deferDragOverlays = useDeferredValue(isCanvasNodeMoving);
    const dramaAdoptNode = drama.adoptNodeId ? nodeById.get(drama.adoptNodeId) || null : null;
    const comparedImages = comparedImageIds?.map((id) => nodeById.get(id)).filter((node): node is CanvasNodeData => Boolean(node)) || [];
    const selectionImages = nodes.filter((node) => selectedNodeIds.has(node.id) && node.type === CanvasNodeType.Image && Boolean(node.metadata?.content || node.metadata?.storageKey));
    const mediaVersionNode = mediaVersionNodeId ? nodeById.get(mediaVersionNodeId) || null : null;

    const frameNode = frameDialogNodeId ? nodeById.get(frameDialogNodeId) || null : null;
    const segmentNode = segmentDialogNodeId ? nodeById.get(segmentDialogNodeId) || null : null;

    const videoProcessingNode = videoProcessingDialog ? nodeById.get(videoProcessingDialog.nodeId) || null : null;
    const videoProcessingModels = useMemo(() => ({ enhance: listVideoProcessingModels(effectiveConfig, "enhance"), depth: listVideoProcessingModels(effectiveConfig, "depth") }), [effectiveConfig]);
    const textEditorNode = textEditorNodeId ? nodeById.get(textEditorNodeId) || null : null;
    const characterReferenceNode = characterReferenceNodeId ? nodeById.get(characterReferenceNodeId) || null : null;
    const drawingNode = drawingNodeId ? nodeById.get(drawingNodeId) || null : null;
    const artCritiqueNode = artCritiqueNodeId ? nodeById.get(artCritiqueNodeId) || null : null;
    const artCritiqueInputs = artCritiqueNode
        ? connections
              .filter((connection) => connection.toNodeId === artCritiqueNode.id)
              .sort((left, right) => left.id.localeCompare(right.id))
              .map((connection) => nodeById.get(connection.fromNodeId))
              .filter((node): node is CanvasNodeData => Boolean(node))
        : [];
    const pendingConnectionSourceNode = pendingConnectionCreate?.connection.handleType === "source" ? nodeById.get(pendingConnectionCreate.connection.nodeId) : null;
    const canCreateDrawingFromConnection = !pendingConnectionCreate?.batchSourceNodeIds?.length && pendingConnectionSourceNode?.type === CanvasNodeType.Image && Boolean(pendingConnectionSourceNode.metadata?.content);

    const openTextNodeEditor = useCallback((node: CanvasNodeData) => {
        if (node.type !== CanvasNodeType.Text) return;
        setSelectedNodeIds(new Set([node.id]));
        setSelectedConnectionId(null);
        setContextMenu(null);
        setDialogNodeId(null);
        setToolbarNodeId(null);
        if (node.metadata?.workflowKind === "character" && (node.metadata.characterAssetId || node.metadata.officialAssetId)) {
            setCharacterReferenceNodeId(node.id);
            return;
        }
        setTextEditorNodeId(node.id);
    }, []);

    const openDrawingNode = useCallback((node: CanvasNodeData) => {
        if (node.type !== CanvasNodeType.Drawing) return;
        setSelectedNodeIds(new Set([node.id]));
        setSelectedConnectionId(null);
        setContextMenu(null);
        setDialogNodeId(null);
        setToolbarNodeId(null);
        setDrawingNodeId(node.id);
    }, []);

    const openArtCritique = useCallback((node: CanvasNodeData) => {
        if (node.type !== ART_CRITIQUE_NODE_TYPE) return;
        setSelectedNodeIds(new Set([node.id]));
        setSelectedConnectionId(null);
        setContextMenu(null);
        setDialogNodeId(null);
        setToolbarNodeId(null);
        setArtCritiqueNodeId(node.id);
    }, []);
    const duplicateNodeFromContent = useCallback((node: CanvasNodeData) => duplicateNode(node.id), [duplicateNode]);
    const deleteNodeFromContent = useCallback((node: CanvasNodeData) => deleteNodes(new Set([node.id])), [deleteNodes]);
    const updateNodeFromContent = useCallback(
        (nodeId: string, update: (node: CanvasNodeData) => CanvasNodeData) => {
            setContentNodes((current) => updateCanvasNode(current, nodeId, update));
        },
        [setContentNodes],
    );
    const pendingMediaUpdatesRef = useRef(new Map<string, (node: CanvasNodeData) => CanvasNodeData>());
    const mediaUpdateTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const updateMediaNodeFromContent = useCallback(
        (nodeId: string, update: (node: CanvasNodeData) => CanvasNodeData) => {
            const previous = pendingMediaUpdatesRef.current.get(nodeId);
            pendingMediaUpdatesRef.current.set(nodeId, previous ? (node) => update(previous(node)) : update);
            if (mediaUpdateTimerRef.current) return;
            mediaUpdateTimerRef.current = setTimeout(() => {
                const updates = pendingMediaUpdatesRef.current;
                pendingMediaUpdatesRef.current = new Map();
                mediaUpdateTimerRef.current = null;
                if (!updates.size) return;
                setContentNodes((current) => updateCanvasNodes(current, updates));
            }, 120);
        },
        [setContentNodes],
    );
    const updateNodeMetadataFromContent = useCallback(
        (nodeId: string, patch: CanvasNodeMetadata) => {
            updateNodeFromContent(nodeId, (node) => ({ ...node, metadata: { ...node.metadata, ...patch } }));
        },
        [updateNodeFromContent],
    );
    const canvasNodeActions = useMemo<CanvasNodeActionContextValue>(
        () => ({
            upload: replaceCanvasNodeMedia,
            download: downloadNodeImage,
            duplicate: duplicateNodeFromContent,
            deleteNode: deleteNodeFromContent,
            updateMetadata: updateNodeMetadataFromContent,
            updateNode: updateNodeFromContent,
            updateMediaNode: updateMediaNodeFromContent,
            openArtCritique,
            extractLayerMaterials,
            dramaStaleNodeIds: drama.staleNodeIds,
            refreshFromDrama: drama.refreshNode,
            addPanoramaCaptureNode,
            openMediaVersions: (node) => setMediaVersionNodeId(node.id),
        }),
        [
            addPanoramaCaptureNode,
            deleteNodeFromContent,
            downloadNodeImage,
            duplicateNodeFromContent,
            openArtCritique,
            extractLayerMaterials,
            drama.staleNodeIds,
            drama.refreshNode,
            replaceCanvasNodeMedia,
            updateMediaNodeFromContent,
            updateNodeFromContent,
            updateNodeMetadataFromContent,
        ],
    );
    const { dismissLastAgentChange, lastAgentChange, undoAgentOps, viewLastAgentChange } = useCanvasOperationHistory({
        projectId,
        domainProjectId: currentProject?.projectId,
        projectTitle: currentProject?.title || t("canvasHistoryUntitled"),
        nodes,
        connections,
        selectedNodeIds,
        viewport,
        nodesRef,
        connectionsRef,
        selectedNodeIdsRef,
        viewportRef,
        generateNodeRef,
        setNodes,
        setConnections,
        setSelectedNodeIds,
        setSelectedConnectionId,
        setViewport,
        setContextMenu,
        focusSelection: fitCanvasSelection,
    });

    const { selectCanvasStyle, styleApplying } = useCanvasStyleWorkflow({
        canvasId: projectId,
        domainProjectId: currentProject?.projectId,
        nodesRef,
        selectedNodeIdsRef,
        getCanvasCenter,
        setNodes,
        setSelectedNodeIds,
        setSelectedConnectionId,
        setDialogNodeId,
        setStylePickerOpen,
    });

    const { addPrevisToCanvas, applyPrevisOutput, createPrevisShot, openPrevisWorkbench, prepareDramaPrevis, savePrevisScene } = useCanvasPrevis({
        projectId,
        domainProjectId: currentProject?.projectId,
        previsNodeId,
        previsScenes: currentProject?.previsScenes || [],
        nodesRef,
        connectionsRef,
        getCanvasCenter,
        setNodes,
        setConnections,
        setSelectedNodeIds,
        setSelectedConnectionId,
        setPrevisNodeId,
        updateProject,
    });

    dramaPrevisRef.current = async (request, editor) => {
        const nodeId = await prepareDramaPrevis(request);
        setDramaPrevisEntry({ nodeId, mode: editor === "timeline" ? "animate" : "layout" });
        setPrevisNodeId(nodeId);
    };

    const {
        activateStep: activateShortDramaStep,
        createPipeline: createShortDramaPipeline,
        guideCollapsed: shortDramaGuideCollapsed,
        openStoryInput,
        progress: shortDramaProgress,
        setGuideCollapsed: setShortDramaGuideCollapsed,
        skipGuide: skipShortDramaGuide,
    } = useCanvasShortDrama({
        nodes,
        connections,
        nodesRef,
        connectionsRef,
        selectedNodeIdsRef,
        getCanvasCenter,
        setNodes,
        setConnections,
        setSelectedNodeIds,
        setSelectedConnectionId,
        setStylePickerOpen,
        fitCanvasSelection,
        focusCanvasNode,
        openTextEditor: openTextNodeEditor,
    });

    const shortDramaGuide = shortDramaEnabled && !currentProject?.projectId && shortDramaProgress.active ? { progress: shortDramaProgress, collapsed: shortDramaGuideCollapsed, onToggle: () => setShortDramaGuideCollapsed((value) => !value) } : undefined;

    const clearCanvas = useCallback(() => {
        const drawingIds = nodesRef.current.flatMap((node) => (node.type === CanvasNodeType.Drawing && node.metadata?.drawingId ? [node.metadata.drawingId] : []));
        if (drawingIds.length) {
            void Promise.all(drawingIds.map((drawingId) => removeCanvasDrawing(projectId, drawingId))).catch(() => message.warning(t("canvasToolsUi.canvasClearedCacheFailed")));
        }
        setNodes([]);
        setConnections([]);
        setTextEditorNodeId(null);
        setDrawingNodeId(null);
        setInfoNodeId(null);
        setCropNodeId(null);
        setRegionEditNodeId(null);
        setAnnotationNodeId(null);
        setAngleNodeId(null);
        setLightingNodeId(null);
        setEmotionNodeId(null);
        setPreviewNodeId(null);
        setRunningNodeId(null);
        setArtCritiqueNodeId(null);
        deselectCanvas();
        setClearConfirmOpen(false);
        clearCanvasFiles();
    }, [clearCanvasFiles, deselectCanvas, message, nodesRef, projectId, setEmotionNodeId, t]);

    useCanvasKeyboard({
        enabled: projectLoaded && !versions.preview && canvasView === "canvas" && !mediaVersionNodeId,
        nodesRef,
        selectedNodeIdsRef,
        selectedConnectionId,
        setSelectedNodeIds,
        setSelectedConnectionId,
        setContextMenu,
        setShortcutRequestNonce,
        setInfoNodeId,
        setCropNodeId,
        setRegionEditNodeId,
        setAnnotationNodeId,
        saveCanvasProject,
        zoomToActualSize,
        fitCanvasContent,
        fitCanvasSelection,
        undoCanvas,
        redoCanvas,
        cancelSelectionBox,
        copySelectedNodes,
        pasteCopiedNodes,
        restoreCopiedNodesFromText,
        shouldPreferCopiedNodes,
        pasteSystemClipboard,
        deleteNodes,
        deleteConnection,
        deselectCanvas,
        zoomCanvasIn,
        zoomCanvasOut,
        focusMode,
        exitFocusMode,
        toggleFocusMode,
        onOpenSearch: () => setNodeSearchOpen(true),
        beginBatchConnection: () => {
            const selected = selectedNodeIdsRef.current;
            const hasFrame = [...selected].some((id) => isFrameNode(nodesRef.current.find((node) => node.id === id)));
            if (selected.size > 1 || hasFrame) beginBatchConnectionMode(batchSourceNodeIdsRef.current);
        },
    });

    const startTitleEditing = useCallback(() => {
        setTitleDraft(currentProject?.title || t("canvasHistoryUntitled"));
        setTitleEditing(true);
    }, [currentProject?.title, t]);

    const finishTitleEditing = useCallback(() => {
        const nextTitle = titleDraft.trim();
        if (nextTitle) renameCurrentProject(nextTitle);
        setTitleEditing(false);
    }, [renameCurrentProject, titleDraft]);

    const pasteAtPosition = useCallback(
        (position: Position) => {
            if (shouldPreferCopiedNodes() && pasteCopiedNodes(position)) return;
            void (async () => {
                try {
                    // 标记写入成功时仍优先系统图片，兼容截图和从外部应用复制的媒体。
                    const handled = await pasteSystemClipboard(position);
                    if (!handled) pasteCopiedNodes(position);
                } catch {
                    if (!pasteCopiedNodes(position)) message.warning(t("canvasToolsUi.clipboardReadFailed"));
                }
            })();
        },
        [message, pasteCopiedNodes, pasteSystemClipboard, shouldPreferCopiedNodes, t],
    );

    const copyingNodeContentRef = useRef(false);
    const copyNodeContentToClipboard = useCallback(
        async (node: CanvasNodeData | null) => {
            if (copyingNodeContentRef.current) return;
            copyingNodeContentRef.current = true;
            releaseCopiedNodesPastePriority();
            if (!node) {
                copyingNodeContentRef.current = false;
                message.warning(t("canvasToolsUi.nothingToCopy"));
                return;
            }

            try {
                const content = node.metadata?.content?.trim();
                const resourceId = resourceIdFromStorageKey(node.metadata?.storageKey);
                // Resource-backed media must use the central access contract. This keeps
                // copy operations on the configured CDN/OSS URL instead of copying the
                // platform file endpoint or a stale URL persisted in canvas metadata.
                const copySource = resourceId ? resolveResourceAccessURL((await getResourceAccess(`resource:${resourceId}`, "copy")).url) : content || "";
                if (!copySource) throw new Error(t("canvasToolsUi.nothingToCopy"));
                if (node.type === CanvasNodeType.Image) {
                    try {
                        await copyImageToSystemClipboard(copySource, node.metadata?.storageKey);
                        message.success(t("canvasToolsUi.imageCopied"));
                        return;
                    } catch (imageErr) {
                        const fallbackUrl = new URL(copySource, window.location.href).toString();
                        if (navigator.clipboard?.writeText) {
                            await navigator.clipboard.writeText(fallbackUrl).catch(() => undefined);
                            message.info(t("canvasToolsUi.imageUrlCopiedNoFocus"));
                            return;
                        }
                        if (await copyToClipboard(fallbackUrl)) {
                            message.info(t("canvasToolsUi.imageUrlCopiedNoFocus"));
                            return;
                        }
                        throw imageErr;
                    }
                }

                if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(copySource);
                else if (!copyToClipboard(copySource)) throw new Error("当前浏览器不支持写入剪贴板");
                message.success(node.type === CanvasNodeType.Text ? t("assetsUi.textCopied") : "内容链接已复制");
            } catch (error) {
                message.error(error instanceof Error ? error.message : "复制失败，请检查浏览器剪贴板权限");
            } finally {
                copyingNodeContentRef.current = false;
            }
        },
        [message, releaseCopiedNodesPastePriority, t],
    );

    const copyNodeMediaUrlToClipboard = useCallback(
        async (node: CanvasNodeData | null) => {
            releaseCopiedNodesPastePriority();
            try {
                const storageKey = node?.metadata?.storageKey;
                const content = node?.metadata?.content?.trim();
                const resourceId = resourceIdFromStorageKey(storageKey);
                const mediaPath = content && !content.startsWith("data:") && !content.startsWith("blob:") ? content : "";
                const mediaURL = resourceId ? resolveResourceAccessURL((await getResourceAccess(`resource:${resourceId}`, "copy")).url) : mediaPath ? new URL(mediaPath, window.location.href).toString() : "";
                if (!mediaURL) throw new Error("当前媒体只有本地内容，没有可复制的地址");
                if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(mediaURL);
                else if (!(await copyToClipboard(mediaURL))) throw new Error("当前浏览器不支持写入剪贴板");
                message.success(node?.type === CanvasNodeType.Video ? "视频地址已复制" : "图片地址已复制");
            } catch (error) {
                message.error(error instanceof Error ? error.message : "媒体地址复制失败");
            }
        },
        [message, releaseCopiedNodesPastePriority],
    );

    const uploadNodeImageToArkPrivateAsset = useCallback(
        async (node: CanvasNodeData) => {
            if (node.type !== CanvasNodeType.Image || !node.metadata?.content) {
                message.warning(t("canvasToolsUi.selectImageUpload"));
                return;
            }
            if (arkPrivateAssetUploadNodeId === node.id) return;
            const feedbackKey = `ark-private-asset-${node.id}`;
            setArkPrivateAssetUploadNodeId(node.id);
            message.loading({ key: feedbackKey, content: "正在保存并上传到方舟素材库...", duration: 0 });
            try {
                let resourceID = resourceIdFromStorageKey(node.metadata.storageKey);
                let persistedNode = node;
                if (!resourceID) {
                    const uploaded = await uploadImage(node.metadata.content);
                    resourceID = resourceIdFromStorageKey(uploaded.storageKey);
                    if (!resourceID) throw new Error("图片未能保存到系统素材库，请检查对象存储配置后重试");
                    handleConfigNodeChange(node.id, imageMetadata(uploaded));
                    persistedNode = { ...node, metadata: { ...node.metadata, ...imageMetadata(uploaded) } };
                }
                const asset = await ensureCanvasNodeAsset({ canvasId: projectId, domainProjectId: currentProject?.projectId, node: persistedNode, source: "canvas-manual" });
                handleConfigNodeChange(node.id, { assetId: asset.assetId });
                await syncResourceToArkPrivateAsset(resourceID);
                message.success({ key: feedbackKey, content: "已同步到方舟素材库，Seedance 将自动复用该素材", duration: 4 });
            } catch (error) {
                message.error({ key: feedbackKey, content: error instanceof Error ? error.message : "上传到方舟素材库失败", duration: 5 });
            } finally {
                setArkPrivateAssetUploadNodeId((current) => (current === node.id ? null : current));
            }
        },
        [arkPrivateAssetUploadNodeId, currentProject?.projectId, handleConfigNodeChange, message, projectId, t],
    );

    const confirmUploadNodeImageToArkPrivateAsset = useCallback(
        (node: CanvasNodeData) => {
            modal.confirm({
                title: t("contextArk"),
                content: "仅可上传你拥有肖像、版权或其他合法使用权的图片。方舟审核通过后，Seedance 会使用受控素材标识生成视频。",
                okText: "确认拥有使用权并上传",
                cancelText: t("timelineCancel"),
                onOk: () => uploadNodeImageToArkPrivateAsset(node),
            });
        },
        [modal, uploadNodeImageToArkPrivateAsset, t],
    );

    const handleCanvasContextMenu = useCallback(
        (event: ReactMouseEvent) => {
            const target = event.target instanceof Element ? event.target : null;
            if (target?.closest("[data-node-id],[data-connection-id]")) return;

            event.preventDefault();
            event.stopPropagation();
            if (target?.closest("[data-canvas-no-zoom],.ant-modal,.ant-popover,.ant-dropdown")) {
                setContextMenu(null);
                return;
            }

            closeConnectionCreateMenu();
            setContextMenu({ type: "canvas", x: event.clientX, y: event.clientY, position: screenToCanvas(event.clientX, event.clientY) });
        },
        [closeConnectionCreateMenu, screenToCanvas],
    );

    const handleNodeContextMenu = useCallback(
        (event: ReactMouseEvent, id: string) => {
            event.preventDefault();
            event.stopPropagation();
            setSelectedNodeIds((current) => {
                if (current.has(id) && current.size > 1) return current;
                return new Set([id]);
            });
            setSelectedConnectionId(null);
            closeConnectionCreateMenu();
            setToolbarNodeId(null);
            setDialogNodeId(null);
            setContextMenu({ type: "node", x: event.clientX, y: event.clientY, nodeId: id });
        },
        [closeConnectionCreateMenu],
    );

    const handleGenerateNode = useCanvasGenerationExecutor({
        projectId,
        domainProjectId: currentProject?.projectId,
        addedSkills,
        assets,
        nodesRef,
        connectionsRef,
        setNodes,
        setConnections,
        setSelectedNodeIds,
        setSelectedConnectionId,
        setDialogNodeId,
        setRunningNodeId,
        startGenerationRequest,
        finishGenerationRequest,
        bindGenerationTask,
        applyGenerationTaskResult,
    });
    useEffect(() => {
        generateNodeRef.current = handleGenerateNode;
    }, [handleGenerateNode]);

    const { enqueueGenerationBatch, retryFailedBatchItems, stopRemainingBatchItems } = useCanvasGenerationBatches({ connectionsRef, assets, projectId, projectLoaded, nodes, nodesRef, setNodes, handleGenerateNode });

    const {
        addReferenceColumn: addBatchReferenceColumn,
        addRow: addBatchRow,
        batchGenDialogConfig,
        batchGenDialogConcurrency,
        batchGenDialogOpen,
        batchGenDialogRowCount,
        closeBatchGenDialog,
        confirmBatchGenDialog,
        fillRowsFromConnections,
        generateRows: generateBatchRows,
        moveReferenceCell: moveBatchReferenceCell,
        patchTable: patchBatchTable,
        removeReferenceColumn: removeBatchReferenceColumn,
        removeRow: removeBatchRow,
        reorderReferenceColumns: reorderBatchReferenceColumns,
        syncRowsFromConnections,
        updateRow: updateBatchRow,
    } = useCanvasBatchTable({ assets, nodesRef, connectionsRef, setNodes, setConnections, setSelectedNodeIds, enqueueGenerationBatch });

    useEffect(() => {
        if (!projectLoaded) return;
        setNodes((current) => {
            let changed = false;
            const next = current.map((node) => {
                const promoted = promoteLegacyBatchTableSize(node);
                if (promoted !== node) changed = true;
                return promoted;
            });
            return changed ? next : current;
        });
        nodesRef.current
            .filter((node) => node.type === CanvasNodeType.BatchTable)
            .forEach((node) => {
                syncRowsFromConnections(node.id, true);
            });
    }, [connections, projectLoaded, setNodes, syncRowsFromConnections]);

    const handleUploadBatchReference = useCallback(
        async (tableNodeId: string, rowId: string, columnIndex: number, file: File) => {
            const tableNode = nodesRef.current.find((item) => item.id === tableNodeId);
            const table = tableNode?.metadata?.batchTable;
            const row = table?.rows.find((item) => item.id === rowId);
            if (!tableNode || !table || !row) return;
            const existingId = row.inputNodeIds[columnIndex];
            if (existingId) {
                await replaceNodeMedia(existingId, file);
                return;
            }
            const rowIndex = table.rows.findIndex((item) => item.id === rowId);
            const uploadedNodeId = await createFileNode(file, {
                x: tableNode.position.x - 240,
                y: tableNode.position.y + 170 + Math.max(0, rowIndex) * 220,
            });
            if (!uploadedNodeId) return;
            const inputNodeIds = Array.from({ length: Math.max(batchReferenceColumns(table).length, columnIndex + 1) }, (_, index) => row.inputNodeIds[index] || "");
            inputNodeIds[columnIndex] = uploadedNodeId;
            updateBatchRow(tableNodeId, rowId, { inputNodeIds });
            message.success(t("followupUi.referenceUploaded", { number: columnIndex + 1 }));
        },
        [createFileNode, message, nodesRef, replaceNodeMedia, updateBatchRow],
    );

    const { addScriptRow, createAndGenerateScriptVideos, createScriptActionBoards, createScriptImageNodes, createScriptVideoNodes, generateScriptImages, generateScriptRows, generateScriptVideos, removeScriptRow, replaceScriptRows, updateScriptRow } =
        useCanvasStoryboard({
            projectId,
            addedSkills,
            nodesRef,
            connectionsRef,
            setNodes,
            setConnections,
            setSelectedNodeIds,
            enqueueGenerationBatch,
        });

    const createStoryboardFromBatchTable = useCallback(
        async (tableNodeId: string) => {
            const tableNode = nodesRef.current.find((node) => node.id === tableNodeId && node.type === CanvasNodeType.BatchTable);
            const table = tableNode?.metadata?.batchTable;
            if (!tableNode || !table || table.contentKind !== "storyboard") return;
            const rows = storyboardRowsFromBatchTable(table);
            if (!rows.length) return message.warning(t("canvasToolsUi.noStoryboardRows"));
            const sourceIds = Array.from(
                new Set([...(table.storyboardSourceNodeIds || []), ...connectionsRef.current.filter((connection) => connection.toNodeId === tableNodeId && connection.relation !== "batch-output").map((connection) => connection.fromNodeId)]),
            ).filter((id) => nodesRef.current.some((node) => node.id === id));
            const sourceVideo = sourceIds.map((id) => nodesRef.current.find((node) => node.id === id)).find((node): node is CanvasNodeData => node?.type === CanvasNodeType.Video);
            const keyframeTimesMs = rows.map(storyboardKeyframeTime).filter((value): value is number => value !== undefined);
            const useKeyframes = Boolean(sourceVideo && keyframeTimesMs.length);
            const scriptSpec = getNodeSpec(CanvasNodeType.Script);
            const scriptNode = createCanvasNode(
                CanvasNodeType.Script,
                {
                    x: tableNode.position.x + tableNode.width + 160 + scriptSpec.width / 2,
                    y: tableNode.position.y + Math.max(tableNode.height, scriptSpec.height) / 2,
                },
                {
                    storyboard: { rows, visibleColumns: cinematicStoryboardColumns(), referenceNodeIds: sourceIds },
                    storyboardVideoInputMode: useKeyframes ? "keyframe" : "direct",
                    workflowKind: "storyboard",
                    workflowTitle: table.storyboardTitle || "视频脚本",
                    composerContent: table.storyboardTitle || "来自多维表格的视频分镜脚本",
                    status: "idle",
                },
            );
            scriptNode.title = table.storyboardTitle || "视频脚本";
            const nextConnections = [...connectionsRef.current, ...sourceIds.map((sourceId) => ({ id: nanoid(), fromNodeId: sourceId, toNodeId: scriptNode.id, toHandleId: "storyboard:context", relation: "storyboard-asset-reference" as const }))];
            const nextNodes = [...nodesRef.current, scriptNode];
            nodesRef.current = nextNodes;
            connectionsRef.current = nextConnections;
            setNodes(nextNodes);
            setConnections(nextConnections);
            setSelectedNodeIds(new Set([scriptNode.id]));
            setDialogNodeId(null);
            if (sourceVideo && keyframeTimesMs.length) {
                const frameNodes = await extractVideoFrames(sourceVideo, { timesMs: keyframeTimesMs });
                if (frameNodes.length) {
                    const withFrames = nodesRef.current.map((node) =>
                        node.id === scriptNode.id
                            ? {
                                  ...node,
                                  metadata: {
                                      ...node.metadata,
                                      storyboard: {
                                          ...node.metadata?.storyboard,
                                          rows: bindStoryboardKeyframes(node.metadata?.storyboard?.rows || rows, frameNodes, sourceVideo.id),
                                          visibleColumns: cinematicStoryboardColumns(),
                                          referenceNodeIds: sourceIds,
                                      },
                                  },
                              }
                            : node,
                    );
                    nodesRef.current = withFrames;
                    setNodes(withFrames);
                    message.success(t("followupUi.scriptFramesCreated", { count: frameNodes.length }));
                } else {
                    message.warning(t("canvasToolsUi.scriptCreatedFramesFailed"));
                }
            } else {
                message.success(t("followupUi.scriptShotsCreated", { count: rows.length }));
            }
        },
        [connectionsRef, extractVideoFrames, message, nodesRef, setConnections, setDialogNodeId, setNodes, setSelectedNodeIds, t],
    );

    const handleRetryNode = useCanvasGenerationRetry({
        projectId,
        domainProjectId: currentProject?.projectId,
        addedSkills,
        assets,
        nodesRef,
        connectionsRef,
        setNodes,
        setRunningNodeId,
        startGenerationRequest,
        finishGenerationRequest,
        bindGenerationTask,
        applyGenerationTaskResult,
    });
    const reloadCanvasNodeResource = useCallback(
        async (node: CanvasNodeData) => {
            if (!canvasNodeCanResyncTask(node.metadata)) return;
            await resyncGenerationTaskNode(node);
        },
        [resyncGenerationTaskNode],
    );
    const reconcileImageBatchRootNode = useCallback(
        (rootId: string) => {
            setNodes((current) => {
                const root = current.find((item) => item.id === rootId);
                if (!root) return current;
                const reconciled = reconcileImageBatchRoot(root, current);
                return current.map((item) => (item.id === root.id ? reconciled : item));
            });
        },
        [setNodes],
    );
    const retryImageBatchChildren = useCallback(
        (rootId: string, children: CanvasNodeData[]) => {
            const childIds = children.map((child) => child.id);
            setNodes((current) => markImageBatchRetrying(rootId, childIds, current));
            void Promise.allSettled(
                children.map(async (child) => {
                    await handleRetryNode(child);
                    setNodes((current) => current.map((item) => (item.id === child.id ? restoreUnsubmittedImageBatchChild(item, child) : item)));
                }),
            ).finally(() => reconcileImageBatchRootNode(rootId));
        },
        [handleRetryNode, reconcileImageBatchRootNode, setNodes],
    );

    const generateImageFromTextNode = useCallback(
        (node: CanvasNodeData) => {
            const prompt = (node.metadata?.content || node.metadata?.prompt || "").trim();
            if (!prompt) {
                message.warning(t("canvasToolsUi.textEmptyImage"));
                return;
            }
            const sourceNode = nodesRef.current.find((item) => item.id === node.id);
            if (!sourceNode) return;
            const nodeSize = getNodeSpec(CanvasNodeType.Image);
            const imageNode = createCanvasNode(
                CanvasNodeType.Image,
                {
                    x: sourceNode.position.x + sourceNode.width + 96 + nodeSize.width / 2,
                    y: sourceNode.position.y + sourceNode.height / 2,
                },
                {
                    prompt: "@文本1",
                    composerContent: "@文本1",
                    model: effectiveConfig.imageModel || effectiveConfig.model,
                    size: effectiveConfig.size,
                    quality: effectiveConfig.quality,
                    transparentBackground: effectiveConfig.transparentBackground,
                    count: getGenerationCount(effectiveConfig.canvasImageCount || effectiveConfig.count),
                },
            );
            imageNode.title = t("navImage");
            const connection = { id: nanoid(), fromNodeId: sourceNode.id, toNodeId: imageNode.id };
            const nextNodes = nodesRef.current.map((item) => (item.id === sourceNode.id ? { ...item, metadata: { ...item.metadata, content: prompt, richText: undefined, prompt, status: NODE_STATUS_SUCCESS } } : item)).concat(imageNode);
            const nextConnections = [...connectionsRef.current, connection];
            nodesRef.current = nextNodes;
            connectionsRef.current = nextConnections;
            setNodes(nextNodes);
            setConnections(nextConnections);
            setSelectedNodeIds(new Set([imageNode.id]));
            setSelectedConnectionId(null);
            setDialogNodeId(imageNode.id);
        },
        [effectiveConfig, message, t],
    );

    const renderCanvasNodePanel = useCallback(
        (panelNode: CanvasNodeData) => {
            if (panelNode.type === CanvasNodeType.Script || panelNode.type === CanvasNodeType.Drawing) return null;
            const emptyRemakeImage = panelNode.metadata?.videoRemake
                ? connectionsRef.current
                      .filter((edge) => edge.toNodeId === panelNode.id)
                      .map((edge) => nodeById.get(edge.fromNodeId))
                      .find((node) => node?.type === CanvasNodeType.Image && !node.metadata?.content && !node.metadata?.storageKey && !node.metadata?.locked && node.metadata?.fileUpload !== "uploading")
                : undefined;
            return panelNode.type === CanvasNodeType.Config ? (
                <CanvasConfigComposer
                    nodeId={panelNode.id}
                    canvasId={projectId}
                    value={panelNode.metadata?.composerContent ?? panelNode.metadata?.prompt ?? ""}
                    inputs={configInputsById.get(panelNode.id) || []}
                    skillReferences={skillMentionReferences}
                    generationMode={panelNode.metadata?.generationMode}
                    metadata={panelNode.metadata}
                    workspaceMode={workspaceMode}
                    onChange={(composerContent) => handleConfigNodeChange(panelNode.id, { composerContent })}
                    onMetadataChange={(patch) => handleConfigNodeChange(panelNode.id, patch)}
                    onClose={() => setDialogNodeId(null)}
                />
            ) : (
                <CanvasNodePromptPanel
                    projectId={projectId}
                    node={panelNode}
                    isRunning={isCanvasNodeGenerating(panelNode, runningNodeId)}
                    mentionReferences={[
                        ...(mentionReferencesByNodeId.get(panelNode.id) || EMPTY_RESOURCE_REFERENCES),
                        ...buildCanvasResourceReferences(nodesRef.current, connectionsRef.current).filter(
                            (reference) => reference.kind === "text" && reference.nodeId !== panelNode.id && !(mentionReferencesByNodeId.get(panelNode.id) || []).some((active) => active.nodeId === reference.nodeId),
                        ),
                    ]}
                    onAddReference={(nodeId, reference) => {
                        if (reference.active || reference.assetId || reference.kind === "skill") return reference;
                        if (reference.kind !== "text" || !reference.nodeId || reference.nodeId === nodeId) return undefined;
                        try {
                            const linked = connectCanvasTextMention(nodesRef.current, connectionsRef.current, nodeId, reference.nodeId, nanoid());
                            nodesRef.current = linked.nodes;
                            connectionsRef.current = linked.connections;
                            setNodes(linked.nodes);
                            setConnections(linked.connections);
                            return linked.reference;
                        } catch (cause) {
                            message.warning(cause instanceof Error ? cause.message : "文本引用失败");
                            return undefined;
                        }
                    }}
                    onPromptChange={handleNodePromptChange}
                    onConfigChange={handleConfigNodeChange}
                    onGenerate={handleGenerateNode}
                    onRemoveReference={handleRemoveNodeReference}
                    onReorderReferences={handleReorderNodeReferences}
                    onReplaceReference={handleReplaceNodeReference}
                    onReplaceReferenceFiles={handleReplaceNodeReferenceFiles}
                    onBindCaseReferences={handleBindCaseReferences}
                    onUploadRemakeImage={emptyRemakeImage ? () => handleUploadRequest(emptyRemakeImage.id, undefined, { preserveSelection: true }) : undefined}
                    onClose={() => setDialogNodeId(null)}
                    onNodeMouseDown={handleNodeMouseDown}
                    workspaceMode={workspaceMode}
                    referenceImageSize={canvasReferenceImageDimensions(panelNode.id, nodesRef.current, connectionsRef.current)}
                    onImageSettingsOpenChange={(open) => {
                        setNodeImageSettingsOpen(open);
                        if (open) setToolbarNodeId(null);
                    }}
                    onListGenerate={(nodeId, listPrompt) => {
                        void handleListGenerate({
                            sourceNodeId: nodeId,
                            prompt: listPrompt,
                            nodes: nodesRef.current,
                            connections: connectionsRef.current,
                            config: effectiveConfig,
                            projectId,
                            setNodes,
                            setConnections,
                            setRunningNodeId,
                            setDialogNodeId,
                        });
                    }}
                />
            );
        },
        [
            configInputsById,
            effectiveConfig,
            handleBindCaseReferences,
            handleConfigNodeChange,
            handleGenerateNode,
            handleNodePromptChange,
            handleRemoveNodeReference,
            handleReorderNodeReferences,
            handleReplaceNodeReference,
            handleReplaceNodeReferenceFiles,
            handleUploadRequest,
            mentionReferencesByNodeId,
            message,
            nodeById,
            projectId,
            runningNodeId,
            setConnections,
            setDialogNodeId,
            setNodes,
            setRunningNodeId,
            skillMentionReferences,
            workspaceMode,
        ],
    );

    const renderCanvasNodeContent = useCallback(
        (contentNode: CanvasNodeData) => {
            if (contentNode.metadata?.workflowKind === "character" && (contentNode.metadata.characterAssetId || contentNode.metadata.officialAssetId)) {
                return <CanvasCharacterReferenceNodeContent node={contentNode} />;
            }
            if (contentNode.metadata?.workflowKind === "styleboard" && !contentNode.metadata.content) {
                return <CanvasStylePlaceholderNodeContent onChoose={() => setStylePickerOpen(true)} />;
            }
            if (contentNode.metadata?.workflowKind === "story_input") {
                return <CanvasStoryInputNodeContent node={contentNode} onEdit={() => openStoryInput(contentNode.id)} />;
            }
            if (contentNode.type === CanvasNodeType.BatchTable) {
                return (
                    <CanvasBatchTableNodeContent
                        readOnly={Boolean(contentNode.metadata?.locked)}
                        onPickReference={(rowId, columnIndex) => batchReferences.pick(contentNode.id, rowId, columnIndex)}
                        onRemoveReference={(rowId, columnIndex) => batchReferences.remove(contentNode.id, rowId, columnIndex)}
                        onScrollChange={(scroll) => setBatchScrollById((previous) => (previous[contentNode.id]?.top === scroll.top && previous[contentNode.id]?.left === scroll.left ? previous : { ...previous, [contentNode.id]: scroll }))}
                        node={contentNode}
                        nodes={nodesRef.current}
                        connections={connections}
                        batch={visibleGenerationBatch(contentNode)}
                        theme={theme}
                        onPatchTable={(patch) => patchBatchTable(contentNode.id, patch)}
                        onAddRow={() => addBatchRow(contentNode.id)}
                        onRemoveRow={(rowId) => removeBatchRow(contentNode.id, rowId)}
                        onUpdateRow={(rowId, patch) => updateBatchRow(contentNode.id, rowId, patch)}
                        onFillRows={() => fillRowsFromConnections(contentNode.id)}
                        onGenerate={(rowIds) => void generateBatchRows(contentNode.id, rowIds)}
                        onCreateStoryboard={() => createStoryboardFromBatchTable(contentNode.id)}
                        onRetryItem={(batchId, itemId) => retryFailedBatchItems(contentNode.id, batchId, itemId)}
                        onAddReferenceColumn={() => addBatchReferenceColumn(contentNode.id)}
                        onRemoveReferenceColumn={() => removeBatchReferenceColumn(contentNode.id)}
                        onFocusOutput={(nodeId) => focusCanvasImageNode(nodeId)}
                        onReorderReferenceColumns={(fromColumnId, toColumnId) => reorderBatchReferenceColumns(contentNode.id, fromColumnId, toColumnId)}
                        onMoveReferenceCell={(sourceRowId, sourceColumnIndex, targetRowId, targetColumnIndex) => moveBatchReferenceCell(contentNode.id, sourceRowId, sourceColumnIndex, targetRowId, targetColumnIndex)}
                        onUploadReference={(rowId, columnIndex, file) => {
                            void handleUploadBatchReference(contentNode.id, rowId, columnIndex, file);
                        }}
                        onConnectStart={(event, handleId) => handleConnectStart(event, contentNode.id, "target", handleId)}
                        onConnectDrop={(event, handleId) => handleConnectDrop(event, contentNode.id, handleId)}
                    />
                );
            }
            if (contentNode.type === CanvasNodeType.Script) {
                const pipeline = deriveStoryboardPipelineProgress(contentNode, nodesRef.current, connectionsRef.current);
                return (
                    <CanvasScriptNodeContent
                        onEditAssets={(rowId) => setStoryboardAssetTarget({ nodeId: contentNode.id, rowId })}
                        node={contentNode}
                        nodes={nodesRef.current}
                        batch={visibleGenerationBatch(contentNode)}
                        pipeline={pipeline}
                        scale={viewport.k}
                        mentionReferences={mentionReferencesByNodeId.get(contentNode.id) || EMPTY_RESOURCE_REFERENCES}
                        onOpen={() => setScriptEditorNodeId(contentNode.id)}
                        onCreateImageNodes={() => createScriptImageNodes(contentNode.id)}
                        onCreateVideoNodes={() => createScriptVideoNodes(contentNode.id)}
                        onGenerateImages={(rowIds) => void generateScriptImages(contentNode.id, rowIds)}
                        onGenerateVideos={(rowIds) => (contentNode.metadata?.storyboardVideoInputMode === "keyframe" ? void generateScriptVideos(contentNode.id, rowIds) : void createAndGenerateScriptVideos(contentNode.id, rowIds))}
                        onVideoInputModeChange={(storyboardVideoInputMode) => handleConfigNodeChange(contentNode.id, { storyboardVideoInputMode })}
                        onMergeVideos={() => void mergeVideosByIds(pipeline.successfulVideoNodeIds)}
                        onCreateActionBoards={() => void createScriptActionBoards(contentNode.id)}
                        onRetryBatch={(batchId) => retryFailedBatchItems(contentNode.id, batchId)}
                        onRetryBatchItem={(batchId, itemId) => retryFailedBatchItems(contentNode.id, batchId, itemId)}
                        onStopBatch={(batchId) => stopRemainingBatchItems(contentNode.id, batchId)}
                        onAddRow={() => addScriptRow(contentNode.id)}
                        onRemoveRow={(rowId) => removeScriptRow(contentNode.id, rowId)}
                        onUpdateRow={(rowId, patch) => updateScriptRow(contentNode.id, rowId, patch)}
                        onPromptChange={(composerContent) => handleConfigNodeChange(contentNode.id, { composerContent })}
                        onGenerateScript={(prompt) => void generateScriptRows(contentNode.id, prompt)}
                        onModelChange={(model) => handleConfigNodeChange(contentNode.id, { model })}
                        onImageModelChange={(model) => {
                            const current = nodesRef.current.find((node) => node.id === contentNode.id);
                            if (!current?.metadata?.storyboardImageDefaults) return;
                            const ids = new Set(current.metadata.storyboard?.rows.flatMap((row) => storyboardRowImageOutputs(current.id, row, nodesRef.current, connectionsRef.current).map((node) => node.id)));
                            handleConfigNodeChange(contentNode.id, { storyboardImageDefaults: { ...current.metadata.storyboardImageDefaults, model } });
                            for (const target of nodesRef.current) if (ids.has(target.id) && target.type === CanvasNodeType.Image && !target.metadata?.model) handleConfigNodeChange(target.id, { model });
                        }}
                        onShotDurationChange={(duration: StoryboardShotDuration) => handleConfigNodeChange(contentNode.id, { storyboardShotDuration: duration })}
                        onShotCountChange={(count: StoryboardShotCount) => handleConfigNodeChange(contentNode.id, { storyboardShotCount: count })}
                        workspaceMode={workspaceMode}
                        onComposerHeightChange={(height) => {
                            if (contentNode.metadata?.storyboardComposerHeight === height) return;
                            handleConfigNodeChange(contentNode.id, { storyboardComposerHeight: height });
                            const minHeight = storyboardMinNodeHeight(height);
                            if (contentNode.height < minHeight) handleNodeResize(contentNode.id, contentNode.width, minHeight);
                        }}
                        onConnectStart={(event, rowId, handleType) => handleConnectStart(event, contentNode.id, handleType, rowId === "context" ? "storyboard:context" : `row:${rowId}`)}
                        onScrollTopChange={(scrollTop) => setScriptScrollTopById((current) => (current[contentNode.id] === scrollTop ? current : { ...current, [contentNode.id]: scrollTop }))}
                    />
                );
            }
            if (contentNode.metadata?.previsSceneId) {
                return (
                    <CanvasPrevisNodePanel
                        node={contentNode}
                        scene={currentProject?.previsScenes?.find((scene) => scene.id === contentNode.metadata?.previsSceneId) || null}
                        readNodeContent={(nodeId) => {
                            const previewNode = nodeId ? nodesRef.current.find((item) => item.id === nodeId) : undefined;
                            return previewNode ? { content: previewNode.metadata?.content, storageKey: previewNode.metadata?.storageKey } : undefined;
                        }}
                        professional={workspaceMode === "professional"}
                        onOpen={() => openPrevisWorkbench(contentNode.id)}
                    />
                );
            }
            return (
                <CanvasConfigNodePanel
                    node={contentNode}
                    isRunning={isCanvasNodeGenerating(contentNode, runningNodeId)}
                    inputSummary={getInputSummary(configInputsById.get(contentNode.id) || [])}
                    onConfigChange={handleConfigNodeChange}
                    onComposerToggle={() => setDialogNodeId((current) => (current === contentNode.id ? null : contentNode.id))}
                    onGenerate={(nodeId) => {
                        const target = nodesRef.current.find((item) => item.id === nodeId);
                        void handleGenerateNode(nodeId, target?.metadata?.generationMode || "image", target?.metadata?.composerContent ?? target?.metadata?.prompt ?? "");
                    }}
                    workspaceMode={workspaceMode}
                />
            );
        },
        [
            addBatchReferenceColumn,
            addBatchRow,
            addScriptRow,
            configInputsById,
            connections,
            createAndGenerateScriptVideos,
            createScriptActionBoards,
            createStoryboardFromBatchTable,
            createScriptImageNodes,
            createScriptVideoNodes,
            currentProject?.previsScenes,
            fillRowsFromConnections,
            focusCanvasImageNode,
            generateBatchRows,
            generateScriptImages,
            generateScriptRows,
            generateScriptVideos,
            handleUploadBatchReference,
            moveBatchReferenceCell,
            handleConfigNodeChange,
            handleConnectDrop,
            handleConnectStart,
            handleGenerateNode,
            handleNodeResize,
            mentionReferencesByNodeId,
            mergeVideosByIds,
            openPrevisWorkbench,
            openStoryInput,
            patchBatchTable,
            removeBatchReferenceColumn,
            removeBatchRow,
            reorderBatchReferenceColumns,
            replaceCanvasNodeMedia,
            removeScriptRow,
            retryFailedBatchItems,
            runningNodeId,
            stopRemainingBatchItems,
            theme,
            updateBatchRow,
            updateScriptRow,
            viewport.k,
            workspaceMode,
        ],
    );
    const handleConnectionSelect = useCallback((connectionId: string) => {
        setSelectedConnectionId(connectionId);
        setSelectedNodeIds(new Set());
        setContextMenu(null);
    }, []);
    const handleConnectionContextMenu = useCallback(
        (event: ReactMouseEvent<SVGPathElement>, connectionId: string) => {
            setSelectedConnectionId(connectionId);
            setSelectedNodeIds(new Set());
            closeConnectionCreateMenu();
            setContextMenu({ type: "connection", x: event.clientX, y: event.clientY, connectionId });
        },
        [closeConnectionCreateMenu],
    );

    const handleCanvasNodeHoverStart = useCallback(
        (nodeId: string) => {
            if (nodeDraggingRef.current) return;
            setHoveredNodeId(nodeId);
            keepNodeToolbar(nodeId);
        },
        [keepNodeToolbar],
    );
    const handleCanvasNodeHoverEnd = useCallback(
        (nodeId: string) => {
            setHoveredNodeId((current) => (current === nodeId ? null : current));
            hideNodeToolbar();
        },
        [hideNodeToolbar],
    );
    const retryCanvasNode = useCallback(
        (node: CanvasNodeData) => {
            if (node.type === CanvasNodeType.Script) {
                const prompt = (node.metadata?.composerContent || node.metadata?.prompt || "").trim();
                if (!prompt) {
                    message.warning(t("canvasToolsUi.storyMissingRetry"));
                    return;
                }
                void generateScriptRows(node.id, prompt);
                return;
            }
            if (node.type === CanvasNodeType.Image && node.metadata?.isBatchRoot) {
                const failedChildren = failedImageBatchChildren(node, nodesRef.current);
                if (!failedChildren.length) {
                    message.info(t("canvasToolsUi.noFailedImagesRetry"));
                    return;
                }
                message.info(t("followupUi.retryImages", { count: failedChildren.length }));
                retryImageBatchChildren(node.id, failedChildren);
                return;
            }
            if (node.type === CanvasNodeType.Image && node.metadata?.batchRootId) {
                retryImageBatchChildren(node.metadata.batchRootId, [node]);
                return;
            }
            void handleRetryNode(node);
        },
        [generateScriptRows, handleRetryNode, message, nodesRef, retryImageBatchChildren, t],
    );
    const openCanvasNodeTaskDetails = useCallback(
        (node: CanvasNodeData) => {
            void openNodeTaskDetails(node);
        },
        [openNodeTaskDetails],
    );
    const openCanvasNodeVersions = useCallback((node: CanvasNodeData) => {
        if (hasMediaVersionHistory(node)) setMediaVersionNodeId(node.id);
        else setVersionCompareRootId(node.metadata?.versionOfNodeId || node.id);
    }, []);
    const changeCanvasView = useCallback(
        (view: CanvasProjectView) => {
            setSearchParams(
                (current) => {
                    const next = new URLSearchParams(current);
                    if (view === "assets") next.set("view", "assets");
                    else next.delete("view");
                    return next;
                },
                { replace: true },
            );
            if (view !== "assets") return;
            setContextMenu(null);
            setDialogNodeId(null);
            setToolbarNodeId(null);
            setHoveredNodeId(null);
        },
        [setDialogNodeId, setSearchParams],
    );
    const locateAssetNode = useCallback(
        (nodeId: string) => {
            changeCanvasView("canvas");
            const target = nodesRef.current.find((node) => node.id === nodeId);
            const parent = target?.parentId ? nodesRef.current.find((node) => node.id === target.parentId) : null;
            if (parent?.metadata?.frame?.collapsed) toggleFrameCollapsed(parent.id);
            const batchRoot = target?.metadata?.batchRootId ? nodesRef.current.find((node) => node.id === target.metadata?.batchRootId) : null;
            if (batchRoot && !batchRoot.metadata?.imageBatchExpanded) toggleBatchExpanded(batchRoot.id);
            const selection = new Set([nodeId]);
            selectedNodeIdsRef.current = selection;
            setSelectedNodeIds(selection);
            setSelectedConnectionId(null);
            focusCanvasNode(nodeId);
        },
        [changeCanvasView, focusCanvasNode, nodesRef, selectedNodeIdsRef, setSelectedNodeIds, toggleBatchExpanded, toggleFrameCollapsed],
    );
    const createDramaFromStoryboard = useCallback(
        (node: CanvasNodeData) => {
            const source = canvasStoryboardToDramaSource(node);
            if (!source) {
                message.warning("分镜脚本里还没有可转录的镜头");
                return;
            }
            // 未关联项目的画布在作品创建后关联到新短剧，成为它的精修画布；已关联的画布保持原关联。
            navigate("/projects/new", { state: { prefill: { name: node.title || currentProject?.title || "画布分镜", sourceFormat: "storyboard", text: source.text, canvasId: currentProject?.projectId ? undefined : projectId } } });
        },
        [currentProject?.projectId, currentProject?.title, message, navigate, projectId],
    );

    const renameAssetNodes = useCallback(
        (updates: Array<{ nodeId: string; title: string }>) => {
            updates.forEach(({ nodeId, title }) => handleNodeTitleChange(nodeId, title));
        },
        [handleNodeTitleChange],
    );
    const promoteAssetVersion = useCallback(
        (version: CanvasAssetVersion) => {
            const node = nodesRef.current.find((item) => item.id === version.nodeId);
            if (!node) {
                message.info("该节点已删除或尚未同步到画布");
                return;
            }
            if (version.source === "batch") {
                setBatchPrimary(node);
                message.success(`已将${version.label}设为主图`);
                return;
            }
            if (version.mediaVersionId && !adoptNodeMediaVersion(node.id, version.mediaVersionId)) return;
            if (node.metadata?.versionOfNodeId && !node.metadata.versionPrimary) setPrimaryVersion(node.id);
        },
        [adoptNodeMediaVersion, message, nodesRef, setBatchPrimary, setPrimaryVersion],
    );
    const viewCanvasNodeImage = useCallback((node: CanvasNodeData) => setPreviewNodeId(node.id), []);
    const editCanvasPrevis = useCallback((node: CanvasNodeData) => openPrevisWorkbench(node.id), [openPrevisWorkbench]);
    const storyboardAssetNode = nodes.find((node) => node.id === storyboardAssetTarget?.nodeId);
    const storyboardAssetRow = storyboardAssetNode?.metadata?.storyboard?.rows.find((row) => row.id === storyboardAssetTarget?.rowId);
    const storyboardAssetBindings =
        storyboardAssetNode && storyboardAssetRow
            ? normalizeStoryboardAssetBindings([
                  ...(storyboardAssetRow.assetBindings || []),
                  ...storyboardRowReferenceNodeIds(storyboardAssetNode, storyboardAssetRow, nodes, connections, false)
                      .filter((id) => !storyboardAssetNode.metadata?.storyboard?.referenceNodeIds.includes(id))
                      .flatMap((id) => {
                          const node = nodes.find((item) => item.id === id);
                          const binding = node && bindingForConnectedNode(node);
                          return binding ? [binding] : [];
                      }),
              ])
            : [];

    const locateProjectStyleNode = useCallback(() => {
        const styleNode = nodesRef.current.find((node) => node.type === CanvasNodeType.Text && node.metadata?.workflowKind === "styleboard");
        if (!styleNode) {
            message.info(t("canvasToolsUi.styleSyncing"));
            return;
        }
        focusCanvasNode(styleNode.id);
    }, [focusCanvasNode, message, nodesRef, t]);
    const freeformCreateCommands = useCanvasCreateCommands({
        workspaceMode,
        isProjectLinked: Boolean(shortDramaEnabled && currentProject?.projectId),
        handlers: {
            onAddText: () => createNode(CanvasNodeType.Text),
            onAddImage: () => createNode(CanvasNodeType.Image),
            onAddVideo: () => createNode(CanvasNodeType.Video),
            onAddAudio: () => createNode(CanvasNodeType.Audio),
            onAddScript: () => createNode(CanvasNodeType.Script),
            onAddFrame: () => createNode(CanvasNodeType.Frame),
            onAddFolder: createFolder,
            onAddDrawing: () => createNode(CanvasNodeType.Drawing),
            onAddWorkflow: () => createNode(CanvasNodeType.Config),
            onAddExtensionNode: (type) => createNode(type),
            onChooseStyle: () => setStylePickerOpen(true),
            onOpenPrevis: () => createPrevisShot("empty"),
            onUpload: () => handleUploadRequest(),
            onOpenMyAssets: () => openAssetsAtPosition(),
            onOpenProjectCharacters: () => openCharacterLibrary(),
            onOpenPoseLibrary: () => openPoseLibrary(),
        },
    });
    const emptyStateKind = resolveCanvasEmptyStateKind({
        nodeCount: nodes.length,
        shortDramaEnabled,
        isProjectLinked: Boolean(currentProject?.projectId),
        starterMode: currentProject?.starterMode,
    });
    const dramaCanvas = Boolean(drama.dramaId) && !drama.loadFailed;
    const dramaFirstEpisode = drama.summary?.episodes.find((episode) => episode.stats.segments > 0);

    const emptyCanvasState =
        drama.summary && nodes.length === 0 ? (
            <CanvasDramaEmptyState
                dramaName={drama.summary.project.name}
                studioPath={`/projects/${encodeURIComponent(drama.summary.project.id)}`}
                episodeLabel={dramaFirstEpisode ? `第 ${dramaFirstEpisode.number} 集` : undefined}
                onProjectEpisode={dramaFirstEpisode ? () => void drama.projectEpisode(dramaFirstEpisode.id) : undefined}
                onAddText={() => createNode(CanvasNodeType.Text)}
            />
        ) : emptyStateKind === "freeform" ? (
            <CanvasFreeformEmptyState commands={freeformCreateCommands} />
        ) : emptyStateKind === "linked" ? (
            <CanvasLinkedProjectEmptyState
                projectName={linkedProjectQuery.data?.project.name || currentProject?.title || t("canvasLibraryProjectCanvas")}
                hasChapter={Boolean(linkedProjectQuery.data?.units.length)}
                onAddFirstChapter={() => {
                    const first = linkedProjectQuery.data?.units.slice().sort((left, right) => left.position - right.position)[0];
                    if (first) void handleProjectChapterInsert({ id: first.id, projectId: linkedProjectId, title: first.title, position: first.position });
                }}
                onOpenAssets={() => openProjectAssets()}
                onAddText={() => createNode(CanvasNodeType.Text)}
            />
        ) : emptyStateKind === "guided" ? (
            <CanvasShortDramaEmptyState
                onSubmitPrompt={(text) => {
                    setCinematicAgentEntry(true);
                    // 有输入时直接作为首条消息提交；空输入只打开面板。
                    if (text) setAgentPrefillRequest((current) => ({ id: (current?.id ?? 0) + 1, text, autoSubmit: true }));
                    openAgent();
                }}
                onCreatePipeline={createShortDramaPipeline}
                onStartFreeform={() => updateProject(projectId, { starterMode: "freeform" })}
                onUpload={() => handleUploadRequest()}
                onAddText={() => createNode(CanvasNodeType.Text)}
                onAddScript={() => createNode(CanvasNodeType.Script)}
            />
        ) : null;
    const agentSelectedNodeIds = useMemo(() => Array.from(selectedNodeIds), [selectedNodeIds]);
    const agentFocusNodeRef = useRef<(nodeId: string) => void>(() => {});

    const handleAgentFocusNode = useCallback(
        (nodeId: string) => {
            const currentNodes = nodesRef.current;
            const target = currentNodes.find((node) => node.id === nodeId);
            if (!target) {
                message.info(t("canvasToolsUi.nodeRemovedOrUnsynced"));
                return;
            }
            const parent = target.parentId ? currentNodes.find((node) => node.id === target.parentId) : null;
            if (parent?.metadata?.frame?.collapsed) toggleFrameCollapsed(parent.id);
            const batchRoot = target.metadata?.batchRootId ? currentNodes.find((node) => node.id === target.metadata?.batchRootId) : null;
            if (batchRoot && isHiddenBatchChild(target, currentNodes) && !batchRoot.metadata?.imageBatchExpanded) toggleBatchExpanded(batchRoot.id);
            focusCanvasNode(nodeId);
        },
        [message, nodesRef, toggleFrameCollapsed, toggleBatchExpanded, focusCanvasNode, t],
    );
    // Agent 输入框的附件放到画布中心附近（按 3 列网格排开），不改选区、不弹全局进度；上传状态写在节点上。
    const insertAgentFiles = useCallback(
        (files: File[], onError?: (nodeId: string, details: string) => void) => {
            const center = getCanvasCenter();
            const columns = Math.min(files.length, 3);
            return files.map((file, index) => {
                const nodeId = `upload-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
                const position = { x: center.x + ((index % 3) - (columns - 1) / 2) * 380, y: center.y + Math.floor(index / 3) * 300 };
                void createFileNode(file, position, undefined, { quiet: { nodeId, onError: onError ? (details) => onError(nodeId, details) : undefined } });
                return nodeId;
            });
        },
        [createFileNode, getCanvasCenter],
    );
    const insertAgentText = useCallback(
        (text: string, title: string) => {
            const node = { ...createCanvasNode(CanvasNodeType.Text, getCanvasCenter(), { content: text, prompt: text, status: "success" }), title };
            setNodes((current) => [...current, node]);
            return node.id;
        },
        [getCanvasCenter, setNodes],
    );
    const insertAgentMarkdown = useCallback(
        (markdown: string, title: string) => {
            const node = { ...createCanvasNode(CanvasNodeType.Text, getCanvasCenter(), { content: markdown, textFormat: "markdown", status: "success" }), title, width: 420, height: 360 };
            setNodes((current) => [...current, node]);
            return node.id;
        },
        [getCanvasCenter, setNodes],
    );
    const insertAgentAssets = useCallback(
        async (payloads: InsertAssetPayload[]): Promise<AgentInsertedNode[]> =>
            (await handleAssetsInsert(payloads)).map((node) => ({
                nodeId: node.id,
                title: node.title || "素材",
                kind: node.type === CanvasNodeType.Image ? "image" : node.type === CanvasNodeType.Video ? "video" : node.type === CanvasNodeType.Audio ? "audio" : "text",
                previewUrl: node.type === CanvasNodeType.Image ? node.metadata?.content : undefined,
            })),
        [handleAssetsInsert],
    );
    const insertAgentImageAsset = useCallback(
        async (assetId: string) => {
            const asset = useAssetStore.getState().assets.find((item): item is ImageAsset => item.kind === "image" && item.id === assetId);
            if (!asset) return null;
            return createImageAssetNode(asset, undefined, { quiet: true });
        },
        [createImageAssetNode],
    );
    // 只删除没有连线的节点：用户已经把它接到别的节点上，说明它不再只是这条消息的附件。
    const discardAgentNodes = useCallback(
        (nodeIds: string[]) => {
            const linked = new Set(connectionsRef.current.flatMap((connection) => [connection.fromNodeId, connection.toNodeId]));
            const removable = nodeIds.filter((id) => !linked.has(id) && nodesRef.current.some((node) => node.id === id));
            if (removable.length) deleteNodes(new Set(removable));
        },
        [deleteNodes, nodesRef],
    );
    // 平台唯一的 Agent 面板挂在布局上；画布只发布自己的上下文。画布加载完成前不发布，避免以未保存画布绑定运行。
    const publishAgentCanvas = useGlobalAgentStore((state) => state.setCanvas);
    useEffect(() => {
        if (!projectLoaded || !projectId) return;
        publishAgentCanvas({
            canvasId: projectId,
            domainProjectId: currentProject?.projectId,
            canvasNodes: nodes,
            runningNodeId,
            nodeCount: nodes.length,
            selectedNodeIds: agentSelectedNodeIds,
            references: agentMentionReferences,
            prefillRequest: agentPrefillRequest,
            onFocusNode: handleAgentFocusNode,
            insertAgentFiles,
            insertAgentText,
            insertAgentMarkdown,
            insertAgentAssets,
            insertAgentImageAsset,
            discardAgentNodes,
        });
    }, [
        projectLoaded,
        projectId,
        currentProject?.projectId,
        nodes,
        runningNodeId,
        agentSelectedNodeIds,
        agentMentionReferences,
        agentPrefillRequest,
        handleAgentFocusNode,
        publishAgentCanvas,
        insertAgentFiles,
        insertAgentText,
        insertAgentMarkdown,
        insertAgentAssets,
        insertAgentImageAsset,
        discardAgentNodes,
    ]);
    // 离开画布（卸载或切换到另一个画布）时撤回上下文：之后的对话轮次不再绑定这个画布。
    useEffect(() => {
        return () => {
            const current = useGlobalAgentStore.getState().canvas;
            if (current?.canvasId === projectId) useGlobalAgentStore.getState().setCanvas(null);
        };
    }, [projectId]);
    if (!projectLoaded && loadError)
        return (
            <main className="flex h-full flex-col items-center justify-center gap-4">
                <p role="alert">{loadError}</p>
                <Button onClick={retryLoad}>{t("galleryRetry")}</Button>
                <Link to={workspacePath("/canvas")}>{t("canvasToolsUi.canvasLibraryBack")}</Link>
            </main>
        );
    if (!projectLoaded) return <CanvasRefreshShell />;

    const projectHeading = (
        <CanvasProjectHeading
            view={canvasView}
            onViewChange={changeCanvasView}
            title={currentProject?.title || t("canvasHistoryUntitled")}
            titleDraft={titleDraft}
            isTitleEditing={titleEditing}
            onTitleDraftChange={setTitleDraft}
            onStartTitleEditing={startTitleEditing}
            onFinishTitleEditing={finishTitleEditing}
            onCancelTitleEditing={() => setTitleEditing(false)}
            canUndo={historyState.canUndo}
            canRedo={historyState.canRedo}
            onCreateProject={createAndOpenProject}
            onDeleteProject={deleteCurrentProject}
            onSave={() => void saveCanvasProject()}
            onForceSave={confirmForceSaveCanvas}
            onImportImage={() => handleUploadRequest()}
            onUndo={undoCanvas}
            onRedo={redoCanvas}
            syncIcon={<CanvasSyncStatus projectId={projectId} onLoadLatest={reloadLatestCanvasProject} onOpenVersions={openVersions} />}
            onOpenSearch={() => setNodeSearchOpen(true)}
            projectContext={
                shortDramaEnabled && currentProject?.projectId
                    ? {
                          ...canvasContext,
                          projectId: currentProject.projectId,
                          projectName: drama.summary?.project.name || linkedProjectQuery.data?.project.name || currentProject.title,
                          ...(drama.active ? { kind: "drama" as const } : {}),
                      }
                    : undefined
            }
        />
    );

    return (
        <CanvasNodeResizeMotionProvider key={projectId} nodes={candidateNodes}>
            <a
                href="#canvas-main"
                className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[var(--z-toast)] focus:rounded-md focus:border focus:bg-background focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:shadow-lg"
            >
                {t("canvasToolsUi.skipToCanvas")}
            </a>
            <main
                id="canvas-main"
                data-project-sidebar={!focusMode && drama.summary ? "" : undefined}
                tabIndex={-1}
                className={`relative flex h-full min-h-0 overflow-hidden outline-none ${!focusMode && !versions.preview ? `canvas-main-with-workspace ${workspaceOpen ? "canvas-workspace-expanded" : ""}` : ""}`}
                style={{ background: resolvedCanvasAppearance.background, color: theme.node.text }}
            >
                {!focusMode && !versions.preview && !dramaCanvas ? (
                    <CanvasWorkspacePanel
                        key={projectId}
                        heading={projectHeading}
                        open={workspaceOpen}
                        onOpen={() => setWorkspaceOpen(true)}
                        onInsertAssets={handleProjectAssetsInsert}
                        projectId={projectId}
                        nodes={nodes}
                        selectedNodeIds={selectedNodeIds}
                        onClose={() => setWorkspaceOpen(false)}
                        onAssets={() => openAssetsAtPosition()}
                        onProjectAssets={currentProject?.projectId ? () => openProjectAssets() : undefined}
                        onCancelTask={cancelCanvasTask}
                        onFocus={(nodeId) => {
                            const target = nodeById.get(nodeId);
                            const parent = target?.parentId ? nodeById.get(target.parentId) : null;
                            if (parent?.metadata?.frame?.collapsed) toggleFrameCollapsed(parent.id);
                            const batchRoot = target?.metadata?.batchRootId ? nodeById.get(target.metadata.batchRootId) : null;
                            if (batchRoot && !batchRoot.metadata?.imageBatchExpanded) toggleBatchExpanded(batchRoot.id);
                            const selection = new Set([nodeId]);
                            selectedNodeIdsRef.current = selection;
                            setSelectedNodeIds(selection);
                            setSelectedConnectionId(null);
                            focusCanvasNode(nodeId);
                        }}
                    />
                ) : null}
                {!workspaceOpen && !focusMode && !versions.preview && shortDramaEnabled && currentProject?.projectId ? (
                    <CanvasProjectSidebar projectId={currentProject.projectId} detail={linkedProjectQuery.data} onAddChapter={handleProjectChapterInsert} onLocateStyle={locateProjectStyleNode} onOpenAssets={() => openProjectAssets()} />
                ) : null}
                {!focusMode && drama.summary ? (
                    <CanvasDramaSidebar
                        summary={drama.summary}
                        cast={drama.cast}
                        presence={drama.presence}
                        busyKey={drama.busyKey}
                        onProjectCast={drama.projectCast}
                        onProjectSegment={drama.projectSegment}
                        onProjectEpisode={drama.projectEpisode}
                        onProjectFinal={drama.projectFinal}
                    />
                ) : null}
                <CanvasOverlayLayerProvider>
                    <div className="canvas-editor-shell relative flex min-w-0 flex-1" data-previs-open={previsNodeId && activePrevisScene ? "" : undefined}>
                        <section
                            data-canvas-editor
                            inert={Boolean(versions.preview)}
                            style={{ visibility: versions.preview ? "hidden" : undefined, opacity: versions.preview ? 0 : undefined }}
                            className="relative min-w-0 flex-1 flex flex-col min-h-0 overflow-hidden"
                        >
                            {!focusMode ? (
                                <CanvasTopBar
                                    projectHeading={dramaCanvas ? projectHeading : undefined}
                                    view={canvasView}
                                    onViewChange={changeCanvasView}
                                    onImportLibTV={() => setLibTVImportOpen(true)}
                                    onImportTapNow={() => setTapNowImportOpen(true)}
                                    onShare={workspaceTeamId ? undefined : () => setShareModalOpen(true)}
                                    shortcutRequestNonce={shortcutRequestNonce}
                                    versionsOpen={versions.open}
                                    onToggleVersions={() => {
                                        closeAgent();
                                        setVersionCompareRootId(null);
                                        versions.toggle();
                                    }}
                                    mediaPerformanceMode={mediaPerformanceMode}
                                    onMediaPerformanceModeChange={setMediaPerformanceMode}
                                    onOpenSearch={() => setNodeSearchOpen(true)}
                                    onEnterFocusMode={enterFocusMode}
                                    shortDramaGuide={shortDramaGuide}
                                />
                            ) : null}

                            <CanvasNodeSearchModal
                                open={nodeSearchOpen}
                                nodes={nodes}
                                onClose={() => setNodeSearchOpen(false)}
                                onFocus={(nodeId) => {
                                    const target = nodeById.get(nodeId);
                                    const parent = target?.parentId ? nodeById.get(target.parentId) : null;
                                    if (parent?.metadata?.frame?.collapsed) toggleFrameCollapsed(parent.id);
                                    const batchRoot = target?.metadata?.batchRootId ? nodeById.get(target.metadata.batchRootId) : null;
                                    if (batchRoot && !batchRoot.metadata?.imageBatchExpanded) toggleBatchExpanded(batchRoot.id);
                                    const selection = new Set([nodeId]);
                                    selectedNodeIdsRef.current = selection;
                                    setSelectedNodeIds(selection);
                                    setSelectedConnectionId(null);
                                    focusCanvasNode(nodeId);
                                }}
                            />

                            {!focusMode && shortDramaGuide ? (
                                <CanvasShortDramaGuide progress={shortDramaGuide.progress} collapsed={shortDramaGuide.collapsed} onToggle={shortDramaGuide.onToggle} onSkip={skipShortDramaGuide} onStepClick={activateShortDramaStep} />
                            ) : null}

                            {batchReferencePickerModal}
                            {!workspaceTeamId && <CanvasShareModal projectId={projectId} open={shareModalOpen} onClose={() => setShareModalOpen(false)} beforeCreate={saveCanvasProject} />}
                            {libTVImportOpen ? (
                                <Suspense fallback={null}>
                                    <LibTVImportDialog key={projectId} open projectId={projectId} viewport={viewport} viewportSize={size} onClose={() => setLibTVImportOpen(false)} onApply={applyImportedCanvas} />
                                </Suspense>
                            ) : null}
                            {tapNowImportOpen ? (
                                <Suspense fallback={null}>
                                    <TapNowImportDialog key={projectId} open projectId={projectId} viewport={viewport} viewportSize={size} onClose={() => setTapNowImportOpen(false)} onApply={applyImportedCanvas} />
                                </Suspense>
                            ) : null}

                            <CanvasStylePickerModal open={stylePickerOpen} value={activeStylePresetId} applying={styleApplying} onClose={() => setStylePickerOpen(false)} onSelect={selectCanvasStyle} />

                            <CanvasPrevisTemplateModal open={Boolean(previsTemplateRequest)} onClose={() => setPrevisTemplateRequest(null)} onSelect={(templateId) => createPrevisShot(templateId, previsTemplateRequest?.position)} />
                            <Modal
                                open={Boolean(pendingHomeTool)}
                                title={pendingHomeTool ? canvasToolLabels[pendingHomeTool] : ""}
                                okText={t("canvasToolsUi.addToCanvas")}
                                cancelText={t("timelineCancel")}
                                onCancel={() => setPendingHomeTool(null)}
                                onOk={() => {
                                    if (!pendingHomeTool) return;
                                    createNode(pendingHomeTool === "batch" ? CanvasNodeType.BatchTable : CanvasNodeType.MediaConversion);
                                    setPendingHomeTool(null);
                                }}
                            >
                                <p>{pendingHomeTool === "batch" ? t("followupUi.batchNodeHelp") : t("followupUi.transformNodeHelp")}</p>
                            </Modal>

                            <div className="relative flex min-h-0 min-w-0 flex-1">
                                <div className="relative min-w-0 flex-1 overflow-clip">
                                    <CanvasGestureRenderWindow containerRef={containerRef} viewport={viewport} size={size} query={queryGesturePreview} connections={displayConnections} filterConnections={filterSceneConnections}>
                                        {(gestureNodes, visibleDisplayConnections) => (
                                            <CanvasViewport
                                                interactive={!versions.preview}
                                                containerRef={containerRef}
                                                viewport={viewport}
                                                appearance={canvasAppearance}
                                                backgroundMode={backgroundMode}
                                                graphicsLayer={
                                                    <CanvasLeaferGraphicsLayer
                                                        containerRef={containerRef}
                                                        viewport={viewport}
                                                        theme={theme}
                                                        displayConnections={visibleDisplayConnections}
                                                        scriptScrollTopById={scriptScrollTopById}
                                                        batchScrollById={batchScrollById}
                                                        connectingParams={connectingParams}
                                                        batchConnectionPreview={batchConnectionPreview}
                                                        mouseWorld={mouseWorld}
                                                        nodeById={nodeById}
                                                        selectionBox={selectionBox}
                                                        selectedNodeBounds={selectedNodeBounds}
                                                    />
                                                }
                                                onViewportChange={handleViewportChange}
                                                onViewportPreviewChange={handleViewportPreviewChange}
                                                onCanvasMouseDown={handleCanvasMouseDown}
                                                boxSelectEnabled={canvasTool === "box-select"}
                                                onCanvasDoubleClick={handleCanvasDoubleClick}
                                                onCanvasDeselect={deselectCanvas}
                                                onContextMenu={handleCanvasContextMenu}
                                                onDrop={handleDrop}
                                                onFileDragEnter={handleFileDragEnter}
                                                onFileDragLeave={handleFileDragLeave}
                                                onFileDragOver={handleFileDragOver}
                                            >
                                                <CanvasNodeActionContext.Provider value={canvasNodeActions}>
                                                    <CanvasNodeGraphContext.Provider value={nodeGraphContext}>
                                                        <CanvasProjectWorldLayers
                                                            connectionApproach={connectionApproach}
                                                            isConnecting={Boolean(connectingParams || batchConnectionPreview)}
                                                            projectId={projectId}
                                                            viewportScale={viewport.k}
                                                            connectionLayerBounds={connectionLayerBounds}
                                                            displayConnections={visibleDisplayConnections}
                                                            selectedConnectionId={selectedConnectionId}
                                                            relatedConnectionIds={relatedHighlight.connectionIds}
                                                            scriptScrollTopById={scriptScrollTopById}
                                                            batchScrollById={batchScrollById}
                                                            connectionTargetNodeId={connectionTargetNodeId}
                                                            nodeById={nodeById}
                                                            candidateNodes={candidateNodes}
                                                            gestureNodes={gestureNodes}
                                                            immediateRenderNodeIds={immediateRenderNodeIds}
                                                            renderViewBounds={renderViewBounds}
                                                            nodeRenderLODById={nodeRenderLODById}
                                                            nodeStackOrder={nodeStackOrder}
                                                            frameChildrenById={frameChildrenById}
                                                            linkedFolderPreviewNodesById={linkedFolderPreviewNodesById}
                                                            dragPreview={dragPreview}
                                                            selectedNodeIds={selectedNodeIds}
                                                            frameDropTargetId={frameDropTargetId}
                                                            relatedNodeIds={relatedHighlight.nodeIds}
                                                            activeNodeId={activeNodeId}
                                                            selectionBox={selectionBox}
                                                            batchChildCountById={batchChildCountById}
                                                            collapsingBatchIds={collapsingBatchIds}
                                                            openingBatchIds={openingBatchIds}
                                                            batchMotionById={batchMotionById}
                                                            showImageInfo={showImageInfo}
                                                            resourceReferenceByNodeId={resourceReferenceByNodeId}
                                                            mentionReferencesByNodeId={mentionReferencesByNodeId}
                                                            mediaEffectsDisabledNodeId={emotionNodeId}
                                                            selectedNodeBounds={batchConnectionBounds}
                                                            batchSourceNodeIds={batchSourceNodeIds}
                                                            batchConnectionPreview={batchConnectionPreview}
                                                            isNodeDragging={isNodeDragging}
                                                            selectionBoundsElementRef={selectionBoundsElementRef}
                                                            renderCanvasNodeContent={renderCanvasNodeContent}
                                                            onConnectionSelect={handleConnectionSelect}
                                                            onConnectionContextMenu={handleConnectionContextMenu}
                                                            onNodeMouseDown={handleNodeMouseDown}
                                                            onNodeHoverStart={handleCanvasNodeHoverStart}
                                                            onNodeHoverEnd={handleCanvasNodeHoverEnd}
                                                            onConnectStart={handleConnectStart}
                                                            onNodeResize={handleNodeResize}
                                                            onToggleFrame={handleFrameToggle}
                                                            onFolderStyleChange={handleFolderStyleChange}
                                                            onFolderThemeChange={handleFolderThemeChange}
                                                            onNodeTitleChange={handleNodeTitleChange}
                                                            onNodeContextMenu={handleNodeContextMenu}
                                                            onNodeContentChange={handleNodeContentChange}
                                                            onToggleBatch={toggleBatchExpanded}
                                                            onSetBatchPrimary={setBatchPrimary}
                                                            onRetry={retryCanvasNode}
                                                            onReloadResource={reloadCanvasNodeResource}
                                                            onOpenTaskDetails={openCanvasNodeTaskDetails}
                                                            onViewImage={viewCanvasNodeImage}
                                                            onReplaceMedia={replaceCanvasNodeMedia}
                                                            onOpenTextEditor={openTextNodeEditor}
                                                            onOpenPrevis={editCanvasPrevis}
                                                            onOpenDrawing={openDrawingNode}
                                                            onStartBatchConnection={startBatchConnection}
                                                        />
                                                    </CanvasNodeGraphContext.Provider>
                                                </CanvasNodeActionContext.Provider>
                                            </CanvasViewport>
                                        )}
                                    </CanvasGestureRenderWindow>

                                    <CanvasCollaborationLayer key={`${canvasStorageScope}:${projectId}`} canvasId={projectId} enabled={projectLoaded && savedProject} containerRef={containerRef} nodesRef={nodesRef} viewportRef={viewportRef} />

                                    <CanvasActiveTaskPanel tasks={activeTasks} onCancelTask={cancelCanvasTask} topInset={focusMode ? "var(--space-3)" : "var(--canvas-topbar-offset)"} />

                                    {focusMode ? (
                                        <CanvasFocusModeBar
                                            syncStatus={<CanvasSyncStatus projectId={projectId} onLoadLatest={reloadLatestCanvasProject} onOpenVersions={openVersions} />}
                                            versionsOpen={versions.open}
                                            onToggleVersions={() => {
                                                closeAgent();
                                                versions.toggle();
                                            }}
                                            dockRevealed={focusDockRevealed}
                                            zoomPercent={viewport.k}
                                            onToggleDock={() => setFocusDockRevealed((value) => !value)}
                                            onExit={exitFocusMode}
                                            onZoomIn={zoomCanvasIn}
                                            onZoomOut={zoomCanvasOut}
                                            onFit={fitCanvasContent}
                                        />
                                    ) : null}

                                    <CanvasFileDropOverlay active={fileDropActive} theme={theme} />

                                    {emptyCanvasState}

                                    {!focusMode || focusDockRevealed ? (
                                        <CanvasToolbar
                                            selectedCount={selectedNodeIds.size}
                                            workspaceMode={workspaceMode}
                                            canvasTool={canvasTool}
                                            onToolChange={setCanvasTool}
                                            isProjectLinked={Boolean(shortDramaEnabled && currentProject?.projectId)}
                                            canUndo={historyState.canUndo}
                                            canRedo={historyState.canRedo}
                                            appearance={canvasAppearance}
                                            backgroundMode={backgroundMode}
                                            showImageInfo={showImageInfo}
                                            onAddImage={() => createNode(CanvasNodeType.Image)}
                                            onAddVideo={() => createNode(CanvasNodeType.Video)}
                                            onAddAudio={() => createNode(CanvasNodeType.Audio)}
                                            onAddText={() => createNode(CanvasNodeType.Text)}
                                            onChooseStyle={() => setStylePickerOpen(true)}
                                            onAddScript={() => createNode(CanvasNodeType.Script)}
                                            onAddFrame={() => createNode(CanvasNodeType.Frame)}
                                            onAddFolder={createFolder}
                                            onAddDrawing={() => createNode(CanvasNodeType.Drawing)}
                                            onAddExtensionNode={(type) => createNode(type)}
                                            onAddWorkflow={() => createNode(CanvasNodeType.Config)}
                                            onOpenPrevis={() => createPrevisShot("empty")}
                                            onUndo={undoCanvas}
                                            onRedo={redoCanvas}
                                            onUpload={() => handleUploadRequest()}
                                            onDelete={() => deleteNodes(new Set(selectedNodeIds))}
                                            onClear={() => setClearConfirmOpen(true)}
                                            onDeselect={deselectCanvas}
                                            onAppearanceChange={applyCanvasAppearance}
                                            onSaveAppearanceDefault={saveCanvasAppearanceDefault}
                                            onBackgroundModeChange={setBackgroundMode}
                                            onShowImageInfoChange={setShowImageInfo}
                                            onOpenWorkspace={() => setWorkspaceOpen((value) => !value)}
                                            onOpenMyAssets={() => {
                                                openAssetsAtPosition();
                                            }}
                                            onOpenProjectCharacters={() => openCharacterLibrary()}
                                            onOpenPoseLibrary={() => openPoseLibrary()}
                                            compact={dramaCanvas}
                                        />
                                    ) : null}
                                </div>
                            </div>

                            {angleNode?.metadata?.content ? (
                                <CanvasNodePanelOverlay
                                    node={angleNode}
                                    viewport={viewport}
                                    containerRef={containerRef}
                                    panelWidth={640}
                                    panelHeight={540}
                                    allowOverflow
                                    dragOffset={dragPreview?.nodeIds.has(angleNode.id) ? { x: dragPreview.x, y: dragPreview.y } : null}
                                    isDragging={isNodeDragging && Boolean(dragPreview?.nodeIds.has(angleNode.id))}
                                >
                                    <CanvasNodeAnglePanel
                                        dataUrl={angleNode.metadata.content}
                                        onClose={() => setAngleNodeId(null)}
                                        onConfirm={(params) => {
                                            void generateAngleNode(angleNode, params);
                                        }}
                                    />
                                </CanvasNodePanelOverlay>
                            ) : null}

                            {lightingNode?.metadata?.content ? (
                                <AppModal flush open centered title={null} closable={false} footer={null} width={720} onCancel={() => setLightingNodeId(null)}>
                                    <CanvasNodeLightingPanel
                                        dataUrl={lightingNode.metadata.content}
                                        onClose={() => setLightingNodeId(null)}
                                        onConfirm={(options, prompt) => {
                                            generateLightingNode(lightingNode, options, prompt);
                                        }}
                                    />
                                </AppModal>
                            ) : null}

                            {emotionNode?.metadata?.content && !isCanvasNodeMoving ? (
                                <CanvasEmotionWorkspace
                                    node={emotionNode}
                                    viewport={viewport}
                                    containerRef={containerRef}
                                    dragOffset={dragPreview?.nodeIds.has(emotionNode.id) ? { x: dragPreview.x, y: dragPreview.y } : null}
                                    isDragging={isNodeDragging && Boolean(dragPreview?.nodeIds.has(emotionNode.id))}
                                    onClose={() => setEmotionNodeId(null)}
                                    onConfirm={(payload: CanvasImageEmotionPayload) => {
                                        void generateEmotionNode(emotionNode, payload);
                                    }}
                                />
                            ) : null}

                            {dialogNode &&
                            !isCanvasImageSourceNode(dialogNode) &&
                            !dialogNode.metadata?.fileUpload &&
                            dialogNode.type !== CanvasNodeType.Script &&
                            dialogNode.type !== CanvasNodeType.BatchTable &&
                            dialogNode.type !== CanvasNodeType.Drawing &&
                            dialogNode.type !== CanvasNodeType.Panorama &&
                            !(dialogNode.metadata?.workflowKind === "character" && (dialogNode.metadata.characterAssetId || dialogNode.metadata.officialAssetId)) &&
                            !dialogNode.metadata?.previsSceneId &&
                            !selectionBox &&
                            !deferDragOverlays &&
                            !isCanvasNodeMoving ? (
                                <CanvasNodePanelOverlay
                                    node={dialogNode}
                                    viewport={viewport}
                                    containerRef={containerRef}
                                    allowOverflow={dialogNode.type !== CanvasNodeType.Config}
                                    dragOffset={dragPreview?.nodeIds.has(dialogNode.id) ? { x: dragPreview.x, y: dragPreview.y } : null}
                                    isDragging={isNodeDragging && Boolean(dragPreview?.nodeIds.has(dialogNode.id))}
                                >
                                    {renderCanvasNodePanel(dialogNode)}
                                </CanvasNodePanelOverlay>
                            ) : null}

                            {pendingConnectionCreate ? (
                                <CanvasConnectionCreateMenu
                                    pending={pendingConnectionCreate}
                                    viewport={viewport}
                                    viewportSize={size}
                                    containerRef={containerRef}
                                    canCreateDrawing={canCreateDrawingFromConnection}
                                    getDisabledReason={(type) => getConnectionCreateDisabledReason(type, pendingConnectionCreate)}
                                    onCreate={(type) => void createConnectedNode(type, pendingConnectionCreate)}
                                    onClose={cancelPendingConnectionCreate}
                                />
                            ) : null}

                            {connectionReplaceHover ? (
                                <div
                                    className="pointer-events-none fixed z-[var(--z-dialog-popover)] flex select-none items-center gap-1.5 rounded-full border border-white/15 bg-black/60 px-2.5 py-1 text-[11px] font-medium text-white/90 shadow-[0_8px_24px_rgba(0,0,0,0.4)] backdrop-blur-md transition-all"
                                    style={{
                                        left: connectionReplaceHover.clientX + 14,
                                        top: connectionReplaceHover.clientY + 14,
                                        transform: "translateY(-50%)",
                                    }}
                                >
                                    <ArrowLeftRight className="size-3 text-blue-400" />
                                    <span>{t("canvasToolsUi.releaseToReplace")}</span>
                                    <span className="rounded bg-white/15 px-1.5 py-0.5 text-[10px] font-semibold text-blue-200">@{connectionReplaceHover.referenceLabel}</span>
                                </div>
                            ) : null}

                            {selectedNodeBounds && !selectionBox && !isCanvasNodeMoving ? (
                                <CanvasProjectSelectionToolbar
                                    anchorRef={selectionBoundsElementRef}
                                    containerRef={containerRef}
                                    count={selectedNodeBounds.count}
                                    selectedVideoCount={selectedVideoNodes.length}
                                    mergingVideos={Boolean(mergeVideoProgress)}
                                    onAlign={alignSelectedNodes}
                                    onArrange={arrangeSelectedNodes}
                                    onCreateStoryboard={createStoryboardGroup}
                                    onCreateFrame={createFrameAroundSelection}
                                    onCreateReferenceGroup={createReferenceGroup}
                                    onBatchConnect={() => beginBatchConnectionMode(batchSourceNodeIds)}
                                    onMergeVideos={() => void mergeSelectedVideos()}
                                    onCompareImages={selectedNodeIds.size === 2 && selectionImages.length === 2 ? () => setComparedImageIds(selectionImages.map((node) => node.id)) : undefined}
                                    onSendSelectionToAgent={() => sendSelectionToAgent()}
                                />
                            ) : null}

                            {uploadStatus ? <CanvasUploadStatusToast status={uploadStatus} theme={theme} /> : null}
                            {mergeVideoProgress ? <CanvasMergeStatusToast progress={mergeVideoProgress} theme={theme} /> : null}
                            {lastAgentChange ? (
                                <CanvasOperationChangeToast
                                    change={lastAgentChange}
                                    theme={theme}
                                    onView={viewLastAgentChange}
                                    onUndo={() => {
                                        undoAgentOps();
                                    }}
                                    onClose={dismissLastAgentChange}
                                />
                            ) : null}

                            <CanvasNodeToolbar
                                onRotateImage={(node, direction) => void rotateImageNode(node.id, direction)}
                                onCreateEditCopy={(node) => duplicateNode(node.id, "linked-copy")}
                                rotatingImage={rotatingNodeId !== null}
                                onPrevis={sendImageToPrevisAgent}
                                onAdoptToDrama={drama.active ? drama.openAdopt : undefined}
                                onRefreshFromDrama={toolbarNode && drama.staleNodeIds.has(toolbarNode.id) ? drama.refreshNode : undefined}
                                onVersions={openCanvasNodeVersions}
                                node={isCanvasNodeMoving || deferDragOverlays || nodeImageSettingsOpen || emotionNodeId || angleNodeId ? null : toolbarNode}
                                workspaceMode={workspaceMode}
                                viewport={viewport}
                                containerRef={containerRef}
                                onKeep={keepNodeToolbar}
                                onLeave={hideNodeToolbar}
                                onInfo={(node) => (node.metadata?.workflowKind === "character" && (node.metadata.characterAssetId || node.metadata.officialAssetId) ? openTextNodeEditor(node) : setInfoNodeId(node.id))}
                                onEditText={openTextNodeEditor}
                                onDecreaseFont={(node) => handleFontSizeChange(node.id, Math.max(10, (node.metadata?.fontSize || 14) - 2))}
                                onIncreaseFont={(node) => handleFontSizeChange(node.id, Math.min(32, (node.metadata?.fontSize || 14) + 2))}
                                onToggleDialog={(node) => setDialogNodeId((current) => (current === node.id ? null : node.id))}
                                onGenerateImage={generateImageFromTextNode}
                                onUpload={(node) => handleUploadRequest(node.id)}
                                onDownload={downloadNodeImage}
                                onDownloadSubtitles={(node) => {
                                    const entries = node.metadata?.subtitleEntries;
                                    if (entries?.length) saveAs(new Blob([serializeSrtEntries(entries)], { type: "application/x-subrip;charset=utf-8" }), `${node.title || "字幕"}.srt`);
                                }}
                                onSaveAsset={(node) => void saveNodeAsset(node)}
                                onAnnotate={(node) => setAnnotationNodeId(node.id)}
                                onAnnotationEdit={openAnnotationEditNode}
                                onRegionEdit={(node) => setRegionEditNodeId(node.id)}
                                onRemoveBackground={openBackgroundRemoval}
                                onLayerDecomposition={openLayerDecomposition}
                                onTextEdit={openTextEditNode}
                                onEmotion={(node) => {
                                    setDialogNodeId(null);
                                    setEmotionNodeId((current) => (current === node.id ? null : node.id));
                                }}
                                onPortraitTexture={openPortraitTextureEditor}
                                onCrop={(node) => setCropNodeId(node.id)}
                                onSplit={(node, params) => void splitImageNode(node, params)}
                                onUpscale={(node) => setUpscaleNodeId(node.id)}
                                onSuperResolve={(node) => setSuperResolveNodeId(node.id)}
                                onAngle={(node) => {
                                    setDialogNodeId(null);
                                    setAngleNodeId((current) => (current === node.id ? null : node.id));
                                }}
                                onLighting={(node) => {
                                    setDialogNodeId(null);
                                    setLightingNodeId((current) => (current === node.id ? null : node.id));
                                }}
                                onPanorama={openPanoramaConfig}
                                onViewImage={(node) => setPreviewNodeId(node.id)}
                                onExtractVideoFrames={openVideoFrameExtractor}
                                onExtractAudioFromVideo={(node) => void extractAudioFromVideo(node)}
                                onRemakeVideo={remakeVideo}
                                onTrimVideoSegments={openVideoSegmentExtractor}
                                onSubtitles={(node) => setSubtitleNodeId(node.id)}
                                onTimeline={(node) => setTimelineNodeId(node.id)}
                                onEnhanceVideo={videoProcessingModels.enhance.length ? (node) => openVideoProcessing(node, "enhance") : undefined}
                                onDepthVideo={videoProcessingModels.depth.length ? (node) => openVideoProcessing(node, "depth") : undefined}
                                extractingVideoFrames={toolbarNode?.id === extractingVideoFramesNodeId}
                                extractingAudio={segmentRunningMode === "audio"}
                                trimmingVideo={segmentRunningMode === "video"}
                                onNineGrid={(node, id, label, icon) => void generateNineGridNode(node, id, label, icon)}
                                onReversePrompt={createImageReversePromptNodes}
                                onRetry={retryCanvasNode}
                                onToggleFreeResize={(node) => toggleNodeFreeResize(node.id)}
                                onToggleLocked={(node) => toggleNodeLocked(node.id)}
                                onDelete={(node) => deleteNodes(new Set([node.id]))}
                            />

                            {isMiniMapOpen && !focusMode ? <Minimap nodes={nodes} viewport={viewport} viewportSize={size} canvasContainerRef={containerRef} onViewportPreviewChange={previewViewport} onViewportChange={handleViewportChange} /> : null}

                            {!focusMode ? (
                                <CanvasOverlayLayerContainer
                                    overlayId="asset-tray"
                                    fallbackZIndex="var(--z-panel)"
                                    className="canvas-workspace-zoom-controls absolute bottom-[calc(var(--canvas-inset-y)+var(--space-16))] left-[var(--canvas-inset-x)] flex items-end gap-2 lg:bottom-[var(--canvas-inset-y)]"
                                    onMouseDown={(event) => event.stopPropagation()}
                                    onPointerDown={(event) => event.stopPropagation()}
                                    onWheel={(event) => event.stopPropagation()}
                                >
                                    <CanvasZoomControls
                                        scale={viewport.k}
                                        containerRef={containerRef}
                                        onScaleChange={setZoomScale}
                                        onFitContent={fitCanvasContent}
                                        onAutoArrange={autoArrangeCanvasNodes}
                                        hideNodeConnections={hideNodeConnections}
                                        onHideNodeConnectionsChange={setHideNodeConnections}
                                        isMiniMapOpen={isMiniMapOpen}
                                        onToggleMiniMap={() => setIsMiniMapOpen((value) => !value)}
                                        onOpenShortcuts={() => setShortcutRequestNonce((value) => value + 1)}
                                    />
                                </CanvasOverlayLayerContainer>
                            ) : null}

                            <CanvasProjectContextMenu
                                onAdoptToDrama={drama.active ? drama.openAdopt : undefined}
                                onCreateDramaFromStoryboard={shortDramaEnabled ? createDramaFromStoryboard : undefined}
                                menu={contextMenu}
                                node={contextMenuNode}
                                workspaceMode={workspaceMode}
                                isProjectLinked={Boolean(currentProject?.projectId)}
                                canUndo={historyState.canUndo}
                                canRedo={historyState.canRedo}
                                canPaste={hasCopiedNodes || Boolean(navigator.clipboard)}
                                selectedCount={selectedNodeIds.size}
                                downloadableSelectionCount={contextMenu && selectedNodeIds.size > 1 ? nodes.filter((node) => selectedNodeIds.has(node.id) && canDownloadCanvasNodeMedia(node)).length : 0}
                                onDownloadSelection={() => void downloadNodesMedia(nodesRef.current.filter((node) => selectedNodeIds.has(node.id)))}
                                screenToCanvas={screenToCanvas}
                                onClose={() => setContextMenu(null)}
                                onAddNode={(type, position) => createNode(type, position)}
                                onAddFolder={createFolder}
                                onChooseStyle={() => setStylePickerOpen(true)}
                                onOpenPrevis={(position) => createPrevisShot("empty", position)}
                                onUpload={(nodeId, position) => handleUploadRequest(nodeId, position)}
                                onOpenAssets={openAssetsAtPosition}
                                onOpenProjectCharacters={(position) => openCharacterLibrary(position)}
                                onOpenPoseLibrary={(position) => openPoseLibrary(position)}
                                onUndo={undoCanvas}
                                onRedo={redoCanvas}
                                onPaste={pasteAtPosition}
                                onCopyNode={(nodeId) => copyNodesToClipboard(new Set([nodeId]))}
                                onCreateGenerationCopy={(nodeId) => duplicateNode(nodeId, "copy")}
                                onDuplicate={duplicateNode}
                                onDeleteNode={(nodeId) => deleteNodes(new Set([nodeId]))}
                                onDeleteConnection={deleteConnection}
                                onSaveAsset={(node) => {
                                    void saveNodeAsset(node);
                                }}
                                onViewMedia={(node) => setPreviewNodeId(node.id)}
                                onOpenVersions={openCanvasNodeVersions}
                                onEditText={openTextNodeEditor}
                                onOpenDrawing={openDrawingNode}
                                onGenerateImage={generateImageFromTextNode}
                                onCopyContent={(node) => {
                                    void copyNodeContentToClipboard(node);
                                }}
                                onCopyMediaUrl={(node) => {
                                    void copyNodeMediaUrlToClipboard(node);
                                }}
                                onUploadToArkPrivateAsset={confirmUploadNodeImageToArkPrivateAsset}
                                onSetAssetCategory={(nodeId, assetCategory) => handleConfigNodeChange(nodeId, { assetCategory })}
                                onSetFrameColor={(nodeId, color) => {
                                    const target = nodesRef.current.find((item) => item.id === nodeId);
                                    if (!target || target.type !== CanvasNodeType.Frame || target.metadata?.folder) return;
                                    setNodes((current) => {
                                        const next = current.map((item) =>
                                            item.id === nodeId
                                                ? {
                                                      ...item,
                                                      metadata: {
                                                          ...item.metadata,
                                                          frame: {
                                                              ...item.metadata?.frame,
                                                              collapsed: Boolean(item.metadata?.frame?.collapsed),
                                                              expandedWidth: item.metadata?.frame?.expandedWidth || item.width,
                                                              expandedHeight: item.metadata?.frame?.expandedHeight || item.height,
                                                              color,
                                                          },
                                                      },
                                                  }
                                                : item,
                                        );
                                        nodesRef.current = next;
                                        return next;
                                    });
                                }}
                                onToggleFrame={(node) => handleFrameToggle(node.id)}
                                onSpreadSelection={spreadSelectedNodes}
                                onCopySelection={copySelectedNodes}
                                onDeleteSelection={() => deleteNodes(selectedNodeIds)}
                                onSendToAgent={() => sendSelectionToAgent(contextMenu?.type === "node" && selectedNodeIds.size <= 1 ? contextMenu.nodeId : undefined)}
                            />

                            <CanvasUploadModal open={uploadModalOpen} onClose={closeUploadModal} onUpload={handleUploadFiles} />

                            <input ref={imageInputRef} type="file" accept="image/*,video/*,audio/mpeg,audio/wav,audio/x-wav,.mp3,.wav" className="hidden" onChange={handleImageInputChange} />

                            <CanvasNodeInfoModal node={infoNode} open={Boolean(infoNode)} onClose={() => setInfoNodeId(null)} onMetadataChange={handleConfigNodeChange} />

                            {subtitleNode ? (
                                <CanvasSubtitleDialog
                                    node={subtitleNode}
                                    open={Boolean(subtitleNode)}
                                    projectId={projectId}
                                    config={effectiveConfig}
                                    onClose={() => setSubtitleNodeId(null)}
                                    onSave={(nodeId, patch) => {
                                        handleConfigNodeChange(nodeId, patch);
                                        const currentTimeline = currentProject?.timeline;
                                        if (currentTimeline) {
                                            const next = syncNodeSubtitlesToTimeline(currentTimeline, nodeId, patch.subtitleEntries || []);
                                            if (next !== currentTimeline) updateProject(projectId, { timeline: next });
                                        }
                                    }}
                                />
                            ) : null}

                            {frameNode ? <CanvasVideoFrameDialog node={frameNode} open={Boolean(frameNode)} onClose={closeFrameDialog} onConfirm={(params) => void extractVideoFrames(frameNode, params)} /> : null}

                            {segmentNode && segmentDialogMode ? (
                                <CanvasVideoSegmentDialog
                                    node={segmentNode}
                                    nodes={nodes}
                                    connections={connections}
                                    open={Boolean(segmentNode && segmentDialogMode)}
                                    mode={segmentDialogMode}
                                    config={effectiveConfig}
                                    timeline={currentProject?.timeline || null}
                                    onClose={closeSegmentDialog}
                                    onConfirm={(params) => void handleSegmentConfirm(segmentNode, params)}
                                />
                            ) : null}

                            {timelineNode ? (
                                <CanvasTimelineDialog
                                    projectId={projectId}
                                    onPersist={() => saveCanvasProject({ requireRemote: true })}
                                    node={timelineNode}
                                    open={Boolean(timelineNode)}
                                    nodes={nodes}
                                    timeline={timelineNode.metadata?.timelineComposition ?? currentProject?.timeline ?? null}
                                    selectedNodeIds={selectedNodeIds}
                                    dramaAspectRatio={drama.active ? drama.summary?.production.settings.aspectRatio : undefined}
                                    onClose={() => setTimelineNodeId(null)}
                                    onOpenSubtitleDialog={(subNodeId) => {
                                        setTimelineNodeId(null);
                                        setSubtitleNodeId(subNodeId);
                                    }}
                                    onSave={(next) => (timelineNode.metadata?.timelineComposition ? handleConfigNodeChange(timelineNode.id, { timelineComposition: next }) : updateProject(projectId, { timeline: next }))}
                                    onSaveSubtitles={(subNodeId, entries) =>
                                        handleConfigNodeChange(subNodeId, {
                                            subtitleEntries: entries,
                                            ...(entries.length ? {} : { subtitleHighlights: [] }),
                                            subtitleUpdatedAt: new Date().toISOString(),
                                        })
                                    }
                                    onOpenAssetLibrary={openTimelineAssetLibrary}
                                    onOpenProjectAssets={() => openProjectAssets("all", undefined, "timeline")}
                                    onUploadLocalFiles={uploadTimelineMedia}
                                    addNodeToTimelineRef={timelineAddNodeRef}
                                    addMediaToTimelineRef={timelineMediaAddRef}
                                    onCreateAssembledNode={async (blob, title) => {
                                        const output = await createVideoNodeFromBlob(blob, title);
                                        if (output && timelineNode.metadata?.timelineComposition) {
                                            const media = output.metadata;
                                            handleConfigNodeChange(timelineNode.id, {
                                                content: media?.content,
                                                storageKey: media?.storageKey,
                                                naturalWidth: media?.naturalWidth,
                                                naturalHeight: media?.naturalHeight,
                                                durationMs: media?.durationMs,
                                                status: "success",
                                            });
                                        }
                                        return output;
                                    }}
                                />
                            ) : null}
                            {videoProcessingNode && videoProcessingDialog?.operation === "enhance" ? (
                                <CanvasVideoEnhanceDialog
                                    node={videoProcessingNode}
                                    open
                                    config={effectiveConfig}
                                    onClose={() => setVideoProcessingDialog(null)}
                                    onConfirm={(params) => void processVideoNode(videoProcessingNode, { operation: "enhance", params })}
                                />
                            ) : null}
                            {videoProcessingNode && videoProcessingDialog?.operation === "depth" ? (
                                <CanvasVideoDepthDialog
                                    node={videoProcessingNode}
                                    open
                                    config={effectiveConfig}
                                    onClose={() => setVideoProcessingDialog(null)}
                                    onConfirm={(params) => void processVideoNode(videoProcessingNode, { operation: "depth", params })}
                                />
                            ) : null}

                            <CanvasCharacterReferenceModal
                                node={characterReferenceNode}
                                canvasNodes={nodes}
                                open={Boolean(characterReferenceNode)}
                                onClose={() => setCharacterReferenceNodeId(null)}
                                onUpdated={(detail) => setNodes((current) => refreshCanvasCharacterReferenceNodes(current, [{ ...detail.asset, character: detail.character }]))}
                            />

                            {textEditorNode ? (
                                <Suspense fallback={null}>
                                    <CanvasTextEditorModal
                                        node={textEditorNode}
                                        open={Boolean(textEditorNode)}
                                        onClose={() => setTextEditorNodeId(null)}
                                        onFormatChange={(nodeId, textFormat) =>
                                            setNodes((current) => current.map((node) => (node.id === nodeId && !node.metadata?.locked ? { ...node, type: CanvasNodeType.Text, metadata: { ...node.metadata, textFormat } } : node)))
                                        }
                                        onChange={(nodeId, title, content, richText) => {
                                            setNodes((current) => {
                                                const next = current.map((node) => (node.id === nodeId ? { ...node, title, metadata: { ...node.metadata, ...(title !== node.title ? { manualTitle: true } : {}), content, richText } } : node));
                                                nodesRef.current = next;
                                                return next;
                                            });
                                        }}
                                    />
                                </Suspense>
                            ) : null}

                            {comparedImages.length === 2 ? (
                                <Suspense fallback={null}>
                                    <CanvasImageCompareModal nodes={comparedImages as [CanvasNodeData, CanvasNodeData]} onClose={() => setComparedImageIds(null)} />
                                </Suspense>
                            ) : null}

                            {drawingNode ? (
                                <Suspense
                                    fallback={
                                        <div className="fixed inset-0 z-[var(--z-toast)] grid place-items-center px-5" style={{ background: theme.canvas.background, color: theme.node.text }}>
                                            <WorkspaceState icon="loading" title={t("canvasToolsUi.loadingDrawingEditor")} description={t("canvasToolsUi.preparingDrawingCanvas")} />
                                        </div>
                                    }
                                >
                                    <CanvasDrawingEditorModal
                                        node={drawingNode}
                                        projectId={projectId}
                                        open={Boolean(drawingNode)}
                                        onClose={() => setDrawingNodeId(null)}
                                        onSaved={(nodeId, summary) => {
                                            setNodes((current) =>
                                                current.map((node) =>
                                                    node.id === nodeId
                                                        ? {
                                                              ...node,
                                                              metadata: {
                                                                  ...node.metadata,
                                                                  drawingEngine: summary.engine,
                                                                  drawingRevision: summary.revision,
                                                                  drawingUpdatedAt: summary.updatedAt,
                                                                  drawingShapeCount: summary.shapeCount,
                                                                  drawingPageCount: summary.pageCount,
                                                              },
                                                          }
                                                        : node,
                                                ),
                                            );
                                            message.success(t("canvasToolsUi.drawingSaved"));
                                        }}
                                    />
                                </Suspense>
                            ) : null}

                            <AiArtCritiqueModal
                                startRequestId={artCritiqueStartRequest && artCritiqueStartRequest.nodeId === artCritiqueNode?.id ? artCritiqueStartRequest.id : undefined}
                                restartRequested={artCritiqueStartRequest?.nodeId === artCritiqueNode?.id && artCritiqueStartRequest?.restart}
                                onRunningChange={(running) => {
                                    artCritiqueRunningRef.current = running;
                                }}
                                node={artCritiqueNode}
                                upstreamNodes={artCritiqueInputs}
                                open={Boolean(artCritiqueNode)}
                                onClose={() => setArtCritiqueNodeId(null)}
                                onUpdateState={(nodeId, state) => handleConfigNodeChange(nodeId, { artCritique: state })}
                            />

                            <CanvasPanoramaConfigModal
                                open={Boolean(panoramaConfigNodeId)}
                                onCancel={() => setPanoramaConfigNodeId(null)}
                                onConfirm={(composedPrompt, config) => {
                                    const node = nodes.find((n) => n.id === panoramaConfigNodeId);
                                    if (node) {
                                        createPanoramaViewerWithConfig(node, composedPrompt, config);
                                    }
                                }}
                                onCopyPrompt={(prompt) => {
                                    void navigator.clipboard?.writeText(prompt).then(() => message.success(t("canvasToolsUi.panoramaPromptCopied")));
                                }}
                                previewImageUrl={panoramaConfigNodeId ? nodes.find((n) => n.id === panoramaConfigNodeId)?.metadata?.content : undefined}
                                nodes={nodes}
                            />

                            <CanvasScriptEditor
                                onEditAssets={(rowId) => activeScriptNode && setStoryboardAssetTarget({ nodeId: activeScriptNode.id, rowId })}
                                node={activeScriptNode}
                                nodes={nodes}
                                connections={connections}
                                batch={activeScriptNode ? visibleGenerationBatch(activeScriptNode) : undefined}
                                open={Boolean(activeScriptNode)}
                                onClose={() => setScriptEditorNodeId(null)}
                                onFocusOutput={(nodeId) => {
                                    setScriptEditorNodeId(null);
                                    focusCanvasNode(nodeId);
                                }}
                                onRetryBatchItem={(batchId, itemId) => activeScriptNode && retryFailedBatchItems(activeScriptNode.id, batchId, itemId)}
                                onStopBatch={(batchId) => activeScriptNode && stopRemainingBatchItems(activeScriptNode.id, batchId)}
                                onUpdateRows={(rows) => activeScriptNode && replaceScriptRows(activeScriptNode.id, rows)}
                                onViewsChange={(storyboardViews, storyboardActiveViewId) => activeScriptNode && handleConfigNodeChange(activeScriptNode.id, { storyboardViews, storyboardActiveViewId })}
                                onVisibleColumnsChange={(visibleColumns: StoryboardColumn[]) => {
                                    if (!activeScriptNode || !visibleColumns.length) return;
                                    setNodes((prev) =>
                                        prev.map((node) =>
                                            node.id === activeScriptNode.id
                                                ? {
                                                      ...node,
                                                      metadata: {
                                                          ...node.metadata,
                                                          storyboardViews: node.metadata?.storyboardViews?.map((view) => (view.id === (node.metadata?.storyboardActiveViewId || "default") ? { ...view, visibleColumns } : view)),
                                                          storyboard: { rows: node.metadata?.storyboard?.rows || [], visibleColumns, referenceNodeIds: node.metadata?.storyboard?.referenceNodeIds || [] },
                                                      },
                                                  }
                                                : node,
                                        ),
                                    );
                                }}
                                onGenerateImages={(rowIds) => activeScriptNode && void generateScriptImages(activeScriptNode.id, rowIds)}
                                onGenerateVideos={(rowIds) => {
                                    if (!activeScriptNode) return;
                                    if (activeScriptNode.metadata?.storyboardVideoInputMode === "keyframe") void generateScriptVideos(activeScriptNode.id, rowIds);
                                    else void createAndGenerateScriptVideos(activeScriptNode.id, rowIds);
                                }}
                                onVideoInputModeChange={(storyboardVideoInputMode) => activeScriptNode && handleConfigNodeChange(activeScriptNode.id, { storyboardVideoInputMode })}
                            />

                            {previsNodeId && activePrevisScene ? (
                                <Suspense fallback={null}>
                                    <CanvasPrevisWorkbench
                                        open
                                        canvasId={projectId}
                                        scene={activePrevisScene}
                                        imageNodes={nodes.filter((node) => node.type === CanvasNodeType.Image && Boolean(node.metadata?.content || node.metadata?.storageKey))}
                                        initialMode={dramaPrevisEntry?.nodeId === previsNodeId ? dramaPrevisEntry.mode : undefined}
                                        onClose={() => {
                                            setPrevisNodeId(null);
                                            setDramaPrevisEntry(null);
                                        }}
                                        onChange={savePrevisScene}
                                        onApply={applyPrevisOutput}
                                        onAddToCanvas={addPrevisToCanvas}
                                        onDeleteImageNode={(nodeId) => deleteNodes(new Set([nodeId]))}
                                        onFlush={async () => {
                                            await flushCanvasStorePersistence();
                                            await saveRemoteUserDataNow(projectId);
                                        }}
                                        onboardingScope={previsOnboardingScope}
                                    />
                                </Suspense>
                            ) : null}

                            <CanvasVersionCompareModal
                                open={Boolean(versionCompareRootId)}
                                versions={versionCompareNodes}
                                onClose={() => setVersionCompareRootId(null)}
                                onSetPrimary={setPrimaryVersion}
                                onFocus={(nodeId) => {
                                    setVersionCompareRootId(null);
                                    focusCanvasNode(nodeId);
                                }}
                            />

                            <CanvasProjectMediaDialogs
                                cropNode={cropNode}
                                annotationNode={annotationNode}
                                annotationEditNode={annotationEditNodeId ? nodeById.get(annotationEditNodeId) || null : null}
                                regionEditNode={regionEditNode}
                                imageEditNode={imageEditNode}
                                layerDecompositionNode={layerDecompositionNodeId ? nodeById.get(layerDecompositionNodeId) || null : null}
                                textEditNode={textEditNodeId ? nodeById.get(textEditNodeId) || null : null}
                                imageEditPreset={imageEditPreset}
                                upscaleNode={upscaleNode}
                                onCloseCrop={() => setCropNodeId(null)}
                                onCloseAnnotation={() => setAnnotationNodeId(null)}
                                onCloseAnnotationEdit={() => setAnnotationEditNodeId(null)}
                                onCloseRegionEdit={() => setRegionEditNodeId(null)}
                                onCloseImageEdit={() => {
                                    setImageEditNodeId(null);
                                    setImageEditPreset(null);
                                }}
                                onCloseLayerDecomposition={() => setLayerDecompositionNodeId(null)}
                                onCloseTextEdit={() => setTextEditNodeId(null)}
                                onCloseUpscale={() => setUpscaleNodeId(null)}
                                onCrop={(node, crop) => void cropImageNode(node, crop)}
                                onAnnotate={(node, dataUrl) => void saveAnnotatedImageNode(node, dataUrl)}
                                onAnnotationEdit={(node, payload) => void editAnnotatedImageNode(node, payload)}
                                onRegionEdit={(node, payload) => void regionEditImageNode(node, payload)}
                                onImageOperation={(node, payload) => void editImageNode(node, payload)}
                                onLayerDecomposition={(node, payload) => void decomposeImageLayers(node, payload)}
                                onDetectText={() => {
                                    const node = textEditNodeId ? nodeById.get(textEditNodeId) : null;
                                    return node ? detectImageText(node) : Promise.reject(new Error("图片节点已不存在"));
                                }}
                                onTextEdit={(node, payload) => void editTextImageNode(node, payload)}
                                onUpscale={(node, params) => void upscaleImageNode(node, params)}
                                config={effectiveConfig}
                            />

                            <CanvasProjectStatusDialogs
                                theme={theme}
                                task={taskDetail}
                                taskLogs={taskDetailLogs}
                                taskLoading={taskDetailLoading}
                                onCloseTask={() => setTaskDetail(null)}
                                onCancelTask={cancelCanvasTask}
                                superResolveNode={superResolveNode}
                                onCloseSuperResolve={() => setSuperResolveNodeId(null)}
                                previewNode={previewNode}
                                onClosePreview={() => setPreviewNodeId(null)}
                                clearConfirmOpen={clearConfirmOpen}
                                onCancelClear={() => setClearConfirmOpen(false)}
                                onConfirmClear={clearCanvas}
                            />

                            <BatchGenerationSettingsDialog open={batchGenDialogOpen} config={batchGenDialogConfig} rowCount={batchGenDialogRowCount} concurrency={batchGenDialogConcurrency} onClose={closeBatchGenDialog} onConfirm={confirmBatchGenDialog} />

                            {storyboardAssetNode && storyboardAssetRow ? (
                                <StoryboardAssetPickerModal
                                    key={`${storyboardAssetNode.id}:${storyboardAssetRow.id}`}
                                    nodes={nodes}
                                    bindings={storyboardAssetBindings}
                                    shotNumber={storyboardAssetRow.shotNumber}
                                    detail={linkedProjectQuery.data}
                                    onClose={() => setStoryboardAssetTarget(null)}
                                    onSave={(bindings) => {
                                        const result = replaceStoryboardRowAssets(nodesRef.current, connectionsRef.current, storyboardAssetNode.id, storyboardAssetRow.id, bindings);
                                        nodesRef.current = result.nodes;
                                        connectionsRef.current = result.connections;
                                        setNodes(result.nodes);
                                        setConnections(result.connections);
                                        setStoryboardAssetTarget(null);
                                    }}
                                    onImport={async (payloads) => {
                                        const existing: CanvasNodeData[] = [];
                                        const pending = payloads.filter((payload) => {
                                            const node = payload.assetId ? nodesRef.current.find((item) => item.metadata?.assetId === payload.assetId || item.metadata?.characterAssetId === payload.assetId) : undefined;
                                            if (node) existing.push(node);
                                            return !node;
                                        });
                                        const imported = await Promise.all(
                                            pending.map(async (payload, index) => {
                                                const resourceId = payload.kind !== "text" && payload.kind !== "character" ? resourceIdFromStorageKey(payload.storageKey) : "";
                                                const resource = resourceId ? await getResource(resourceId) : undefined;
                                                const input =
                                                    resource && payload.kind !== "text" && payload.kind !== "character"
                                                        ? {
                                                              ...payload,
                                                              width: resource.width ?? ("width" in payload ? payload.width : undefined),
                                                              height: resource.height ?? ("height" in payload ? payload.height : undefined),
                                                              durationMs: resource.durationMs ?? ("durationMs" in payload ? payload.durationMs : undefined),
                                                              bytes: resource.size,
                                                              mimeType: resource.mimeType,
                                                          }
                                                        : payload;
                                                const node = await createAssetPayloadNode(input, { x: storyboardAssetNode.position.x - 440, y: storyboardAssetNode.position.y + index * 260 });
                                                const source = linkedProjectQuery.data?.assets.find((asset) => asset.id === payload.assetId);
                                                return source ? { ...node, metadata: { ...node.metadata, assetCategory: normalizeAssetCategory(source.category) } } : node;
                                            }),
                                        );
                                        if (!nodesRef.current.some((node) => node.id === storyboardAssetNode.id && node.metadata?.storyboard?.rows.some((row) => row.id === storyboardAssetRow.id))) throw new Error("镜头已不存在，请重新选择");
                                        if (imported.length) {
                                            nodesRef.current = [...nodesRef.current, ...imported];
                                            setNodes(nodesRef.current);
                                        }
                                        return [...existing, ...imported];
                                    }}
                                />
                            ) : null}
                            <AssetPickerModal open={assetPickerOpen} multiple={assetInsertScope === "canvas"} onInsert={handleLibraryAssetsInsert} onClose={closeAssetPicker} />
                            <CanvasPoseLibraryModal open={Boolean(poseLibraryRequest)} onClose={() => setPoseLibraryRequest(null)} onInsert={(payloads) => handleAssetsInsert(payloads, poseLibraryRequest?.position)} />
                            <CanvasCharacterLibraryModal
                                open={characterLibraryOpen}
                                imageResourceId={resourceIdFromStorageKey(selectedCharacterImage?.metadata?.storageKey) || undefined}
                                audioResourceId={resourceIdFromStorageKey(selectedCharacterAudio?.metadata?.storageKey) || undefined}
                                imageTitle={selectedCharacterImage?.title}
                                audioTitle={selectedCharacterAudio?.title}
                                onClose={() => setCharacterLibraryOpen(false)}
                                onInsert={async (payloads) => {
                                    await handleProjectAssetsInsert(payloads, characterLibraryPosition);
                                }}
                            />
                            <CanvasProjectAssetModal
                                open={projectAssetOpen}
                                detail={linkedProjectQuery.data}
                                initialCategory={projectAssetInitialCategory}
                                initialFolderId={projectAssetInitialFolderId}
                                onClose={closeProjectAssets}
                                onInsert={handleTimelineProjectAssetsInsert}
                                onInsertFolder={projectAssetScope === "canvas" ? handleProjectFolderInsert : undefined}
                            />
                            <CanvasMediaVersionModal
                                node={mediaVersionNodeId ? nodeById.get(mediaVersionNodeId) || null : null}
                                onClose={() => setMediaVersionNodeId(null)}
                                onAdopt={adoptNodeMediaVersion}
                                onDelete={deleteNodeMediaVersion}
                                onExtract={(nodeId, versionId) => {
                                    const extractedId = extractNodeMediaVersion(nodeId, versionId);
                                    if (extractedId) {
                                        setMediaVersionNodeId(null);
                                        locateAssetNode(extractedId);
                                    }
                                }}
                            />
                            {canvasView === "assets" && !versions.preview ? (
                                <div className="canvas-asset-view-layer absolute bottom-0 left-0 right-0 top-[var(--canvas-topbar-h)] z-[var(--z-panel-floating)] flex min-h-0">
                                    <CanvasAssetView nodes={nodes} onLocate={locateAssetNode} onRename={renameAssetNodes} onPromoteVersion={promoteAssetVersion} onDownloadMedia={downloadNodeImage} onUpload={() => handleUploadRequest()} />
                                </div>
                            ) : null}
                        </section>
                        {versions.preview ? <CanvasVersionPreview key={versions.preview.key} preview={versions.preview} onReturn={versions.returnToCurrent} onShowVersions={versions.show} /> : null}
                    </div>
                    {drama.summary && dramaAdoptNode ? <CanvasDramaAdoptModal node={dramaAdoptNode} nodes={nodes} summary={drama.summary} cast={drama.cast} onClose={drama.closeAdopt} onAdopted={drama.markAdopted} /> : null}
                </CanvasOverlayLayerProvider>
                <CanvasVersionHistory history={versions} />
            </main>
        </CanvasNodeResizeMotionProvider>
    );
}
