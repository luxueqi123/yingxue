import type { ProductionItem } from "../services/production-library";

export type ProductionProjectEntry = { id: string; snapshotPath: string; sha256: string; nodeCount: number; connectionCount: number; generationNodeCount: number; requiredInputs?: readonly unknown[] };
export type NativeProductionMediaAsset = {
    role: "reference-video" | "first-frame";
    path: string;
    sourcePack: string;
    sourcePath: string;
    mimeType: "video/mp4" | "image/webp";
    bytes: number;
    sha256: string;
};
export type NativeProductionRecord = { item: ProductionItem; project: ProductionProjectEntry; provenance: { sourcePack: string; sourceSha256: string; reconstruction: true }; mediaAssets: NativeProductionMediaAsset[] };

export function validateNativeProductionRegistry(value: unknown): NativeProductionRecord[] {
    const data = value as { version?: number; entries?: NativeProductionRecord[] } | null;
    if (data?.version !== 1 || !Array.isArray(data.entries)) throw new Error("原生资源目录版本无效");
    const ids = new Set<string>();
    for (const entry of data.entries) {
        const item = entry?.item, project = entry?.project, source = entry?.provenance;
        if (!item || !project || !source || !/^native-[a-z0-9-]+$/.test(item.id) || ids.has(item.id)
            || project.id !== item.id || project.snapshotPath !== `/production-library/native-projects/${item.id}.json`
            || !/^[a-f0-9]{64}$/.test(project.sha256) || !/^[a-z0-9-]+$/.test(source.sourcePack) || source.sourcePack !== item.source
            || !/^[a-f0-9]{64}$/.test(source.sourceSha256) || source.reconstruction !== true
            || ![project.nodeCount, project.connectionCount, project.generationNodeCount].every(n => Number.isSafeInteger(n) && n >= 0)
            || project.generationNodeCount < 1 || project.generationNodeCount > project.nodeCount
            || !item.name?.trim() || !item.description?.trim() || !item.available || !["case", "template"].includes(item.kind)) throw new Error("原生资源目录或工程合同不完整");
        if (item.kind === "case" && (item.presentation !== "reconstruction"
            || item.localMedia !== `/production-library/native-media/${item.id}/reference.mp4`
            || item.localCover !== `/production-library/native-media/${item.id}/first-frame.webp`)) throw new Error("重建案例必须有一一对应的演示和首帧");
        const expectedMedia = item.kind === "case" ? [
            { role: "reference-video", path: item.localMedia, sourcePath: `${item.id}/reference.mp4`, mimeType: "video/mp4" },
            { role: "first-frame", path: item.localCover, sourcePath: `${item.id}/first-frame.webp`, mimeType: "image/webp" },
        ] : [];
        if (!Array.isArray(entry.mediaAssets) || entry.mediaAssets.length !== expectedMedia.length
            || expectedMedia.some(expected => {
                const asset = entry.mediaAssets.find(candidate => candidate?.role === expected.role);
                return !asset || asset.path !== expected.path || asset.sourcePack !== source.sourcePack
                    || asset.sourcePath !== expected.sourcePath || asset.mimeType !== expected.mimeType
                    || !Number.isSafeInteger(asset.bytes) || asset.bytes <= 0 || !/^[a-f0-9]{64}$/.test(asset.sha256);
            })) throw new Error("原生案例媒体来源或SHA-256合同不完整");
        if (item.kind === "template") {
            const editorialCover = `/production-library/editorial-covers/${item.id}.webp`;
            if (!["storyboard-template", "image-template"].includes(item.presentation || "") || item.localMedia || item.media
                || (item.cover && item.cover !== editorialCover) || (item.localCover && item.localCover !== editorialCover)) {
                throw new Error("制作模板仅允许专属主题封面，不能冒充已有媒体的作品");
            }
        }
        ids.add(item.id);
    }
    return data.entries;
}
