import { useInterfaceTranslation } from "@/stores/use-interface-locale-store";
import type { InterfaceMessageKey, InterfaceTranslate } from "@/lib/interface-locale";
import { useState } from "react";
import { Slider } from "antd";
import { Tooltip } from "@/components/ui/base/tooltip";
import { motion, useReducedMotion } from "motion/react";
import { Camera, RotateCcw, Send, X } from "lucide-react";
import { CanvasAngleScene } from "@/components/canvas/canvas-angle-scene";
import { SpotlightSurface } from "@/components/ui/aceternity/spotlight-surface";
import { aceternityMotion } from "@/lib/aceternity-motion";
import { canvasThemes } from "@/lib/canvas-theme";
import { useActiveTheme } from "@/stores/canvas/use-canvas-theme-store";
export type CanvasImageAngleParams = {
    horizontalAngle: number;
    pitchAngle: number;
    cameraDistance: number;
    wideAngle: boolean;
};
type AnglePresetId = "front" | "left" | "right" | "back" | "top" | "bottom";
const defaultParams: CanvasImageAngleParams = { horizontalAngle: 45, pitchAngle: 0, cameraDistance: 4.8, wideAngle: false };
const presets: Array<{ id: AnglePresetId; label: InterfaceMessageKey; horizontalAngle: number; pitchAngle: number }> = [
    { id: "front", label: "imageNodeUi.front", horizontalAngle: 0, pitchAngle: 0 },
    { id: "left", label: "imageNodeUi.left", horizontalAngle: -90, pitchAngle: 0 },
    { id: "right", label: "imageNodeUi.right", horizontalAngle: 90, pitchAngle: 0 },
    { id: "back", label: "imageNodeUi.back", horizontalAngle: 180, pitchAngle: 0 },
    { id: "top", label: "imageNodeUi.highAngle", horizontalAngle: 0, pitchAngle: 60 },
    { id: "bottom", label: "imageNodeUi.lowAngle", horizontalAngle: 0, pitchAngle: -60 },
];
function distanceLabel(value: number, t: InterfaceTranslate) {
    return t(value <= 3 ? "projectUi.shotSizeMediumClose" : value >= 7 ? "projectUi.shotSizeWide" : "projectUi.shotSizeMedium");
}
export function CanvasNodeAnglePanel({ dataUrl, onClose, onConfirm }: { dataUrl: string; onClose: () => void; onConfirm: (params: CanvasImageAngleParams) => void }) {
    const { t } = useInterfaceTranslation();
    const theme = canvasThemes[useActiveTheme()];
    const reducedMotion = useReducedMotion();
    const [params, setParams] = useState(defaultParams);
    const [mode, setMode] = useState<"camera" | "skybox">("camera");
    const update = <Key extends keyof CanvasImageAngleParams>(key: Key, value: CanvasImageAngleParams[Key]) => setParams((current) => ({ ...current, [key]: value }));
    const activePreset = presets.find((preset) => preset.horizontalAngle === params.horizontalAngle && preset.pitchAngle === params.pitchAngle);
    const viewLabel = activePreset?.label || t("createUiCustom");
    return (
        <SpotlightSurface
            data-canvas-no-zoom
            spotlightColor={theme.toolbar.itemHover}
            initial={reducedMotion ? { opacity: 0 } : { opacity: 0, y: 8, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={reducedMotion ? { duration: 0 } : aceternityMotion.spring.panel}
            className="aceternity-floating-panel canvas-angle-panel w-full overflow-hidden rounded-[var(--r-2xl)] border backdrop-blur-2xl"
            style={{ background: theme.spatial.elevated, borderColor: theme.toolbar.border, color: theme.node.text, boxShadow: `0 28px 80px ${theme.spatial.shadow}` }}
            onMouseDown={(event) => event.stopPropagation()}
            onPointerDown={(event) => event.stopPropagation()}
        >
            <div className="flex h-11 items-center gap-2 border-b px-2" style={{ borderColor: theme.toolbar.border }}>
                <span className="grid size-7 shrink-0 place-items-center rounded-[var(--r-md)]" style={{ background: theme.toolbar.itemHover }}>
                    <Camera className="size-3.5" />
                </span>
                <span className="text-xs font-semibold">{t("imageNodeUi.angleEditor")}</span>
                <span className="min-w-0 flex-1" />
                <Tooltip title={t("canvasImportClose")}>
                    <button type="button" aria-label={t("imageNodeUi.closeAngleEditor")} className="grid size-7 place-items-center rounded-full transition hover:bg-black/5 dark:hover:bg-white/10" onClick={onClose}>
                        <X className="size-3.5" />
                    </button>
                </Tooltip>
            </div>
            <div className="flex h-10 items-center gap-1 overflow-x-auto border-b px-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" style={{ borderColor: theme.toolbar.border }}>
                <AnglePresetButton active={!activePreset} label={t("createUiCustom")} />
                {presets.map((preset) => (
                    <AnglePresetButton key={preset.id} active={activePreset?.id === preset.id} label={t(preset.label)} onClick={() => setParams((current) => ({ ...current, horizontalAngle: preset.horizontalAngle, pitchAngle: preset.pitchAngle }))} />
                ))}
            </div>
            <div className="canvas-angle-body">
                <div className="canvas-angle-stage">
                    <CanvasAngleScene
                        mode={mode}
                        rotate={params.horizontalAngle}
                        tilt={params.pitchAngle}
                        distance={params.cameraDistance}
                        imageSrc={dataUrl}
                        faceLabels={{
                            back: t("imageNodeUi.back"),
                            right: t("imageNodeUi.right"),
                            left: t("imageNodeUi.left"),
                            top: t("imageNodeUi.top"),
                            bottom: t("imageNodeUi.bottom"),
                        }}
                        dirLabels={{
                            up: t("imageNodeUi.pitchUp"),
                            down: t("imageNodeUi.pitchDown"),
                            left: t("imageNodeUi.orbitLeft"),
                            right: t("imageNodeUi.orbitRight"),
                        }}
                        onRotateChange={(value) => update("horizontalAngle", value)}
                        onTiltChange={(value) => update("pitchAngle", value)}
                    />
                </div>
                <div className="flex min-w-0 flex-col justify-center gap-2 rounded-[var(--r-lg)] border px-2 py-2" style={{ background: theme.toolbar.itemHover, borderColor: theme.toolbar.border }}>
                    <AngleSeg
                        value={mode}
                        options={[
                            { label: t("imageNodeUi.skybox"), value: "skybox" },
                            { label: t("imageNodeUi.cameraView"), value: "camera" },
                        ]}
                        onChange={(value) => setMode(value as "camera" | "skybox")}
                    />
                    <span className="text-[var(--fs-tiny)] font-medium opacity-70">{t("imageNodeUi.commonAngles")}</span>
                    <div className="grid grid-cols-2 gap-2">
                        {presets.map((preset) => (
                            <button
                                key={preset.id}
                                type="button"
                                className="canvas-angle-preset"
                                aria-pressed={activePreset?.id === preset.id}
                                onClick={() => setParams((current) => ({ ...current, horizontalAngle: preset.horizontalAngle, pitchAngle: preset.pitchAngle }))}
                            >
                                {t(preset.label)}
                            </button>
                        ))}
                    </div>
                    <AngleSlider label={t("imageNodeUi.horizontalOrbit")} value={params.horizontalAngle} min={-180} max={180} suffix="°" onChange={(value) => update("horizontalAngle", value)} />
                    <AngleSlider label={t("imageNodeUi.verticalTilt")} value={params.pitchAngle} min={-60} max={60} suffix="°" onChange={(value) => update("pitchAngle", value)} />
                    <AngleSlider label={t("imageNodeUi.shotZoom")} value={params.cameraDistance} min={1} max={10} step={0.1} suffix={distanceLabel(params.cameraDistance, t)} onChange={(value) => update("cameraDistance", value)} />
                    <div className="grid h-8 grid-cols-[62px_minmax(0,1fr)] items-center gap-2">
                        <span className="text-[var(--fs-tiny)] font-medium opacity-60">{t("creationPageShot")}</span>
                        <AngleSeg
                            value={params.wideAngle ? "wide" : "standard"}
                            options={[
                                { label: t("assetsUi.densityStandard"), value: "standard" },
                                { label: t("imageNodeUi.wideAngle"), value: "wide" },
                            ]}
                            onChange={(value) => update("wideAngle", value === "wide")}
                        />
                    </div>
                </div>
            </div>
            <div className="flex h-11 items-center gap-2 border-t px-3" style={{ borderColor: theme.toolbar.border }}>
                <span className="text-[var(--fs-tiny)] opacity-60">{t("imageNodeUi.currentView")}</span>
                <span className="text-xs font-semibold">{viewLabel}</span>
                <span className="text-[var(--fs-tiny)] opacity-60">
                    {params.horizontalAngle}° / {params.pitchAngle}° · {params.cameraDistance.toFixed(1)} {distanceLabel(params.cameraDistance, t)}
                </span>
                <span className="flex-1" />
                <button type="button" className="flex h-8 items-center gap-2 rounded-[var(--dock-item-radius)] px-2 text-[var(--fs-label)] font-medium transition hover:bg-black/5 dark:hover:bg-white/10" onClick={() => setParams(defaultParams)}>
                    <RotateCcw className="size-3.5" />
                    {t("collectionReset")}
                </button>
                <motion.button
                    type="button"
                    whileHover={reducedMotion ? undefined : { y: -1 }}
                    whileTap={reducedMotion ? undefined : { scale: 0.97 }}
                    className="canvas-angle-generate flex h-8 items-center gap-2 rounded-[var(--dock-item-radius)] px-3 text-[var(--fs-label)] font-semibold"
                    style={{ background: theme.node.activeStroke, color: theme.node.panel }}
                    onClick={() => onConfirm(params)}
                >
                    <Send className="size-3.5" />
                    {t("imageNodeUi.generateAngle")}
                </motion.button>
            </div>
        </SpotlightSurface>
    );
}
function AngleSeg({ value, options, onChange }: { value: string; options: { label: string; value: string }[]; onChange: (value: string) => void }) {
    return (
        <div className="canvas-angle-seg">
            {options.map((option) => (
                <button key={option.value} type="button" aria-pressed={value === option.value} onClick={() => onChange(option.value)}>
                    {option.label}
                </button>
            ))}
        </div>
    );
}
function AngleSlider({ label, value, min, max, step = 1, suffix, onChange }: { label: string; value: number; min: number; max: number; step?: number; suffix: string; onChange: (value: number) => void }) {
    return (
        <div className="grid h-8 grid-cols-[62px_minmax(0,1fr)_60px] items-center gap-2">
            <span className="text-[var(--fs-tiny)] font-medium opacity-60">{label}</span>
            <Slider className="canvas-angle-slider m-0" min={min} max={max} step={step} value={value} tooltip={{ open: false }} onChange={onChange} />
            <span className="text-right text-[var(--fs-tiny)] font-semibold">
                {Number.isInteger(value) ? value : value.toFixed(1)}
                {suffix.startsWith("°") ? suffix : ` ${suffix}`}
            </span>
        </div>
    );
}
function AnglePresetButton({ active, label, onClick }: { active: boolean; label: string; onClick?: () => void }) {
    return (
        <button type="button" aria-pressed={active} className="canvas-angle-tab" onClick={onClick}>
            {label}
        </button>
    );
}
