import { useState } from "react";
import "./image-size-picker.css";
import { Input, Button } from "antd";
import type { ImageCapabilityConfig } from "@/lib/model-capabilities";
import type { InterfaceMessageKey, InterfaceTranslate, InterfaceValues } from "@/lib/interface-locale";
import {
    IMAGE_RESOLUTIONS,
    imagePresetForRatio,
    imagePresetValue,
    imageQualityForSelection,
    imageQualityForTier,
    imageResolutionTiers,
    imageResolutionUsesQuality,
    imageSizePresets,
    imageTierAvailable,
    imageDeclaredSizePresets,
} from "@/lib/image-size-presets";
import { buildImageResolutionOptions, type ImageResolutionOption, type ImageResolutionTier } from "@/lib/image-resolution-tiers";
import { useInterfaceTranslation } from "@/stores/use-interface-locale-store";
import { resolveImageRequestSize, validateImageSize } from "@/services/api/image-validation";
function imageSizePickerT(t: InterfaceTranslate, key: string, values?: InterfaceValues) {
    return t(key as InterfaceMessageKey, values);
}
function imageSizeErrorMessage(t: InterfaceTranslate, reason: unknown) {
    const message = reason instanceof Error ? reason.message : String(reason);
    const knownMessages: Record<string, { key: string; values?: InterfaceValues }> = {
        尺寸格式无效: { key: "imageSizePickerUiInvalidFormat" },
        "请输入宽高比，例如 16:9": { key: "imageSizePickerUiRatioExample", values: { example: "16:9" } },
        "宽高比必须为正数，且不超过 3:1": { key: "imageSizePickerUiRatioRange" },
        "分辨率仅支持 1K、2K、4K": { key: "imageSizePickerUiSupportedTiers" },
        "图像尺寸格式不支持，请使用 auto、9:16 或 1024x1024": { key: "imageSizePickerUiUnsupportedSizeFormat", values: { examples: "auto / 9:16 / 1024x1024" } },
        "图像比例必须是正数，例如 9:16": { key: "imageSizePickerUiPositiveRatio", values: { example: "9:16" } },
        "图像宽高比不能超过 3:1，请调整尺寸": { key: "imageSizePickerUiRatioTooWide" },
        "图像尺寸必须是正整数，例如 1024x1024": { key: "imageSizePickerUiPositiveIntegerSize", values: { example: "1024x1024" } },
        "图像尺寸的宽高必须是 16 的倍数，请调整尺寸": { key: "imageSizePickerUiSizeStep" },
        "图像尺寸最长边不能超过 3840px，请调整尺寸": { key: "imageSizePickerUiMaxEdge" },
        "图像总像素需在 655360 到 8294400 之间，请调整尺寸": { key: "imageSizePickerUiPixelRange" },
        "图像比例格式不支持，请使用 3:4 或 1024x1360": { key: "imageSizePickerUiUnsupportedRatioFormat", values: { examples: "3:4 / 1024x1360" } },
        当前分辨率不支持所选图片宽高比: { key: "imageSizePickerUiResolutionRatioUnsupported" },
    };
    const localized = knownMessages[message];
    return localized ? imageSizePickerT(t, localized.key, localized.values) : message;
}
export function ImageSizePicker({
    profile,
    size,
    quality,
    imageResolution,
    canSelectResolution,
    ratioHint,
    declaredSizeOptions,
    onChange,
}: {
    profile: ImageCapabilityConfig;
    size: string;
    quality?: string;
    imageResolution?: string;
    canSelectResolution?: (resolution: string) => boolean;
    /** 可选：在比例按钮下补一行用途说明（如电商“主图”），不改变可选值。 */
    ratioHint?: (ratio: string) => { label: string; title?: string } | undefined;
    declaredSizeOptions?: boolean;
    onChange: (size: string, quality?: string, resolution?: string) => void;
}) {
    const { t } = useInterfaceTranslation();
    const ungrouped = Boolean(profile.parameters && !profile.resolution.supported);
    const declaredPresets = declaredSizeOptions ? imageDeclaredSizePresets(profile) : [];
    const tierValues = ungrouped ? [...new Set(imageSizePresets(profile).map((p) => p.tier))] : imageResolutionTiers(profile);
    const IMAGE_RESOLUTIONS = declaredPresets.length ? tierValues.map((value) => value.trim().toLowerCase() as ImageResolutionTier) : tierValues;
    const presets = (declaredPresets.length ? declaredPresets : imageSizePresets(profile)).filter((preset) => imageTierAvailable(profile, preset.tier));
    const visibleTiers = IMAGE_RESOLUTIONS.filter((value) => presets.some((preset) => preset.tier === value));
    const [chosenTier, setChosenTier] = useState<ImageResolutionTier>("1k");
    const [customPreset, setCustomPreset] = useState<ImageResolutionOption>();
    const [custom, setCustom] = useState("");
    const [error, setError] = useState("");
    const qualityTier = IMAGE_RESOLUTIONS.find((value) => value === (quality || "").toLowerCase());
    const resolutionTier = IMAGE_RESOLUTIONS.find((value) => value === (imageResolution || "").toLowerCase());
    const selectedTier = profile.resolution.supported ? resolutionTier : qualityTier;
    const matches = (preset: ImageResolutionOption) => {
        if (imagePresetValue(profile, preset) !== size) return false;
        if (profile.size.parameter !== "aspect_ratio") return true;
        if (profile.resolution.supported) return !resolutionTier || resolutionTier === preset.tier;
        if (imageResolutionUsesQuality(profile)) return imageQualityForTier(profile, preset.tier) === (quality || profile.quality.default);
        return !qualityTier || qualityTier === preset.tier;
    };
    let resolvedLegacySize: string | undefined;
    if (profile.size.parameter === "size" && size.includes(":")) {
        try {
            resolvedLegacySize = resolveImageRequestSize(profile, quality, size)?.value;
        } catch {
            /* 保留旧值，交由请求校验报告错误。 */
        }
    }
    let restoredCustom: ImageResolutionOption | undefined;
    if (profile.size.allowCustom && size !== "auto") {
        try {
            if (profile.size.parameter === "size") restoredCustom = buildImageResolutionOptions([resolvedLegacySize || size])[0];
            else if (profile.size.parameter === "aspect_ratio") {
                const restoredTier = imageResolutionUsesQuality(profile)
                    ? IMAGE_RESOLUTIONS.find((value) => imageQualityForTier(profile, value) === (quality || profile.quality.default)) || "1k"
                    : (qualityTier && visibleTiers.includes(qualityTier) ? qualityTier : visibleTiers[0]) || "1k";
                restoredCustom = imagePresetForRatio(restoredTier, size);
            }
        } catch {
            /* 无效配置不伪装成已选中的有效预设，交由请求校验处理。 */
        }
    }
    const active =
        (profile.size.allowCustom && customPreset && imageTierAvailable(profile, customPreset.tier) && matches(customPreset) ? customPreset : undefined) ||
        presets.find(matches) ||
        presets.find((preset) => preset.size === resolvedLegacySize) ||
        (restoredCustom && imageTierAvailable(profile, restoredCustom.tier) ? restoredCustom : undefined);
    const available = (value: ImageResolutionTier) => imageTierAvailable(profile, value) && (profile.size.allowCustom || presets.some((preset) => preset.tier === value));
    const tier = ungrouped
        ? (IMAGE_RESOLUTIONS[0] ?? "")
        : (active && visibleTiers.includes(active.tier) ? active.tier : undefined) ||
          (profile.size.parameter === "aspect_ratio" && imageResolutionUsesQuality(profile) ? visibleTiers.find((value) => imageQualityForTier(profile, value) === (quality || profile.quality.default)) : undefined) ||
          (selectedTier && visibleTiers.includes(selectedTier) ? selectedTier : undefined) ||
          (visibleTiers.includes(chosenTier) ? chosenTier : visibleTiers[0]) ||
          "1k";
    const choices = presets.filter((preset) => preset.tier === tier);
    const select = (preset: ImageResolutionOption) => {
        if (!available(preset.tier)) return;
        if (profile.resolution.supported && canSelectResolution && !canSelectResolution(preset.tier)) return;
        const resolution = profile.resolution.values.find((value) => value.toLowerCase() === preset.tier);
        setChosenTier(preset.tier);
        setCustomPreset(preset);
        setError("");
        onChange(
            imagePresetValue(profile, preset),
            profile.resolution.supported ? undefined : profile.size.parameter === "aspect_ratio" ? imageQualityForSelection(profile, preset.tier) : undefined,
            profile.resolution.supported ? resolution || preset.tier : undefined,
        );
    };
    const makeCustom = (next: ImageResolutionTier, ratio: string) => {
        const preset = imagePresetForRatio(next, ratio);
        // 精确支持值保持原值；支持值之外的像素仍遵守请求端的 16px 步长。
        if (profile.size.parameter === "size" && !profile.size.values.includes(preset.size)) {
            preset.width = Math.round(preset.width / 16) * 16;
            preset.height = Math.round(preset.height / 16) * 16;
            preset.size = `${preset.width}x${preset.height}`;
            validateImageSize(preset.width, preset.height);
        }
        return preset;
    };
    const changeTier = (next: ImageResolutionTier) => {
        const ratio = active?.ratio || (size.includes(":") ? size : "1:1");
        const candidate = presets.find((preset) => preset.tier === next && preset.ratio === ratio);
        try {
            if (candidate) select(candidate);
            else if (profile.size.allowCustom) select(makeCustom(next, ratio));
            else {
                const first = presets.find((preset) => preset.tier === next);
                if (first) select(first);
            }
        } catch (reason) {
            setError(imageSizeErrorMessage(t, reason));
        }
    };
    const applyCustom = () => {
        try {
            if (custom.includes(":") || custom.includes("：")) {
                select(makeCustom(tier, custom));
                return;
            }
            const match = custom.trim().match(/^(\d+)\s*[x×]\s*(\d+)$/i);
            if (!match) {
                setError(imageSizePickerT(t, "imageSizePickerUiRatioOrPixelsExample", { ratio: "16:9", pixels: "1824x1024" }));
                return;
            }
            const width = Number(match[1]),
                height = Number(match[2]);
            if (profile.size.parameter === "aspect_ratio") {
                select(makeCustom(tier, `${width}:${height}`));
                return;
            }
            const value = `${width}x${height}`;
            validateImageSize(width, height, !profile.size.values.includes(value));
            const preset = presets.find((item) => item.size === value) || {
                ...imagePresetForRatio(width * height <= 2_000_000 ? "1k" : width * height <= 4_300_000 ? "2k" : "4k", `${width}:${height}`),
                width,
                height,
                size: value,
            };
            select(preset);
        } catch (reason) {
            setError(imageSizeErrorMessage(t, reason));
        }
    };
    if (profile.size.parameter === "none")
        return profile.resolution.supported ? (
            <div className="image-size-picker">
                <div className="image-size-label">{imageSizePickerT(t, "imageSizePickerUiResolution")}</div>
                <div className="image-size-tiers">
                    {profile.resolution.values.map((value) => (
                        <button type="button" key={value} aria-pressed={value === imageResolution} disabled={Boolean(canSelectResolution && !canSelectResolution(value))} onClick={() => onChange(size, undefined, value)}>
                            {value.toUpperCase()}
                        </button>
                    ))}
                </div>
            </div>
        ) : null;
    return (
        <div className="image-size-picker">
            {profile.resolution.supported ? (
                <>
                    <div className="image-size-label">{imageSizePickerT(t, "imageSizePickerUiResolution")}</div>
                    <div className="image-size-tiers">
                        {profile.resolution.values.map((value) => (
                            <button
                                type="button"
                                key={value}
                                aria-pressed={value === imageResolution || (imageResolution === undefined && size !== "auto" && active?.tier === value)}
                                disabled={Boolean(canSelectResolution && !canSelectResolution(value))}
                                onClick={() => {
                                    const next = value.toLowerCase() as ImageResolutionTier;
                                    if (size !== "auto" && visibleTiers.includes(next)) changeTier(next);
                                    else onChange(size, undefined, value);
                                }}
                            >
                                {value.toUpperCase()}
                            </button>
                        ))}
                    </div>
                </>
            ) : (!ungrouped || imageResolutionUsesQuality(profile)) && visibleTiers.length && (profile.size.parameter === "size" || imageResolutionUsesQuality(profile) || !profile.quality.supported) ? (
                <>
                    <div className="image-size-label">{imageSizePickerT(t, "imageSizePickerUiResolution")}</div>
                    <div className="image-size-tiers">
                        {visibleTiers.map((value) => (
                            <button type="button" key={value} aria-pressed={size !== "auto" && active?.tier === value} onClick={() => changeTier(value)}>
                                {value.toUpperCase()}
                            </button>
                        ))}
                    </div>
                </>
            ) : null}
            {profile.size.values.includes("auto") ? (
                <button
                    type="button"
                    className="image-size-auto"
                    aria-pressed={size === "auto"}
                    onClick={() => {
                        setError("");
                        onChange("auto");
                    }}
                >
                    {imageSizePickerT(t, "imageSizePickerUiAutoSize")}
                </button>
            ) : null}
            {choices.length ? <div className="image-size-label">{imageSizePickerT(t, "imageSizePickerUiAspectRatio")}</div> : null}
            <div className="image-size-ratios">
                {choices.map((preset) => {
                    const hint = ratioHint?.(preset.ratio);
                    return (
                        <button
                            type="button"
                            key={`${preset.ratio}:${preset.size}`}
                            title={`${preset.ratio} · ${preset.width} × ${preset.height}${hint?.title ? `\n${hint.title}` : ""}`}
                            aria-pressed={size !== "auto" && active?.size === preset.size && active?.tier === tier}
                            onClick={() => select(preset)}
                        >
                            <span className="image-size-ratio-icon" style={{ width: 24 * Math.min(1, preset.width / preset.height), height: 24 * Math.min(1, preset.height / preset.width) }} />
                            <span>{preset.ratio}</span>
                            {hint ? <small className="image-size-ratio-hint">{hint.label}</small> : null}
                        </button>
                    );
                })}
            </div>
            {!choices.length ? <p className="image-size-hint">{imageSizePickerT(t, profile.size.allowCustom ? "imageSizePickerUiNoPresetsCustomAllowed" : "imageSizePickerUiNoPresets")}</p> : null}
            <output aria-live="polite" className="image-size-output">
                {size === "auto" || !size ? imageSizePickerT(t, "imageSizePickerUiModelDecidesSize") : active ? active.ratio + " · " + active.width + " × " + active.height + " px" : size.replace("x", " × ")}
            </output>
            {profile.size.parameter === "aspect_ratio" ? (
                <p className="image-size-hint">{imageSizePickerT(t, "imageSizePickerUiPixelEstimate") + (!imageResolutionUsesQuality(profile) && visibleTiers.length <= 1 ? " " + imageSizePickerT(t, "imageSizePickerUiNoSeparateResolution") : "")}</p>
            ) : null}
            {profile.size.allowCustom ? (
                <details className="image-size-custom">
                    <summary>{imageSizePickerT(t, "imageSizePickerUiCustomRatioOrSize")}</summary>
                    <div className="image-size-custom-input">
                        <Input
                            aria-label={imageSizePickerT(t, "imageSizePickerUiCustomRatioOrSize")}
                            placeholder={imageSizePickerT(t, "imageSizePickerUiRatioOrPixelsExample", { ratio: "16:9", pixels: "1824x1024" })}
                            value={custom}
                            onChange={(event) => setCustom(event.target.value)}
                            onPressEnter={applyCustom}
                        />
                        <Button onClick={applyCustom}>{imageSizePickerT(t, "imageSizePickerUiApply")}</Button>
                    </div>
                </details>
            ) : null}
            {error ? (
                <p role="alert" className="image-size-error">
                    {error}
                </p>
            ) : null}
        </div>
    );
}
