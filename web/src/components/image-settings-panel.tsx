import { ImageParameterFields } from "./image-parameter-fields";
import { imageSizePresets } from "@/lib/image-size-presets";
import { useEffect, useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { imagePriceSelector, normalizeImagePriceSelector } from "@/lib/image-pricing";
import { ImageSizePicker } from "./image-size-picker";
import { imageResolutionUsesQuality } from "@/lib/image-size-presets";
import { type ReactNode } from "react";
import { ConfigProvider } from "antd";
import { Switch } from "@/components/ui/base/switch";
import { type CanvasTheme } from "@/lib/canvas-theme";
import { buildImageResolutionOptions, formatImageResolutionSize } from "@/lib/image-resolution-tiers";
import { modelCapabilityConfigFor, type ImageCapabilityConfig } from "@/lib/model-capabilities";
import { preserveImageSettings as normalizeImageValue, type ImageSettings } from "@/lib/media-settings";
import { MediaSettingsNotice } from "./media-settings-notice";
import { mergedImageCapabilityConfig } from "@/lib/model-selection";
import { modelOptionName, resolveModelChannel, resolveModelRequestConfig, type AiConfig } from "@/stores/use-config-store";
import type { InterfaceMessageKey, InterfaceTranslate, InterfaceValues } from "@/lib/interface-locale";
import { useInterfaceTranslation } from "@/stores/use-interface-locale-store";

function imageSettingsT(t: InterfaceTranslate, key: string, values?: InterfaceValues) {
    return t(key as InterfaceMessageKey, values);
}

const qualityMessageKeys: Partial<Record<string, InterfaceMessageKey>> = {
    auto: "imageSettingsUiQualityAuto",
    high: "imageSettingsUiQualityHigh",
    medium: "imageSettingsUiQualityMedium",
    low: "imageSettingsUiQualityLow",
    xhigh: "imageSettingsUiQualityXhigh",
    max: "imageSettingsUiQualityMax",
};

const qualityOptions = [
    { value: "1k", label: "1K" },
    { value: "2k", label: "2K" },
    { value: "4k", label: "4K" },
];

type AspectOption = { value: string; label: string; width: number; height: number; icon: string; size?: string };

const aspectOptions: AspectOption[] = [
    { value: "1:1", label: "1:1", width: 1024, height: 1024, icon: "square" },
    { value: "3:2", label: "3:2", width: 1536, height: 1024, icon: "landscape" },
    { value: "2:3", label: "2:3", width: 1024, height: 1536, icon: "portrait" },
    { value: "4:3", label: "4:3", width: 1360, height: 1024, icon: "landscape" },
    { value: "3:4", label: "3:4", width: 1024, height: 1360, icon: "portrait" },
    { value: "16:9", label: "16:9", width: 1824, height: 1024, icon: "landscape" },
    { value: "2:1", label: "2:1", size: "2048x1024", width: 2048, height: 1024, icon: "landscape" },
    { value: "1:2", label: "1:2", size: "1024x2048", width: 1024, height: 2048, icon: "portrait" },
    { value: "21:9", label: "21:9", size: "2352x1008", width: 2352, height: 1008, icon: "landscape" },
    { value: "9:16", label: "9:16", width: 1024, height: 1824, icon: "portrait" },
    { value: "1:1-2k", label: "1:1(2k)", size: "2048x2048", width: 2048, height: 2048, icon: "square" },
    { value: "16:9-2k", label: "16:9(2k)", size: "2048x1152", width: 2048, height: 1152, icon: "landscape" },
    { value: "9:16-2k", label: "9:16(2k)", size: "1152x2048", width: 1152, height: 2048, icon: "portrait" },
    { value: "16:9-4k", label: "16:9(4k)", size: "3840x2160", width: 3840, height: 2160, icon: "landscape" },
    { value: "9:16-4k", label: "9:16(4k)", size: "2160x3840", width: 2160, height: 3840, icon: "portrait" },
    { value: "auto", label: "auto", width: 0, height: 0, icon: "auto" },
];

type ImageSettingsPanelProps = {
    config: AiConfig;
    onConfigChange: (key: "quality" | "imageResolution" | "size" | "transparentBackground" | "count" | "imageParameters", value: string) => void;
    theme: CanvasTheme;
    showTitle?: boolean;
    showQuality?: boolean;
    showTransparent?: boolean;
    showSize?: boolean;
    showCount?: boolean;
    className?: string;
    maxCount?: number;
    quickCount?: number;
    countLimit?: number;
    /** 局部编辑等场景需要先允许选择参数，由后端负责最终计费校验。 */
    bypassPriceGuard?: boolean;
};

export function ImageSettingsPanel(props: ImageSettingsPanelProps) {
    const { config } = props;
    const model = config.model || config.imageModel;
    return (
        <>
            <MediaSettingsNotice config={props.config} capability="image" onChange={(field, value) => props.onConfigChange(field as Parameters<ImageSettingsPanelProps["onConfigChange"]>[0], value)} />
            <ImageProfileControls {...props} profile={mergedImageCapabilityConfig(config, model)} protocol={resolveModelRequestConfig(config, model).interfaceType} priceTiers={imageModelPriceTiers(config)} />
        </>
    );
}

export function ImageProfileControls({
    config,
    profile,
    protocol,
    priceTiers = [],
    onConfigChange,
    theme,
    showTitle = true,
    showQuality = true,
    showTransparent = true,
    showSize = true,
    showCount = true,
    className = "w-[304px] space-y-3 rounded-2xl px-1 py-0.5",
    maxCount = 15,
    quickCount = 3,
    countLimit,
    bypassPriceGuard = false,
}: Omit<ImageSettingsPanelProps, "config"> & { profile: ImageCapabilityConfig; protocol?: string; config: ImageSettings; priceTiers?: ReturnType<typeof imageModelPriceTiers> }) {
    const { t } = useInterfaceTranslation();
    const normalized = normalizeImageValue(profile, config, protocol);
    const quality = normalized.quality;

    const transparentBackground = normalized.transparentBackground === "true";

    const effectiveMaxCount = Math.min(maxCount, countLimit === undefined ? profile.maxOutputs : countLimit);

    const count = countLimit === undefined ? Math.max(1, Math.min(effectiveMaxCount, Number(normalized.count))) : Math.max(1, Math.min(effectiveMaxCount, Math.floor(Number(config.count)) || 1));

    const activeSize = normalized.size;
    const activeQualityOptions = profile.quality.values.map((value) => ({ value, label: imageQualityLabel(value, t) }));
    if (profile.parameters)
        return (
            <ImageSettingsTheme theme={theme}>
                <div className={className}>
                    {showTitle ? <div className="mb-3 text-base font-semibold">{t("imageSettingsUiTitle")}</div> : null}
                    <ImageParameterFields profile={profile} config={config} onChange={onConfigChange} showSize={showSize} showCount={showCount} showQuality={showQuality} showTransparent={showTransparent} countLimit={countLimit} />
                </div>
            </ImageSettingsTheme>
        );

    return (
        <ImageSettingsTheme theme={theme}>
            <div
                className={className}
                style={{ color: theme.node.text }}
                onMouseDown={(event) => {
                    event.stopPropagation();
                    if (event.target instanceof HTMLInputElement) return;
                    if (document.activeElement instanceof HTMLInputElement && event.currentTarget.contains(document.activeElement)) document.activeElement.blur();
                }}
            >
                {showTitle ? <div className="text-base font-semibold">{t("imageSettingsUiTitle")}</div> : null}
                {/* 张数与透明背景放在最前：尺寸列表较长，放在后面时需要滚动才能看到。 */}
                {showCount && effectiveMaxCount > 1 ? (
                    <div className="space-y-2">
                        <SettingTitle color={theme.node.muted}>{t("imageSettingsUiGenerationCount")}</SettingTitle>
                        <div className="grid grid-cols-4 gap-2">
                            {Array.from({ length: Math.min(3, effectiveMaxCount) }, (_, index) => index + 1).map((value) => (
                                <OptionPill key={value} selected={count === value} theme={theme} onClick={() => onConfigChange("count", String(value))}>
                                    {value}
                                </OptionPill>
                            ))}
                            {effectiveMaxCount >= 4 ? <CountStepperInput value={count} max={effectiveMaxCount} theme={theme} onChange={(value) => onConfigChange("count", String(value))} /> : null}
                        </div>
                    </div>
                ) : null}
                {showTransparent && profile.transparentBackground.supported ? (
                    <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                            <SettingTitle color={theme.node.muted}>{t("imageSettingsUiTransparentBackground")}</SettingTitle>
                            <div className="mt-1 text-[var(--fs-label)]" style={{ color: theme.node.muted }}>
                                {t("imageSettingsUiTransparentBackgroundDescription")}
                            </div>
                        </div>
                        <span title={t("imageSettingsUiTransparentBackgroundHelp")} onMouseDown={(event) => event.stopPropagation()}>
                            <Switch aria-label={t("imageSettingsUiTransparentBackground")} size="sm" checked={transparentBackground} onChange={(checked) => onConfigChange("transparentBackground", checked ? "true" : "false")} />
                        </span>
                    </div>
                ) : null}
                {showQuality && profile.quality.supported && !imageResolutionUsesQuality(profile) ? (
                    <div className="space-y-2">
                        <SettingTitle color={theme.node.muted}>{t(isGrokResolutionQuality(profile) ? "imageSettingsUiResolution" : "imageSettingsUiQuality")}</SettingTitle>
                        <div className={`grid gap-2 ${activeQualityOptions.length <= 2 ? "grid-cols-2" : "grid-cols-4"}`}>
                            {activeQualityOptions.map((item) => (
                                <OptionPill
                                    key={item.value}
                                    selected={quality === item.value}
                                    disabled={!bypassPriceGuard && !hasPriceTierForImageSelection(priceTiers, item.value, activeSize)}
                                    theme={theme}
                                    onClick={() => onConfigChange("quality", item.value)}
                                >
                                    {item.label}
                                </OptionPill>
                            ))}
                        </div>
                    </div>
                ) : null}
                {showSize ? (
                    <ImageSizePicker
                        profile={profile}
                        size={activeSize}
                        quality={quality}
                        imageResolution={normalized.imageResolution}
                        onChange={(size, nextQuality, nextResolution) => applyImageSizeSelection(onConfigChange, size, nextQuality, nextResolution)}
                    />
                ) : null}
            </div>
        </ImageSettingsTheme>
    );
}

export function applyImageSizeSelection(onConfigChange: ImageSettingsPanelProps["onConfigChange"], size: string, quality?: string, imageResolution?: AiConfig["imageResolution"]) {
    onConfigChange("size", size);
    if (quality) onConfigChange("quality", quality);
    if (imageResolution) onConfigChange("imageResolution", imageResolution);
}

export function ImageSettingsTheme({ theme, children }: { theme: CanvasTheme; children: ReactNode }) {
    return (
        <ConfigProvider
            theme={{
                token: { colorBgContainer: theme.canvas.background, colorBgElevated: theme.canvas.background, colorBorder: theme.node.stroke, colorPrimary: theme.node.activeStroke, colorText: theme.node.text, colorTextLightSolid: theme.node.panel },
                components: { Button: { defaultBg: theme.canvas.background, defaultBorderColor: theme.node.stroke, defaultColor: theme.node.text } },
            }}
        >
            {children}
        </ConfigProvider>
    );
}

export function imageQualityLabel(value: string, t?: InterfaceTranslate) {
    const normalizedValue = value.toLowerCase();

    const messageKey = qualityMessageKeys[normalizedValue];
    if (messageKey && t) return t(messageKey);

    return (
        (
            {
                auto: "自动",
                high: "高",
                medium: "中",
                low: "低",
                "1k": "1K",
                "2k": "2K",
                "4k": "4K",
            } as Record<string, string>
        )[normalizedValue] ||
        value ||
        "默认"
    );
}

function isGrokResolutionQuality(profile: ImageCapabilityConfig) {
    const values = profile.quality.values.map((item) => item.toLowerCase());

    return values.some((value) => ["1k", "2k", "4k"].includes(value));
}

export function imageSizeLabel(size: string, t?: InterfaceTranslate) {
    if (size.trim().toLowerCase() === "auto" && t) return t("imageSettingsUiQualityAuto");

    const resolutionLabel = formatImageResolutionSize(size, buildImageResolutionOptions([size]));

    return resolutionLabel !== size ? resolutionLabel : aspectOptions.find((item) => (item.size || item.value) === size || item.value === size)?.label || size;
}

function imageModelPriceTiers(config: AiConfig) {
    const channel = resolveModelChannel(config, config.model || config.imageModel);

    const cost = channel.modelCosts?.find((item) => item.model === modelOptionName(config.model || config.imageModel));

    return cost?.logicalPriceTiers || [];
}

function hasPriceTierForImageSelection(tiers: ReturnType<typeof imageModelPriceTiers>, quality: string, size: string) {
    if (!tiers.length) return true;

    const requested = imagePriceSelector(quality, size);

    return tiers.some((tier) => {
        const selector = normalizeImagePriceSelector(tier.selector || {});

        return Object.entries(selector).every(([key, value]) => value === "*" || requested[key] === value);
    });
}

function OptionPill({ selected, disabled = false, theme, onClick, children }: { selected: boolean; disabled?: boolean; theme: CanvasTheme; onClick: () => void; children: ReactNode }) {
    return (
        <button
            type="button"
            className="h-8 cursor-pointer rounded-full px-2 text-xs transition-colors hover:brightness-110 focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-1 disabled:cursor-not-allowed disabled:opacity-40"
            style={{ background: selected ? theme.toolbar.activeBg : "transparent", color: theme.node.text, outlineColor: theme.node.muted }}
            aria-pressed={selected}
            disabled={disabled}
            onMouseDown={(event) => event.stopPropagation()}
            onClick={onClick}
        >
            {children}
        </button>
    );
}

function CountInput({ value, quickCount, max, theme, onChange }: { value: number; quickCount: number; max: number; theme: CanvasTheme; onChange: (value: number | null) => void }) {
    const { t } = useInterfaceTranslation();

    const commit = (input: HTMLInputElement) => {
        const next = Math.max(1, Math.min(max, Math.floor(Number(input.value) || 1)));
        input.value = String(next);
        onChange(next);
    };

    return (
        <label className="flex h-8 overflow-hidden rounded-full text-xs" style={{ background: theme.toolbar.itemHover, color: theme.node.text }}>
            <input
                key={value > quickCount ? `custom-${value}` : "quick"}
                type="number"
                min={1}
                max={max}
                aria-label={imageSettingsT(t, "imageSettingsUiCustomCount")}
                placeholder={imageSettingsT(t, "imageSettingsUiCountPlaceholder")}
                className="min-w-0 flex-1 bg-transparent px-2 text-center outline-none placeholder:text-current placeholder:opacity-55 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                style={{ color: theme.node.text, WebkitTextFillColor: theme.node.text }}
                defaultValue={value > quickCount ? value : ""}
                onBlur={(event) => commit(event.currentTarget)}
                onKeyDown={(event) => {
                    if (event.key === "Enter") event.currentTarget.blur();
                }}
                onMouseDown={(event) => event.stopPropagation()}
            />
        </label>
    );
}

function SettingTitle({ children, color }: { children: string; color: string }) {
    return (
        <div className="text-xs font-medium" style={{ color }}>
            {children}
        </div>
    );
}

function CountStepperInput({ value, max, theme, onChange }: { value: number; max: number; theme: CanvasTheme; onChange: (value: number) => void }) {
    const { t } = useInterfaceTranslation();

    const isSelected = value >= 4;

    const [draftValue, setDraftValue] = useState(() => (value >= 4 ? String(value) : "4"));

    useEffect(() => {
        if (value >= 4) {
            setDraftValue(String(value));
        }
    }, [value]);

    const handleSelectThis = () => {
        const num = Math.max(1, Math.min(max, parseInt(draftValue, 10) || 4));
        onChange(num);
    };

    const handleStepUp = (e: React.MouseEvent) => {
        e.stopPropagation();

        const base = value >= 4 ? value : parseInt(draftValue, 10) || 4;

        const next = Math.min(max, base + 1);
        setDraftValue(String(next));
        onChange(next);
    };

    const handleStepDown = (e: React.MouseEvent) => {
        e.stopPropagation();

        const base = value >= 4 ? value : parseInt(draftValue, 10) || 4;

        const next = Math.max(1, base - 1);
        setDraftValue(String(next));
        onChange(next);
    };

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setDraftValue(e.target.value);
    };

    const handleInputBlur = (e: React.FocusEvent<HTMLInputElement>) => {
        const num = Math.max(1, Math.min(max, parseInt(e.target.value, 10) || 4));
        setDraftValue(String(num));
        onChange(num);
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === "Enter") {
            e.currentTarget.blur();
        } else if (e.key === "ArrowUp") {
            e.preventDefault();

            const base = value >= 4 ? value : parseInt(draftValue, 10) || 4;

            const next = Math.min(max, base + 1);
            setDraftValue(String(next));
            onChange(next);
        } else if (e.key === "ArrowDown") {
            e.preventDefault();

            const base = value >= 4 ? value : parseInt(draftValue, 10) || 4;

            const next = Math.max(1, base - 1);
            setDraftValue(String(next));
            onChange(next);
        }
    };

    return (
        <div
            className="group relative flex h-8 items-center overflow-hidden rounded-full border text-xs transition-colors cursor-pointer select-none"
            style={{ background: isSelected ? theme.toolbar.activeBg : theme.toolbar.itemHover, borderColor: isSelected ? theme.accent.primary : "transparent", color: theme.node.text }}
            onClick={handleSelectThis}
        >
            <input
                type="text"
                inputMode="numeric"
                aria-label={t("imageSettingsUiCustomCount")}
                value={draftValue}
                onChange={handleInputChange}
                onBlur={handleInputBlur}
                onKeyDown={handleKeyDown}
                onFocus={(e) => {
                    e.currentTarget.select();
                    if (value < 4) {
                        handleSelectThis();
                    }
                }}
                className="w-full min-w-0 flex-1 bg-transparent pl-2 pr-0.5 text-center font-medium text-xs outline-none"
                style={{ color: theme.node.text, WebkitTextFillColor: theme.node.text }}
            />
            <div className="flex flex-col h-full w-4.5 shrink-0 border-l justify-center items-center divide-y" style={{ borderColor: `${theme.toolbar.border}80` }}>
                <button
                    type="button"
                    tabIndex={-1}
                    onClick={handleStepUp}
                    disabled={value >= max && isSelected}
                    className="flex flex-1 w-full items-center justify-center hover:bg-black/15 dark:hover:bg-white/15 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                    title={t("workbenchUi.increaseCount")}
                    aria-label={t("workbenchUi.increaseCount")}
                >
                    <ChevronUp className="size-2.5 opacity-70" />
                </button>
                <button
                    type="button"
                    tabIndex={-1}
                    onClick={handleStepDown}
                    disabled={value <= 1 && isSelected}
                    className="flex flex-1 w-full items-center justify-center hover:bg-black/15 dark:hover:bg-white/15 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                    title={t("workbenchUi.decreaseCount")}
                    aria-label={t("workbenchUi.decreaseCount")}
                >
                    <ChevronDown className="size-2.5 opacity-70" />
                </button>
            </div>
        </div>
    );
}
