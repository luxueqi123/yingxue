import { previsPoseLabel, previsBoneLabel, previsActorArchetypeLabel } from "@/lib/canvas/previs/previs-scene";
import { dropPrevisObjectToGround, groundPrevisScene } from "@/lib/canvas/previs/previs-grounding";
import { Aperture, Circle as RecordDot, Layers, MonitorUp, Keyboard } from "lucide-react";
import { PrevisAddDialog, type PrevisAddKind, type PrevisAddResult } from "./previs-add-dialog";
import { movePrevisPathKeyframe } from "@/lib/canvas/previs/previs-path";
import { useInterfaceTranslation } from "@/stores/use-interface-locale-store";
import { cameraMoveOptions, poseEditBones, BoneRotationFields, shotSizeOptions, ObjectInspector, LightInspector, ShotInspector } from "./previs-inspectors";
import { snapPrevisTime, advancePrevisPlayhead, resolvePrevisKeyframeRecord, resolvePrevisObjectTransformEdit, resolvePrevisCameraMoveKeyframes, resolvePrevisCameraAlignment } from "@/lib/canvas/previs/previs-animation-semantics";
import {
    interpolatePrevisTransform,
    touchPrevisScene,
    createPrevisObject,
    createPrevisActor,
    PREVIS_ACTOR_COLORS,
    resolvePrevisActorColor,
    createPrevisModel,
    createPrevisBillboard,
    createPrevisCamera,
    createPrevisLight,
    upsertPrevisBoneKeyframe,
    removePrevisSceneKeyframe,
    setPrevisSceneKeyframeEasing,
    previsActorProfileForArchetype,
    uniquePrevisName,
} from "@/lib/canvas/previs/previs-scene";
import { type PrevisObject, type PrevisLight, type PrevisShot, type PrevisHumanoidBone, type PrevisQuat, type PrevisKeyframeDeleteTarget, type PrevisKeyframeEasing, type PrevisRig, type PrevisShotSize, type PrevisActorProfile } from "@/types/previs";
import { resolvePrevisPlacementAnchor, resolvePrevisPlacement, type PrevisGroundPoint } from "@/lib/canvas/previs/previs-placement";
import { uploadMediaFile } from "@/services/file-storage";
import { saveRemoteUserDataNow, localSavedRemotePendingMessage } from "@/services/user-data-sync";
import { Camera, Lightbulb, LampDesk, UserRound, Box, Circle, Cuboid, Square, FileUp, X, Undo2, Redo2, RotateCcw, Video, Save, Plus, WandSparkles, BoxSelect, Image as ImageIcon, Users, Route, Search } from "lucide-react";
import { PrevisCanvasDock } from "./previs-canvas-dock";
import { PrevisPropLibraryPanel } from "./previs-prop-library-panel";
import { previsPropScale } from "@/lib/canvas/previs/previs-prop-library";
import { previsActorDisplayLabel, previsBoneDisplayLabel, previsPoseDisplayLabel, previsRenderModeDisplayLabel } from "./previs-display-labels";
import { Dropdown } from "antd";
import { nanoid } from "nanoid";
import { type PrevisShortcutAction, resolvePrevisShortcut, blocksPrevisShortcut, releasePrevisFocusAfterPointer, PREVIS_SHORTCUT_GUIDE, PREVIS_TOOL_LABELS } from "@/lib/canvas/previs/previs-shortcuts";
import { saveAs } from "file-saver";
import { previsAspectOption, resolvePrevisDepthRange } from "@/lib/canvas/previs/previs-optics";
import { formatPrevisTimecode, openPrevisMonitorWindow, type PrevisMonitorHandle } from "./previs-monitor-window";
import { Euler, Vector3, type AnimationClip, Quaternion } from "three";
import { compilePrevisPrompt } from "@/lib/canvas/previs/previs-prompt-compiler";
import { Select } from "@/components/ui/base/select";
import { PrevisViewport } from "./previs-viewport";
import { CanvasPrevisOnboarding } from "@/components/canvas/previs/canvas-previs-onboarding";
import { PrevisSequencer } from "./previs-sequencer";
import { App, type MenuProps, Input, Button } from "antd";
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type MouseEvent, type PointerEvent } from "react";
import { type PrevisViewportHandle } from "@/components/canvas/previs/previs-viewport";
import { transcodeVideoToMp4 } from "@/lib/canvas/canvas-video-merge";
import { canvasThemes } from "@/lib/canvas-theme";
import { type PrevisTransaction, createPrevisTransaction, installPrevisTerminalListeners } from "@/lib/canvas/previs/previs-gesture-transaction";
import { buildPrevisPathKeyframes } from "@/lib/canvas/previs/previs-path";
import { recordPrevisDiagnostic } from "@/lib/canvas/previs/previs-diagnostics-recorder";
import { previsExportRestoreState, shouldReinitializePrevisSession, isPrevisOutputSnapshotCurrent } from "@/lib/canvas/previs/previs-session";
import { isPrevisPreviewRequestForWorkbench, previsPreviewRequestKey, type PrevisPreviewRequest } from "@/lib/canvas/previs/previs-preview";
import { describePrevisSaveStatus, shouldOfferPrevisDraftRecovery, shouldBlockPrevisUnload, resolvePrevisCloseOutcome } from "@/lib/canvas/previs/previs-save-wiring";
import { usePrevisSaveCoordinator } from "@/components/canvas/previs/use-previs-save-coordinator";
import "./canvas-previs-workbench.css";
import { flushSync } from "react-dom";
import { GLTFLoader } from "three-stdlib";
import { createThreeboxAnimationRuntime } from "@/lib/canvas/previs/threebox-animation";
import { disposePrevisObject3D } from "@/lib/canvas/previs/previs-resources";
import { isPrevisActor } from "@/lib/canvas/previs/director-object-role";
import { parseThreeboxGlb, parseThreeboxStaticScene, planThreeboxAnimation, resolvePrevisModelNormalization } from "@/lib/canvas/previs/threebox-import";
import { useAssetStore, type ModelAsset } from "@/stores/use-asset-store";
import { useAppearanceStore } from "@/stores/use-appearance-store";
import { usePrevisWorkbenchStore } from "@/stores/canvas/use-previs-workbench-store";
import { PREVIS_MODES, previsModeCapabilities, type PrevisMode } from "@/lib/canvas/previs/previs-modes";
import { useActiveTheme } from "@/stores/canvas/use-canvas-theme-store";
import type { CanvasNodeData } from "@/types/canvas";
import type { PrevisCameraMove, PrevisCanvasExport, PrevisRenderMode, PrevisScene, PrevisSceneOutput, PrevisTransform, PrevisVec3 } from "@/types/previs";
export { cameraMoveOptions, poseOptions, shotSizeOptions } from "./previs-inspectors";

