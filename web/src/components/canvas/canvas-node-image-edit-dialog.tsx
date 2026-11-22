import { useInterfaceTranslation } from "@/stores/use-interface-locale-store";
import { useEffect, useState } from "react";
import { Button, Input, Modal } from "antd";
import { X, PenLine } from "lucide-react";
import { ModelPicker } from "@/components/model-picker";
import type { AiConfig } from "@/stores/use-config-store";
import { defaultImageParamsForModel } from "@/lib/model-selection";

export type CanvasImageEditPayload = { prompt: string; generationConfig?: Partial<Pick<AiConfig, "model" | "imageModel" | "size" | "quality" | "transparentBackground">> };

export function CanvasNodeImageEditDialog({
    dataUrl,
    open,
    config,
    preset,
    onClose,
    onConfirm,
}: {
    dataUrl: string;
    open: boolean;
    onClose: () => void;
    onConfirm: (payload: CanvasImageEditPayload) => void;
    config: AiConfig;
    preset?: "remove-background" | null;
}) {
    const { t } = useInterfaceTranslation();
    const [prompt, setPrompt] = useState(preset === "remove-background" ? "移除图片背景，保留主体完整轮廓、细节和边缘，输出透明背景。" : "");
    const [generationConfig, setGenerationConfig] = useState<AiConfig>(config);

    useEffect(() => {
        if (open) setPrompt(preset === "remove-background" ? "移除图片背景，保留主体完整轮廓、细节和边缘，输出透明背景。" : "");
        if (open) setGenerationConfig(config);
    }, [config, open, dataUrl]);

    return (
        <Modal open={open && Boolean(dataUrl)} onCancel={onClose} footer={null} centered destroyOnHidden width={860} title={preset === "remove-background" ? t("imageNodeUi.removeBackground") : t("imageNodeUi.imageEdit")}>
            <div className="grid gap-5 md:grid-cols-[minmax(0,1fr)_300px]">
                <div className="grid min-h-[320px] place-items-center overflow-hidden rounded-xl bg-black/5 p-3 dark:bg-white/[0.04]">
                    <img src={dataUrl} alt={t("imageNodeUi.editImageInput")} className="max-h-[58vh] max-w-full object-contain" draggable={false} />
                </div>
                <div className="flex flex-col gap-4">
                    <div>
                        <h3 className="text-lg font-semibold">{preset === "remove-background" ? t("imageNodeUi.removeBackground") : t("imageNodeUi.describeEdits")}</h3>
                        <p className="mt-1 text-sm opacity-60">{t("imageNodeUi.preserveImageHelp")}</p>
                    </div>
                    <Input.TextArea autoFocus rows={7} value={prompt} placeholder={t("imageNodeUi.editExample")} onChange={(event) => setPrompt(event.target.value)} />
                    <div className="space-y-2">
                        <div className="text-sm font-medium opacity-75">{t("imageNodeUi.editModel")}</div>
                        <ModelPicker
                            config={generationConfig}
                            value={generationConfig.imageModel || generationConfig.model}
                            capability="image"
                            fullWidth
                            showSelectedPrice={false}
                            onChange={(model) => setGenerationConfig((current) => ({ ...current, model, imageModel: model, ...defaultImageParamsForModel(current, model) }))}
                        />
                    </div>
                    <div className="mt-auto flex justify-end gap-2">
                        <Button icon={<X className="size-4" />} onClick={onClose}>
                            {t("timelineCancel")}
                        </Button>
                        <Button
                            type="primary"
                            icon={<PenLine className="size-4" />}
                            disabled={!prompt.trim()}
                            onClick={() =>
                                onConfirm({
                                    prompt: prompt.trim(),
                                    generationConfig: {
                                        model: generationConfig.model,
                                        imageModel: generationConfig.imageModel,
                                        size: generationConfig.size,
                                        quality: generationConfig.quality,
                                        ...(preset === "remove-background" ? { transparentBackground: "true" } : {}),
                                    },
                                })
                            }
                        >
                            {t("imageNodeUi.startEditing")}
                        </Button>
                    </div>
                </div>
            </div>
        </Modal>
    );
}
