import { publishedSkills } from "@/lib/published-production-assets";
import { withYingxueCover } from "@/lib/yingxue-covers";
import { isVerifiedProductionSkill, verifiedLtvCaseIds } from "@/lib/verified-production-assets";
import { appendNativeProductionItems } from "@/lib/native-production-registry";
import { isCasePublic } from "@/lib/case-publication-policy";
import { cleanedCaseMediaBinding, enforceCleanedCaseMedia } from "@/lib/cleaned-case-media";
import type { CommunityWork } from "@/services/api/community-works";

export type ProductionMediaInfo = {
    bytes: number;
    sha256: string;
    durationSeconds: number;
    format: string;
    videoCodec: string;
    audioCodec: string | null;
    width?: number;
    height?: number;
};

export type ProductionItem = {
    id: string;
    kind: "skill" | "agent" | "case" | "voice" | "template";
    presentation?: "reconstruction" | "storyboard-template" | "image-template";
    name: string;
    description: string;
    category: string;
    cover?: string;
    source: string;
    author: string;
    available: boolean;
    version?: string;
    input?: string;
    output?: string;
    fileCount?: number;
    media?: string;
    mediaKind?: "image" | "video";
    communityWork?: CommunityWork;
    tags?: string[];
    voiceId?: string;
    modelFamily?: string;
    projectId?: string;
    sourceProjectId?: string;
    sourceTemplateId?: string;
    sourceRank?: number;
    likeCount?: number;
    publishedAt?: string;
    localCover?: string;
    localMedia?: string;
    mediaStatus?: "local" | "remote" | "unavailable";
    localMediaInfo?: ProductionMediaInfo;
};

export type ProductionCatalog = {
    version: number;
    publishedCaseIds?: string[];
    stats: { sourceSkills: number; portableSkills: number; agents: number; referenceSkills: number; cases: number; voices: number; localCovers: number; localCases?: number; templates?: number };
    items: ProductionItem[];
    mediaWarning?: string;
};

export type LtvHomeItem = ProductionItem & { sourceOrder: number; previewOnly?: boolean };
export type LtvHomeCatalog = { version: number; items: LtvHomeItem[]; skills: ProductionItem[] };

function publicCatalogSignal(signal?: AbortSignal): AbortSignal {
    const timeout = AbortSignal.timeout(12_000);
    return signal ? AbortSignal.any([signal, timeout]) : timeout;
}

export async function loadLtvHomeCatalog(signal?: AbortSignal): Promise<LtvHomeCatalog> {
    const response = await fetch(new URL("../assets/ltv-home-published.json", import.meta.url).href, { signal: publicCatalogSignal(signal) });
    if (!response.ok) throw new Error("精选内容暂时未能加载，请重试。");
    const result = await response.json();
    if (result.version !== 1 || !Array.isArray(result.items) || !Array.isArray(result.skills)) throw new Error("精选内容版本无效。");
    return {
        ...result,
        items: result.items.filter((item: ProductionItem) => publishedSkills[item.id] && isVerifiedProductionSkill(item.id)).map((item: ProductionItem) => ({ ...item, cover: publishedSkills[item.id].cover })),
        skills: result.skills.filter((item: ProductionItem) => publishedSkills[item.id] && isVerifiedProductionSkill(item.id)).map((item: ProductionItem) => ({ ...item, cover: publishedSkills[item.id].cover })),
    };
}

