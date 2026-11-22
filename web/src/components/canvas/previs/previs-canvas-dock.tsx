import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Camera, Check, Focus, Keyboard, Minus, MousePointer2, Move3d, PanelLeft, Plus, Rotate3d, Route, Scale3d, Scan, SlidersHorizontal, ChartGantt } from "lucide-react";

import { FloatingDock, type FloatingDockEntry } from "@/components/ui/aceternity/floating-dock";
import { aceternityMotion } from "@/lib/aceternity-motion";
import { canvasDockStyle } from "@/lib/canvas/canvas-aceternity-style";
import type { CanvasTheme } from "@/lib/canvas-theme";
import { PREVIS_VIEW_MODES, type PrevisViewMode } from "@/lib/canvas/previs/previs-view-modes";
import { PREVIS_ASPECT_RATIOS, previsAspectOption } from "@/lib/canvas/previs/previs-optics";
import type { PrevisAspectRatio, PrevisCamera } from "@/types/previs";
import type { PrevisToolMode } from "@/lib/canvas/previs/previs-shortcuts";

type TransformMode = PrevisToolMode;

export type PrevisCanvasDockProps = {
    theme: CanvasTheme;
    transformMode: TransformMode;
    onTransformModeChange: (mode: TransformMode) => void;
    trajectoryDrawing: boolean;
    trajectoryKind: "actor" | "camera" | null;
    onToggleTrajectory: () => void;
    viewMode: PrevisViewMode;
    onViewModeChange: (mode: PrevisViewMode) => void;
    /** 当前镜头画幅；选择后由宿主写入镜头并切到机位视图预览安全框。 */
    aspectRatio?: PrevisAspectRatio;
    onAspectRatioChange: (value: PrevisAspectRatio) => void;
    cameras: PrevisCamera[];
    viewedCameraId: string | null;
    onViewCamera: (id: string) => void;
    onFocusSelected: () => void;
    onFrameScene: () => void;
    onZoom: (factor: number) => void;
    timelineOpen: boolean;
    onOpenTimeline: () => void;
    scenePanelOpen: boolean;
    onToggleScenePanel: () => void;
    inspectorOpen: boolean;
    onToggleInspector: () => void;
    shortcutHelpOpen: boolean;
    onToggleShortcutHelp: () => void;
};

/**
 * 预演台视口工具条：与画布主工具条共用 FloatingDock 组件、dock token 与提示/动效。
 * 一条 dock 承载「改内容」(变换、画轨迹) 与「怎么看」(取景、导航)，取景细项收进弹层，
 * 避免视口四角各挂一组浮层遮挡画面。
 */
