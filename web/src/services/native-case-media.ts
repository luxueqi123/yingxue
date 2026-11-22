import { getActiveUserScope } from "@/lib/user-scope";
import { relocateLtvMedia } from "@/lib/canvas/ltv-media-relocation";
import { nativeProductionRecords, productionProjectEntry } from "@/lib/production-project-registry";
import { validateProductionCaseMediaAssets, type ProductionCaseMediaAsset } from "@/lib/production-case-media-contract";
import { remapLtvMaskEditMedia } from "@/lib/canvas/ltv-mask-edit";
import { ResourceUploadError, resourceFileUrl, resourceStorageKey, uploadResourceFile, type RemoteResource } from "@/services/api/resources";
import { CanvasNodeType, type CanvasNodeData } from "@/types/canvas";
import type { PrevisScene } from "@/types/previs";

type PreparedCaseMedia = { blob?: Blob; node?: CanvasNodeData; asset: ProductionCaseMediaAsset };
const VERIFIED_MEDIA_CACHE_BYTES = 32 * 1024 * 1024;
export type CaseMediaCopyProgress = { completed: number; total: number } & (
    { phase: "verifying" | "uploading" } | { phase: "waiting"; retryAfterSeconds: number; connectionRetry?: true }
);

async function blobSha256(blob: Blob): Promise<string> {
    const subtle = globalThis.crypto?.subtle;
    if (!subtle) throw new Error("浏览器未提供 SHA-256 校验，已停止复制。");
    const digest = await subtle.digest("SHA-256", await blob.arrayBuffer());
    return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
}