// Build-time static assets, separate from authenticated business JSON.
export async function loadProductionCatalog(featured = false, signal?: AbortSignal): Promise<ProductionCatalog> {
    const response = await fetch(new URL("../assets/published-catalog-featured-200.json", import.meta.url).href, { signal: publicCatalogSignal(signal) });
    if (!response.ok) throw new Error("已发布内容暂时未能加载，请重试。");
    const catalog: ProductionCatalog = await response.json();
    if (catalog.version !== 1 || !Array.isArray(catalog.items) || !catalog.stats) throw new Error("已发布内容版本无效。");
    const caseIds = new Set(catalog.items.filter((item) => item.kind === "case").map((item) => item.id));
    if (!Array.isArray(catalog.publishedCaseIds) || !catalog.publishedCaseIds.length || new Set(catalog.publishedCaseIds).size !== catalog.publishedCaseIds.length || catalog.publishedCaseIds.some((id) => !caseIds.has(id)))
        throw new Error("已发布案例名单缺失或无效，未展示未验收的资料条目。");
    const publishedCases = new Set(catalog.publishedCaseIds);
    const items = catalog.items
        .filter((item) => (item.kind === "case" ? publishedCases.has(item.id) && verifiedLtvCaseIds.has(item.id) && isCasePublic(item) : Boolean(publishedSkills[item.id]) && isVerifiedProductionSkill(item.id)))
        .map((item) => (publishedSkills[item.id] ? { ...item, cover: publishedSkills[item.id].cover, available: true } : item));
    const result = {
        ...catalog,
        mediaWarning: undefined,
        items,
        stats: {
            ...catalog.stats,
            portableSkills: items.filter((item) => item.kind === "skill").length,
            agents: items.filter((item) => item.kind === "agent").length,
            referenceSkills: 0,
            cases: items.filter((item) => item.kind === "case").length,
            voices: 0,
            localCases: 0,
        },
    };
    result.items = result.items.map(enforceCleanedCaseMedia).map(withYingxueCover);
    if (!result.stats.cases) return appendNativeProductionItems(result);
    const localCases = items.filter((item) => item.kind === "case");
    if (localCases.every((item) => item.localMedia && item.localMediaInfo)) {
        try {
            // Published catalogs already carry verified film metadata. The full
            // manifest also lists every workflow asset and is not needed here.
            const embedded = mergeProductionCaseMedia(result, {
                version: 1,
                kind: "ltv-case-media",
                metadataCount: localCases.length,
                entries: localCases.map(({ id, localMedia, localMediaInfo }) => ({ id, localMedia, localMediaInfo })),
            });
            if (embedded.stats.localCases === localCases.length) return appendNativeProductionItems(embedded);
        } catch {
            // Refresh incomplete or stale catalog metadata from the live manifest.
        }
    }
    try {
        const media = await fetch("/production-library/case-media-manifest.json", { signal: publicCatalogSignal(signal) });
        if (!media.ok) throw new Error("案例媒体清单暂不可用");
        const merged = mergeProductionCaseMedia(catalog, await media.json());
        const approved = new Set(items.map((item) => item.id));
        const mergedItems = merged.items.filter((item) => approved.has(item.id)).map((item) => (publishedSkills[item.id] ? { ...item, cover: publishedSkills[item.id].cover, available: true } : item));
        return appendNativeProductionItems({ ...result, items: mergedItems.map(withYingxueCover), stats: { ...result.stats, localCases: mergedItems.filter((item) => item.kind === "case" && item.mediaStatus === "local").length } });
    } catch (error) {
        if (signal?.aborted) throw error;
        return appendNativeProductionItems(result);
    }
}