export function CanvasPrevisWorkbench({
    open,
    canvasId,
    scene,
    imageNodes,
    onboardingScope,
    initialMode,
    onClose,
    onChange,
    onApply,
    onAddToCanvas,
    onDeleteImageNode,
    onFlush,
}: {
    open: boolean;
    canvasId?: string;
    scene: PrevisScene | null;
    imageNodes: CanvasNodeData[];
    onboardingScope: string;
    initialMode?: PrevisMode;
    onClose: () => void;
    onChange: (scene: PrevisScene) => void;
    onApply: (output: PrevisSceneOutput) => Promise<void>;
    onAddToCanvas: (output: PrevisCanvasExport) => Promise<void>;
    onDeleteImageNode: (nodeId: string) => void;
    onFlush?: () => void | Promise<void>;
}) {
    const { t } = useInterfaceTranslation();
    const { message, modal } = App.useApp();
    const theme = canvasThemes[useActiveTheme()];
    const brandName = useAppearanceStore((state) => state.appearance.brandName);
    const effectiveCanvasId = useMemo(() => {
        const explicit = canvasId?.trim();
        if (explicit) return explicit;
        if (typeof window === "undefined") return undefined;
        const match = window.location.pathname.match(/^\/canvas\/([^/]+)/u);
        return match ? decodeURIComponent(match[1]) : undefined;
    }, [canvasId]);
    const viewportRef = useRef<PrevisViewportHandle>(null);
    const modelInputRef = useRef<HTMLInputElement>(null);
    const threeboxInputRef = useRef<HTMLInputElement>(null);
    const threeboxAnimatedInputRef = useRef<HTMLInputElement>(null);
    const threeboxSessionRef = useRef({ open, sceneId: scene?.id });
    if (threeboxSessionRef.current.open !== open || threeboxSessionRef.current.sceneId !== scene?.id) threeboxSessionRef.current = { open, sceneId: scene?.id };
    const [draft, setDraft] = useState<PrevisScene | null>(null);
    const [history, setHistory] = useState<PrevisScene[]>([]);
    const [future, setFuture] = useState<PrevisScene[]>([]);
    const [saving, setSaving] = useState(false);
    const [screenshot, setScreenshot] = useState<{ output: Extract<PrevisCanvasExport, { kind: "screenshot" }>; url: string; added: boolean } | null>(null);
    const [capturing, setCapturing] = useState(false);
    const captureRequestRef = useRef<AbortController | null>(null);
    const [addingToCanvas, setAddingToCanvas] = useState(false);
    const addingToCanvasRef = useRef(false);
    useEffect(
        () => () => {
            if (screenshot) URL.revokeObjectURL(screenshot.url);
        },
        [screenshot?.url],
    );
    useEffect(() => {
        setScreenshot(null);
        return () => {
            captureRequestRef.current?.abort();
        };
    }, [effectiveCanvasId, scene?.id, open]);
    const [recording, setRecording] = useState(false);
    const exportAbortRef = useRef<AbortController | null>(null);
    useEffect(() => {
        if (!open) exportAbortRef.current?.abort();
        return () => { exportAbortRef.current?.abort(); };
    }, [open, scene?.id]);
    const [lastClayExport, setLastClayExport] = useState<{ shotId: string; at: number } | null>(null);
    const [depthExporting, setDepthExporting] = useState(false);
    const [screenRecording, setScreenRecording] = useState<"shot" | "window" | null>(null);
    const [shortcutHelpOpen, setShortcutHelpOpen] = useState(false);
    const [monitorOpen, setMonitorOpen] = useState(false);
    const monitorRef = useRef<PrevisMonitorHandle | null>(null);
    const windowRecorderRef = useRef<{ stop: () => void } | null>(null);
    const recordAbortRef = useRef<AbortController | null>(null);

    const [trajectoryDrawing, setTrajectoryDrawing] = useState(false);
    const [inspectorOpen, setInspectorOpen] = useState(false);
    const [scenePanelOpen, setScenePanelOpen] = useState(false);
    // 桌面端侧栏常驻，可收起换取沉浸视口；窄屏下改为 scenePanelOpen/inspectorOpen 控制的浮层。
    const [sceneDocked, setSceneDocked] = useState(true);
    const [inspectorDocked, setInspectorDocked] = useState(true);
    const [compactLayout, setCompactLayout] = useState(() => typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia("(max-width: 860px)").matches);
    useEffect(() => {
        if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
        const media = window.matchMedia("(max-width: 860px)");
        const update = () => setCompactLayout(media.matches);
        update();
        media.addEventListener("change", update);
        return () => media.removeEventListener("change", update);
    }, []);
    const [onboardingRestartSignal, setOnboardingRestartSignal] = useState(0);
    const mode = usePrevisWorkbenchStore((state) => state.mode);
    const setMode = usePrevisWorkbenchStore((state) => state.setMode);
    const viewMode = usePrevisWorkbenchStore((state) => state.viewMode);
    const setViewMode = usePrevisWorkbenchStore((state) => state.setViewMode);
    const selectedObjectId = usePrevisWorkbenchStore((state) => state.selectedObjectId);
    const selectedLightId = usePrevisWorkbenchStore((state) => state.selectedLightId);
    const transformMode = usePrevisWorkbenchStore((state) => state.transformMode);
    const renderMode = usePrevisWorkbenchStore((state) => state.renderMode);
    const playhead = usePrevisWorkbenchStore((state) => state.playhead);
    const playing = usePrevisWorkbenchStore((state) => state.playing);
    const selectedBone = usePrevisWorkbenchStore((state) => state.selectedBone);
    const autoKey = usePrevisWorkbenchStore((state) => state.autoKey);
    const sequencerHeight = usePrevisWorkbenchStore((state) => state.sequencerHeight);
    const sequencerVisible = usePrevisWorkbenchStore((state) => state.sequencerVisible);
    const setSelectedObjectId = usePrevisWorkbenchStore((state) => state.setSelectedObjectId);
    const [selectedCameraId, setSelectedCameraId] = useState<string | null>(null);
    const [sceneQuery, setSceneQuery] = useState("");
    const setSelectedLightId = usePrevisWorkbenchStore((state) => state.setSelectedLightId);
    const setTransformMode = usePrevisWorkbenchStore((state) => state.setTransformMode);
    const setRenderMode = usePrevisWorkbenchStore((state) => state.setRenderMode);
    const setPlayhead = usePrevisWorkbenchStore((state) => state.setPlayhead);
    const setPlaying = usePrevisWorkbenchStore((state) => state.setPlaying);
    const setSelectedBone = usePrevisWorkbenchStore((state) => state.setSelectedBone);
    const setAutoKey = usePrevisWorkbenchStore((state) => state.setAutoKey);
    const setSequencerHeight = usePrevisWorkbenchStore((state) => state.setSequencerHeight);
    const setSequencerVisible = usePrevisWorkbenchStore((state) => state.setSequencerVisible);
    const resetWorkbench = usePrevisWorkbenchStore((state) => state.reset);
    const stopPrevisEntityPointer = useCallback((event: MouseEvent | PointerEvent) => {
        event.stopPropagation();
    }, []);
    const selectSceneObject = useCallback(
        (id: string) => {
            setSelectedObjectId(id);
            setSelectedCameraId(null);
            setSelectedBone(null);
            setInspectorOpen(true);
            setInspectorDocked(true);
        },
        [setSelectedBone, setSelectedObjectId],
    );
    const selectSceneCamera = useCallback(
        (id: string) => {
            setSelectedObjectId(null);
            setSelectedLightId(null);
            setSelectedCameraId(id);
            setSelectedBone(null);
            // CAM hides camera gizmos; keep the editable scene view so the selected camera is visible.
            setViewMode("free");
            setInspectorOpen(true);
            setInspectorDocked(true);
        },
        [setSelectedBone, setSelectedLightId, setSelectedObjectId, setViewMode],
    );
    const assets = useAssetStore((state) => state.assets);
    const addAsset = useAssetStore((state) => state.addAsset);
    const modelAssets = useMemo(() => assets.filter((asset): asset is ModelAsset => asset.kind === "model"), [assets]);

    const capabilities = previsModeCapabilities(mode);
    const renderModeOptions = PREVIS_RENDER_MODE_LABELS.filter((option) => capabilities.renderModes.includes(option.value)).map((option) => ({ ...option, label: previsRenderModeDisplayLabel(option.value, t) }));

    const draftRef = useRef<PrevisScene | null>(null);
    const stagedRef = useRef<PrevisTransaction | null>(null);
    const initializedSceneIdRef = useRef<string | null>(null);
    const onChangeRef = useRef(onChange);
    const onFlushRef = useRef(onFlush);
    useEffect(() => {
        onChangeRef.current = onChange;
        onFlushRef.current = onFlush;
    }, [onChange, onFlush]);

    const closingRef = useRef(false);
    const recoveryPromptedRef = useRef<string | null>(null);
    const [retrying, setRetrying] = useState(false);
    const handledPreviewRequestsRef = useRef(new Set<string>());

    // 按 scene.id 持有唯一 coordinator：flush 先把 request.scene 写回项目，再等持久化完成。
    const saveController = usePrevisSaveCoordinator({
        sceneId: scene?.id ?? null,
        initialScene: scene,
        persistScene: (next) => onChangeRef.current(next),
        flushPersistence: () => onFlushRef.current?.(),
    });
    const saveControllerRef = useRef(saveController);
    saveControllerRef.current = saveController;
    const saveIndicator = describePrevisSaveStatus(saveController.progress, key => t(`previsSave.${key}`));

    const retrySave = async () => {
        setRetrying(true);
        try {
            if (await saveController.retry()) {
                recordPrevisDiagnostic("PREVIS_SAVE_RETRY_RECOVERED", { sceneId: draftRef.current?.id, revision: saveController.progress.revision, userInitiated: true });
                message.success(t("canvasPrevisUi021"));
                return;
            }
            // 只有真的存在合法本地候选才敢说草稿已保留。
            const draftStored = Boolean(saveController.restoreCandidate());
            recordPrevisDiagnostic("PREVIS_SAVE_RETRY_FAILED", { sceneId: draftRef.current?.id, revision: saveController.progress.revision, draftStored, userInitiated: true });
            if (!draftStored) recordPrevisDiagnostic("PREVIS_SAVE_DRAFT_UNAVAILABLE", { sceneId: draftRef.current?.id, revision: saveController.progress.revision });
            if (draftStored) message.error(t("canvasPrevisUi022"));
            else message.error(t("canvasPrevisUi023"));
        } finally {
            setRetrying(false);
        }
    };

    const writeDraft = useCallback((next: PrevisScene | null) => {
        draftRef.current = next;
        setDraft(next);
    }, []);

    /**
     * 仅镜像当前 draft 到项目 previsScenes，不产生 canonical 提交。
     * 用于取消预览、idle pagehide、卸载兜底 —— 这些都不是新的用户改动。
     */
    const mirrorDraft = useCallback(() => {
        const current = draftRef.current;
        if (!current || initializedSceneIdRef.current !== current.id) return;
        onChangeRef.current(current);
    }, []);

    /** 真实 canonical 提交：先交给 coordinator（本地草稿 + 远端保存），再镜像到项目。 */
    const commitDraft = useCallback(() => {
        const current = draftRef.current;
        if (!current || initializedSceneIdRef.current !== current.id) return;
        saveControllerRef.current?.commitScene(current);
        onChangeRef.current(current);
    }, []);

    const writeAndPublish = useCallback(
        (next: PrevisScene) => {
            writeDraft(next);
            saveControllerRef.current?.commitScene(next);
            onChangeRef.current(next);
        },
        [writeDraft],
    );

    // 会话初始化只认 scene id：同 id 的父级镜像回流不得重建会话。
    useEffect(() => {
        if (!open || !scene) return;
        if (!shouldReinitializePrevisSession({ initializedSceneId: initializedSceneIdRef.current, nextSceneId: scene.id })) return;
        const next = structuredClone(scene);
        next.objects = next.objects.map((object) => (object.kind === "actor" || object.primitive === "character" ? { ...object, color: resolvePrevisActorColor(object.color), archetype: object.archetype || "adult" } : object));
        next.shots = next.shots.map((shot) => ({ ...shot, fps: shot.fps || 24 }));
        stagedRef.current?.end("cancel");
        initializedSceneIdRef.current = scene.id;
        writeDraft(groundPrevisScene(next).scene);
        setHistory([]);
        setFuture([]);
        resetWorkbench();
        if (initialMode) setMode(initialMode);
    }, [initialMode, open, resetWorkbench, scene, setMode, writeDraft]);

    // 父级项目收到 Agent 的预演台语义补丁后，scene.id 不变但 updatedAt 会变化；
    // 不能只按 scene.id 忽略，否则打开着的工作台永远看不到 Agent 的修改。
    useEffect(() => {
        if (!open || !scene || initializedSceneIdRef.current !== scene.id) return;
        const current = draftRef.current;
        if (!current || scene.updatedAt === current.updatedAt) return;
        stagedRef.current?.end("cancel");
        const next = structuredClone(scene);
        writeDraft(groundPrevisScene(next).scene);
        setHistory([]);
        setFuture([]);
        setSelectedObjectId(null);
        setSelectedLightId(null);
        setSelectedBone(null);
        setPlayhead(0);
        message.info(t("canvasPrevisUi024"));
    }, [message, open, scene, setPlayhead, setSelectedBone, setSelectedLightId, setSelectedObjectId, writeDraft]);

    // 打开会话时检查合法本地恢复候选：同一场景只提示一次，恢复/放弃都必须有明确结果。
    useEffect(() => {
        if (!open || !scene) return;
        if (recoveryPromptedRef.current === scene.id) return;
        recoveryPromptedRef.current = scene.id;

        const controller = saveControllerRef.current;
        const candidate = controller?.restoreCandidate() ?? null;
        if (!controller || !candidate) return;
        if (!shouldOfferPrevisDraftRecovery({ candidate, authoritativeScene: scene })) return;

        modal.confirm({
            title: t("canvasPrevisUi025"),
            content: t("canvasPrevisDyn004", { revision: candidate.revision }),
            okText: t("canvasPrevisUi026"),
            cancelText: t("canvasPrevisUi027"),
            closable: false,
            mask: { closable: false },
            keyboard: false,
            onOk: () => {
                if (!controller.restoreDraft(candidate)) {
                    message.error(t("canvasPrevisUi028"));
                    return;
                }
                writeDraft(candidate.scene);
                message.success(t("canvasPrevisUi029"));
            },
            onCancel: () => {
                if (controller.discardDraft()) message.success(t("canvasPrevisUi030"));
                else message.error(t("canvasPrevisUi031"));
            },
        });
    }, [message, modal, open, scene, writeDraft]);

    const activeShot = draft?.shots?.find((item) => item.id === draft.activeShotId) || draft?.shots?.[0] || null;
    const activeCamera = draft?.cameras?.find((item) => item.id === activeShot?.cameraId) || draft?.cameras?.[0] || null;
    useEffect(() => {
        const cameras = draft?.cameras || [];
        if (!cameras.length) {
            setSelectedCameraId(null);
            return;
        }
        if (!selectedCameraId || !cameras.some((camera) => camera.id === selectedCameraId)) {
            setSelectedCameraId(null);
        }
    }, [activeCamera?.id, draft?.cameras, selectedCameraId]);
    useEffect(() => {
        if (activeShot?.id) setSelectedCameraId(activeShot.cameraId || null);
    }, [activeShot?.id]);
    const compiledPrompt = useMemo(() => (draft && activeShot ? compilePrevisPrompt(draft, activeShot) : ""), [activeShot, draft]);
    const selectedObject = draft?.objects?.find((item) => item.id === selectedObjectId) || null;
    const selectedLight = draft?.lights?.find((item) => item.id === selectedLightId) || null;
    const selectedCamera = draft?.cameras?.find((item) => item.id === selectedCameraId) || null;
    const inspectorCamera = selectedCamera || activeCamera;
    // 写入关键帧的目的时间用吸附值；取值/显示/手势起点一律用 raw playhead，
    // 否则处在两个帧格之间时 AutoKey OFF 的增量会从错误起点计算而产生漂移。
    const snappedPlayhead = snapPrevisTime(playhead, activeShot?.fps || 24);
    const selectedObjectRendered = selectedObject ? interpolatePrevisTransform(selectedObject.transform, selectedObject.keyframes, playhead) : null;

    useEffect(() => {
        if (!playing || !activeShot || recording) return;
        let frame = 0;
        let last = performance.now();
        let pending = 0;
        const frameInterval = 1 / Math.max(1, Math.min(120, activeShot.fps || 24));
        const tick = (now: number) => {
            pending += Math.max(0, (now - last) / 1000);
            last = now;
            if (pending >= frameInterval) {
                const elapsed = Math.floor(pending / frameInterval) * frameInterval;
                pending -= elapsed;
                setPlayhead(advancePrevisPlayhead(usePrevisWorkbenchStore.getState().playhead, elapsed, activeShot.duration));
            }
            frame = requestAnimationFrame(tick);
        };
        frame = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(frame);
    }, [activeShot, playing, recording, setPlayhead]);

    const commit = useCallback(
        (updater: (current: PrevisScene) => PrevisScene) => {
            // 普通提交前先终结暂存手势，避免新动作消费旧 base。
            stagedRef.current?.end("commit");
            const current = draftRef.current;
            if (!current) return;
            setHistory((items) => [...items.slice(-49), structuredClone(current)]);
            setFuture([]);
            writeAndPublish(touchPrevisScene(groundPrevisScene(updater(current)).scene));
        },
        [writeAndPublish],
    );

    /** 暂存型手势（数值滑杆）：实时预览写草稿但不产生历史，也不镜像到项目。 */
    const stagedTransaction = useMemo(
        () =>
            createPrevisTransaction<PrevisScene>({
                read: () => draftRef.current,
                // 取消：恢复快照且绝不发布被取消的值。
                restore: (snapshot) => writeDraft(snapshot),
                commit: (from) => {
                    setHistory((items) => [...items.slice(-49), from]);
                    setFuture([]);
                    // 手势成功终态是真实 canonical 提交。
                    commitDraft();
                },
                setActive: () => undefined,
            }),
        [commitDraft, writeDraft],
    );
    stagedRef.current = stagedTransaction;

    const stageGesture = useCallback(
        (updater: (current: PrevisScene) => PrevisScene) => {
            const current = draftRef.current;
            if (!current) return;
            stagedTransaction.begin();
            writeDraft(touchPrevisScene(updater(current)));
        },
        [stagedTransaction, writeDraft],
    );

    /** 无历史但持久的变化（标题、rig/motionClips 等）同样要镜像。 */
    const replaceWithoutHistory = useCallback(
        (updater: (current: PrevisScene) => PrevisScene) => {
            const current = draftRef.current;
            if (current) writeAndPublish(touchPrevisScene(groundPrevisScene(updater(current)).scene));
        },
        [writeAndPublish],
    );

    // 暂存手势的终止生命周期：常驻安装，非活跃时 end 为空操作。
    useEffect(
        () =>
            installPrevisTerminalListeners(stagedTransaction, {
                window,
                document,
                isHidden: () => document.visibilityState === "hidden",
            }),
        [stagedTransaction],
    );

    // 切换选择/骨骼、关闭或卸载前必须先终止旧手势，不能让新选择消费旧 base。
    useEffect(() => () => stagedTransaction.end("cancel"), [open, selectedBone, selectedObjectId, stagedTransaction]);

    // 离开页面：active 预览由 end("commit") 完成真实提交，idle 只镜像；落盘统一交给 controller。
    useEffect(() => {
        const onPageHide = () => {
            if (stagedTransaction.active()) stagedTransaction.end("commit");
            else mirrorDraft();
            // 只调用 handlePageHide：dirty 时它自己会 persist + flush，组件再叠一次就是重复落盘。
            void saveControllerRef.current?.handlePageHide();
        };
        // 异步 flush 不可能阻塞卸载：这里只同步声明「仍有未确认改动」，让浏览器自己弹保护。
        const onBeforeUnload = (event: BeforeUnloadEvent) => {
            const controller = saveControllerRef.current;
            if (!controller || !shouldBlockPrevisUnload(controller.progress)) return;
            event.preventDefault();
            event.returnValue = "";
        };
        window.addEventListener("pagehide", onPageHide);
        window.addEventListener("beforeunload", onBeforeUnload);
        return () => {
            window.removeEventListener("pagehide", onPageHide);
            window.removeEventListener("beforeunload", onBeforeUnload);
        };
    }, [mirrorDraft, stagedTransaction]);

    // 卸载兜底：只把最新 draft 镜像回项目，不制造新的 canonical revision。
    useEffect(
        () => () => {
            stagedRef.current?.end("cancel");
            mirrorDraft();
        },
        [mirrorDraft],
    );

    const undo = () => {
        const previous = history.at(-1);
        if (!previous || !draft) return;
        setHistory((items) => items.slice(0, -1));
        setFuture((items) => [structuredClone(draft), ...items].slice(0, 50));
        writeAndPublish(previous);
    };
    const redo = () => {
        const next = future[0];
        if (!next || !draft) return;
        setFuture((items) => items.slice(1));
        setHistory((items) => [...items, structuredClone(draft)].slice(-50));
        writeAndPublish(next);
    };

    /**
     * 关闭统一入口：取消未结束的预览、镜像当前 draft，再按 prepareClose 决策是否真的退出。
     * 这里只镜像不提交：取消预览不是新的 canonical 变化。
     */
    const closeWorkbench = () => {
        if (closingRef.current) return;
        closingRef.current = true;
        stagedTransaction.end("cancel");
        mirrorDraft();

        // 异步生成缩略图，不阻塞关闭流程
        if (viewportRef.current && draftRef.current && activeShot) {
            const currentScene = draftRef.current;
            const currentShot = activeShot;
            setTimeout(() => {
                void (async () => {
                    try {
                        const thumbnail = await viewportRef.current?.capture("clay");
                        if (thumbnail) {
                            await onApply({
                                scene: currentScene,
                                shot: currentShot,
                                prompt: compilePrevisPrompt(currentScene, currentShot),
                                beauty: thumbnail,
                                clayVideo: undefined,
                                clayVideoMimeType: "",
                            });
                        }
                    } catch (error) {
                        console.warn("预演台缩略图后台生成失败", error);
                    }
                })();
            }, 100);
        }

        void (async () => {
            let decision;
            try {
                decision = resolvePrevisCloseOutcome(await saveController.prepareClose(), key => t(`previsSave.${key}`));
            } catch {
                message.error(t("canvasPrevisUi032"));
                closingRef.current = false;
                return;
            }

            if (decision.kind === "close") {
                onClose();
                return;
            }
            if (decision.kind === "blocked") {
                recordPrevisDiagnostic("PREVIS_CLOSE_BLOCKED", { sceneId: draftRef.current?.id, saveOutcome: "stay", revision: saveController.progress.revision, draftStored: saveController.progress.draftStored });
                message.error(decision.message);
                closingRef.current = false;
                return;
            }

            // 确认框存续期间保持上锁，否则重复点击会叠出多个弹窗。
            modal.confirm({
                title: t("canvasPrevisUi033"),
                content: decision.message,
                okText: t("canvasPrevisUi034"),
                cancelText: t("canvasPrevisUi035"),
                closable: false,
                mask: { closable: false },
                keyboard: false,
                onOk: () => onClose(),
                onCancel: () => {
                    closingRef.current = false;
                },
            });
        })();
    };

    const updateObject = (id: string, patch: Partial<PrevisObject>) => commit((current) => ({ ...current, objects: current.objects.map((item) => (item.id === id ? { ...item, ...patch } : item)) }));
    const duplicateObject = (id: string) => {
        const source = draft?.objects.find((item) => item.id === id);
        if (!source) return;
        const copy = structuredClone(source);
        copy.id = nanoid();
        copy.name = `${source.name} 副本`;
        copy.transform = { ...copy.transform, position: [source.transform.position[0] + 0.8, source.transform.position[1], source.transform.position[2] + 0.8] };
        copy.keyframes = copy.keyframes.map((keyframe) => ({ ...keyframe, id: nanoid() }));
        copy.boneTracks = copy.boneTracks?.map((track) => ({ ...track, keyframes: track.keyframes.map((keyframe) => ({ ...keyframe, id: nanoid() })) }));
        commit((current) => ({ ...current, objects: [...current.objects, copy] }));
        setSelectedObjectId(copy.id);
        setSelectedBone(null);
        message.success(t("canvasPrevisUi036"));
    };
    const updateLight = (id: string, patch: Partial<PrevisLight>) => commit((current) => ({ ...current, lights: current.lights.map((item) => (item.id === id ? { ...item, ...patch } : item)) }));
    const updateShot = (id: string, patch: Partial<PrevisShot>) => commit((current) => ({ ...current, shots: current.shots.map((item) => (item.id === id ? { ...item, ...patch } : item)) }));
    const removeObject = (id: string) => {
        commit((current) => ({ ...current, objects: current.objects.filter((item) => item.id !== id) }));
        if (selectedObjectId === id) {
            setSelectedObjectId(null);
            setSelectedBone(null);
        }
    };
    const removeLight = (id: string) => {
        commit((current) => ({ ...current, lights: current.lights.filter((item) => item.id !== id) }));
        if (selectedLightId === id) setSelectedLightId(null);
    };
    const removeCamera = (id: string) => {
        if (!draft || draft.cameras.length <= 1) {
            message.warning(t("canvasPrevisUi037"));
            return;
        }
        const fallback = draft.cameras.find((item) => item.id !== id);
        if (!fallback) return;
        commit((current) => ({
            ...current,
            cameras: current.cameras.filter((item) => item.id !== id),
            shots: current.shots.map((shot) => (shot.cameraId === id ? { ...shot, cameraId: fallback.id } : shot)),
        }));
    };

    /**
     * 所有「新增到场景」的唯一入口。
     * 在 commit 内读取一次 placement intent：因此模型上传等异步路径拿到的是
     * 「点击添加完成那一刻」的意图，而不是发起上传时捕获的过时坐标。
     * 锚点只提供 XZ，Y 严格保留构造器给定值，再交给 resolvePrevisPlacement 做碰撞避让。
     */
    const addObject = (object: PrevisObject) => {
        commit((current) => {
            const anchored = resolvePrevisPlacementAnchor({
                intent: viewportRef.current?.readPlacementIntent() ?? null,
                fallback: object.transform.position,
            });
            const position = resolvePrevisPlacement({ object: { ...object, transform: { ...object.transform, position: anchored } }, existing: current.objects });
            return { ...current, objects: [...current.objects, { ...object, transform: { ...object.transform, position } }] };
        });
        setSelectedObjectId(object.id);
    };

    const addPrimitive = (primitive: PrevisObject["primitive"], name: string) => addObject(createPrevisObject(primitive, name));

    const addActor = () => {
        const existingActors = draft?.objects.filter((item) => item.kind === "actor" || item.primitive === "character") || [];
        const colorIndex = existingActors.length % PREVIS_ACTOR_COLORS.length;
        addObject(createPrevisActor(`演员 ${existingActors.length + 1}`, [0, 0, 0], PREVIS_ACTOR_COLORS[colorIndex]));
    };

    const addModelAsset = (asset: ModelAsset) => addObject({ ...createPrevisModel({ name: asset.title, assetId: asset.id, storageKey: asset.data.storageKey, url: asset.data.url, mimeType: asset.data.mimeType }), modelNormalization: resolvePrevisModelNormalization(asset.metadata?.modelNormalization) });

    const uploadModel = async (file?: File) => {
        if (!file || !/\.(glb|gltf)$/i.test(file.name)) return;
        const uploaded = await uploadMediaFile(file, "model");
        const assetId = addAsset({
            kind: "model",
            title: file.name.replace(/\.(glb|gltf)$/i, ""),
            coverUrl: "",
            tags: ["3D模型"],
            source: "预演台",
            data: { url: uploaded.url, storageKey: uploaded.storageKey, bytes: uploaded.bytes, mimeType: uploaded.mimeType, fileName: file.name },
            metadata: { source: "previs" },
        });
        const asset = useAssetStore.getState().assets.find((item): item is ModelAsset => item.id === assetId && item.kind === "model");
        if (asset) addModelAsset(asset);
        try {
            await saveRemoteUserDataNow();
            message.success(t("canvasPrevisUi038"));
        } catch (error) {
            message.warning(localSavedRemotePendingMessage(t("canvasPrevisUi039"), error));
        }
    };

    const importThreebox = async (files: File[], animated = false) => {
        const session = threeboxSessionRef.current;
        try {
            const json = files.filter((file) => /\.json$/i.test(file.name));
            const models = files.filter((file) => /\.glb$/i.test(file.name));
            if (files.length !== 2 || json.length !== 1 || models.length !== 1) throw new Error("请同时选择同一场景的协作 JSON 与 GLB，共两个文件");
            if (json[0].size > 8 * 1024 * 1024 || models[0].size > 64 * 1024 * 1024) throw new Error("JSON 上限 8 MiB，GLB 上限 64 MiB");
            const [source, buffer] = await Promise.all([json[0].text().then((value) => JSON.parse(value) as unknown), models[0].arrayBuffer()]);
            const gltf = parseThreeboxGlb(buffer);
            const staticResult = parseThreeboxStaticScene(source, () => ({ gltf, asset: { name: models[0].name.replace(/\.glb$/i, ""), mimeType: "model/gltf-binary" } }));
            let animationPlan: ReturnType<typeof planThreeboxAnimation> | null = null;
            if (animated) {
                const loaded = await new GLTFLoader().parseAsync(buffer, "");
                let runtime: ReturnType<typeof createThreeboxAnimationRuntime> | undefined;
                try {
                    animationPlan = planThreeboxAnimation(source, staticResult, loaded.animations);
                    runtime = createThreeboxAnimationRuntime(loaded.scene, loaded.animations);
                    for (let frame = 0; frame <= Math.ceil(animationPlan.duration * animationPlan.fps); frame++) {
                        runtime.seek(Math.min(frame / animationPlan.fps, animationPlan.duration));
                        for (const camera of animationPlan.cameras) runtime.readCamera(camera.sourceCamera.entityId, camera.id);
                    }
                } finally { runtime?.dispose(); disposePrevisObject3D(loaded.scene); }
            }
            const result = animationPlan ?? staticResult;
            if (session !== threeboxSessionRef.current || !session.open) return;
            modal.confirm({
                title: animated ? t("canvasPrevisUi040") : t("canvasPrevisUi041"),
                okText: animated ? t("canvasPrevisUi042") : t("canvasPrevisUi043"),
                cancelText: t("timelineCancel"),
                content: <div><p>{t("sharedUi.importSummary", { entities: result.matchedEntities, cameras: result.cameras.length })}</p><details><summary>{t("sharedUi.importBoundaries", { count: result.warnings.length })}</summary><ul className="max-h-48 overflow-y-auto">{result.warnings.map((warning, index) => <li key={index}>{warning.message}</li>)}</ul></details><p>{t("canvasPrevisUi044")}</p></div>,
                onOk: async () => {
                    if (session !== threeboxSessionRef.current || !session.open) throw new Error(t("canvasPrevisUi045"));
                    const uploaded = await uploadMediaFile(models[0], "model");
                    if (session !== threeboxSessionRef.current) { message.warning(t("canvasPrevisUi046")); return; }
                    const assetId = addAsset({ kind: "model", title: result.objects[0].name, coverUrl: "", tags: ["3D模型", animated ? "动态整场景源文件" : "静态整场景"], source: "3D-BOX", data: { url: uploaded.url, storageKey: uploaded.storageKey, bytes: uploaded.bytes, mimeType: uploaded.mimeType, fileName: models[0].name }, metadata: { source: animated ? "threebox-animated" : "threebox-static", modelNormalization: "preserve-source" } });
                    const object = { ...result.objects[0], id: nanoid(), assetId, url: uploaded.url, storageKey: uploaded.storageKey, mimeType: uploaded.mimeType };
                    const cameraIds = new Map(result.cameras.map((camera) => [camera.id, nanoid()]));
                    const cameras = result.cameras.map((camera) => ({ ...camera, id: cameraIds.get(camera.id)!, ...(camera.sourceCamera ? { sourceCamera: { ...camera.sourceCamera, objectId: object.id } } : {}) }));
                    const plan = animationPlan;
                    const shot: PrevisShot | null = plan ? { id: nanoid(), name: "源整场景动画", cameraId: cameraIds.get(plan.selectedCameraId)!, duration: plan.duration, fps: plan.fps, shotSize: "wide", cameraMove: "static", prompt: "" } : null;
                    commit((current) => ({ ...current, objects: [...current.objects, object], cameras: [...current.cameras, ...cameras], ...(shot ? { shots: [...current.shots, shot], activeShotId: shot.id } : {}) }));
                    if (plan) { setPlayhead(0); setViewMode("camera"); }
                    setSelectedObjectId(object.id);
                    try { await saveRemoteUserDataNow(); message.success(animated ? t("canvasPrevisUi047") : t("canvasPrevisUi048")); }
                    catch (error) { message.warning(localSavedRemotePendingMessage(t("canvasPrevisUi049"), error)); }
                },
            });
        } catch (error) { message.error(error instanceof Error ? error.message : t("canvasPrevisUi050")); }
    };

    const addBillboard = async (node: CanvasNodeData) => {
        const url = node.metadata?.content || node.metadata?.storageKey;
        if (!url) {
            message.warning(t("canvasPrevisUi051"));
            return;
        }
        // 如果是 storageKey，需要解析成实际URL
        let actualUrl = url;
        if (node.metadata?.storageKey && !url.startsWith("http") && !url.startsWith("blob:") && !url.startsWith("data:")) {
            try {
                const { resolveImageUrl } = await import("@/services/image-storage");
                actualUrl = await resolveImageUrl(node.metadata.storageKey, url);
            } catch (error) {
                console.warn("解析图片URL失败，使用原URL:", error);
            }
        }
        const billboard = createPrevisBillboard(node.title || "背板", actualUrl, node.metadata?.storageKey, node.id);
        addObject(billboard);
        message.success(t("canvasPrevisDyn008", { label: t("storageUi.storageDetailTitle", { scope: t("canvasPrevisBackboard"), state: node.title ? `: ${node.title}` : "" }) }));
    };
    const setPanoramaEnvironment = (node: CanvasNodeData) => {
        const url = node.metadata?.content;
        if (!url) return;
        commit((current) => ({ ...current, environment: { mode: "panorama", url, storageKey: node.metadata?.storageKey, sourceNodeId: node.id, rotationY: 0, opacity: 1, exposure: 0, useAsLighting: false, lightingIntensity: 0.2 } }));
        message.success(t("canvasPrevisUi052"));
    };
    const clearPanoramaEnvironment = () => commit((current) => ({ ...current, environment: { mode: "color" } }));

    const copyCompiledPrompt = async () => {
        if (!compiledPrompt) return;
        try {
            await navigator.clipboard.writeText(compiledPrompt);
            message.success(t("canvasPrevisUi053"));
        } catch {
            message.warning(t("canvasPrevisUi054"));
        }
    };

    const addToCanvas = async (output: PrevisCanvasExport) => {
        if (addingToCanvasRef.current) return;
        addingToCanvasRef.current = true;
        setAddingToCanvas(true);
        try {
            await onAddToCanvas(output);
            if (output.kind === "screenshot") setScreenshot((current) => (current?.output === output ? { ...current, added: true } : current));
            message.success(output.kind === "prompt" ? "提示词已加入画布" : output.renderMode === "beauty" || output.renderMode === "clay" ? "截图与图生视频节点已加入画布，返回画布后选择模型生成" : "控制图已加入画布，可连接到支持该控制类型的模型");
        } catch (error) {
            message.error(error instanceof Error ? error.message : "加入画布失败，请重试");
        } finally {
            addingToCanvasRef.current = false;
            setAddingToCanvas(false);
        }
    };
    const addPromptToCanvas = () => {
        stagedTransaction.end("commit");
        const current = draftRef.current;
        const shot = current?.shots.find((item) => item.id === current.activeShotId) || current?.shots[0];
        if (!current || !shot) return;
        void addToCanvas({ kind: "prompt", sceneId: current.id, shotId: shot.id, title: shot.name, prompt: compilePrevisPrompt(current, shot) });
    };

    /** 统一的「添加到场景」弹窗：选项 + 实时预览，确认后才写入场景。 */
    const [addDialog, setAddDialog] = useState<{ open: boolean; kind: PrevisAddKind }>({ open: false, kind: "actor" });
    const openAddDialog = (kind: PrevisAddKind) => setAddDialog({ open: true, kind });
    const closeAddDialog = () => setAddDialog((current) => ({ ...current, open: false }));
    const confirmAddDialog = (result: PrevisAddResult) => {
        closeAddDialog();
        if (result.kind === "actor" || result.kind === "prop") {
            // 逐个经过 addObject：统一走放置锚点、碰撞避让与落地规则。
            result.objects.forEach((object) => addObject(object));
            message.success(result.objects.length > 1 ? `已加入 ${result.objects.length} 个对象` : `已加入「${result.objects[0]?.name}」`);
            return;
        }
        if (result.kind === "light") {
            commit((current) => ({ ...current, lights: [...current.lights, result.light] }));
            setSelectedLightId(result.light.id);
            message.success(`已加入「${result.light.name}」`);
            return;
        }
        commit((current) => ({ ...current, cameras: [...current.cameras, result.camera] }));
        if (activeShot) updateShot(activeShot.id, { cameraId: result.camera.id });
        selectSceneCamera(result.camera.id);
        message.success(`已加入「${result.camera.name}」，可直接拖动机位；点底部 CAM 查看取景`);
    };
    const addCounts = {
        actors: draft?.objects.filter((item) => item.kind === "actor" || item.primitive === "character").length || 0,
        props: draft?.objects.filter((item) => item.kind !== "actor" && item.primitive !== "character").length || 0,
        lights: draft?.lights.length || 0,
        cameras: draft?.cameras.length || 0,
    };


    const addCamera = () => {
        const camera = createPrevisCamera(`摄影机 ${draft?.cameras.length ? draft.cameras.length + 1 : 1}`);
        commit((current) => ({ ...current, cameras: [...current.cameras, camera] }));
        if (activeShot) updateShot(activeShot.id, { cameraId: camera.id });
    };

    const addLight = (type: PrevisLight["type"] = "point", label = "灯光", position: PrevisVec3 = [2, 3, 2], intensity = 1.5) => {
        const light = createPrevisLight(type, `${label} ${draft?.lights.length ? draft.lights.length + 1 : 1}`, position, intensity);
        commit((current) => ({ ...current, lights: [...current.lights, light] }));
        setSelectedLightId(light.id);
    };

    const addCameraMenuItems: MenuProps["items"] = [{ key: "camera", icon: <Camera className="size-3.5" />, label: t("canvasPrevisUi055"), onClick: addCamera }];
    const addLightMenuItems: MenuProps["items"] = [
        { key: "directional", icon: <Lightbulb className="size-3.5" />, label: t("canvasPrevisUi056"), onClick: () => addLight("directional", "方向光", [4, 6, 4], 2.4) },
        { key: "point", icon: <Lightbulb className="size-3.5" />, label: t("canvasPrevisUi057"), onClick: () => addLight("point", "点光源") },
        { key: "spot", icon: <Lightbulb className="size-3.5" />, label: t("canvasPrevisUi058"), onClick: () => addLight("spot", "聚光灯", [2, 4, 2], 2) },
        { key: "ambient", icon: <LampDesk className="size-3.5" />, label: t("canvasPrevisUi059"), onClick: () => addLight("ambient", "环境光", [0, 0, 0], 0.65) },
    ];
    const addObjectMenuItems: MenuProps["items"] = [
        { key: "actor", icon: <UserRound className="size-3.5" />, label: t("canvasPrevisUi060"), onClick: addActor },
        { key: "box", icon: <Box className="size-3.5" />, label: t("canvasPrevisUi061"), onClick: () => addPrimitive("box", "立方体") },
        { key: "sphere", icon: <Circle className="size-3.5" />, label: t("canvasPrevisUi062"), onClick: () => addPrimitive("sphere", "球体") },
        { key: "cylinder", icon: <Cuboid className="size-3.5" />, label: t("canvasPrevisUi063"), onClick: () => addPrimitive("cylinder", "圆柱") },
        { key: "model", icon: <FileUp className="size-3.5" />, label: t("canvasPrevisUi064"), onClick: () => modelInputRef.current?.click() },
    ];

    const addShot = () => {
        if (!activeCamera) return;
        const shot: PrevisShot = { id: nanoid(), name: `镜头 ${(draft?.shots.length || 0) + 1}`, cameraId: activeCamera.id, duration: 5, fps: 24, shotSize: "medium", cameraMove: "static", prompt: "" };
        commit((current) => ({ ...current, shots: [...current.shots, shot], activeShotId: shot.id }));
        setPlayhead(0);
    };

    const addObjectKeyframe = () => {
        if (!selectedObject) return;
        // 取值用 raw playhead（视口真正渲染的时间），写入用 snapped 目的时间。
        const record = resolvePrevisKeyframeRecord({ base: selectedObject.transform, keyframes: selectedObject.keyframes, rawTime: playhead, snappedTime: snappedPlayhead });
        updateObject(selectedObject.id, { keyframes: record.keyframes });
    };

    const addCameraKeyframe = () => {
        if (!activeCamera) return;
        if (activeCamera.ltvCameraMotion !== undefined) { message.info(t("canvasPrevisUi065")); return; }
        if (activeCamera.sourceCamera) { message.info(t("canvasPrevisUi066")); return; }
        commit((current) => ({
            ...current,
            cameras: current.cameras.map((item) => (item.id === activeCamera.id ? { ...item, keyframes: resolvePrevisKeyframeRecord({ base: item.transform, keyframes: item.keyframes, rawTime: playhead, snappedTime: snappedPlayhead }).keyframes } : item)),
        }));
    };

    const recordSelectedKeyframe = () => {
        if (selectedObject && selectedBone) {
            const rotation = selectedObject.boneOverrides?.[selectedBone as PrevisHumanoidBone] || ([0, 0, 0, 1] as PrevisQuat);
            updateObject(selectedObject.id, { boneTracks: upsertPrevisBoneKeyframe(selectedObject.boneTracks || [], selectedBone as PrevisHumanoidBone, snappedPlayhead, rotation) });
            return;
        }
        if (selectedObject) addObjectKeyframe();
        else addCameraKeyframe();
    };

    /**
     * 时间轴删除关键帧的唯一入口。
     *
     * 未命中（对象/摄影机/关键帧已不存在）时 removePrevisSceneKeyframe 返回同一引用，
     * 此时不进 commit：不记历史、不产生修订、不触发保存。
     */
    const deleteKeyframe = useCallback(
        (target: PrevisKeyframeDeleteTarget) => {
            const current = draftRef.current;
            if (!current || removePrevisSceneKeyframe(current, target) === current) return;
            commit((scene) => removePrevisSceneKeyframe(scene, target));
        },
        [commit],
    );

    const setKeyframeEasing = useCallback(
        (target: PrevisKeyframeDeleteTarget, easing: PrevisKeyframeEasing) => {
            const current = draftRef.current;
            if (!current || setPrevisSceneKeyframeEasing(current, target, easing) === current) return;
            commit((scene) => setPrevisSceneKeyframeEasing(scene, target, easing));
        },
        [commit],
    );

    /**
     * 快捷键执行器。放在 ref 里：监听只在 open 变化时注册一次，
     * 但每次渲染都能拿到最新的选择、历史和 draft，避免闭包读到过期状态。
     *
     * 返回值表示「动作真的执行了」，只有执行了才 preventDefault：
     * 没有选中对象时的 Delete 仍然交还给浏览器。
     */
    const runShortcut = (action: PrevisShortcutAction): boolean => {
        switch (action.kind) {
            case "transform-mode":
                setTransformMode(action.mode);
                return true;
            case "delete-selected":
                if (selectedObject) {
                    removeObject(selectedObject.id);
                    return true;
                }
                if (selectedLight) {
                    removeLight(selectedLight.id);
                    return true;
                }
                return false;
            case "undo":
                if (!history.length) return false;
                undo();
                return true;
            case "redo":
                if (!future.length) return false;
                redo();
                return true;
            case "toggle-visibility":
                if (!selectedObject) return false;
                updateObject(selectedObject.id, { visible: !selectedObject.visible });
                return true;
            case "deselect":
                if (!selectedObjectId && !selectedLightId && !selectedBone) return false;
                setSelectedObjectId(null);
                setSelectedLightId(null);
                setSelectedBone(null);
                return true;
            case "toggle-play":
                setPlaying(!playing);
                return true;
            case "duplicate-selected":
                if (!selectedObject) return false;
                duplicateObject(selectedObject.id);
                return true;
            case "focus-selected":
                viewportRef.current?.focusSelected();
                return true;
            case "frame-scene":
                viewportRef.current?.frameScene();
                return true;
            case "toggle-camera-view":
                setViewMode(viewMode === "camera" ? "free" : "camera");
                return true;
            case "capture-screenshot":
                void downloadShotScreenshot();
                return true;
            case "toggle-help":
                setShortcutHelpOpen((value) => !value);
                return true;
        }
        return false;
    };
    const runShortcutRef = useRef(runShortcut);
    runShortcutRef.current = runShortcut;

    // 预演台是全屏浮层，快捷键挂在 window；焦点落在任何交互控件内时交还给该控件，
    // 关键帧按钮再额外拦截自己的 Enter/Space/Delete/Backspace。
    useEffect(() => {
        if (!open) return;
        const onKeyDown = (event: KeyboardEvent) => {
            const action = resolvePrevisShortcut({
                key: event.key,
                ctrlKey: event.ctrlKey,
                metaKey: event.metaKey,
                shiftKey: event.shiftKey,
                altKey: event.altKey,
                isInteractiveTarget: blocksPrevisShortcut(event.target),
            });
            if (!action) return;
            if (runShortcutRef.current(action)) event.preventDefault();
        };
        window.addEventListener("keydown", onKeyDown);
        return () => window.removeEventListener("keydown", onKeyDown);
    }, [open]);

    /** 对象 transform 编辑的唯一入口：gizmo 与检查器共用同一套静态/动画语义。 */
    const handleObjectTransform = useCallback(
        (id: string, from: PrevisTransform, to: PrevisTransform) => {
            commit((current) => ({
                ...current,
                objects: current.objects.map((item) => {
                    if (item.id !== id) return item;
                    const edit = resolvePrevisObjectTransformEdit({ base: item.transform, keyframes: item.keyframes, rendered: from, edited: to, autoKey, time: snappedPlayhead });
                    return { ...item, transform: edit.transform, keyframes: edit.keyframes };
                }),
            }));
        },
        [autoKey, commit, snappedPlayhead],
    );

    /** 摄影机 transform gizmo 写入：直接覆盖摄影机 transform（不走 object autoKey 逻辑）。 */
    const handleCameraTransform = useCallback(
        (id: string, from: PrevisTransform, to: PrevisTransform) => {
            commit((current) => ({
                ...current,
                cameras: current.cameras.map((item) => {
                    if (item.id !== id) return item;
                    // 机位取景由 target 决定：平移时保持盯住原焦点；旋转时按新朝向把焦点推到同样距离。
                    const rotated = to.rotation.some((value, index) => Math.abs(value - from.rotation[index]) > 1e-4);
                    if (!rotated) return { ...item, transform: { ...to, scale: [1, 1, 1] } };
                    const distance = Math.max(0.5, new Vector3(...item.target).distanceTo(new Vector3(...from.position)));
                    const forward = new Vector3(0, 0, -1).applyEuler(new Euler(...to.rotation)).multiplyScalar(distance);
                    const target: PrevisVec3 = [to.position[0] + forward.x, to.position[1] + forward.y, to.position[2] + forward.z];
                    return { ...item, transform: { ...to, scale: [1, 1, 1] }, target };
                }),
            }));
        },
        [commit],
    );

    /** 骨骼写入语义：静态覆盖 + autoKey 时在吸附播放头补关键帧。gizmo 与数值编辑器共用。 */
    const writeBoneRotation = useCallback(
        (id: string, bone: string, rotation: PrevisQuat, mode: "stage" | "commit") => {
            const write = mode === "stage" ? stageGesture : commit;
            write((current) => ({
                ...current,
                objects: current.objects.map((item) =>
                    item.id === id
                        ? {
                              ...item,
                              boneOverrides: { ...item.boneOverrides, [bone]: rotation },
                              boneTracks: autoKey ? upsertPrevisBoneKeyframe(item.boneTracks || [], bone as PrevisHumanoidBone, snappedPlayhead, rotation) : item.boneTracks,
                          }
                        : item,
                ),
            }));
        },
        [autoKey, commit, snappedPlayhead, stageGesture],
    );

    const handleBoneTransform = useCallback((id: string, bone: string, rotation: PrevisQuat) => writeBoneRotation(id, bone, rotation, "commit"), [writeBoneRotation]);

    const handleActorRigReady = useCallback(
        (id: string, rig: PrevisRig, animations: AnimationClip[]) => {
            replaceWithoutHistory((current) => ({
                ...current,
                objects: current.objects.map((item) => {
                    if (item.id !== id) return item;
                    const existing = item.motionClips || [];
                    const motionClips = existing.length ? existing : animations.map((clip) => ({ id: nanoid(), name: clip.name || "动作片段", sourceAnimation: clip.name, start: 0, duration: Math.max(0.1, clip.duration), playbackRate: 1, loop: true }));
                    return { ...item, rig, motionClips };
                }),
            }));
        },
        [replaceWithoutHistory],
    );

    const applyCameraMove = () => {
        if (!activeCamera || !activeShot) return;
        if (activeCamera.ltvCameraMotion !== undefined) { message.info(t("canvasPrevisUi067")); return; }
        if (activeCamera.sourceCamera) { message.info(t("canvasPrevisUi066")); return; }
        const cameraId = activeCamera.id;
        const move = activeShot.cameraMove;
        const duration = activeShot.duration;
        commit((current) => ({
            ...current,
            cameras: current.cameras.map((item) => (item.id === cameraId ? { ...item, keyframes: resolvePrevisCameraMoveKeyframes(item.keyframes, item.transform, cameraMoveTransform(item.transform, move), duration) } : item)),
        }));
        message.success(t("canvasPrevisUi068"));
    };

    const alignCameraToView = () => {
        if (!activeCamera) return;
        if (activeCamera.ltvCameraMotion !== undefined) { message.info(t("canvasPrevisUi069")); return; }
        if (activeCamera.sourceCamera) { message.info(t("canvasPrevisUi066")); return; }
        const transform = viewportRef.current?.readCameraTransform();
        if (!transform) return;
        commit((current) => ({ ...current, cameras: current.cameras.map((item) => (item.id === activeCamera.id ? resolvePrevisCameraAlignment(item, transform, snappedPlayhead) : item)) }));
        message.success(t("canvasPrevisUi070"));
    };

    const applyToCanvas = async () => {
        stagedTransaction.end("commit");
        const current = draftRef.current;
        if (!current || !activeShot || !viewportRef.current) return;
        const expected = { scene: current, shotId: activeShot.id };
        setSaving(true);
        try {
            const beauty = await viewportRef.current.capture("beauty", viewMode === "camera" ? current.outputFrame : undefined);
            if (!isPrevisOutputSnapshotCurrent(draftRef.current, expected)) throw new Error("输出期间场景或镜头已变化，请重试");
            const prompt = compilePrevisPrompt(current, activeShot);
            // 先镜像最新 scene，再做 canvas 输出；失败时 draft 保留可继续重试。
            const next = touchPrevisScene(current);
            writeAndPublish(next);
            await onApply({ scene: next, shot: activeShot, prompt, beauty });
            message.success(t("canvasPrevisUi071"));
        } catch (error) {
            message.error(error instanceof Error ? error.message : t("canvasPrevisUi072"));
        } finally {
            setSaving(false);
        }
    };

    const exportClayVideo = async () => {
        stagedTransaction.end("commit");
        const current = draftRef.current;
        if (!current || !activeShot || !viewportRef.current || recording || exportAbortRef.current) return;
        const expected = { scene: current, shotId: activeShot.id };
        const exportSession = threeboxSessionRef.current;
        setRecording(true);
        const wasPlaying = playing;
        const previousPlayhead = playhead;
        const previousViewMode = viewMode;
        const abort = new AbortController();
        exportAbortRef.current = abort;
        setPlayhead(0);
        setPlaying(false);
        setViewMode("camera");
        try {
            const { exportPrevisFrameVideo } = await import("@/services/director-frame-video");
            const clayVideo = await exportPrevisFrameVideo(activeShot.duration, activeShot.fps, async time => {
                if (!isPrevisOutputSnapshotCurrent(draftRef.current, expected) || !viewportRef.current) throw new Error("导出期间场景或镜头已变化，请重试");
                flushSync(() => setPlayhead(time));
                // Let R3F consume the committed playhead before capturing, independent of realtime playback speed.
                for (let frame = 0; frame < 4; frame++) {
                    abort.signal.throwIfAborted();
                    await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
                }
                const state = usePrevisWorkbenchStore.getState();
                if (state.playhead !== time || state.viewMode !== "camera") throw new Error("导出期间播放头或视角已变化，请重试");
                if (!isPrevisOutputSnapshotCurrent(draftRef.current, expected) || !viewportRef.current) throw new Error("导出期间场景或镜头已变化，请重试");
                return viewportRef.current.capture("clay", current.outputFrame);
            }, abort.signal);
            abort.signal.throwIfAborted();
            if (!isPrevisOutputSnapshotCurrent(draftRef.current, expected)) throw new Error("录制期间场景或镜头已变化，请重试");
            const beauty = await viewportRef.current.capture("beauty", current.outputFrame);
            abort.signal.throwIfAborted();
            if (!isPrevisOutputSnapshotCurrent(draftRef.current, expected)) throw new Error("输出期间场景或镜头已变化，请重试");
            const next = touchPrevisScene(draftRef.current || current);
            writeAndPublish(next);
            await onApply({ scene: next, shot: activeShot, prompt: compilePrevisPrompt(next, activeShot), beauty, clayVideo, clayVideoMimeType: clayVideo.type });
            setLastClayExport({ shotId: expected.shotId, at: Date.now() });
            message.success(t("canvasPrevisUi073"));
        } catch (error) {
            message.error(error instanceof Error ? error.message : t("canvasPrevisUi074"));
        } finally {
            if (exportAbortRef.current === abort) exportAbortRef.current = null;
            const restoreState = previsExportRestoreState(threeboxSessionRef.current, exportSession, wasPlaying);
            if (restoreState.restore) {
                setPlaying(restoreState.playing);
                setPlayhead(previousPlayhead);
                setViewMode(previousViewMode);
            }
            setRecording(false);
        }
    };

    /** 当前镜头深度范围：整段镜头固定一次，深度视频不闪烁。 */
    const resolveShotDepthRange = () => {
        const current = draftRef.current;
        const camera = current?.cameras.find((item) => item.id === activeShot?.cameraId) || current?.cameras[0];
        if (!current || !camera || !activeShot) return { near: 0, far: 30 };
        const cameraPositions = [0, activeShot.duration].map((time) => interpolatePrevisTransform(camera.transform, camera.keyframes, time).position);
        const objectPositions = current.objects.filter((item) => item.visible).flatMap((item) => [0, activeShot.duration].map((time) => interpolatePrevisTransform(item.transform, item.keyframes, time).position));
        return resolvePrevisDepthRange({ cameraPositions, objectPositions });
    };

    /**
     * 白模深度捕捉：同一镜头摄影机、同一画幅输出深度图（PNG）与深度视频，回写画布。
     * 近白远黑、固定米制范围；不自动连到镜头节点，避免不支持深度控制的视频模型把它当普通参考。
     */
    const exportDepthPass = async () => {
        stagedTransaction.end("commit");
        const current = draftRef.current;
        if (!current || !activeShot || !viewportRef.current || depthExporting || recording) return;
        const expected = { scene: current, shotId: activeShot.id };
        const range = resolveShotDepthRange();
        setDepthExporting(true);
        try {
            const depth = await viewportRef.current.capture("depth", { depthNear: range.near, depthFar: range.far });
            const recordedDepth = await viewportRef.current.recordVideo(activeShot.duration, activeShot.fps, "depth", { depthNear: range.near, depthFar: range.far });
            const depthVideo = recordedDepth.type === "video/mp4" ? recordedDepth : await transcodeVideoToMp4(recordedDepth);
            if (!isPrevisOutputSnapshotCurrent(draftRef.current, expected)) throw new Error("捕捉期间场景或镜头已变化，请重试");
            const beauty = await viewportRef.current.capture("beauty");
            const next = touchPrevisScene(draftRef.current || current);
            writeAndPublish(next);
            await onApply({ scene: next, shot: activeShot, prompt: compilePrevisPrompt(next, activeShot), beauty, depth, depthVideo });
            message.success(`深度图与深度视频已回写画布（${range.near}–${range.far} 米，近白远黑）`);
        } catch (error) {
            message.error(error instanceof Error ? error.message : "深度捕捉失败");
        } finally {
            setDepthExporting(false);
        }
    };

    const renderModeFileLabel = () => renderModeOptions.find((item) => item.value === renderMode)?.label || "预览";
    const outputFileName = (suffix: string, extension: string) => `${(draftRef.current?.title || "预演").replace(/[\\/:*?"<>|]/g, "_")}-${activeShot?.name || "镜头"}-${suffix}.${extension}`;

    /** 下载与侧栏共用同一帧；提示词、镜头和时间码在捕捉时冻结。 */
    async function downloadShotScreenshot() {
        stagedTransaction.end("commit");
        const current = draftRef.current;
        if (!viewportRef.current || !current || !activeShot || captureRequestRef.current) return;
        const controller = new AbortController();
        captureRequestRef.current = controller;
        setCapturing(true);
        const timecode = formatPrevisTimecode(playhead, activeShot.fps);
        const prompt = compilePrevisPrompt(current, activeShot);
        const title = `${activeShot.name} · ${renderModeFileLabel()}`;
        const fileName = outputFileName(`${renderModeFileLabel()}-${timecode.replaceAll(":", "")}`, "png");
        try {
            const range = renderMode === "depth" ? resolveShotDepthRange() : null;
            const blob = await viewportRef.current.capture(renderMode, { depthNear: range?.near, depthFar: range?.far, signal: controller.signal });
            controller.signal.throwIfAborted();
            setScreenshot({ output: { kind: "screenshot", sceneId: current.id, shotId: activeShot.id, title, prompt, image: blob, renderMode, timecode, duration: activeShot.duration }, url: URL.createObjectURL(blob), added: false });
            setInspectorOpen(true);
            setInspectorDocked(true);
            saveAs(blob, fileName);
            message.success("截图已下载，并保留在右侧预览");
        } catch (error) {
            if (!controller.signal.aborted) message.error(error instanceof Error ? error.message : "截图失败");
        } finally {
            captureRequestRef.current = null;
            setCapturing(false);
        }
    }

    /** 内置录屏 A：镜头摄影机按镜头时长录当前渲染模式，下载 WebM/MP4 原始录制。 */
    const recordShotToFile = async () => {
        if (!viewportRef.current || !activeShot || screenRecording) return;
        const controller = new AbortController();
        recordAbortRef.current = controller;
        setScreenRecording("shot");
        try {
            const range = renderMode === "depth" ? resolveShotDepthRange() : null;
            const blob = await viewportRef.current.recordVideo(activeShot.duration, activeShot.fps, renderMode, { depthNear: range?.near, depthFar: range?.far, signal: controller.signal });
            saveAs(blob, outputFileName(`${renderModeFileLabel()}-录制`, blob.type.includes("mp4") ? "mp4" : "webm"));
            message.success("镜头录制已保存");
        } catch (error) {
            if (!controller.signal.aborted) message.error(error instanceof Error ? error.message : "录制失败");
        } finally {
            recordAbortRef.current = null;
            setScreenRecording(null);
        }
    };

    /** 内置录屏 B：录整个预演台窗口（含面板与操作过程），用于教学、评审和问题复现。 */
    const recordWindowToFile = async () => {
        if (screenRecording || recordAbortRef.current) return;
        if (!navigator.mediaDevices?.getDisplayMedia || typeof MediaRecorder === "undefined") {
            message.error("当前浏览器不支持窗口录屏，请使用 Chrome 或 Edge");
            return;
        }
        const controller = new AbortController();
        recordAbortRef.current = controller;
        setScreenRecording("window");
        let stream: MediaStream | undefined;
        let recorder: MediaRecorder | undefined;
        let failure: string | null = null;
        const finish = () => {
            stream?.getTracks().forEach((track) => track.stop());
            if (recordAbortRef.current === controller) {
                recordAbortRef.current = null;
                windowRecorderRef.current = null;
                setScreenRecording(null);
            }
        };
        try {
            stream = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 30 }, audio: false, preferCurrentTab: true } as DisplayMediaStreamOptions);
            // 共享选择器可能晚于工作台关闭才返回，绝不让晚到的流继续采集。
            if (controller.signal.aborted) {
                finish();
                return;
            }
            const mimeType = ["video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/mp4", "video/webm"].find((type) => MediaRecorder.isTypeSupported(type));
            if (!mimeType) throw new Error("当前浏览器没有可用的视频编码器");
            const activeRecorder = (recorder = new MediaRecorder(stream, { mimeType }));
            const chunks: Blob[] = [];
            const stop = () => {
                if (activeRecorder.state !== "inactive") activeRecorder.stop();
            };
            activeRecorder.ondataavailable = (event) => {
                if (event.data.size) chunks.push(event.data);
            };
            activeRecorder.onerror = () => {
                failure = "窗口录屏编码失败";
                stop();
            };
            activeRecorder.onstop = () => {
                controller.signal.removeEventListener("abort", stop);
                finish();
                if (controller.signal.aborted) return;
                const blob = new Blob(chunks, { type: activeRecorder.mimeType });
                if (failure || !blob.size) message.error(failure || "录屏没有产生视频数据");
                else saveAs(blob, outputFileName("窗口录屏", blob.type.includes("mp4") ? "mp4" : "webm"));
            };
            // 浏览器共享条停止与产品停止按钮共用收尾；取消或卸载不触发迟到下载。
            stream.getVideoTracks()[0]?.addEventListener("ended", stop, { once: true });
            controller.signal.addEventListener("abort", stop, { once: true });
            windowRecorderRef.current = { stop };
            activeRecorder.start(500);
        } catch (error) {
            if (recorder && recorder.state !== "inactive") recorder.stop();
            finish();
            if (!controller.signal.aborted && !(error instanceof DOMException && ["NotAllowedError", "AbortError"].includes(error.name))) {
                message.error(error instanceof Error ? error.message : "窗口录屏失败");
            }
        }
    };

    const stopScreenRecording = () => {
        if (windowRecorderRef.current) windowRecorderRef.current.stop();
        else recordAbortRef.current?.abort();
    };

    /** 第二屏监看：镜头摄影机画面投放到独立窗口，可拖到外接屏全屏。 */
    const toggleMonitor = () => {
        if (monitorRef.current && !monitorRef.current.closed()) {
            monitorRef.current.close();
            return;
        }
        const viewport = viewportRef.current;
        if (!viewport) return;
        let surface: ReturnType<PrevisViewportHandle["createShotSurface"]> | null = null;
        try {
            surface = viewport.createShotSurface({ longEdge: 1920 });
            const activeSurface = surface;
            monitorRef.current = openPrevisMonitorWindow({
                brandName,
                renderFrame: () => {
                    const state = monitorStateRef.current;
                    if (!state.shot) return null;
                    return { canvas: activeSurface.render(state.mode, state.playhead), shotName: state.shot.name, timecode: formatPrevisTimecode(state.playhead, state.shot.fps), mode: state.mode };
                },
                onClosed: () => {
                    activeSurface.dispose();
                    monitorRef.current = null;
                    setMonitorOpen(false);
                },
            });
            setMonitorOpen(true);
            message.info("监看窗口已打开：拖到第二屏幕后按 F 全屏");
        } catch (error) {
            surface?.dispose();
            message.error(error instanceof Error ? error.message : "无法打开监看窗口");
        }
    };

    // 监看窗口每帧读取最新的镜头、渲染模式与播放头；只写 ref，不触发重渲染。
    const monitorStateRef = useRef({ shot: activeShot, mode: renderMode, playhead });
    monitorStateRef.current = { shot: activeShot, mode: renderMode, playhead };
    useEffect(() => {
        monitorRef.current?.setBrandName(brandName);
    }, [brandName]);
    useEffect(
        () => () => {
            monitorRef.current?.close();
            recordAbortRef.current?.abort();
            windowRecorderRef.current?.stop();
        },
        [],
    );

    const sceneActors = draft?.objects.filter((item) => item.kind === "actor" || item.primitive === "character") || [];
    const sceneProps = draft?.objects.filter((item) => item.kind !== "actor" && item.primitive !== "character") || [];
    const normalizedSceneQuery = sceneQuery.trim().toLowerCase();
    const matchesSceneQuery = (name: string, meta = "") => !normalizedSceneQuery || `${name} ${meta}`.toLowerCase().includes(normalizedSceneQuery);
    const visibleSceneActors = sceneActors.filter((actor) => matchesSceneQuery(actor.name, `${actor.archetype || ""} ${actor.pose || ""}`));
    const visibleSceneProps = sceneProps.filter((object) => matchesSceneQuery(object.name, `${object.kind} ${object.primitive || ""}`));
    const visibleCameras = draft?.cameras.filter((camera) => matchesSceneQuery(camera.name, `${camera.focalLength}mm`)) || [];
    const visibleLights = draft?.lights.filter((light) => matchesSceneQuery(light.name, light.type)) || [];
    const selectedActor = sceneActors.find((item) => item.id === selectedObjectId) ?? null;
    const handleGroundClick = useCallback(
        (point: PrevisGroundPoint) => {
            if (!selectedActor || !selectedObjectId) {
                message.info(t("canvasPrevisUi075"));
                return;
            }
            setSelectedObjectId(selectedActor.id);
            handleObjectTransform(selectedActor.id, selectedActor.transform, {
                ...selectedActor.transform,
                position: [point.x, selectedActor.transform.position[1], point.z],
            });
            message.success(t("canvasPrevisUi076"));
        },
        [handleObjectTransform, message, selectedActor],
    );
    const addActorToScene = () => {
        addActor();
        message.success(t("canvasPrevisUi077"));
    };

    const trajectoryTarget = selectedActor ? { kind: "actor" as const, id: selectedActor.id, name: selectedActor.name } : selectedCamera ? { kind: "camera" as const, id: selectedCamera.id, name: selectedCamera.name } : null;
    const trajectoryPreviousViewModeRef = useRef(viewMode);
    const trajectorySessionRef = useRef(false);
    useEffect(() => {
        if (trajectoryDrawing && !trajectorySessionRef.current) {
            trajectorySessionRef.current = true;
            trajectoryPreviousViewModeRef.current = viewMode;
            if (viewMode !== "top") setViewMode("top");
            message.info(trajectoryTarget ? t(trajectoryTarget.kind === "camera" ? "canvasPrevisDyn005" : "canvasPrevisDyn006") : t("canvasPrevisDyn007"));
            return;
        }
        if (!trajectoryDrawing && trajectorySessionRef.current) {
            trajectorySessionRef.current = false;
            setViewMode(trajectoryPreviousViewModeRef.current);
        }
    }, [message, setViewMode, trajectoryDrawing, trajectoryTarget, viewMode]);
    const handleTrajectoryComplete = useCallback(
        (points: PrevisGroundPoint[]) => {
            const current = draftRef.current;
            const shot = current?.shots.find((item) => item.id === current.activeShotId) || current?.shots[0];
            if (!current || !shot || points.length < 2) {
                setTrajectoryDrawing(false);
                if (points.length >= 2 && !trajectoryTarget) message.info(t("canvasPrevisUi081"));
                return;
            }
            if (selectedActor) {
                const y = selectedActor.transform.position[1];
                const path = [[selectedActor.transform.position[0], y, selectedActor.transform.position[2]] as PrevisVec3, ...points.map((point) => [point.x, y, point.z] as PrevisVec3)];
                const keyframes = buildPrevisPathKeyframes({ base: selectedActor.transform, points: path, duration: shot.duration, orientToPath: true });
                commit((scene) => ({ ...scene, objects: scene.objects.map((object) => (object.id === selectedActor.id ? { ...object, keyframes, motionPath: { points: path, speed: "walk", startDelay: 0, orientToPath: true } } : object)) }));
                message.success(t("canvasPrevisUi082"));
            } else if (selectedCamera) {
                const y = selectedCamera.transform.position[1];
                const path = [[selectedCamera.transform.position[0], y, selectedCamera.transform.position[2]] as PrevisVec3, ...points.map((point) => [point.x, y, point.z] as PrevisVec3)];
                const keyframes = buildPrevisPathKeyframes({ base: selectedCamera.transform, points: path, duration: shot.duration });
                commit((scene) => ({ ...scene, cameras: scene.cameras.map((camera) => (camera.id === selectedCamera.id ? { ...camera, keyframes, motionPath: { points: path, speed: "walk", startDelay: 0, orientToPath: false } } : camera)) }));
                message.success(t("canvasPrevisUi083"));
            }
            setTrajectoryDrawing(false);
        },
        [commit, message, selectedActor, selectedCamera, trajectoryTarget],
    );
    const handleMovePathWaypoint = useCallback(
        (kind: "object" | "camera", id: string, index: number, point: PrevisGroundPoint) => {
            const syncPath = <T extends { keyframes: PrevisObject["keyframes"]; motionPath?: PrevisObject["motionPath"] }>(item: T): T => {
                const keyframes = movePrevisPathKeyframe(item.keyframes, index, point, Boolean(item.motionPath?.orientToPath));
                const motionPath = item.motionPath ? { ...item.motionPath, points: keyframes.map((keyframe) => keyframe.transform.position) } : item.motionPath;
                return { ...item, keyframes, motionPath };
            };
            commit((current) => (kind === "object" ? { ...current, objects: current.objects.map((item) => (item.id === id ? syncPath(item) : item)) } : { ...current, cameras: current.cameras.map((item) => (item.id === id ? syncPath(item) : item)) }));
        },
        [commit],
    );


    // ── 演员体型模板 ──────────────────────────────────────────────────────────
    /** 每个模板：name 显示名、archetype、体型 overrides（可覆盖 previsActorProfileForArchetype 默认值）*/
    const ACTOR_TEMPLATES: Array<{ key: string; name: string; labelKey: import("@/lib/interface-locale").InterfaceMessageKey; archetype: import("@/types/previs").PrevisActorArchetype; profileOverrides?: Partial<PrevisActorProfile>; crowd?: boolean }> = [
        { key: "std-male", name: "标准男性", labelKey: "canvasPrevisUi274", archetype: "man" },
        { key: "std-female", name: "标准女性", labelKey: "canvasPrevisUi275", archetype: "woman" },
        { key: "muscular", name: "健硕", labelKey: "canvasPrevisUi276", archetype: "man", profileOverrides: { shoulderWidth: 1.32, torsoRatio: 1.12, height: 1.06 } },
        { key: "slim", name: "纤细", labelKey: "canvasPrevisUi277", archetype: "woman", profileOverrides: { shoulderWidth: 0.78, torsoRatio: 0.88, height: 0.98 } },
        { key: "teen", name: "少年", labelKey: "canvasPrevisUi278", archetype: "child", profileOverrides: { height: 0.86, headRatio: 1.12 } },
        { key: "child", name: "儿童", labelKey: "canvasPrevisUi279", archetype: "child" },
        { key: "stocky", name: "宽厚", labelKey: "canvasPrevisUi280", archetype: "man", profileOverrides: { shoulderWidth: 1.18, torsoRatio: 1.24, height: 0.96 } },
        { key: "chibi", name: "二头身", labelKey: "canvasPrevisUi281", archetype: "adult", profileOverrides: { height: 0.62, headRatio: 1.68 } },
    ];

    const addActorFromTemplate = (template: (typeof ACTOR_TEMPLATES)[number]) => {
        const existingActors = draft?.objects.filter((item) => item.kind === "actor" || item.primitive === "character") || [];
        const colorIndex = existingActors.length % PREVIS_ACTOR_COLORS.length;
        const baseProfile = previsActorProfileForArchetype(template.archetype);
        const actorProfile = template.profileOverrides ? { ...baseProfile, ...template.profileOverrides } : baseProfile;
        const actor = { ...createPrevisActor(`${template.name} ${existingActors.length + 1}`, [0, 0, 0], PREVIS_ACTOR_COLORS[colorIndex], template.archetype), actorProfile };
        addObject(actor);
        message.success(t("canvasPrevisDyn008", { label: t(template.labelKey) }));
    };

    const addCrowdActors = () => {
        const existingActors = draft?.objects.filter((item) => item.kind === "actor" || item.primitive === "character") || [];
        const base = existingActors.length;
        for (let row = 0; row < 3; row++) {
            for (let col = 0; col < 3; col++) {
                const idx = base + row * 3 + col;
                const colorIndex = idx % PREVIS_ACTOR_COLORS.length;
                const actor = createPrevisActor(`群众 ${idx + 1}`, [col * 1.1 - 1.1, 0, row * 1.1 - 1.1], PREVIS_ACTOR_COLORS[colorIndex]);
                addObject(actor);
            }
        }
        message.success(t("canvasPrevisUi084"));
    };

    const actorTemplateMenuItems: MenuProps["items"] = [
        { key: "upload", icon: <FileUp className="size-3.5" />, label: t("canvasPrevisUi085"), onClick: () => modelInputRef.current?.click() },
        { type: "divider" },
        ...ACTOR_TEMPLATES.map((template) => ({
            key: template.key,
            icon: <UserRound className="size-3.5" />,
            label: t(template.labelKey),
            onClick: () => addActorFromTemplate(template),
        })),
        { type: "divider" },
        { key: "crowd", icon: <Users className="size-3.5" />, label: t("canvasPrevisUi086"), onClick: addCrowdActors },
        {
            key: "geometry",
            icon: <Box className="size-3.5" />,
            label: t("canvasPrevisUi087"),
            children: [
                { key: "geo-upload", icon: <FileUp className="size-3.5" />, label: t("createUpload"), onClick: () => modelInputRef.current?.click() },
                { key: "geo-box", icon: <Box className="size-3.5" />, label: t("canvasPrevisUi061"), onClick: () => addPrimitive("box", "立方体") },
                { key: "geo-sphere", icon: <Circle className="size-3.5" />, label: t("canvasPrevisUi062"), onClick: () => addPrimitive("sphere", "球体") },
                { key: "geo-cyl", icon: <Cuboid className="size-3.5" />, label: t("canvasPrevisUi088"), onClick: () => addPrimitive("cylinder", "圆柱体") },
                { key: "geo-torus", icon: <Circle className="size-3.5" />, label: t("canvasPrevisUi089"), onClick: () => addPrimitive("sphere", "环状体") },
                { key: "geo-cone", icon: <Square className="size-3.5" />, label: t("canvasPrevisUi090"), onClick: () => addPrimitive("plane", "圆锥") },
                { key: "geo-plane", icon: <Square className="size-3.5" />, label: t("canvasPrevisUi091"), onClick: () => addPrimitive("plane", "平面") },
                { key: "geo-null", icon: <Plus className="size-3.5" />, label: t("canvasPrevisUi092"), onClick: () => addPrimitive("box", "空对象") },
            ],
        },
    ];

    // ── 机位预设 ────────────────────────────────────────────────────────────────
    type CameraPreset = {
        key: string;
        label: string;
        position: [number, number, number];
        target: [number, number, number];
        fov: number;
        isCurrentView?: boolean;
    };
    const CAMERA_PRESETS: CameraPreset[] = [
        { key: "current", label: t("canvasPrevisUi093"), position: [4.8, 2.7, 6.8], target: [0, 1, 0], fov: 50, isCurrentView: true },
        { key: "front-medium", label: t("canvasPrevisUi094"), position: [0, 1.4, 4.0], target: [0, 1, 0], fov: 50 },
        { key: "front-cu", label: t("canvasPrevisUi095"), position: [0, 1.65, 1.8], target: [0, 1.6, 0], fov: 40 },
        { key: "front-wide", label: t("canvasPrevisUi096"), position: [0, 2.0, 7.5], target: [0, 1, 0], fov: 60 },
        { key: "side-follow", label: t("canvasPrevisUi097"), position: [3.8, 1.4, 0], target: [0, 1, 0], fov: 50 },
        { key: "side-cu", label: t("canvasPrevisUi098"), position: [2.0, 1.65, 0], target: [0, 1.6, 0], fov: 45 },
        { key: "back-medium", label: t("canvasPrevisUi099"), position: [0, 1.4, -4.0], target: [0, 1, 0], fov: 50 },
        { key: "bird-wide", label: t("canvasPrevisUi100"), position: [0, 6.5, 3.5], target: [0, 0, 0], fov: 65 },
        { key: "angle-45", label: t("canvasPrevisUi101"), position: [3.0, 4.5, 4.5], target: [0, 0.8, 0], fov: 55 },
        { key: "low-uptilt", label: t("canvasPrevisUi102"), position: [0, 0.3, 3.5], target: [0, 2.2, 0], fov: 55 },
        { key: "low-wide", label: t("canvasPrevisUi103"), position: [0, 0.5, 4.5], target: [0, 1.2, 0], fov: 75 },
        { key: "ots-left", label: t("canvasPrevisUi104"), position: [-1.1, 1.75, 2.2], target: [0.6, 1.65, 0], fov: 50 },
        { key: "ots-right", label: t("canvasPrevisUi105"), position: [1.1, 1.75, 2.2], target: [-0.6, 1.65, 0], fov: 50 },
        { key: "birds-eye", label: t("canvasPrevisUi106"), position: [0, 9.0, 0.1], target: [0, 0, 0], fov: 70 },
        { key: "dutch", label: t("canvasPrevisUi107"), position: [2.8, 1.7, 4.0], target: [0, 1.2, 0], fov: 52 },
    ];

    const addCameraPreset = (preset: CameraPreset) => {
        if (preset.isCurrentView) {
            const transform = viewportRef.current?.readCameraTransform();
            if (transform) {
                const cam = { ...createPrevisCamera(`机位 ${(draft?.cameras.length || 0) + 1}`), transform, target: preset.target };
                commit((current) => ({ ...current, cameras: [...current.cameras, cam] }));
                if (activeShot) updateShot(activeShot.id, { cameraId: cam.id });
                setViewMode("camera");
                message.success(t("canvasPrevisUi108"));
            } else {
                addCamera();
                message.info(t("canvasPrevisUi109"));
            }
            return;
        }
        const cam = {
            ...createPrevisCamera(`机位 ${(draft?.cameras.length || 0) + 1}`),
            transform: { position: preset.position, rotation: [0, 0, 0] as [number, number, number], scale: [1, 1, 1] as [number, number, number] },
            target: preset.target,
            fov: preset.fov,
        };
        commit((current) => ({ ...current, cameras: [...current.cameras, cam] }));
        if (activeShot) updateShot(activeShot.id, { cameraId: cam.id });
        setViewMode("camera");
        message.success(t("canvasPrevisDyn009", { preset: preset.label }));
    };

    const cameraPresetMenuItems: MenuProps["items"] = CAMERA_PRESETS.map((preset) => ({
        key: preset.key,
        icon: <Camera className="size-3.5" />,
        label: preset.label,
        onClick: () => addCameraPreset(preset),
    }));

    const enterAnimationMode = useCallback(() => {
        stagedTransaction.end("commit");
        if (selectedActor) {
            setSelectedObjectId(selectedActor.id);
            setSelectedLightId(null);
            setSelectedBone(null);
        }
        setPlaying(false);
        setMode("animate");
        setSequencerVisible(true);
    }, [selectedActor, setMode, setPlaying, setSelectedBone, setSelectedLightId, setSelectedObjectId, setSequencerVisible, stagedTransaction]);

    useEffect(() => {
        const onPreviewRequested = (event: Event) => {
            const detail = (event as CustomEvent<PrevisPreviewRequest>).detail;
            if (!isPrevisPreviewRequestForWorkbench({ request: detail, canvasId: effectiveCanvasId, sceneId: draft?.id, activeShotId: activeShot?.id })) return;
            const requestKey = previsPreviewRequestKey(detail);
            if (handledPreviewRequestsRef.current.has(requestKey)) return;
            // 标记发生在 recording 判断之前：录制期间的重复/并发事件也不能在录制结束后再次执行。
            handledPreviewRequestsRef.current.add(requestKey);
            if (handledPreviewRequestsRef.current.size > 64) {
                const oldest = handledPreviewRequestsRef.current.values().next().value;
                if (typeof oldest === "string") handledPreviewRequestsRef.current.delete(oldest);
            }
            if (recording) return;
            void exportClayVideo();
        };
        window.addEventListener("previs:preview-requested", onPreviewRequested);
        return () => window.removeEventListener("previs:preview-requested", onPreviewRequested);
    }, [activeShot?.id, draft?.id, effectiveCanvasId, exportClayVideo]);

    if (!open || !draft || !activeShot) return null;

    const saveStatusClass = saveIndicator.tone === "danger" ? "is-danger" : saveIndicator.busy ? "is-busy" : "";
    // 位于 early return 之后，不能使用 Hook；每次渲染直接派生主题变量。
    const workbenchThemeStyle = {
        "--pd-s0": theme.canvas.background,
        "--pd-s1": theme.toolbar.panel,
        "--pd-s2": theme.toolbar.activeBg,
        "--pd-s3": theme.toolbar.itemHover,
        "--pd-s4": theme.toolbar.activeBg,
        "--pd-s5": theme.spatial.elevated,
        "--pd-b0": theme.toolbar.border,
        "--pd-b1": theme.node.stroke,
        "--pd-b2": theme.node.activeStroke,
        "--pd-t0": theme.node.text,
        "--pd-t1": theme.node.muted,
        "--pd-t2": theme.node.muted,
        "--pd-t3": theme.node.faint,
        "--pd-a0": theme.accent.primary,
        "--pd-a1": theme.accent.primary,
        "--pd-a-bg": theme.accent.primarySoft,
        "--pd-a-bd": theme.node.activeStroke,
        "--pd-a-on": theme.accent.onPrimary,
        "--pd-accent-rgb": theme.accent.primary === "#171717" || theme.accent.primary === "#f5f5f5" ? "255 255 255" : "79 140 255",
        "--previs-accent": theme.accent.primary,
        "--pd-a-on-theme": theme.accent.onPrimary,
        "--pd-a-bg-theme": theme.accent.primarySoft,
        "--pd-a-bd-theme": theme.node.activeStroke,
    } as CSSProperties;

    return (
        <div data-canvas-previs-workbench data-canvas-no-zoom className="previs-desk fixed inset-0 z-[var(--z-toast)] flex min-h-0 min-w-0 flex-col overflow-hidden" style={workbenchThemeStyle}>
            <header className="previs-desk-header thin-scrollbar overflow-x-auto overflow-y-hidden">
                <button type="button" className="previs-desk-icon-button" aria-label={t("canvasPrevisUi113")} title={t("canvasPrevisUi113")} onClick={closeWorkbench}>
                    <X className="size-4" />
                </button>
                <div className="previs-desk-brand">
                    <span className="previs-desk-logo" title={brandName}>
                        {brandName}
                    </span>
                    <span className="previs-desk-brand-title">{t("canvasPrevisUi115")}</span>
                    <span className="previs-desk-brand-sub">{t("canvasPrevisUi116")}</span>
                </div>
                <span className="previs-desk-divider" />
                <input className="previs-desk-scene-title" aria-label={t("canvasPrevisUi117")} value={draft.title} onChange={(event) => replaceWithoutHistory((current) => ({ ...current, title: event.target.value }))} />
                <div className="previs-desk-history">
                    <button type="button" aria-label={t("canvasToolbarUndo")} title={t("canvasPrevisUi118")} disabled={!history.length} onClick={undo}>
                        <Undo2 className="size-4" />
                    </button>
                    <button type="button" aria-label={t("canvasToolbarRedo")} title={t("canvasPrevisUi119")} disabled={!future.length} onClick={redo}>
                        <Redo2 className="size-4" />
                    </button>
                </div>
                <div className="previs-desk-context-summary" aria-label={t("canvasPrevisUi120")}>
                    <span className="previs-desk-context-dot" />
                    <span>{selectedActor ? t("canvasPrevisDyn010", { name: selectedActor.name }) : selectedLight ? t("canvasPrevisDyn011", { name: selectedLight.name }) : selectedCameraId ? t("canvasPrevisDyn012", { name: selectedCamera?.name || activeCamera?.name || t("canvasPrevisUi121") }) : t("canvasPrevisDyn013", { name: activeShot.name })}</span>
                </div>
                <nav className="previs-mode-switch" aria-label={t("canvasPrevisUi122")}>
                    {PREVIS_MODES.map((item) => (
                        <button
                            key={item.mode}
                            type="button"
                            className={`previs-mode-switch-button ${mode === item.mode ? "is-active" : ""}`}
                            aria-pressed={mode === item.mode}
                            data-mode={item.mode}
                            title={t(`previsGuide.${item.mode}Hint`)}
                            onClick={(event) => {
                                setMode(item.mode);
                                releasePrevisFocusAfterPointer(event);
                            }}
                        >
                            {t(`previsGuide.${item.mode}`)}
                        </button>
                    ))}
                </nav>
                <div className="previs-desk-header-spacer" />
                <span className={`previs-desk-save ${saveStatusClass}`} aria-live="polite">
                    {saveIndicator.label}
                </span>
                {saveIndicator.retryable ? (
                    <button type="button" className="previs-desk-header-action" aria-label={t("canvasUi.retrySave")} disabled={retrying || saveIndicator.busy} onClick={() => void retrySave()}>
                        <RotateCcw className="size-3.5" />
                        {t("canvasUi.retrySave")}
                    </button>
                ) : null}
                {onboardingScope ? (
                    <button type="button" className="previs-desk-icon-button" aria-label={t("canvasPrevisUi123")} title={t("canvasPrevisUi123")} onClick={() => setOnboardingRestartSignal((value) => value + 1)}>
                        <Lightbulb className="size-4" />
                    </button>
                ) : null}
                <button type="button" className="pv-icon-btn" aria-label={t("previsGuide.addScene")} title={t("previsGuide.addSceneHint")} onClick={() => openAddDialog("actor")}>
                                <Plus className="size-4" />
                            </button>
<Select className="previs-desk-header-select" aria-label={t("canvasPrevisUi124")} value={renderMode} options={renderModeOptions} onChange={(value: PrevisRenderMode) => setRenderMode(value)} size="small" />
                <button type="button" className="previs-desk-header-action" aria-label={t("previsToolbar.capture")} disabled={capturing} onClick={() => void downloadShotScreenshot()}>
                    <Aperture className="size-3.5" />
                    {t("previsToolbar.capture")}
                </button>
                {screenRecording ? (
                    <button type="button" className="previs-desk-header-action is-recording" aria-pressed onClick={stopScreenRecording}>
                        <RecordDot className="size-3.5" />
                        {t("previsToolbar.stop")}
                    </button>
                ) : (
                    <Dropdown trigger={["click"]} placement="bottomRight" classNames={{ root: "previs-add-menu-overlay" }} menu={{ items: [
                        { key: "shot", label: t("previsToolbar.recordShot"), onClick: () => void recordShotToFile() },
                        { key: "window", label: t("previsToolbar.recordWindow"), onClick: () => void recordWindowToFile() },
                    ] }}>
                        <button type="button" className="previs-desk-header-action">
                            <RecordDot className="size-3.5" />
                            {t("previsToolbar.record")}
                        </button>
                    </Dropdown>
                )}
                <button type="button" className={`previs-desk-header-action ${monitorOpen ? "is-active" : ""}`} aria-pressed={monitorOpen} onClick={toggleMonitor}>
                    <MonitorUp className="size-3.5" />
                    {t(monitorOpen ? "previsToolbar.closeMonitor" : "previsToolbar.monitor")}
                </button>
                <button type="button" className="previs-desk-header-action" onClick={() => void exportClayVideo()} disabled={recording || depthExporting}>
                    <Video className="size-3.5" />
                    {t("canvasPrevisUi125")}
                </button>
                <button type="button" className="previs-desk-header-action" onClick={() => void exportDepthPass()} disabled={recording || depthExporting}>
                    <Layers className="size-3.5" />
                    {t(depthExporting ? "previsToolbar.capturing" : "previsToolbar.depth")}
                </button>
                <button type="button" className="previs-desk-header-action is-primary" onClick={() => void applyToCanvas()} disabled={saving}>
                    <Save className="size-3.5" />
                    {t("canvasPrevisUi126")}
                </button>
            </header>

            <div className={`pv-layout ${sceneDocked ? "" : "is-scene-collapsed"} ${inspectorDocked ? "" : "is-inspector-collapsed"}`}>
                {/* LEFT: Scene Entity List */}
                <aside className={`pv-panel pv-panel--left thin-scrollbar ${scenePanelOpen ? "is-open" : ""}`}>
                    <div className="pv-panel-header">
                        <div className="pv-panel-header__title">
                            <span className="pv-panel-header__label">{t("contextEnvironmentCategory")}</span>
                            <span className="pv-panel-header__count">{draft.objects.length + draft.cameras.length}</span>
                        </div>
                        <div className="pv-panel-header__actions">
                            <Dropdown menu={{ items: actorTemplateMenuItems }} trigger={["click"]} placement="bottomRight" classNames={{ root: "previs-add-menu-overlay" }}>
                                <button type="button" aria-label={t("canvasPrevisUi127")} className="pv-icon-btn" title={t("canvasPrevisUi127")}>
                                    <UserRound className="size-4" />
                                </button>
                            </Dropdown>
                            <Dropdown menu={{ items: addObjectMenuItems }} trigger={["click"]} placement="bottomRight" classNames={{ root: "previs-add-menu-overlay" }}>
                                <button type="button" aria-label={t("canvasPrevisUi128")} className="pv-icon-btn" title={t("canvasPrevisUi128")}>
                                    <Box className="size-4" />
                                </button>
                            </Dropdown>
                            <Dropdown menu={{ items: addLightMenuItems }} trigger={["click"]} placement="bottomRight" classNames={{ root: "previs-add-menu-overlay" }}>
                                <button type="button" aria-label={t("canvasPrevisUi129")} className="pv-icon-btn" title={t("canvasPrevisUi129")}>
                                    <Lightbulb className="size-4" />
                                </button>
                            </Dropdown>
                            <Dropdown menu={{ items: cameraPresetMenuItems }} trigger={["click"]} placement="bottomRight" classNames={{ root: "previs-add-menu-overlay" }}>
                                <button type="button" aria-label={t("canvasPrevisUi130")} className="pv-icon-btn" title={t("canvasPrevisUi130")}>
                                    <Camera className="size-4" />
                                </button>
                            </Dropdown>
                            <button type="button" className="pv-icon-btn pv-panel-close" aria-label={t("canvasPrevisUi131")} title={t("canvasPrevisUi131")} onClick={() => setScenePanelOpen(false)}>
                                <X className="size-3.5" />
                            </button>
                        </div>
                    </div>
                    <label className="pv-scene-search">
                        <Search className="size-3.5" />
                        <input aria-label={t("canvasPrevisUi132")} value={sceneQuery} onChange={(event) => setSceneQuery(event.target.value)} placeholder={t("canvasPrevisUi133")} />
                        {sceneQuery ? (
                            <button type="button" aria-label={t("galleryClearSearch")} onClick={() => setSceneQuery("")}>
                                <X className="size-3" />
                            </button>
                        ) : null}
                    </label>

                    {visibleSceneActors.length > 0 ? (
                        <section className="pv-entity-section">
                            <div className="pv-entity-section__label">
                                {t("contextCharacterCategory")}{" "}
                                <span>
                                    {visibleSceneActors.length}
                                    {visibleSceneActors.length !== sceneActors.length ? `/${sceneActors.length}` : ""}
                                </span>
                            </div>
                            {visibleSceneActors.map((actor) => {
                                const isSelected = selectedActor?.id === actor.id;
                                const color = resolvePrevisActorColor(actor.color);
                                return (
                                    <div key={actor.id} className={`pv-entity-row ${isSelected ? "pv-entity-row--active" : ""}`}>
                                        <button type="button" className="pv-entity-row__main" onMouseDown={stopPrevisEntityPointer} onPointerDown={stopPrevisEntityPointer} onClick={() => selectSceneObject(actor.id)} aria-pressed={isSelected}>
                                            <span className="pv-entity-row__avatar" style={{ background: color }}>
                                                <UserRound className="size-3" />
                                            </span>
                                            <span className="pv-entity-row__info">
                                                <span className="pv-entity-row__name">{actor.name}</span>
                                                <span className="pv-entity-row__meta">
                                                    {previsActorDisplayLabel(actor.archetype || "adult", t)} · {actor.pose ? previsPoseDisplayLabel(actor.pose, t) : t("canvasPrevisUi134")}
                                                </span>
                                            </span>
                                        </button>
                                        <button type="button" className="pv-entity-row__del" aria-label={t("canvasPrevisDyn014", { label: actor.name })} onClick={() => removeObject(actor.id)}>
                                            <X className="size-3" />
                                        </button>
                                    </div>
                                );
                            })}
                        </section>
                    ) : (
                        <div className="pv-empty-hint">
                            <UserRound className="size-5 opacity-30" />
                            <span>{t("canvasPrevisUi135")}</span>
                            <Dropdown menu={{ items: actorTemplateMenuItems }} trigger={["click"]} placement="bottom" classNames={{ root: "previs-add-menu-overlay" }}>
                                <button type="button" className="pv-btn pv-btn--accent pv-btn--sm">
                                    {t("canvasPrevisUi127")}
                                </button>
                            </Dropdown>
                        </div>
                    )}

                    <section className="pv-entity-section">
                        <div className="pv-entity-section__label">
                            <span>
                                {t("canvasPrevisUi008")}{" "}
                                <span className="pv-entity-section__count">
                                    {visibleCameras.length}
                                    {visibleCameras.length !== draft.cameras.length ? `/${draft.cameras.length}` : ""}
                                </span>
                            </span>
                        </div>
                        {visibleCameras.map((camera) => {
                            const isViewed = (selectedCameraId || activeShot?.cameraId) === camera.id;
                            const isActiveShotCamera = activeShot?.cameraId === camera.id;
                            return (
                                <div key={camera.id} className={`pv-entity-row ${isViewed && !selectedObjectId ? "pv-entity-row--active" : ""}`}>
                                    <button type="button" className="pv-entity-row__main" onMouseDown={stopPrevisEntityPointer} onPointerDown={stopPrevisEntityPointer} onClick={() => selectSceneCamera(camera.id)} aria-pressed={isViewed}>
                                        <span className="pv-entity-row__icon">
                                            <Camera className="size-3.5" />
                                        </span>
                                        <span className="pv-entity-row__info">
                                            <span className="pv-entity-row__name">{camera.name}</span>
                                            <span className="pv-entity-row__meta">
                                                {camera.focalLength}mm · f/{camera.aperture}
                                            </span>
                                        </span>
                                        {isViewed ? <span className="pv-entity-row__badge">{isActiveShotCamera ? t("canvasUi.current") : t("storageUi.viewOrder")}</span> : null}
                                    </button>
                                    {draft.cameras.length > 1 ? (
                                        <button type="button" className="pv-entity-row__del" aria-label={t("canvasPrevisDyn014", { label: camera.name })} onClick={() => removeCamera(camera.id)}>
                                            <X className="size-3" />
                                        </button>
                                    ) : null}
                                </div>
                            );
                        })}
                    </section>

                    {visibleSceneProps.length > 0 ? (
                        <section className="pv-entity-section">
                            <div className="pv-entity-section__label">
                                {t("contextPropCategory")}{" "}
                                <span>
                                    {visibleSceneProps.length}
                                    {visibleSceneProps.length !== sceneProps.length ? `/${sceneProps.length}` : ""}
                                </span>
                            </div>
                            {visibleSceneProps.map((obj) => (
                                <div key={obj.id} className={`pv-entity-row ${selectedObjectId === obj.id ? "pv-entity-row--active" : ""}`}>
                                    <button type="button" className="pv-entity-row__main" onMouseDown={stopPrevisEntityPointer} onPointerDown={stopPrevisEntityPointer} onClick={() => selectSceneObject(obj.id)}>
                                        <span className="pv-entity-row__color-dot" style={{ background: obj.color }} />
                                        <span className="pv-entity-row__info">
                                            <span className="pv-entity-row__name">{obj.name}</span>
                                            <span className="pv-entity-row__meta">
                                                {obj.kind === "billboard" ? t("contextFrame") : obj.kind === "model" ? t("creationModelsShort") : obj.primitive === "plane" ? t("canvasPrevisUi091") : obj.primitive === "sphere" ? t("canvasPrevisUi062") : obj.primitive === "cylinder" ? t("canvasPrevisUi063") : t("canvasPrevisUi136")} ·{" "}
                                                {obj.transform.scale.map((v) => v.toFixed(1)).join("×")}m
                                            </span>
                                        </span>
                                    </button>
                                    <button type="button" className="pv-entity-row__del" aria-label={t("canvasPrevisDyn014", { label: obj.name })} onClick={() => removeObject(obj.id)}>
                                        <X className="size-3" />
                                    </button>
                                </div>
                            ))}
                        </section>
                    ) : null}

                    <PrevisPropLibraryPanel
                        onAdd={(prop) => {
                            const object = createPrevisObject(prop.primitive, prop.name);
                            addObject({ ...object, transform: { ...object.transform, scale: previsPropScale(prop) } });
                        }}
                        onUpload={() => modelInputRef.current?.click()}
                    />

                    {modelAssets.length ? (
                        <section className="pv-entity-section">
                            <div className="pv-entity-section__label">
                                {t("canvasPrevisUi139")} <span>{modelAssets.length}</span>
                            </div>
                            {modelAssets.map((asset) => (
                                <button key={asset.id} type="button" className="pv-entity-row" onClick={() => addModelAsset(asset)}>
                                    <span className="pv-entity-row__icon">
                                        <BoxSelect className="size-3.5" />
                                    </span>
                                    <span className="pv-entity-row__info">
                                        <span className="pv-entity-row__name">{asset.title}</span>
                                        <span className="pv-entity-row__meta">{t("canvasPrevisUi140")}</span>
                                    </span>
                                </button>
                            ))}
                        </section>
                    ) : null}

                    {imageNodes.length > 0 ? (
                        <section className="pv-entity-section">
                            <div className="pv-entity-section__label">{t("canvasPrevisUi141")}</div>
                            <div className="pv-bg-list">
                                {imageNodes.slice(0, 4).map((node) => {
                                    const linked = draft.objects.find((o) => o.sourceNodeId === node.id);
                                    const isPanorama = draft.environment?.sourceNodeId === node.id;
                                    return (
                                        <div key={node.id} className="pv-bg-row">
                                            <button
                                                type="button"
                                                className="pv-bg-row__thumb"
                                                onMouseDown={stopPrevisEntityPointer}
                                                onPointerDown={stopPrevisEntityPointer}
                                                onClick={() => (linked ? selectSceneObject(linked.id) : void addBillboard(node))}
                                                title={node.title || t("canvasPrevisUi142")}
                                            >
                                                {node.metadata?.content ? <img src={node.metadata.content} alt="" className="pv-bg-row__img" /> : <ImageIcon className="size-3.5 opacity-50" />}
                                                <span className="pv-bg-row__name">{node.title || t("contextImage")}</span>
                                            </button>
                                            <div className="pv-bg-row__btns">
                                                <button type="button" className={`pv-bg-btn ${isPanorama ? "pv-bg-btn--active" : ""}`} title={t("canvasPrevisUi143")} onClick={() => setPanoramaEnvironment(node)}>
                                                    360°
                                                </button>
                                                {linked ? (
                                                    <button type="button" className="pv-bg-btn pv-bg-btn--danger" title={t("assetsUi.remove")} onClick={() => removeObject(linked.id)}>
                                                        <X className="size-3" />
                                                    </button>
                                                ) : (
                                                    <button type="button" className="pv-bg-btn" title={t("canvasPrevisUi144")} onClick={() => void addBillboard(node)}>
                                                        {t("agentSkillLibraryUiAdd")}
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                            {draft.environment?.mode === "panorama" ? (
                                <div className="pv-panorama-badge">
                                    <span>{t("canvasPrevisUi145")}</span>
                                    <button type="button" onClick={clearPanoramaEnvironment}>
                                        {t("assetsUi.remove")}
                                    </button>
                                </div>
                            ) : null}
                        </section>
                    ) : null}

                    <section className="pv-entity-section">
                        <div className="pv-entity-section__label">
                            {t("canvasPrevisUi009")}{" "}
                            <span>
                                {visibleLights.length}
                                {visibleLights.length !== draft.lights.length ? `/${draft.lights.length}` : ""}
                            </span>
                        </div>
                        {visibleLights.map((light) => (
                            <div key={light.id} className={`pv-entity-row ${selectedLightId === light.id ? "pv-entity-row--active" : ""}`}>
                                <button
                                    type="button"
                                    className="pv-entity-row__main"
                                    onClick={() => {
                                        setSelectedObjectId(null);
                                        setSelectedCameraId(null);
                                        setSelectedLightId(light.id);
                                        setInspectorOpen(true);
                                        setInspectorDocked(true);
                                    }}
                                >
                                    <Lightbulb className="size-3.5 opacity-50 flex-shrink-0" />
                                    <span className="pv-entity-row__info">
                                        <span className="pv-entity-row__name">{light.name}</span>
                                        <span className="pv-entity-row__meta">
                                            {light.type === "directional" ? t("canvasPrevisUi146") : light.type === "point" ? t("canvasPrevisUi057") : light.type === "spot" ? t("canvasPrevisUi147") : t("canvasPrevisUi148")} × {light.intensity.toFixed(1)}
                                        </span>
                                    </span>
                                </button>
                                <button type="button" className="pv-entity-row__del" aria-label={t("canvasPrevisDyn014", { label: light.name })} onClick={() => removeLight(light.id)}>
                                    <X className="size-3" />
                                </button>
                            </div>
                        ))}
                    </section>
                </aside>

                {/* CENTER: Single viewport with contextual tool layer */}
                <main className="pv-viewport-area">
                    <PrevisViewport
 onMovePathWaypoint={handleMovePathWaypoint}
                        ref={viewportRef}
                        scene={draft}
                        selectedObjectId={selectedObjectId}
                        selectedBone={null}
                        transformMode={transformMode}
                        renderMode={renderMode}
                        playhead={playhead}
                        playing={playing}
                        showMotionPaths={capabilities.timeline}
                        trajectoryDrawing={trajectoryDrawing}
                        onTrajectoryComplete={handleTrajectoryComplete}
                        viewMode={viewMode}
                        onSelectObject={setSelectedObjectId}
                        onSelectBone={setSelectedBone}
                        onGroundClick={handleGroundClick}
                        onObjectTransform={handleObjectTransform}
                        onBoneTransform={handleBoneTransform}
                        onActorRigReady={handleActorRigReady}
                        selectedCameraId={selectedCameraId}
                        onSelectCamera={(id) => {
                            setSelectedCameraId(id);
                            setSelectedObjectId(null);
                            setSelectedLightId(null);
                            setViewMode("camera");
                        }}
                        onCameraTransform={handleCameraTransform}
                        showModelLoadNotice
                        showNavigation={false}
                    />
                    <CanvasPrevisOnboarding scope={onboardingScope} open={open} restartSignal={onboardingRestartSignal} className="pv-onboarding" />
                    {viewMode === "camera" && (selectedCamera || activeCamera) ? (
                        <div className="pv-cam-hud" role="status">
                            <Camera className="size-3" />
                            <span>{(selectedCamera || activeCamera)?.name}</span>
                            <span className="pv-cam-hud__meta">{(selectedCamera || activeCamera)?.focalLength}mm</span>
                            <span className="pv-cam-hud__meta">{previsAspectOption(activeShot.aspectRatio).label}</span>
                        </div>
                    ) : null}
                    {trajectoryDrawing ? (
                        <div className="pv-trajectory-guide" role="status">
                            <Route className="size-3.5" />
                            {trajectoryTarget ? (
                                <>
                                    <span>
                                        {t("canvasPrevisDyn015", { name: trajectoryTarget.name, action: t(trajectoryTarget.kind === "camera" ? "canvasPrevisUi149" : "canvasPrevisUi150") })}
                                    </span>
                                    <small>{t("canvasPrevisUi151")}</small>
                                </>
                            ) : (
                                <>
                                    <span>{t("canvasPrevisUi152")}</span>
                                    <small>{t("canvasPrevisUi153")}</small>
                                </>
                            )}
                        </div>
                    ) : null}
                    <PrevisCanvasDock
 shortcutHelpOpen={shortcutHelpOpen}
 onToggleShortcutHelp={() => setShortcutHelpOpen((value) => !value)}
                        theme={theme}
                        transformMode={transformMode}
                        onTransformModeChange={setTransformMode}
                        trajectoryDrawing={trajectoryDrawing}
                        trajectoryKind={trajectoryTarget?.kind ?? null}
                        onToggleTrajectory={() => setTrajectoryDrawing((active) => !active)}
                        viewMode={viewMode}
                        onViewModeChange={setViewMode}
                        aspectRatio={activeShot.aspectRatio}
                        onAspectRatioChange={(aspectRatio) => {
                            if (aspectRatio !== previsAspectOption(activeShot.aspectRatio).value) updateShot(activeShot.id, { aspectRatio });
                            // 画幅只在机位视图里有安全框：选完直接切过去，看到的就是成片取景。
                            setViewMode("camera");
                        }}
                        cameras={draft.cameras}
                        viewedCameraId={selectedCameraId || activeShot.cameraId || null}
                        onViewCamera={(id) => {
                            setSelectedCameraId(id);
                            setSelectedObjectId(null);
                            setSelectedLightId(null);
                            setViewMode("camera");
                        }}
                        onFocusSelected={() => viewportRef.current?.focusSelected()}
                        onFrameScene={() => viewportRef.current?.frameScene()}
                        onZoom={(factor) => viewportRef.current?.zoom(factor)}
                        timelineOpen={capabilities.timeline && sequencerVisible}
                        onOpenTimeline={enterAnimationMode}
                        scenePanelOpen={compactLayout ? scenePanelOpen : sceneDocked}
                        onToggleScenePanel={() => (compactLayout ? setScenePanelOpen((value) => !value) : setSceneDocked((value) => !value))}
                        inspectorOpen={compactLayout ? inspectorOpen : inspectorDocked}
                        onToggleInspector={() => (compactLayout ? setInspectorOpen((value) => !value) : setInspectorDocked((value) => !value))}
                    />
                </main>

                {/* RIGHT: Shot settings + output */}
                <aside className={`pv-panel pv-panel--right thin-scrollbar ${inspectorOpen ? "is-open" : ""}`}>
                    <div className="pv-panel-header">
                        <div className="pv-panel-header__title">
                            <span className="pv-panel-header__label">{selectedObject?.name || selectedLight?.name || inspectorCamera?.name || activeShot.name}</span>
                            <span className="pv-panel-header__sub">{selectedObject ? t("canvasPrevisUi007") : selectedLight ? t("canvasPrevisUi009") : selectedCameraId ? t("canvasPrevisUi121") : t("creationPageShot")}</span>
                        </div>
                        <div className="pv-panel-header__actions">
                            <button type="button" className="pv-icon-btn" aria-label={t("creationPageAddShot")} title={t("creationPageAddShot")} onClick={addShot}>
                                <Plus className="size-3.5" />
                            </button>
                            <button type="button" className="pv-icon-btn" aria-label={t("canvasPrevisUi154")} title={t("canvasPrevisUi154")} onClick={enterAnimationMode}>
                                <WandSparkles className="size-3.5" />
                            </button>
                            <button type="button" className="pv-icon-btn pv-mobile-inspector-close" aria-label={t("canvasPrevisUi155")} title={t("canvasPrevisUi155")} onClick={() => setInspectorOpen(false)}>
                                <X className="size-3.5" />
                            </button>
                        </div>
                    </div>

                    {screenshot ? (
                        <section className="pv-screenshot" aria-label="最新镜头截图" data-canvas-no-zoom>
                            <div className="pv-screenshot__heading">
                                <span>最新截图</span>
                                <span>{screenshot.output.timecode}</span>
                            </div>
                            <img src={screenshot.url} alt={`${screenshot.output.title}，${screenshot.output.timecode}`} />
                            <div className="pv-screenshot__caption">{screenshot.output.title}</div>
                            <Button size="small" block disabled={screenshot.added || addingToCanvas} loading={addingToCanvas && !screenshot.added} onClick={() => void addToCanvas(screenshot.output)}>
                                {screenshot.added ? "已加入画布" : screenshot.output.renderMode === "beauty" || screenshot.output.renderMode === "clay" ? "加入画布做图生视频" : "加入画布"}
                            </Button>
                        </section>
                    ) : null}
                    {selectedActor ? (
                        <div className="pv-control-block">
                            <div className="pv-control-block__label">{t("canvasPrevisUi156")} {selectedActor.name}</div>
                            <div className="pv-slider-list">
                                <label className="pv-slider-row">
                                    <span>{t("canvasPrevisUi157")}</span>
                                    <input
                                        type="range"
                                        min={0.5}
                                        max={1.5}
                                        step={0.01}
                                        value={selectedActor.actorProfile?.height ?? 1}
                                        onChange={(e) => updateObject(selectedActor.id, { actorProfile: { ...(selectedActor.actorProfile || previsActorProfileForArchetype("adult")), height: Number(e.target.value) } })}
                                    />
                                    <span className="pv-slider-val">{(selectedActor.actorProfile?.height ?? 1).toFixed(2)}</span>
                                </label>
                                <label className="pv-slider-row">
                                    <span>{t("canvasPrevisUi158")}</span>
                                    <input
                                        type="range"
                                        min={0.5}
                                        max={1.5}
                                        step={0.01}
                                        value={selectedActor.actorProfile?.shoulderWidth ?? 1}
                                        onChange={(e) => updateObject(selectedActor.id, { actorProfile: { ...(selectedActor.actorProfile || previsActorProfileForArchetype("adult")), shoulderWidth: Number(e.target.value) } })}
                                    />
                                    <span className="pv-slider-val">{(selectedActor.actorProfile?.shoulderWidth ?? 1).toFixed(2)}</span>
                                </label>
                                <label className="pv-slider-row">
                                    <span>{t("canvasPrevisUi159")}</span>
                                    <input
                                        type="range"
                                        min={0.5}
                                        max={1.6}
                                        step={0.01}
                                        value={selectedActor.actorProfile?.headRatio ?? 1}
                                        onChange={(e) => updateObject(selectedActor.id, { actorProfile: { ...(selectedActor.actorProfile || previsActorProfileForArchetype("adult")), headRatio: Number(e.target.value) } })}
                                    />
                                    <span className="pv-slider-val">{(selectedActor.actorProfile?.headRatio ?? 1).toFixed(2)}</span>
                                </label>
                            </div>
                            <div className="pv-control-block__label" style={{ marginTop: 10 }}>
                                {t("canvasPrevisUi160")}
                            </div>
                            <Select
                                className="w-full"
                                size="small"
                                allowClear
                                value={selectedBone || undefined}
                                options={poseEditBones.map((bone) => ({ label: previsBoneDisplayLabel(bone, t), value: bone }))}
                                placeholder={t("canvasPrevisUi161")}
                                onChange={(bone) => setSelectedBone(bone || null)}
                            />
                            {selectedBone ? (
                                <div style={{ marginTop: 6 }}>
                                    <BoneRotationFields
                                        rotation={selectedActor.boneOverrides?.[selectedBone as PrevisHumanoidBone] || ([0, 0, 0, 1] as PrevisQuat)}
                                        onChange={(rotation) => writeBoneRotation(selectedActor.id, selectedBone, rotation, "stage")}
                                        onChangeComplete={() => stagedTransaction.end("commit")}
                                    />
                                </div>
                            ) : null}
                        </div>
                    ) : null}

                    {selectedObject ? (
                        <div className="pv-control-block pv-detail-block">
                            <div className="pv-control-block__label">{t("canvasPrevisUi162")}</div>
                            <ObjectInspector
 playing={playing}
 pathDrawing={trajectoryDrawing}
 onTogglePlay={() => setPlaying(!playing)}
 onToggleDrawPath={() => setTrajectoryDrawing((active) => !active)}
 onClearPath={() => updateObject(selectedObject.id, { keyframes: [], motionPath: undefined })}
                                object={selectedObject}
                                rendered={selectedObjectRendered || selectedObject.transform}
                                playhead={snappedPlayhead}
                                selectedBone={selectedBone}
                                capabilities={capabilities}
                                onSelectBone={setSelectedBone}
                                onUpdate={(patch) => updateObject(selectedObject.id, patch)}
                                onTransformEdit={(edited) => handleObjectTransform(selectedObject.id, selectedObjectRendered || selectedObject.transform, edited)}
                                onBoneRotationStage={(rotation) => selectedBone && writeBoneRotation(selectedObject.id, selectedBone, rotation, "stage")}
                                onBoneRotationCommit={() => stagedTransaction.end("commit")}
                                onAddKeyframe={recordSelectedKeyframe}
                                onDuplicate={() => duplicateObject(selectedObject.id)}
                                onDelete={() => removeObject(selectedObject.id)}
                            />
                        </div>
                    ) : selectedLight ? (
                        <div className="pv-control-block pv-detail-block">
                            <div className="pv-control-block__label">{t("canvasPrevisUi163")}</div>
                            <LightInspector light={selectedLight} onUpdate={(patch) => updateLight(selectedLight.id, patch)} onDelete={() => removeLight(selectedLight.id)} />
                        </div>
                    ) : (
                        <div className="pv-control-block pv-detail-block">
                            <div className="pv-control-block__label">{t("canvasPrevisUi164")}</div>
                            <ShotInspector
 pathDrawing={trajectoryDrawing}
 onToggleDrawPath={() => {
                                    // 运镜路径作用于当前镜头的摄影机：先选中它再进入绘制。
                                    if (inspectorCamera) setSelectedCameraId(inspectorCamera.id);
                                    setTrajectoryDrawing((active) => !active);
                                }}
                                shot={activeShot}
                                camera={inspectorCamera}
                                cameras={draft.cameras}
                                capabilities={capabilities}
                                onUpdateShot={(patch) => updateShot(activeShot.id, patch)}
                                onUpdateCamera={(patch) => inspectorCamera && commit((current) => ({ ...current, cameras: current.cameras.map((item) => (item.id === inspectorCamera.id ? { ...item, ...patch } : item)) }))}
                                onAddCameraKeyframe={addCameraKeyframe}
                                onApplyCameraMove={applyCameraMove}
                                onAlignCameraToView={alignCameraToView}
                                
                                
                            />
                        </div>
                    )}

                    <div className="pv-output-block">
                        <div className="pv-output-block__header">
                            <span>{t("modelUi.output")}</span>
                            <div className={`pv-output-dot ${lastClayExport?.shotId === activeShot.id ? "pv-output-dot--done" : recording ? "pv-output-dot--recording" : ""}`} />
                        </div>
                        <div className="pv-output-status">{lastClayExport?.shotId === activeShot.id ? t("canvasPrevisUi165") : recording ? t("canvasPrevisUi166") : t("canvasPrevisUi167")}</div>
                        <div className="pv-prompt-preview">
                            <div className="pv-prompt-preview__label">
                                {t("canvasPrevisUi168")}
                                <button type="button" className="pv-prompt-copy" aria-label={t("canvasToolsUi.addToCanvas")} disabled={addingToCanvas} onClick={addPromptToCanvas}>
                                    <Plus className="size-3.5" />
                                    {t("canvasToolsUi.addToCanvas")}
                                </button>
                                <button type="button" className="pv-prompt-copy" onClick={() => void copyCompiledPrompt()}>
                                    {t("agentLocalUiCopy")}
                                </button>
                            </div>
                            <div className="pv-prompt-preview__text">{compiledPrompt || t("canvasPrevisUi169")}</div>
                        </div>
                    </div>

                    <div className="pv-shot-list" aria-label={t("creationPageShotList")}>
                        {draft.shots.map((shot, index) => (
                            <button
                                key={shot.id}
                                type="button"
                                className={`pv-shot-list__item ${shot.id === activeShot.id ? "is-active" : ""}`}
                                onClick={() => {
                                    commit((current) => ({ ...current, activeShotId: shot.id }));
                                    setPlayhead(0);
                                }}
                            >
                                <span>{index + 1}</span>
                                <strong>{shot.name}</strong>
                                <small>{shot.duration}s</small>
                            </button>
                        ))}
                    </div>
                    <button type="button" className="pv-animation-link" onClick={enterAnimationMode}>
                        <WandSparkles className="size-3.5" />
                        {t("canvasPrevisUi154")}
                    </button>
                </aside>
            </div>
            {capabilities.timeline ? (
                <section className={`pv-inline-timeline ${sequencerVisible ? "" : "is-collapsed"}`}>
                    <PrevisSequencer
                        scene={draft}
                        shot={activeShot}
                        camera={activeCamera}
                        objects={draft.objects}
                        selectedObjectId={selectedObjectId}
                        selectedBone={selectedBone}
                        playhead={playhead}
                        playing={playing}
                        autoKey={autoKey}
                        height={sequencerHeight}
                        visible={sequencerVisible}
                        onPlayToggle={() => setPlaying(!playing)}
                        onPlayheadChange={setPlayhead}
                        onAutoKeyChange={setAutoKey}
                        onHeightChange={setSequencerHeight}
                        onVisibilityChange={setSequencerVisible}
                        onSelectObject={setSelectedObjectId}
                        onSelectBone={setSelectedBone}
                        onRecordKeyframe={recordSelectedKeyframe}
                        onAddShot={addShot}
                        onDeleteKeyframe={deleteKeyframe}
                        onSetKeyframeEasing={setKeyframeEasing}
                        onSelectShot={(id) => {
                            commit((current) => ({ ...current, activeShotId: id }));
                            setPlayhead(0);
                        }}
                    />
                </section>
            ) : null}
        <input ref={modelInputRef} type="file" accept=".glb,.gltf,model/gltf-binary,model/gltf+json" className="hidden" aria-hidden="true" tabIndex={-1} onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            void uploadModel(file).catch((error) => message.error(error instanceof Error ? error.message : t("previsToolbar.uploadFailed")));
        }} />
        <PrevisAddDialog
                open={addDialog.open}
                initialKind={addDialog.kind}
                counts={addCounts}
                readCurrentView={() => viewportRef.current?.readCameraTransform() ?? null}
                onClose={closeAddDialog}
                onConfirm={confirmAddDialog}
                onUploadModel={() => {
                    closeAddDialog();
                    modelInputRef.current?.click();
                }}
            />
{shortcutHelpOpen ? (
                        <div className="pv-shortcut-panel" role="dialog" aria-label="预演台快捷键" data-canvas-no-zoom>
                            <div className="pv-shortcut-panel__head">
                                <span>快捷键</span>
                                <button type="button" className="pv-icon-btn" aria-label="关闭快捷键说明" onClick={() => setShortcutHelpOpen(false)}>
                                    <X className="size-3.5" />
                                </button>
                            </div>
                            {PREVIS_SHORTCUT_GUIDE.map((group) => (
                                <section key={group.group} className="pv-shortcut-panel__group">
                                    <div className="pv-shortcut-panel__title">{group.group}</div>
                                    {group.items.map((item) => (
                                        <div key={item.label} className="pv-shortcut-panel__row">
                                            <span>{item.label}</span>
                                            <span className="pv-shortcut-panel__keys">
                                                {item.keys.map((key) => (
                                                    <kbd key={key}>{key}</kbd>
                                                ))}
                                            </span>
                                        </div>
                                    ))}
                                </section>
                            ))}
                        </div>
                    ) : null}
</div>
    );
}

/** 渲染视图全集。实际可选项由当前模式的 capabilities.renderModes 过滤。 */
const PREVIS_RENDER_MODE_LABELS: Array<{ value: PrevisRenderMode }> = [
    { value: "beauty" },
    { value: "clay" },
    { value: "pose" },
    { value: "depth" },
    { value: "normal" },
];

function cameraMoveTransform(transform: PrevisTransform, move: PrevisCameraMove): PrevisTransform {
    const [x, y, z] = transform.position;
    const offsets: Record<PrevisCameraMove, PrevisVec3> = {
        static: [0, 0, 0],
        push_in: [0, 0, -2],
        pull_out: [0, 0, 2],
        pan_left: [-2, 0, 0],
        pan_right: [2, 0, 0],
        tilt_up: [0, 1.5, 0],
        tilt_down: [0, -1.2, 0],
        orbit_left: [-2.5, 0, -1.5],
        orbit_right: [2.5, 0, -1.5],
        handheld: [0.18, 0.08, -0.15],
    };
    const offset = offsets[move];
    return { ...transform, position: [x + offset[0], y + offset[1], z + offset[2]] };
}

const PREVIS_ADD_BUTTONS: Array<{ kind: PrevisAddKind; label: string; icon: typeof UserRound }> = [
    { kind: "actor", label: "角色", icon: UserRound },
    { kind: "prop", label: "道具", icon: Box },
    { kind: "light", label: "灯光", icon: Lightbulb },
    { kind: "camera", label: "机位", icon: Camera },
];
