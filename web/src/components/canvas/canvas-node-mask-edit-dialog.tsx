import { useInterfaceTranslation } from "@/stores/use-interface-locale-store";
import { useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent } from "react";
import { Button, Input, InputNumber, Modal, Segmented, Slider } from "antd";
import { Brush, ChevronDown, Download, Eraser, Redo2, RotateCcw, Undo2, WandSparkles, X } from "lucide-react";

import { ImageSettingsPanel } from "@/components/image-settings-panel";
import { ModelPicker } from "@/components/model-picker";
import { createMaskHistory, prepareOutpaintImage, readImageEditingPixels, reduceMaskHistory, resolveOutpaintGeometry, type CanvasOutpaintPadding, type ImagePixels, type MaskEditHistoryAction, type MaskEditStroke } from "@/lib/canvas/canvas-image-editing";
import { defaultImageParamsForModel } from "@/lib/model-selection";
import { canvasThemes } from "@/lib/canvas-theme";
import { useActiveTheme } from "@/stores/canvas/use-canvas-theme-store";
import type { AiConfig } from "@/stores/use-config-store";

export type CanvasImageMaskEditPayload = {
    prompt: string;
    maskDataUrl: string;
    generationConfig?: Partial<Pick<AiConfig, "model" | "imageModel" | "size" | "quality" | "count" | "transparentBackground">>;
} & ({ kind?: "mask" } | { kind: "outpaint"; sourceDataUrl: string; outpaint: { width: number; height: number; padding: CanvasOutpaintPadding } });

type DrawMode = "paint" | "erase";

const defaultBrushSize = 100;
const maskFillColor = "rgba(37, 99, 235, .38)";
const maskBorderColor = "rgba(255, 255, 255, .72)";

