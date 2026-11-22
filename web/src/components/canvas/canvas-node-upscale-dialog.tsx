import { useState } from "react";
import { Radio, Select } from "antd";
import { AppModal } from "@/components/ui/product/app-modal";
import { MAX_UPSCALE_LONG_EDGE, resolveUpscaleSize, type ImageUpscaleAlgorithm, type ImageUpscaleParams } from "@/lib/canvas/image-operation-plan";
import { useImageToolSource } from "./use-image-tool-source";
import { useInterfaceTranslation } from "@/stores/use-interface-locale-store";

export type CanvasImageUpscaleParams = ImageUpscaleParams;
type UpscaleDialogProps = { dataUrl: string; storageKey?: string; open: boolean; onClose: () => void; onConfirm: (params: CanvasImageUpscaleParams) => void };
const pixelTargets = [1024, 2048, MAX_UPSCALE_LONG_EDGE];

export function CanvasNodeUpscaleDialog(props: UpscaleDialogProps) {
    return props.open && props.dataUrl ? <ResizeEditor key={`${props.storageKey ?? ""}:${props.dataUrl}`} {...props} /> : null;
}

function ResizeEditor({ dataUrl, storageKey, onClose, onConfirm }: UpscaleDialogProps) {
    const { t } = useInterfaceTranslation();
    const { size, error, previewUrl } = useImageToolSource(dataUrl, storageKey);
    const [chosen, setChosen] = useState<number | null>(null);
    const [algorithm, setAlgorithm] = useState<ImageUpscaleAlgorithm>("high");
    const edge = size ? Math.max(size.width, size.height) : 0;
    const target = chosen ?? pixelTargets.find((pixels) => pixels > edge) ?? MAX_UPSCALE_LONG_EDGE;
    const output = size ? resolveUpscaleSize(size.width, size.height, target) : null;
    const ready = Boolean(size && target > edge);
    return (
        <AppModal open centered title={t("imageTools.resize")} width={760} onCancel={onClose} okText={t("imageTools.applyResize")} okButtonProps={{ disabled: !ready || !!error }} onOk={() => ready && !error && onConfirm({ targetLongEdge: target, algorithm })}>
            <div className="grid gap-5 md:grid-cols-2">
                <figure className="m-0 flex flex-col items-center justify-center gap-3 rounded-lg border border-border bg-surface-active p-3">
                    <img alt={t("imageTools.inputImage")} src={previewUrl || dataUrl} draggable={false} className="max-h-[320px] max-w-full object-contain" />
                    <figcaption className="text-sm text-muted-foreground">{size ? `${size.width} × ${size.height} px` : error || t("imageTools.reading")}</figcaption>
                </figure>
                <div className="flex flex-col gap-5">
                    <label className="flex flex-col gap-2 text-sm">
                        {t("imageTools.longEdge")}
                        <Select aria-label={t("imageTools.longEdge")} value={target} onChange={setChosen} options={pixelTargets.map((pixels) => ({ value: pixels, label: `${pixels} px`, disabled: pixels <= edge }))} />
                    </label>
                    <fieldset className="space-y-2">
                        <legend className="mb-2 text-sm">{t("imageTools.sampling")}</legend>
                        <Radio.Group value={algorithm} onChange={(event) => setAlgorithm(event.target.value)} className="flex flex-col gap-2">
                            <Radio value="high">{t("imageTools.highQuality")}</Radio>
                            <Radio value="bilinear">{t("imageTools.bilinear")}</Radio>
                            <Radio value="nearest">{t("imageTools.nearest")}</Radio>
                        </Radio.Group>
                    </fieldset>
                    <output className="text-sm">{output ? t("imageTools.output", { width: output.width, height: output.height }) : t("imageTools.reading")}</output>
                    {error || (size && !ready) ? (
                        <p role="alert" className="text-sm text-destructive">
                            {error || t(edge >= MAX_UPSCALE_LONG_EDGE ? "imageTools.atMaximum" : "imageTools.chooseLarger")}
                        </p>
                    ) : null}
                </div>
            </div>
        </AppModal>
    );
}