export function mergeProductionCaseMetadata(catalog: ProductionCatalog, value: unknown): ProductionCatalog {
    const metadata = value as { version?: number; kind?: string; entries?: ProductionItem[] } | null;
    const cases = new Map(catalog.items.filter((item) => item.kind === "case").map((item) => [item.id, item]));
    if (metadata?.version !== 1 || metadata.kind !== "ltv-case-metadata" || !Array.isArray(metadata.entries) || metadata.entries.length !== cases.size) throw new Error("案例附加资料数量与完整案例数据不一致。");
    const entries = new Map<string, ProductionItem>();
    for (const entry of metadata.entries) {
        const original = cases.get(entry.id);
        const identifier = /^case-([a-f0-9]{32})$/.exec(entry.id)?.[1];
        if (
            !original ||
            !identifier ||
            entries.has(entry.id) ||
            entry.sourceTemplateId !== identifier ||
            typeof entry.sourceProjectId !== "string" ||
            (entry.media ?? "") !== (original.media ?? "") ||
            (entry.cover ?? "") !== (original.cover ?? "") ||
            !Number.isSafeInteger(entry.likeCount) ||
            (entry.likeCount ?? -1) < 0 ||
            typeof entry.publishedAt !== "string" ||
            (entry.localCover !== undefined && entry.localCover !== `/production-library/covers/cases/${identifier}.webp`)
        )
            throw new Error("案例附加资料的来源或映射无效，原始记录未被覆盖。");
        entries.set(entry.id, entry);
    }
    return {
        ...catalog,
        items: catalog.items.map((item) => {
            const extra = entries.get(item.id);
            return extra
                ? {
                      ...item,
                      sourceProjectId: item.sourceProjectId ?? extra.sourceProjectId,
                      sourceTemplateId: item.sourceTemplateId ?? extra.sourceTemplateId,
                      likeCount: item.likeCount ?? extra.likeCount,
                      publishedAt: item.publishedAt ?? extra.publishedAt,
                      localCover: item.localCover ?? extra.localCover,
                  }
                : item;
        }),
    };
}

export function mergeProductionCaseMedia(catalog: ProductionCatalog, value: unknown): ProductionCatalog {
    const manifest = value as { version?: number; kind?: string; metadataCount?: number; entries?: Array<{ id: string; localMedia: string; localCover?: string; localMediaInfo: ProductionMediaInfo }> } | null;
    const caseIds = new Set(catalog.items.filter((item) => item.kind === "case").map((item) => item.id));
    if (manifest?.version !== 1 || manifest.kind !== "ltv-case-media" || manifest.metadataCount !== caseIds.size || !Array.isArray(manifest.entries)) throw new Error("本地案例媒体清单与完整案例数据不一致。");
    const entries = new Map<string, NonNullable<typeof manifest.entries>[number]>();
    const seen = new Set<string>();
    for (const entry of manifest.entries) {
        const info = entry.localMediaInfo;
        const identifier = /^case-([a-f0-9]{32})$/.exec(entry.id)?.[1];
        const binding = cleanedCaseMediaBinding(entry.id, info?.sha256);
        const validPath = (binding && entry.localMedia === binding.path) || ["mp4", "mov"].some((extension) => entry.localMedia === `/production-library/case-media/${identifier}.${extension}`);
        if (
            !identifier ||
            !caseIds.has(entry.id) ||
            seen.has(entry.id) ||
            !validPath ||
            !info ||
            !Number.isSafeInteger(info.bytes) ||
            info.bytes <= 0 ||
            !/^[a-f0-9]{64}$/.test(info.sha256) ||
            !Number.isFinite(info.durationSeconds) ||
            info.durationSeconds <= 0 ||
            (entry.localCover !== undefined && entry.localCover !== `/production-library/covers/cases/${identifier}.webp` && entry.localCover !== binding?.coverPath)
        )
            throw new Error("本地案例媒体映射无效，已停止加载该清单。");
        seen.add(entry.id);
        // A stale bound version must not disable unrelated validated local media.
        // Omit only this entry; enforceCleanedCaseMedia below also blocks its source fallback.
        if (binding && (entry.localMedia !== binding.path || info.sha256 !== binding.sha256 || info.bytes !== binding.bytes)) continue;
        entries.set(entry.id, entry);
    }
    const items = catalog.items.map((item) => {
        const local = entries.get(item.id);
        return enforceCleanedCaseMedia(local ? { ...item, localMedia: local.localMedia, localMediaInfo: local.localMediaInfo, localCover: local.localCover || item.localCover, mediaStatus: "local" as const } : item);
    });
    return {
        ...catalog,
        stats: { ...catalog.stats, localCases: entries.size },
        items,
    };
}

export const productionCategories = [
    { value: "all", label: "全部" },
    { value: "drama", label: "影视短剧" },
    { value: "ecommerce", label: "商业广告" },
    { value: "creative", label: "视觉设计" },
    { value: "social", label: "社媒内容" },
    { value: "others", label: "更多创作" },
];