export function CanvasNodeMaskEditDialog({ dataUrl, open, config, onClose, onConfirm }: { dataUrl: string; open: boolean; config: AiConfig; onClose: () => void; onConfirm: (payload: CanvasImageMaskEditPayload) => void }) {
    const { t } = useInterfaceTranslation();
    const maskCanvasRef = useRef<HTMLCanvasElement>(null);
    const previewCanvasRef = useRef<HTMLCanvasElement>(null);
    const drawingRef = useRef<{ active: boolean; last: { x: number; y: number } | null; stroke?: MaskEditStroke }>({ active: false, last: null });
    const [image, setImage] = useState<ImagePixels | null>(null);
    const [prompt, setPrompt] = useState("");
    const [brushSize, setBrushSize] = useState(defaultBrushSize);
    const [mode, setMode] = useState<DrawMode>("paint");
    const [error, setError] = useState("");
    const [editMode, setEditMode] = useState<"mask" | "outpaint">("mask");
    const [padding, setPadding] = useState<CanvasOutpaintPadding>({ left: 128, top: 128, right: 128, bottom: 128 });
    const [history, setHistory] = useState(createMaskHistory);
    const historyRef = useRef(history);
    const [preparing, setPreparing] = useState(false);
    const preparingRef = useRef(false);
    const [generationConfig, setGenerationConfig] = useState<AiConfig>(() => config);
    const [advancedOpen, setAdvancedOpen] = useState(true);
    const theme = canvasThemes[useActiveTheme()];
    const outpaint = useMemo(() => {
        if (!image) return { geometry: null, error: "" };
        try { return { geometry: resolveOutpaintGeometry(image.width, image.height, padding), error: "" }; }
        catch (error) { return { geometry: null, error: error instanceof Error ? error.message : "扩图范围无效" }; }
    }, [image, padding]);

    useEffect(() => {
        if (!open) return;
        setPrompt("");
        setBrushSize(defaultBrushSize);
        setMode("paint");
        setError("");
        setEditMode("mask");
        setPadding({ left: 128, top: 128, right: 128, bottom: 128 });
        setImage(null);
        historyRef.current = createMaskHistory();
        setHistory(historyRef.current);
        drawingRef.current = { active: false, last: null };
        setAdvancedOpen(true);
        setGenerationConfig(config);
        const controller = new AbortController();
        void readImageEditingPixels(dataUrl, controller.signal).then((pixels) => {
            if (!controller.signal.aborted) setImage(pixels);
        }).catch((error) => {
            if (!controller.signal.aborted) setError(error instanceof Error ? error.message : "原图读取失败");
        });
        return () => controller.abort();
    }, [dataUrl, open]);

    useEffect(() => {
        renderMaskHistory(maskCanvasRef.current, previewCanvasRef.current, historyRef.current.present);
    }, [editMode, image]);

    const applyHistory = (action: MaskEditHistoryAction) => {
        const next = reduceMaskHistory(historyRef.current, action);
        historyRef.current = next;
        setHistory(next);
        renderMaskHistory(maskCanvasRef.current, previewCanvasRef.current, next.present);
        setError("");
    };

    const draw = (event: ReactPointerEvent<HTMLCanvasElement>) => {
        const point = readCanvasPoint(event.currentTarget, event.clientX, event.clientY);
        const maskCanvas = maskCanvasRef.current;
        const context = maskCanvas?.getContext("2d", { willReadFrequently: true });
        const stroke = drawingRef.current.stroke;
        if (!maskCanvas || !context || !stroke) return;
        context.lineCap = "round";
        context.lineJoin = "round";
        context.lineWidth = stroke.size;
        context.globalCompositeOperation = stroke.mode === "paint" ? "source-over" : "destination-out";
        context.strokeStyle = "#000";
        context.fillStyle = "#000";
        if (!drawingRef.current.last) {
            drawMaskStroke(context, point, point, stroke.size);
        } else {
            drawMaskStroke(context, drawingRef.current.last, point, stroke.size);
        }
        renderMaskPreview(maskCanvas, previewCanvasRef.current);
        drawingRef.current.last = point;
        stroke.points.push(point);
        if (mode === "paint") {
            setError("");
        }
    };

    const startDraw = (event: ReactPointerEvent<HTMLCanvasElement>) => {
        if (event.button !== 0 || preparing) return;
        event.preventDefault();
        event.stopPropagation();
        event.currentTarget.setPointerCapture(event.pointerId);
        drawingRef.current = { active: true, last: null, stroke: { mode, size: brushSize, points: [] } };
        if (maskCanvasRef.current) renderMaskPreview(maskCanvasRef.current, previewCanvasRef.current);
        draw(event);
    };

    const moveDraw = (event: ReactPointerEvent<HTMLCanvasElement>) => {
        if (!drawingRef.current.active) return;
        event.preventDefault();
        draw(event);
    };

    const stopDraw = (cancelled = false) => {
        const stroke = drawingRef.current.stroke;
        drawingRef.current = { active: false, last: null };
        if (!cancelled && stroke?.points.length) applyHistory({ type: "stroke", stroke });
        else renderMaskHistory(maskCanvasRef.current, previewCanvasRef.current, historyRef.current.present);
    };

    const resetMask = () => {
        applyHistory({ type: "clear" });
    };

    const onHistoryKeyDown = (event: ReactKeyboardEvent) => {
        if (editMode !== "mask" || !(event.ctrlKey || event.metaKey) || drawingRef.current.active) return;
        const target = event.target as HTMLElement;
        if (target.closest("input, textarea, [contenteditable=true]")) return;
        const key = event.key.toLowerCase();
        if (key !== "z" && key !== "y") return;
        event.preventDefault();
        event.stopPropagation();
        applyHistory({ type: key === "y" || event.shiftKey ? "redo" : "undo" });
    };

    const outpaintArtifacts = () => {
        if (!image) throw new Error("原图尚未读取完成。");
        if (outpaint.error) throw new Error(outpaint.error);
        if (!Object.values(padding).some(value => value > 0)) throw new Error("至少扩展一个方向。");
        return prepareOutpaintImage(image, padding);
    };

    const submit = () => {
        if (preparingRef.current || !image) return;
        const nextPrompt = prompt.trim();
        const canvas = maskCanvasRef.current;
        if (!nextPrompt) return setError("请输入修改要求");
        preparingRef.current = true;
        setPreparing(true);
        try {
            if (editMode === "outpaint") {
                const prepared = outpaintArtifacts();
                onConfirm({ kind: "outpaint", prompt: nextPrompt, maskDataUrl: prepared.maskDataUrl, sourceDataUrl: prepared.sourceDataUrl, outpaint: { width: prepared.width, height: prepared.height, padding: prepared.padding }, generationConfig: pickGenerationConfig(generationConfig) });
            } else {
                if (!canvas || !canvasHasPaint(canvas)) throw new Error("请先涂抹局部区域");
                onConfirm({ prompt: nextPrompt, maskDataUrl: buildEditMask(canvas), generationConfig: pickGenerationConfig(generationConfig) });
            }
        } catch (error) { setError(error instanceof Error ? error.message : "准备图片失败"); }
        finally { preparingRef.current = false; setPreparing(false); }
    };

    const downloadOutpaint = () => {
        try {
            const prepared = outpaintArtifacts();
            const link = document.createElement("a");
            link.href = prepared.sourceDataUrl;
            link.download = `扩图-${prepared.width}x${prepared.height}.png`;
            link.click();
        } catch (error) { setError(error instanceof Error ? error.message : "导出扩图失败"); }
    };

    return (
        <Modal className="workspace-modal workspace-modal-wide" title={null} open={open && Boolean(dataUrl)} onCancel={onClose} footer={null} centered destroyOnHidden>
            <div className="grid gap-5 lg:grid-cols-[minmax(360px,1fr)_320px]" onKeyDown={onHistoryKeyDown}>
                <div className="flex min-h-[360px] items-center justify-center rounded-lg bg-surface-active p-0">
                    {editMode === "outpaint" && outpaint.geometry ? (
                        <div aria-label={t("canvasCompleteUi.outpaintPreview")} className="relative overflow-hidden rounded-lg border border-dashed border-current/20" style={{ width: `min(100%, ${outpaint.geometry.width}px, calc(68vh * ${outpaint.geometry.width / outpaint.geometry.height}))`, aspectRatio: `${outpaint.geometry.width} / ${outpaint.geometry.height}`, backgroundImage: "repeating-conic-gradient(var(--surface-active) 0% 25%, transparent 0% 50%)", backgroundSize: "16px 16px" }}>
                            <img src={dataUrl} alt={t("canvasCompleteUi.originalArea")} draggable={false} className="absolute" style={{ left: t("projectUi.percentComplete", { percent: padding.left / outpaint.geometry.width * 100 }), top: t("projectUi.percentComplete", { percent: padding.top / outpaint.geometry.height * 100 }), width: t("projectUi.percentComplete", { percent: image!.width / outpaint.geometry.width * 100 }), height: t("projectUi.percentComplete", { percent: image!.height / outpaint.geometry.height * 100 }) }} />
                        </div>
                    ) : editMode === "mask" ? (
                    <div className="relative inline-block max-w-full overflow-hidden rounded-lg bg-transparent select-none">
                        <img src={dataUrl} alt="" className="relative z-0 block max-h-[68vh] max-w-full bg-transparent" draggable={false} />
                        {image ? (
                            <>
                                <canvas ref={maskCanvasRef} width={image.width} height={image.height} className="hidden" />
                                <canvas
                                    ref={previewCanvasRef}
                                    width={image.width}
                                    height={image.height}
                                    className="absolute inset-0 z-10 h-full w-full cursor-crosshair touch-none"
                                    onPointerDown={startDraw}
                                    onPointerMove={moveDraw}
                                    onPointerUp={() => stopDraw()}
                                    onPointerCancel={() => stopDraw(true)}
                                />
                            </>
                        ) : null}
                    </div>
                    ) : <div role="status" className="p-4 text-sm">{outpaint.error || t("canvasCompleteUi.readingImage")}</div>}
                </div>

                <div className="flex min-h-[360px] flex-col gap-5">
                    <div>
                        <h2 className="text-xl font-semibold">{editMode === "outpaint" ? t("canvasCompleteUi.extendImage") : t("canvasCompleteUi.localMaskEdit")}</h2>
                        <div className="mt-2 text-sm opacity-60">{image ? `${image.width} x ${image.height}px` : t("settingsUi.reading")}</div>
                    </div>

                    <Segmented block value={editMode} onChange={(value) => { setEditMode(value as "mask" | "outpaint"); setError(""); }} options={[{ value: "mask", label: t("canvasCompleteUi.localEdit") }, { value: "outpaint", label: t("canvasCompleteUi.outpaint") }]} />

                    {editMode === "mask" ? <>
                    <div className="grid grid-cols-2 gap-2">
                        <Button type={mode === "paint" ? "primary" : "default"} aria-pressed={mode === "paint"} icon={<Brush className="size-4" />} onClick={() => setMode("paint")}>
                            {t("imageNodeUi.brush")}
                        </Button>
                        <Button type={mode === "erase" ? "primary" : "default"} aria-pressed={mode === "erase"} icon={<Eraser className="size-4" />} onClick={() => setMode("erase")}>
                            {t("canvasCompleteUi.erase")}
                        </Button>
                    </div>

                    <div className="flex gap-2">
                        <Button size="small" aria-label={t("canvasCompleteUi.undoMask")} disabled={!history.past.length} icon={<Undo2 className="size-4" />} onClick={() => applyHistory({ type: "undo" })}>{t("canvasToolbarUndo")}</Button>
                        <Button size="small" aria-label={t("canvasCompleteUi.redoMask")} disabled={!history.future.length} icon={<Redo2 className="size-4" />} onClick={() => applyHistory({ type: "redo" })}>{t("canvasToolbarRedo")}</Button>
                    </div>

                    <div className="space-y-2">
                        <div className="flex items-center justify-between text-sm">
                            <span className="font-medium opacity-75">{t("canvasCompleteUi.brushSize")}</span>
                            <span className="font-semibold">{brushSize}px</span>
                        </div>
                    </div>
                    </> : <div className="space-y-3">
                        <div className="grid grid-cols-2 gap-3">
                            {([ ["left", t("completeUi.152")], ["right", t("completeUi.153")], ["top", t("completeUi.154")], ["bottom", t("completeUi.155")] ] as const).map(([side, label]) => <label key={side} className="space-y-1 text-sm"><span>{label}{t("canvasCompleteUi.sideExtension")}</span><InputNumber className="w-full" aria-label={t("canvasCompleteUi.sidePixels", { value0: label })} min={0} max={16384} precision={0} value={padding[side]} onChange={(value) => { setPadding(current => ({ ...current, [side]: value ?? 0 })); setError(""); }} /></label>)}
                        </div>
                        <p className="text-xs opacity-60">{outpaint.geometry ? t("canvasCompleteUi.outpaintDimensions", { value0: outpaint.geometry.width, value1: outpaint.geometry.height }) : outpaint.error}</p>
                        <Button icon={<Download className="size-4" />} disabled={!image || Boolean(outpaint.error)} onClick={downloadOutpaint}>{t("canvasCompleteUi.exportOutpaint")}</Button>
                    </div>}

                    <div className="space-y-2">
                        <div className="text-sm font-medium opacity-75">{t("canvasCompleteUi.editRequirements")}</div>
                        <Input.TextArea
                            rows={6}
                            value={prompt}
                            status={error && !prompt.trim() ? "error" : undefined}
                            placeholder={editMode === "outpaint" ? t("completeUi.156") : t("completeUi.157")}
                            onChange={(event) => {
                                setPrompt(event.target.value);
                                setError("");
                            }}
                        />
                        {error ? <div className="text-xs font-medium text-destructive">{error}</div> : null}
                    </div>

                    <div className="rounded-xl border border-border/60">
                        <button
                            type="button"
                            className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left text-sm font-medium"
                            aria-expanded={advancedOpen}
                            onClick={() => setAdvancedOpen((current) => !current)}
                        >
                            <span>{t("canvasCompleteUi.advancedGeneration")}</span>
                            <ChevronDown className={`size-4 shrink-0 opacity-60 transition-transform ${advancedOpen ? "rotate-180" : ""}`} />
                        </button>
                        {advancedOpen ? (
                            <div className="space-y-3 border-t border-border/60 px-3 pb-3 pt-3">
                                <div className="space-y-2">
                                    <div className="text-sm font-medium opacity-75">{t("agentApprovalUiModelLabel")}</div>
                                    <ModelPicker
                                        config={generationConfig}
                                        value={generationConfig.imageModel || generationConfig.model}
                                        capability="image"
                                        fullWidth
                                        showSelectedPrice={false}
                                        onChange={(model) => setGenerationConfig((current) => ({ ...current, model, imageModel: model, ...defaultImageParamsForModel(current, model) }))}
                                    />
                                </div>
                                <ImageSettingsPanel
                                    config={generationConfig}
                                    showTitle={false}
                                    showCount={false}
                                    bypassPriceGuard
                                    className="space-y-3"
                                    theme={theme}
                                    onConfigChange={(key, value) => setGenerationConfig((current) => ({ ...current, [key]: value }))}
                                />
                            </div>
                        ) : null}
                    </div>

                    <div className="mt-auto flex items-center justify-between gap-2">
                        <Button icon={<RotateCcw className="size-4" />} onClick={editMode === "mask" ? resetMask : () => setPadding({ left: 0, top: 0, right: 0, bottom: 0 })}>
                            {t("collectionReset")}
                        </Button>
                        <div className="flex items-center gap-2">
                            <Button icon={<X className="size-4" />} onClick={onClose}>
                                {t("timelineCancel")}
                            </Button>
                            <Button type="primary" disabled={!image || (editMode === "outpaint" && Boolean(outpaint.error))} loading={preparing} icon={<WandSparkles className="size-4" />} onClick={submit}>
                                {editMode === "outpaint" ? t("completeUi.158") : t("completeUi.159")}
                            </Button>
                        </div>
                    </div>
                </div>
            </div>
        </Modal>
    );
}

