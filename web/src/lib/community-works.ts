import type { CommunityWork } from "@/services/api/community-works";
import type { ProductionItem } from "@/services/production-library";
import { resourceFileUrl, resourceIdFromStorageKey } from "@/services/api/resources";
import type { Asset } from "@/stores/use-asset-store";
import type { CanvasProject } from "@/stores/canvas/use-canvas-store";

export type WorkResourceOption = { id: string; title: string; kind: "image" | "video"; url: string };
const categoryTag = { drama: "短片剧集", animation: "动画短片", commercial: "商业广告", music: "MV", documentary: "纪实·访谈", education: "教学教程", creative: "风格美学", other: "其他" };

export function communityWorkItem(work: CommunityWork): ProductionItem {
    return {
        id: work.id,
        kind: "case",
        source: "community",
        name: work.title,
        description: work.description,
        category: work.category,
        tags: [categoryTag[work.category], ...work.tags],
        author: work.author,
        available: true,
        localCover: work.coverUrl,
        localMedia: work.mediaUrl,
        mediaKind: work.kind,
        communityWork: work,
        publishedAt: work.updatedAt,
    };
}

export function workResourceOptions(assets: readonly Asset[], project?: CanvasProject): WorkResourceOption[] {
    const options = new Map<string, WorkResourceOption>();
    const add = (key: string | undefined, title: string, kind: string) => {
        const id = resourceIdFromStorageKey(key);
        if (id && (kind === "image" || kind === "video")) options.set(id, { id, title, kind, url: resourceFileUrl(id) });
    };
    for (const asset of assets) if (asset.kind === "image" || asset.kind === "video") add(asset.data.storageKey, asset.title, asset.kind);
    for (const node of project?.nodes || []) add(node.metadata?.storageKey, node.title || node.type, node.type);
    return [...options.values()];
}

export function workReturnTarget(state: unknown): { to: string; state?: unknown } {
    const value = state && typeof state === "object" ? (state as { returnTo?: unknown; returnState?: unknown }) : {};
    return typeof value.returnTo === "string" && value.returnTo.startsWith("/") && !value.returnTo.startsWith("//") && !value.returnTo.startsWith("/my/works") ? { to: value.returnTo, state: value.returnState } : { to: "/" };
}
