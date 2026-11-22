import { useEffect, useRef, useState, type RefObject } from "react";
import { useInterfaceTranslation } from "@/stores/use-interface-locale-store";
import { createPortal } from "react-dom";
import { Settings2 } from "lucide-react";
import { Button } from "antd";

import { preserveVideoSettings } from "@/lib/media-settings";
import { VideoSettingsPanel, videoResolutionLabel, videoSecondsLabel, videoSizeLabel } from "@/components/video-settings-panel";
import { canvasThemes } from "@/lib/canvas-theme";
import { modelCapabilityConfigFor, videoProfileForOperation } from "@/lib/model-capabilities";
import { useActiveTheme } from "@/stores/canvas/use-canvas-theme-store";
import { resolveModelRequestConfig, type AiConfig } from "@/stores/use-config-store";
import type { CanvasNodeMetadata } from "@/types/canvas";
import { normalizeVideoResolution } from "@/lib/video-generation-options";
import { CanvasKlingStoryboardSettings } from "./canvas-kling-storyboard-settings";

type CanvasVideoSettingsPopoverProps = {
    config: AiConfig;
    operation?: string;
    onConfigChange: (key: keyof AiConfig, value: string) => void;
    webSearch?: boolean;
    onWebSearchChange?: (enabled: boolean) => void;
    searchUsage?: number;
    kling?: CanvasNodeMetadata["videoKling"];
    onKlingChange?: (value: NonNullable<CanvasNodeMetadata["videoKling"]>) => void;
    buttonClassName?: string;
    placement?: "topLeft" | "top" | "topRight" | "bottomLeft" | "bottom" | "bottomRight";
};

export function CanvasVideoSettingsPopover({ config, operation, onConfigChange, webSearch, onWebSearchChange, searchUsage, kling, onKlingChange, buttonClassName, placement = "topLeft" }: CanvasVideoSettingsPopoverProps) {
    const { t } = useInterfaceTranslation();
    const theme = canvasThemes[useActiveTheme()];
    const buttonRef = useRef<HTMLSpanElement>(null);
    const panelRef = useRef<HTMLDivElement>(null);
    const [open, setOpen] = useState(false);
    const [buttonRect, setButtonRect] = useState<DOMRect | null>(null);
    const modelProfile = modelCapabilityConfigFor(config, config.model).video;
    const videoProfile = modelProfile && operation ? videoProfileForOperation(modelProfile, operation) : modelProfile;
    const resolutionSupported = Boolean(videoProfile?.resolutions.length);
    const sizeSupported = Boolean(videoProfile?.ratios.length);
    const preserved = videoProfile ? preserveVideoSettings(videoProfile, { seconds: config.videoSeconds, resolution: config.vquality, ratio: config.size }, resolveModelRequestConfig(config, config.model).interfaceType) : null;
    const resolution = preserved?.resolution || "";
    const size = preserved?.ratio || "";
    const summary = [...(resolutionSupported ? [videoResolutionLabel(resolution)] : []), ...(sizeSupported ? [videoSizeLabel(size, t)] : []), videoSecondsLabel(config.videoSeconds)].join(" · ");

    useEffect(() => {
        if (!open) return;
        const syncPosition = () => setButtonRect(buttonRef.current?.getBoundingClientRect() || null);
        const closeOnOutsidePointer = (event: PointerEvent) => {
            const target = event.target;
            if (!(target instanceof Node)) return;
            if (buttonRef.current?.contains(target) || panelRef.current?.contains(target)) return;
            setOpen(false);
        };

        syncPosition();
        window.addEventListener("resize", syncPosition);
        window.addEventListener("scroll", syncPosition, true);
        window.addEventListener("pointerdown", closeOnOutsidePointer, true);
        return () => {
            window.removeEventListener("resize", syncPosition);
            window.removeEventListener("scroll", syncPosition, true);
            window.removeEventListener("pointerdown", closeOnOutsidePointer, true);
        };
    }, [open]);

    const panel =
        open && buttonRect ? (
            <VideoSettingsPortal
                buttonRect={buttonRect}
                panelRef={panelRef}
                placement={placement}
                theme={theme}
                config={config}
                operation={operation}
                onConfigChange={onConfigChange}
                webSearch={webSearch}
                onWebSearchChange={onWebSearchChange}
                searchUsage={searchUsage}
                kling={kling}
                onKlingChange={onKlingChange}
            />
        ) : null;

    return (
        <>
            <span ref={buttonRef} className="inline-flex min-w-0">
                <Button
                    size="small"
                    type="text"
                    className={`canvas-generation-settings-trigger ${buttonClassName || "!h-8 !max-w-[170px] !justify-start !rounded-full !px-2.5"}`}
                    style={{ background: theme.node.fill, color: theme.node.text }}
                    icon={<Settings2 className="size-3.5" />}
                    aria-expanded={open}
                    aria-label={t("canvasCompleteUi.videoSettingsTitle", { value0: summary })}
                    title={t("canvasCompleteUi.videoSettingsSummary", { value0: summary })}
                    onClick={() => setOpen((current) => !current)}
                >
                    <span className="truncate">{summary}</span>
                </Button>
            </span>
            {panel}
        </>
    );
}

