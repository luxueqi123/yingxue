import type { InterfaceMessageKey, InterfaceTranslate } from "@/lib/interface-locale";

const IMAGE_QUALITY_LABELS: Record<string, string> = {
    auto: "自动",
    low: "低",
    medium: "中",
    high: "高",
    xhigh: "超高",
    max: "最高",
    "1k": "1K",
    "2k": "2K",
    "4k": "4K",
};

const IMAGE_QUALITY_MESSAGE_KEYS: Partial<Record<string, InterfaceMessageKey>> = {
    auto: "imageSettingsUiQualityAuto",
    low: "imageSettingsUiQualityLow",
    medium: "imageSettingsUiQualityMedium",
    high: "imageSettingsUiQualityHigh",
    xhigh: "imageSettingsUiQualityXhigh" as InterfaceMessageKey,
    max: "imageSettingsUiQualityMax" as InterfaceMessageKey,
};

export function imageQualityLabel(value: string, t?: InterfaceTranslate) {
    const normalized = String(value || "").trim().toLowerCase();
    const messageKey = IMAGE_QUALITY_MESSAGE_KEYS[normalized];
    if (messageKey && t) return t(messageKey);
    return IMAGE_QUALITY_LABELS[normalized] || value;
}

const IMAGE_QUALITY_DESCRIPTION_MESSAGE_KEYS: Record<string, string> = {
    auto: "createUiQualityModel", low: "createUiQualityFast", medium: "createUiQualityBalanced",
    high: "creationComposer.qualitySpeed", xhigh: "creationComposer.qualityPriority", max: "createUiQualityDetail",
    "1k": "createUiQualityStandard", "2k": "createUiQualityHigher", "4k": "creationComposer.qualityHighestResolution",
};

export function imageQualityDescription(value: string, t?: InterfaceTranslate) {
    if (t) return t(IMAGE_QUALITY_DESCRIPTION_MESSAGE_KEYS[String(value || "").trim().toLowerCase()] || "createUiSupportedQuality");
    switch (String(value || "").trim().toLowerCase()) {
        case "auto":
            return "由模型决定";
        case "low":
            return "更快生成";
        case "medium":
            return "均衡模式";
        case "high":
            return "优先速度";
        case "xhigh":
            return "优先质量";
        case "max":
            return "优先细节";
        case "1k":
            return "标准清晰度";
        case "2k":
            return "更高清晰度";
        case "4k":
            return "最高清晰度";
        default:
            return "模型支持的质量/分辨率";
    }
}

export function isImageResolutionTier(value: string) {
    return ["1k", "2k", "4k"].includes(String(value || "").trim().toLowerCase());
}