function renderMaskHistory(maskCanvas: HTMLCanvasElement | null, previewCanvas: HTMLCanvasElement | null, strokes: MaskEditStroke[]) {
    if (!maskCanvas) return;
    // Replay on a fresh surface, separate from the live brush and preview readbacks.
    const replay = document.createElement("canvas");
    replay.width = maskCanvas.width;
    replay.height = maskCanvas.height;
    const context = replay.getContext("2d", { willReadFrequently: true });
    const maskContext = maskCanvas.getContext("2d", { willReadFrequently: true });
    if (!context || !maskContext) return;
    for (const stroke of strokes) {
        context.lineCap = "round";
        context.lineJoin = "round";
        context.lineWidth = stroke.size;
        context.globalCompositeOperation = stroke.mode === "paint" ? "source-over" : "destination-out";
        context.strokeStyle = "#000";
        context.fillStyle = "#000";
        stroke.points.forEach((point, index) => drawMaskStroke(context, stroke.points[Math.max(0, index - 1)], point, stroke.size));
    }
    maskContext.putImageData(context.getImageData(0, 0, replay.width, replay.height), 0, 0);
    renderMaskPreview(maskCanvas, previewCanvas, canvasHasPaint(maskCanvas));
}

function readCanvasPoint(canvas: HTMLCanvasElement, clientX: number, clientY: number) {
    const rect = canvas.getBoundingClientRect();
    return {
        x: ((clientX - rect.left) / Math.max(1, rect.width)) * canvas.width,
        y: ((clientY - rect.top) / Math.max(1, rect.height)) * canvas.height,
    };
}