function VideoSettingsPortal({
    buttonRect,
    panelRef,
    placement,
    theme,
    config,
    operation,
    onConfigChange,
    webSearch,
    onWebSearchChange,
    searchUsage,
    kling,
    onKlingChange,
}: {
    buttonRect: DOMRect;
    panelRef: RefObject<HTMLDivElement | null>;
    placement: CanvasVideoSettingsPopoverProps["placement"];
    theme: (typeof canvasThemes)[keyof typeof canvasThemes];
    config: AiConfig;
    operation?: string;
    onConfigChange: (key: keyof AiConfig, value: string) => void;
    webSearch?: boolean;
    onWebSearchChange?: (enabled: boolean) => void;
    searchUsage?: number;
    kling?: CanvasNodeMetadata["videoKling"];
    onKlingChange?: (value: NonNullable<CanvasNodeMetadata["videoKling"]>) => void;
}) {
    const { t } = useInterfaceTranslation();
    const gap = 8;
    const margin = 12;
    const width = Math.min(356, window.innerWidth - margin * 2);
    const alignRight = placement?.endsWith("Right");
    const alignCenter = placement === "top" || placement === "bottom";
    const left = alignCenter ? buttonRect.left + buttonRect.width / 2 - width / 2 : alignRight ? buttonRect.right - width : buttonRect.left;
    const topPlacement = placement?.startsWith("top");
    const estimatedHeight = 370;
    const topSpace = buttonRect.top - gap - margin;
    const bottomSpace = window.innerHeight - buttonRect.bottom - gap - margin;
    const placeAbove = topPlacement ? topSpace >= estimatedHeight || topSpace >= bottomSpace : bottomSpace < estimatedHeight && topSpace > bottomSpace;
    const style = {
        position: "fixed",
        zIndex: "var(--z-dialog-popover)",
        width,
        left: Math.max(margin, Math.min(window.innerWidth - width - margin, left)),
        ...(placeAbove ? { bottom: window.innerHeight - buttonRect.top + gap, maxHeight: Math.max(260, topSpace) } : { top: buttonRect.bottom + gap, maxHeight: Math.max(260, bottomSpace) }),
        background: theme.canvas.background,
        border: `1px solid ${theme.toolbar.border}`,
        borderRadius: 10,
        boxShadow: `0 24px 72px ${theme.spatial.shadow}`,
        padding: 12,
        overflowY: "auto",
        color: theme.node.text,
    } as const;

    return createPortal(
        <div
            ref={panelRef}
            className="canvas-image-settings-popover aceternity-floating-panel backdrop-blur-2xl"
            style={style}
            onPointerDown={(event) => event.stopPropagation()}
            onMouseDown={(event) => event.stopPropagation()}
            onClick={(event) => event.stopPropagation()}
        >
            <VideoSettingsPanel
                operation={operation}
                config={config}
                onConfigChange={(key, value) => {
                    const mode = ({ "720": "std", "1080": "pro", "2160": "4k" } as const)[normalizeVideoResolution(value) as "720" | "1080" | "2160"];
                    if (kling && key === "vquality" && mode && onKlingChange) onKlingChange({ ...kling, mode });
                    else onConfigChange(key, value);
                }}
                theme={theme}
                className="space-y-3"
            />
            {kling ? (
                <div className="mt-3 space-y-2 text-sm">
                    <label className="flex items-center justify-between gap-2">
                        {t("canvasCompleteUi.productionQuality")}
                        <select
                            aria-label={t("canvasCompleteUi.klingQuality")}
                            value={kling.mode}
                            onChange={(event) => onKlingChange?.({ ...kling, mode: event.target.value as typeof kling.mode })}
                            style={{ background: theme.node.fill, color: theme.node.text }}
                        >
                            <option value="std">{t("canvasCompleteUi.standard720")}</option>
                            <option value="pro">{t("canvasCompleteUi.quality1080")}</option>
                            <option value="4k">{t("canvasCompleteUi.quality4k")}</option>
                        </select>
                    </label>
                    <CanvasKlingStoryboardSettings value={kling} duration={Number(config.videoSeconds)} onChange={onKlingChange} />
                </div>
            ) : null}
            {webSearch !== undefined ? (
                <div className="mt-3 space-y-2 text-sm">
                    <label className="flex items-center gap-2">
                        <input type="checkbox" checked={webSearch} onChange={(event) => onWebSearchChange?.(event.target.checked)} />
                        {t("canvasCompleteUi.webAssistance")}
                    </label>
                    <p className="text-xs" style={{ color: theme.node.muted }}>
                        {t("canvasCompleteUi.webHelp")}
                    </p>
                    {searchUsage !== undefined ? (
                        <p className="text-xs" style={{ color: theme.node.muted }}>
                            {searchUsage === 0 ? t("canvasCompleteUi.noSearchLastTime") : t("canvasCompleteUi.lastSearchCount", { value0: searchUsage })}
                        </p>
                    ) : null}
                </div>
            ) : null}
        </div>,
        document.body,
    );
}