export function PrevisCanvasDock(props: PrevisCanvasDockProps) {
    const { t } = useTranslation();
    const { theme } = props;
    const rootRef = useRef<HTMLDivElement>(null);
    // 取景与画幅两个弹层互斥，同一时间只开一个。
    const [openMenu, setOpenMenu] = useState<"view" | "aspect" | null>(null);
    const toggleMenu = (menu: "view" | "aspect") => setOpenMenu((current) => (current === menu ? null : menu));

    useEffect(() => {
        if (!openMenu) return;
        const close = (event: PointerEvent) => {
            if (event.target instanceof Node && !rootRef.current?.contains(event.target)) setOpenMenu(null);
        };
        const closeOnEscape = (event: KeyboardEvent) => {
            if (event.key === "Escape") setOpenMenu(null);
        };
        document.addEventListener("pointerdown", close, true);
        document.addEventListener("keydown", closeOnEscape);
        return () => {
            document.removeEventListener("pointerdown", close, true);
            document.removeEventListener("keydown", closeOnEscape);
        };
    }, [openMenu]);

    const currentView = PREVIS_VIEW_MODES.find((item) => item.mode === props.viewMode) ?? PREVIS_VIEW_MODES[0];
    const currentAspect = previsAspectOption(props.aspectRatio);
    const aspectLabel = (item: typeof currentAspect) => item.value === "auto" ? t("previsDock.auto") : item.label;
    const trajectoryLabel = t(props.trajectoryDrawing ? "previsDock.finishPath" : props.trajectoryKind === "camera" ? "previsDock.cameraPath" : "previsDock.actorPath");

    const items: FloatingDockEntry[] = [
        { id: "previs-scene-panel", label: t(props.scenePanelOpen ? "previsDock.closeScene" : "previsDock.openScene"), icon: <PanelLeft />, active: props.scenePanelOpen, expands: true, onClick: props.onToggleScenePanel },
        { kind: "separator", id: "previs-sep-scene" },
        {
            kind: "switch",
            id: "previs-transform",
            label: t("previsDock.transform"),
            value: props.transformMode,
            onChange: (value) => props.onTransformModeChange(value as TransformMode),
            options: [
                { id: "previs-select", value: "select", label: t("previsDock.select"), icon: <MousePointer2 /> },
                { id: "previs-translate", value: "translate", label: t("previsDock.translate"), icon: <Move3d /> },
                { id: "previs-rotate", value: "rotate", label: t("previsDock.rotate"), icon: <Rotate3d /> },
                { id: "previs-scale", value: "scale", label: t("previsDock.scale"), icon: <Scale3d /> },
            ],
        },
        { id: "previs-trajectory", label: trajectoryLabel, icon: <Route />, active: props.trajectoryDrawing, onClick: props.onToggleTrajectory },
        { kind: "separator", id: "previs-sep-view" },
        {
            id: "previs-view-mode",
            label: t("previsDock.currentView", { view: currentView.label }),
            wide: true,
            quiet: true,
            expands: true,
            active: openMenu === "view",
            icon: <span className="inline-flex h-full items-center justify-center whitespace-nowrap text-[var(--fs-caption)] font-semibold leading-none tracking-wide">{currentView.label}</span>,
            onClick: () => toggleMenu("view"),
        },
        {
            id: "previs-aspect",
            label: t("previsDock.currentAspect", { ratio: aspectLabel(currentAspect) }),
            wide: true,
            quiet: true,
            expands: true,
            active: openMenu === "aspect",
            icon: (
                <span className="pv-dock-aspect">
                    <PrevisAspectGlyph ratio={currentAspect.ratio} />
                    <span>{aspectLabel(currentAspect)}</span>
                </span>
            ),
            onClick: () => toggleMenu("aspect"),
        },
        { id: "previs-focus", label: t("previsDock.focus"), icon: <Focus />, onClick: props.onFocusSelected },
        { id: "previs-frame", label: t("previsDock.fit"), icon: <Scan />, onClick: props.onFrameScene },
        { id: "previs-zoom-out", label: t("previsDock.zoomOut"), icon: <Minus />, onClick: () => props.onZoom(1.38) },
        { id: "previs-zoom-in", label: t("previsDock.zoomIn"), icon: <Plus />, onClick: () => props.onZoom(0.72) },
        { kind: "separator", id: "previs-sep-panels" },
        { id: "previs-timeline", label: t("previsDock.timeline"), icon: <ChartGantt />, active: props.timelineOpen, onClick: props.onOpenTimeline },
        { id: "previs-inspector", label: t(props.inspectorOpen ? "previsDock.closeInspector" : "previsDock.openInspector"), icon: <SlidersHorizontal />, active: props.inspectorOpen, expands: true, onClick: props.onToggleInspector },
        { id: "previs-shortcuts", label: t("previsDock.shortcuts"), icon: <Keyboard />, active: props.shortcutHelpOpen, onClick: props.onToggleShortcutHelp },
    ];

    return (
        <div ref={rootRef} data-canvas-no-zoom className="pv-canvas-dock" onPointerDown={(event) => event.stopPropagation()} onWheel={(event) => event.stopPropagation()}>
            <AnimatePresence>
                {openMenu === "aspect" ? (
                    <motion.div
                        key="aspect"
                        role="dialog"
                        aria-label={t("previsDock.aspect")}
                        initial={{ opacity: 0, y: 14, scale: 0.92 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 9, scale: 0.96 }}
                        transition={aceternityMotion.spring.panel}
                        className="pv-canvas-dock__menu pv-canvas-dock__menu--aspect aceternity-floating-panel"
                        style={{ background: theme.spatial.elevated, color: theme.node.text, boxShadow: `0 28px 80px ${theme.spatial.shadow}` }}
                    >
                        <div className="pv-canvas-dock__menu-title">
                            <span>{t("previsDock.chooseAspect")}</span>
                        </div>
                        <div className="pv-canvas-dock__aspect-grid" role="radiogroup" aria-label={t("previsDock.aspect")}>
                            {PREVIS_ASPECT_RATIOS.map((item) => {
                                const checked = item.value === currentAspect.value;
                                return (
                                    <button
                                        key={item.value}
                                        type="button"
                                        role="radio"
                                        aria-checked={checked}
                                        aria-label={aspectLabel(item)}
                                        title={aspectLabel(item)}
                                        className={checked ? "is-active" : undefined}
                                        onClick={() => {
                                            props.onAspectRatioChange(item.value);
                                            setOpenMenu(null);
                                        }}
                                    >
                                        <PrevisAspectGlyph ratio={item.ratio} large />
                                        <span>{aspectLabel(item)}</span>
                                    </button>
                                );
                            })}
                        </div>
                    </motion.div>
                ) : null}
                {openMenu === "view" ? (
                    <motion.div
                        key="view"
                        role="dialog"
                        aria-label={t("previsDock.viewMode")}
                        initial={{ opacity: 0, y: 14, scale: 0.92 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 9, scale: 0.96 }}
                        transition={aceternityMotion.spring.panel}
                        className="pv-canvas-dock__menu aceternity-floating-panel"
                        style={{ background: theme.spatial.elevated, color: theme.node.text, boxShadow: `0 28px 80px ${theme.spatial.shadow}` }}
                    >
                        <div className="pv-canvas-dock__menu-title">
                            <span>{t("previsDock.view")}</span>
                        </div>
                        <div className="pv-canvas-dock__view-grid" role="radiogroup" aria-label={t("previsDock.viewMode")}>
                            {PREVIS_VIEW_MODES.map((item) => {
                                const checked = item.mode === props.viewMode;
                                return (
                                    <button
                                        key={item.mode}
                                        type="button"
                                        role="radio"
                                        aria-checked={checked}
                                        aria-label={`${item.label} ${t(`previsDock.views.${item.mode}`)}`}
                                        title={t(`previsDock.views.${item.mode}`)}
                                        className={checked ? "is-active" : undefined}
                                        onClick={() => {
                                            props.onViewModeChange(item.mode);
                                            setOpenMenu(null);
                                        }}
                                    >
                                        {item.label}
                                    </button>
                                );
                            })}
                        </div>
                        {props.cameras.length ? (
                            <>
                                <div className="pv-canvas-dock__menu-title is-sub">
                                    <span>{t("previsDock.cameras")}</span>
                                </div>
                                <div className="pv-canvas-dock__camera-list">
                                    {props.cameras.map((camera) => {
                                        const current = props.viewMode === "camera" && camera.id === props.viewedCameraId;
                                        return (
                                            <button
                                                key={camera.id}
                                                type="button"
                                                aria-pressed={current}
                                                className={current ? "is-active" : undefined}
                                                onClick={() => {
                                                    props.onViewCamera(camera.id);
                                                    setOpenMenu(null);
                                                }}
                                            >
                                                <Camera className="size-3.5" />
                                                <span>{camera.name}</span>
                                                <small>{camera.focalLength}mm</small>
                                                {current ? <Check className="size-3.5" /> : null}
                                            </button>
                                        );
                                    })}
                                </div>
                            </>
                        ) : null}
                    </motion.div>
                ) : null}
            </AnimatePresence>
            <FloatingDock items={items} className="canvas-floating-dock" style={canvasDockStyle(theme)} ariaLabel={t("previsDock.controls")} />
        </div>
    );
}