function drawMaskStroke(context: CanvasRenderingContext2D, from: { x: number; y: number }, to: { x: number; y: number }, size: number) {
    if (from.x === to.x && from.y === to.y) {
        context.beginPath();
        context.arc(to.x, to.y, size / 2, 0, Math.PI * 2);
        context.fill();
        return;
    }
    context.beginPath();
    context.moveTo(from.x, from.y);
    context.lineTo(to.x, to.y);
    context.stroke();
}

function canvasHasPaint(canvas: HTMLCanvasElement) {
    const context = canvas.getContext("2d");
    if (!context) return false;
    const data = context.getImageData(0, 0, canvas.width, canvas.height).data;
    for (let index = 3; index < data.length; index += 4) {
        if (data[index] > 0) return true;
    }
    return false;
}

function renderMaskPreview(maskCanvas: HTMLCanvasElement, previewCanvas: HTMLCanvasElement | null, withBorder = false) {
    const context = previewCanvas?.getContext("2d");
    if (!previewCanvas || !context) return;
    context.clearRect(0, 0, previewCanvas.width, previewCanvas.height);
    context.fillStyle = maskFillColor;
    context.fillRect(0, 0, previewCanvas.width, previewCanvas.height);
    context.globalCompositeOperation = "destination-in";
    context.drawImage(maskCanvas, 0, 0);
    context.globalCompositeOperation = "source-over";
    if (withBorder) drawDashedMaskBorder(context, maskCanvas);
}

