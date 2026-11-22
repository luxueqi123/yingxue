// 素材库的展示格式化：摘要、尺寸、时长、时间、下载名与搜索文本。纯函数。

import { formatBytes } from "@/lib/image-utils";
import { audioAverageBitrateKbps, formatAudioSampleRate, imageResolutionTierLabel, isLosslessAudioMimeType, mediaAspectRatioLabel, mediaFormatLabel, videoResolutionTierLabel } from "@/lib/media-spec";
import { characterAssetSummary } from "@/components/assets/asset-rich-cover";
import { type AssetCategory, normalizeAssetCategory } from "@/lib/asset-category";
import { resourceStorageLocation } from "@/lib/canvas/resource-storage-status";
import { interfaceTranslator, type InterfaceLocale, type InterfaceMessageKey, type InterfaceTranslate } from "@/lib/interface-locale";
import { currentLocale } from "@/i18n";
import { type AssetKind } from "@/stores/use-asset-store";
import { type AssetGridDensity, parseAssetGridDensity } from "./asset-grid-density";
import { type Asset } from "@/stores/use-asset-store";
import { type LucideIcon, FileText, Image as ImageIcon, Clapperboard, AudioLines, Box, UserRound, Mountain, Package, Layers, Shapes, ShieldCheck } from "lucide-react";

export type LibraryAsset = Asset;

export const ASSET_GRID_DENSITY_KEY = "yingce:asset-grid-density";

export const assetKindIcons: Record<LibraryAsset["kind"], LucideIcon> = {
    text: FileText,
    image: ImageIcon,
    video: Clapperboard,
    audio: AudioLines,
    model: Box,
    entity: UserRound,
};

const assetKindMessageKeys: Record<AssetKind, InterfaceMessageKey> = {
    text: "assetsUi.kindText",
    image: "assetsUi.kindImage",
    video: "assetsUi.kindVideo",
    audio: "assetsUi.kindAudio",
    model: "assetsUi.kindModel",
    entity: "assetsUi.kindCharacter",
};

const assetCategoryMessageKeys: Record<AssetCategory, string> = {
    character: "assetsUi.categoryCharacter",
    environment: "assetsUi.categoryEnvironment",
    prop: "assetsUi.categoryProp",
    material: "assetsUi.categoryMaterial",
    other: "assetsUi.categoryOther",
    ark: "library.ark.title",
};

export function assetKindLabel(kind: AssetKind, t: InterfaceTranslate = interfaceTranslator(currentLocale())) {
    return t(assetKindMessageKeys[kind]);
}

export function assetCategoryLabel(value: unknown, t: InterfaceTranslate = interfaceTranslator(currentLocale())) {
    return t(assetCategoryMessageKeys[normalizeAssetCategory(value)]);
}

export function assetSourceLabel(asset: LibraryAsset, t: InterfaceTranslate = interfaceTranslator(currentLocale())) {
    if (asset.source === "批量上传" && asset.metadata?.source === "manual-batch") return t("library.assets.batch.title");
    return asset.source || t("assetsUi.unlabeledSource");
}

export function assetResolutionLabel(asset: LibraryAsset, t: InterfaceTranslate = interfaceTranslator(currentLocale())) {
    if (asset.kind !== "image" && asset.kind !== "video") return "";
    const tier = asset.kind === "video" ? videoResolutionTierLabel(asset.data.width, asset.data.height) : imageResolutionTierLabel(asset.data.width, asset.data.height);
    return tier === "标清" ? t("assetsUi.standardDefinition") : tier;
}

/** 业务分类图标；方舟认证用盾牌，与素材卡片、画布节点上的认证标识一致。 */
export const assetCategoryIcons: Record<AssetCategory, LucideIcon> = {
    character: UserRound,
    environment: Mountain,
    prop: Package,
    material: Layers,
    other: Shapes,
    ark: ShieldCheck,
};

/**
 * 卡片摘要只放挑素材时真正比较的规格：图片/视频是清晰度与画幅，音频是时长与采样率。
 * 像素尺寸、大小和格式留在素材档案里（见 assetSummaryDetail 与 assetArchiveFacts）。
 */
export function assetSummary(asset: LibraryAsset, audioSampleRate?: number, t: InterfaceTranslate = interfaceTranslator(currentLocale())) {
    if (asset.kind === "entity") return asset.category === "environment" || asset.category === "prop" ? String(asset.data.definition.description || t("assetsUi.waitingImage")) : characterAssetSummary(asset);
    if (asset.kind === "text") return asset.data.content;
    if (asset.kind === "audio") return [formatAssetClock(asset.data.durationMs) || formatAssetDuration(asset.data.durationMs), formatAudioSampleRate(audioSampleRate)].filter(Boolean).join(" · ");
    if (asset.kind === "model") return `${asset.data.fileName} · ${formatBytes(asset.data.bytes)} · ${asset.data.mimeType}`;
    const tier = assetResolutionLabel(asset, t);
    const spec = [tier, mediaAspectRatioLabel(asset.data.width, asset.data.height)].filter(Boolean).join(" · ");
    return spec || `${t("assetsUi.unknown")} · ${formatBytes(asset.data.bytes)}`;
}

