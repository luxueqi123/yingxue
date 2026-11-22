import type { CanvasNodeData } from "../types/canvas";
import type { PrevisScene } from "../types/previs";

export type ProductionCaseMediaAsset = {
    source: string;
    path: string;
    kind: "image" | "video" | "audio" | "file";
    mimeType: string;
    bytes: number;
    sha256: string;
};

const mimeExtensions: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "image/bmp": "bmp", "video/mp4": "mp4", "video/quicktime": "mov", "video/webm": "webm", "audio/mpeg": "mp3", "audio/wav": "wav", "audio/mp4": "m4a", "audio/ogg": "ogg", "model/gltf-binary": "glb" };

/** Shared by snapshot validation and the existing local media library allowlist. */
export function assertProductionCaseMediaFile(id: string, asset: ProductionCaseMediaAsset): void {
    if (!/^case-[a-f0-9]{32}$/.test(id) || !asset || typeof asset.sha256 !== "string" || !/^[a-f0-9]{64}$/.test(asset.sha256)
        || !Number.isSafeInteger(asset.bytes) || asset.bytes <= 0
        || !Object.hasOwn(mimeExtensions, asset.mimeType) || (asset.kind === "file" ? asset.mimeType !== "model/gltf-binary" : !asset.mimeType.startsWith(`${asset.kind}/`))
        || asset.path !== `/production-library/case-media/${id}/${asset.sha256}.${mimeExtensions[asset.mimeType]}`) {
        throw new Error("案例媒体清单文件路径或校验字段无效。");
    }
}

/** Media declarations live inside the already hash-verified project snapshot. */
export function validateProductionCaseMediaAssets(id: string, nodes: CanvasNodeData[], value: unknown, previsScenes?: PrevisScene[]): ProductionCaseMediaAsset[] | undefined {
    if (value === undefined) return undefined;
    const invalid = () => new Error("案例媒体清单与工程引用不完整，已停止复制。");
    if (!/^case-[a-f0-9]{32}$/.test(id) || !Array.isArray(value)) throw invalid();
    const required = new Map<string, string>();
    const requireMedia = (source: string, kind: string) => {
        if (required.has(source) && required.get(source) !== kind) throw invalid();
        required.set(source, kind);
    };
    for (const node of nodes) {
        if (["image", "video", "audio"].includes(node.type) && node.metadata?.content) requireMedia(node.metadata.content, node.type);
        if (node.metadata?.ltvMaskEdit) {
            requireMedia(node.metadata.ltvMaskEdit.sourceUrl, "image");
            requireMedia(node.metadata.ltvMaskEdit.maskUrl, "image");
        }
    }
    for (const scene of previsScenes ?? []) {
        for (const object of scene.objects) {
            if (object.kind === "model" || object.kind === "billboard") {
                if (!object.url) throw invalid();
                requireMedia(object.url, object.kind === "model" ? "file" : "image");
            }
        }
    }
    const seen = new Set<string>();
    const paths = new Map<string, number>();
    for (const asset of value as ProductionCaseMediaAsset[]) {
        assertProductionCaseMediaFile(id, asset);
        if (typeof asset.source !== "string" || seen.has(asset.source) || required.get(asset.source) !== asset.kind) throw invalid();
        if (paths.has(asset.path) && paths.get(asset.path) !== asset.bytes) throw invalid();
        paths.set(asset.path, asset.bytes);
        seen.add(asset.source);
    }
    if (seen.size !== required.size) throw invalid();
    return value;
}