function drawDashedMaskBorder(context: CanvasRenderingContext2D, maskCanvas: HTMLCanvasElement) {
    const maskContext = maskCanvas.getContext("2d");
    if (!maskContext) return;
    const { width, height } = maskCanvas;
    const data = maskContext.getImageData(0, 0, width, height).data;
    const step = Math.max(1, Math.round(Math.max(width, height) / 1200));
    const dash = step * 8;
    const gap = step * 5;
    const period = dash + gap;

    context.save();
    context.fillStyle = maskBorderColor;
    context.shadowColor = "rgba(0, 0, 0, .24)";
    context.shadowBlur = step * 1.5;
    for (let y = step; y < height - step; y += step) {
        for (let x = step; x < width - step; x += step) {
            const offset = (y * width + x) * 4 + 3;
            if (data[offset] === 0 || !isMaskEdge(data, width, x, y, step)) continue;
            if ((x + y) % period > dash) continue;
            context.fillRect(x - step / 2, y - step / 2, Math.max(1.5, step), Math.max(1.5, step));
        }
    }
    context.restore();
}

function isMaskEdge(data: Uint8ClampedArray, width: number, x: number, y: number, step: number) {
    return data[((y - step) * width + x) * 4 + 3] === 0 || data[((y + step) * width + x) * 4 + 3] === 0 || data[(y * width + x - step) * 4 + 3] === 0 || data[(y * width + x + step) * 4 + 3] === 0;
}

function buildEditMask(selectionCanvas: HTMLCanvasElement) {
    const canvas = document.createElement("canvas");
    canvas.width = selectionCanvas.width;
    canvas.height = selectionCanvas.height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("浏览器无法创建编辑蒙版。");
    const selectionContext = selectionCanvas.getContext("2d");
    context.fillStyle = "#fff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    if (!selectionContext) throw new Error("浏览器无法读取编辑蒙版。");
    const selection = selectionContext.getImageData(0, 0, canvas.width, canvas.height);
    const mask = context.getImageData(0, 0, canvas.width, canvas.height);
    for (let index = 3; index < mask.data.length; index += 4) {
        if (selection.data[index] > 0) mask.data[index] = 0;
    }
    context.putImageData(mask, 0, 0);
    return canvas.toDataURL("image/png");
}

function pickGenerationConfig(config: AiConfig): NonNullable<CanvasImageMaskEditPayload["generationConfig"]> {
    return { model: config.model, imageModel: config.imageModel, size: config.size, quality: config.quality, count: config.count, transparentBackground: config.transparentBackground };
}