/** 卡片摘要悬停提示：补上像素尺寸、文件大小和格式，不必打开档案也能核对。 */
export function assetSummaryDetail(asset: LibraryAsset, audioSampleRate?: number) {
    if (asset.kind === "image" || asset.kind === "video") return [assetSizeLabel(asset.data.width, asset.data.height), formatBytes(asset.data.bytes), mediaFormatLabel(asset.data.mimeType)].join(" · ");
    if (asset.kind === "audio") {
        const bitrate = isLosslessAudioMimeType(asset.data.mimeType) ? 0 : audioAverageBitrateKbps(asset.data.bytes, asset.data.durationMs);
        return [assetSummary(asset, audioSampleRate), bitrate ? `${bitrate} kbps` : "", formatBytes(asset.data.bytes), mediaFormatLabel(asset.data.mimeType)].filter(Boolean).join(" · ");
    }
    return assetSummary(asset);
}

export function assetSizeLabel(width: number, height: number, t: InterfaceTranslate = interfaceTranslator(currentLocale())) {
    // 旧版本后端把未知尺寸写成 1×1 占位；1 像素的边长不是真实媒体尺寸，同样按未知显示。
    return width > 1 && height > 1 ? `${width}x${height}` : t("assetsUi.unknown");
}

export function assetSearchText(asset: LibraryAsset, t: InterfaceTranslate = interfaceTranslator(currentLocale())) {
    const body = asset.kind === "text" ? asset.data.content : asset.kind === "entity" ? JSON.stringify(asset.data.definition) : asset.data.mimeType;
    return [asset.title, asset.source || "", asset.note || "", assetCategoryLabel(asset.category, t), (asset.tags || []).join(" "), body].join(" ").toLowerCase();
}

export function assetProjectLabel(asset: LibraryAsset, t: InterfaceTranslate = interfaceTranslator(currentLocale())) {
    const projectName = asset.metadata?.projectName;
    if (typeof projectName === "string" && projectName.trim()) return projectName;
    return Array.isArray(asset.metadata?.projectIds) && asset.metadata.projectIds.length ? t("assetsUi.projectLinked") : t("assetsUi.projectUnlinked");
}

export function assetDownloadLabel(asset: LibraryAsset, t: InterfaceTranslate = interfaceTranslator(currentLocale())) {
    if (asset.kind === "video") return t("assetsUi.downloadVideo");
    if (asset.kind === "audio") return t("assetsUi.downloadAudio");
    if (asset.kind === "model") return t("assetsUi.downloadModel");
    return t("assetsUi.downloadImage");
}

export function assetStorageLabel(storageKey: string | undefined, t: InterfaceTranslate = interfaceTranslator(currentLocale())) {
    const location = resourceStorageLocation(storageKey);
    if (location === "oss") return t("assetsUi.storageUploaded");
    if (location === "local") return t("assetsUi.storageLocal");
    return t("assetsUi.storageUnsynced");
}

export function assetStorageTitle(storageKey: string | undefined, t: InterfaceTranslate = interfaceTranslator(currentLocale())) {
    const location = resourceStorageLocation(storageKey);
    if (location === "oss") return t("assetsUi.storageUploadedTitle");
    if (location === "local") return t("assetsUi.storageLocalTitle");
    return t("assetsUi.storageUnsyncedTitle");
}

export function readAssetGridDensity(): AssetGridDensity {
    if (typeof window === "undefined") return 8;
    return parseAssetGridDensity(window.localStorage.getItem(ASSET_GRID_DENSITY_KEY));
}

export function assetCountMap<T extends { label: string; value: string }>(options: T[], remote: Record<string, number> | undefined, fallback: LibraryAsset[], valueOf: (asset: LibraryAsset) => string) {
    const result = new Map<string, number>();
    options.forEach((option) => {
        // “全部”只累计筛选条上声明的类型，避免未展示的分类把计数和列表对不上。
        if (remote) result.set(option.value, option.value === "all" ? options.reduce((sum, item) => (item.value === "all" ? sum : sum + (remote[item.value] || 0)), 0) : remote[option.value] || 0);
        else result.set(option.value, option.value === "all" ? fallback.length : fallback.filter((asset) => valueOf(asset) === option.value).length);
    });
    return result;
}

export function formatAssetDuration(durationMs: number | undefined, t: InterfaceTranslate = interfaceTranslator(currentLocale())) {
    if (!durationMs) return t("assetsUi.unknownDuration");
    return t("assetsUi.durationSeconds", { seconds: Math.round(durationMs / 100) / 10 });
}

export function formatAssetClock(durationMs?: number) {
    if (!durationMs || durationMs < 1000) return null;
    const total = Math.round(durationMs / 1000);
    const minutes = Math.floor(total / 60);
    const seconds = total % 60;
    return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

export function formatAssetTime(value: string, locale: InterfaceLocale = currentLocale()) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? "-" : date.toLocaleDateString(locale, { month: "2-digit", day: "2-digit" });
}

export function formatAssetDateTime(value: string, locale: InterfaceLocale = currentLocale()) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "-";
    return date.toLocaleString(locale, { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}