/** Only call for an explicit editable-canvas action. Read-only previews never upload. */
export async function materializeNativeCaseMedia(id: string, nodes: CanvasNodeData[], declaredMedia?: ProductionCaseMediaAsset[], onProgress?: (progress: CaseMediaCopyProgress) => void, previsScenes?: PrevisScene[]): Promise<{ nodes: CanvasNodeData[]; previsScenes?: PrevisScene[] }> {
    const entry = nativeProductionRecords.find(record => record.item.id === id);
    if (entry && entry.item.kind !== "case") return { nodes, previsScenes };
    if (!entry && declaredMedia === undefined) {
        if (previsScenes?.some(scene => scene.objects.some(object => object.kind === "model" || object.kind === "billboard"))) throw new Error("导演台素材缺少完整清单，已停止复制。");
        return { nodes, previsScenes };
    }
    const project = productionProjectEntry(id);
    if (!project) throw new Error("案例工程未登记，已停止复制。");
    const scope = getActiveUserScope();
    const assertScope = () => { if (getActiveUserScope() !== scope) throw new Error("账号已变化，请重新复制案例。"); };
    const assets = entry ? nodes.flatMap((node): ProductionCaseMediaAsset[] => {
        const source = node.metadata?.content;
        if (!source || (node.type !== CanvasNodeType.Image && node.type !== CanvasNodeType.Video)) return [];
        const kind = node.type === CanvasNodeType.Image ? "image" as const : "video" as const;
        const expected = kind === "image" ? entry.item.localCover : entry.item.localMedia;
        if (source !== expected) throw new Error("案例素材与目录未一一对应，已停止复制。");
        const role = kind === "image" ? "first-frame" : "reference-video";
        const mimeType = kind === "image" ? "image/webp" : "video/mp4";
        const asset = entry.mediaAssets.find(candidate => candidate.role === role && candidate.path === source);
        if (!asset || asset.mimeType !== mimeType) throw new Error("案例素材缺少有效的源文件 SHA-256 合同，已停止复制。");
        return [{ source, path: asset.path, kind, mimeType: asset.mimeType, bytes: asset.bytes, sha256: asset.sha256 }];
    }) : validateProductionCaseMediaAssets(id, nodes, declaredMedia, previsScenes)!;

    const relocate = (replacements: Readonly<Record<string,string>>) => relocateLtvMedia(remapLtvMaskEditMedia(nodes, replacements), replacements);
    // Invalid references or a missing mask fail before downloading or creating user resources.
    relocate(Object.fromEntries(assets.map(asset => [asset.source,asset.path])));

    const readVerifiedBlob = async (asset: ProductionCaseMediaAsset) => {
        let response!: Response, blob!: Blob;
        for (let attempt = 0; ; attempt++) {
            assertScope();
            try {
                response = await fetch(asset.path, { credentials: "same-origin", cache: "no-store" });
                if (!response.ok) throw new Error("案例参考素材读取失败，未创建项目。");
                assertScope();
                blob = await response.blob();
                break;
            } catch (error) {
                // Fetch/body transport failures can occur on the uncached second read.
                // Retry only that read; HTTP and content-integrity failures stay terminal.
                if (!(error instanceof TypeError) || attempt === 2) throw error;
                await new Promise<void>(resolve => setTimeout(resolve, (attempt + 1) * 1000));
            }
        }
        assertScope();
        const responseMime = response.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase();
        if (responseMime !== asset.mimeType || blob.type !== asset.mimeType) throw new Error("案例参考素材 MIME 与源清单不匹配，未创建项目。");
        if (!blob.size || blob.size !== asset.bytes) throw new Error("案例参考素材字节数与源清单不匹配，未创建项目。");
        if (await blobSha256(blob) !== asset.sha256) throw new Error("案例参考素材 SHA-256 与源清单不匹配，未创建项目。");
        assertScope();
        return blob;
    };

    // Verify the entire set first, without retaining a multi-gigabyte case in memory.
    // Uncached files are re-read AND verified again before upload, never trusted by the earlier hash alone.
    const prepared = new Map<string, PreparedCaseMedia>();
    const total = new Set(assets.map(asset => asset.path)).size;
    onProgress?.({ phase: "verifying", completed: 0, total });
    let cachedBytes = 0;
    for (const asset of assets) {
        if (prepared.has(asset.path)) continue;
        const blob = await readVerifiedBlob(asset);
        const retain = cachedBytes + blob.size <= VERIFIED_MEDIA_CACHE_BYTES;
        if (retain) cachedBytes += blob.size;
        prepared.set(asset.path, { ...(retain ? { blob } : {}), node: nodes.find(node => node.metadata?.content === asset.source), asset });
        onProgress?.({ phase: "verifying", completed: prepared.size, total });
    }

    const resources = new Map<string, string>();
    onProgress?.({ phase: "uploading", completed: 0, total });
    for (const [path, preparedMedia] of prepared) {
        const { node, asset } = preparedMedia;
        assertScope();
        const blob = preparedMedia.blob || await readVerifiedBlob(asset);
        delete preparedMedia.blob;
        let resource: RemoteResource | undefined;
        for (let attempt = 0; attempt < 3; attempt++) {
            assertScope();
            try {
                resource = await uploadResourceFile(blob, asset.kind, {
                    width: node?.metadata?.naturalWidth, height: node?.metadata?.naturalHeight,
                    durationMs: node?.metadata?.durationMs,
                    fileName: asset.path.split("/").at(-1),
                    idempotencyKey: `native-case:${scope}:${project.sha256}:${asset.sha256}`,
                });
                break;
            } catch (error) {
                // A streaming proxy can lose an early response as a gateway error or connection reset.
                // Replay only this idempotent upload; preserve completed resources and never relax server limits.
                const connectionRetry = error instanceof ResourceUploadError && (error.status === undefined || [502, 503, 504].includes(error.status));
                const delay = error instanceof ResourceUploadError ? error.retryAfterMs ?? (connectionRetry ? 60_000 : undefined) : undefined;
                if (!(error instanceof ResourceUploadError) || (error.status !== 429 && !connectionRetry) || error.permanent
                    || delay === undefined || !Number.isFinite(delay) || delay < 0 || delay > 120_000 || attempt === 2) throw error;
                const waitMs = Math.max(1000, Math.ceil(delay));
                onProgress?.({ phase: "waiting", completed: resources.size, total, retryAfterSeconds: Math.ceil(waitMs / 1000), ...(connectionRetry ? { connectionRetry: true as const } : {}) });
                await new Promise<void>(resolve => setTimeout(resolve, waitMs));
                assertScope();
                onProgress?.({ phase: "uploading", completed: resources.size, total });
            }
        }
        assertScope();
        if (!resource?.id) throw new Error("案例素材未返回有效资源，未创建项目。");
        resources.set(path, resource.id);
        onProgress?.({ phase: "uploading", completed: resources.size, total });
    }

    // Successful uploads may be shared by another project through idempotency; later failures leave them intact.
    const replacements = Object.fromEntries(assets.map(asset => [asset.source, resourceFileUrl(resources.get(asset.path)!)]));
    const ownedNodes = relocate(replacements).map((node, index) => {
        const input = assets.find(asset => asset.source === nodes[index].metadata?.content);
        const resourceId = input ? resources.get(input.path) : undefined;
        return resourceId && input ? { ...node, metadata: { ...node.metadata, content: resourceFileUrl(resourceId), storageKey: resourceStorageKey(resourceId), mimeType: input.mimeType, bytes: input.bytes, assetId: undefined, previewContent: undefined } } : node;
    });
    const ownedScenes = previsScenes ? structuredClone(previsScenes) : undefined;
    for (const scene of ownedScenes ?? []) {
        for (const object of scene.objects) {
            if (object.kind !== "model" && object.kind !== "billboard") continue;
            const ownedUrl = replacements[object.url!];
            if (!ownedUrl) throw new Error("导演台素材没有归属当前账号，未创建项目。");
            object.url = ownedUrl;
        }
    }
    return { nodes: ownedNodes, previsScenes: ownedScenes };
}