/** 画幅示意：按比例画一个居中矩形；自适应（无固定比例）画四角取景框。 */
function PrevisAspectGlyph({ ratio, large = false }: { ratio?: number; large?: boolean }) {
    const box = 16;
    const max = 13;
    const width = ratio ? (ratio >= 1 ? max : Math.max(4, max * ratio)) : 13;
    const height = ratio ? (ratio >= 1 ? Math.max(4, max / ratio) : max) : 10;
    const x = (box - width) / 2;
    const y = (box - height) / 2;
    const corner = 3.5;
    return (
        <span className={`pv-aspect-glyph ${large ? "is-large" : ""}`} aria-hidden>
            <svg viewBox={`0 0 ${box} ${box}`} fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
                {ratio ? (
                    <rect x={x} y={y} width={width} height={height} rx={1.4} strokeWidth={1.4} />
                ) : (
                    <path
                        strokeWidth={1.4}
                        d={[
                            `M${x} ${y + corner}V${y}H${x + corner}`,
                            `M${x + width - corner} ${y}H${x + width}V${y + corner}`,
                            `M${x + width} ${y + height - corner}V${y + height}H${x + width - corner}`,
                            `M${x + corner} ${y + height}H${x}V${y + height - corner}`,
                        ].join("")}
                    />
                )}
            </svg>
        </span>
    );
}
