import type { InterfaceTranslate } from "./interface-locale";
import type { ImageParameter, ImageParameterValue } from "./image-parameters";

const builtInLabels: Record<string, Record<string, string>> = {
    size: { "画幅 / 尺寸": "imageParameters.size", "画幅": "imageParameters.frame", "画幅比例": "imageParameters.ratio" },
    imageResolution: { "分辨率": "imageSettingsUiResolution" },
    quality: { "图片质量": "createUiImageQuality", "质量": "imageSettingsUiQuality" },
    count: { "生成数量": "imageSettingsUiGenerationCount", "生成张数": "imageSettingsUiGenerationCount" },
    transparentBackground: { "透明背景": "imageSettingsUiTransparentBackground" },
    speed: { "生成速度": "imageParameters.speed" }, reference: { "参考方式": "imageParameters.reference" },
    seed: { "随机种子": "imageParameters.seed" }, temperature: { "随机程度": "imageParameters.temperature" },
    raw: { "原始风格": "imageParameters.raw" }, mjQuality: { "细节质量": "imageParameters.mjQuality" },
    stylize: { "风格化程度": "imageParameters.stylize" }, chaos: { "变化程度": "imageParameters.chaos" },
    weird: { "奇异程度": "imageParameters.weird" }, negative_prompt: { "排除内容": "imageParameters.negativePrompt" },
    tile: { "无缝平铺": "imageParameters.tile" }, iw: { "图片权重": "imageParameters.imageWeight" },
    cref: { "角色参考": "imageParameters.characterReference" }, sref: { "风格参考": "imageParameters.styleReference" },
    dref: { "细节参考": "imageParameters.detailReference" }, cw: { "角色权重": "imageParameters.characterWeight" },
    sw: { "风格权重": "imageParameters.styleWeight" }, dw: { "细节权重": "imageParameters.detailWeight" },
    hd: { "高清输出": "imageParameters.hd" }, outputFormat: { "输出格式": "imageParameters.outputFormat" },
    outputCompression: { "压缩质量": "imageParameters.outputCompression" },
};

// Recognize built-in metadata only; authored labels and protocol values stay intact.
export function imageParameterLabel(field: ImageParameter, t: InterfaceTranslate) {
    const key = Object.hasOwn(builtInLabels, field.name) && Object.hasOwn(builtInLabels[field.name], field.label)
        ? builtInLabels[field.name][field.label] : undefined;
    return key ? t(key) : field.label;
}

export function imageParameterValueLabel(field: ImageParameter, value: ImageParameterValue, t: InterfaceTranslate) {
    if (typeof value === "boolean") return t(value ? "imageParameters.enabled" : "imageParameters.disabled");
    if (field.name === "quality" && typeof value === "string") {
        const keys: Record<string, string> = { auto: "imageSettingsUiQualityAuto", low: "imageSettingsUiQualityLow", medium: "imageSettingsUiQualityMedium", high: "imageSettingsUiQualityHigh", xhigh: "imageSettingsUiQualityXhigh", max: "imageSettingsUiQualityMax" };
        if (Object.hasOwn(keys, value)) return t(keys[value]);
    }
    if (value === "auto" && (field.name === "size" || field.name === "imageResolution")) return t("imageSettingsUiQualityAuto");
    return String(value);
}
