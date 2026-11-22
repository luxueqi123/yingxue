import { nanoid } from "nanoid";
import { copyStoryboardRow } from "@/lib/canvas/canvas-node-copy";
import { orderLtvReferenceConnections, remapLtvReferencePlan } from "@/lib/canvas/ltv-runtime-references";
import { remapLtvMaskEditMedia } from "@/lib/canvas/ltv-mask-edit";
import { relocateLtvMedia } from "@/lib/canvas/ltv-media-relocation";
import { productionProjectEntry } from "@/lib/production-project-registry";
import { isCaseWithdrawn } from "@/lib/case-publication-policy";
import { assertLibTVImportFitsCanvas, buildLibTVImagePreviewUrl } from "@/lib/canvas/libtv-import";
import type { CanvasNodeData, CanvasConnection } from "@/types/canvas";
import type { TimelineProject } from "@/types/timeline";
import type { PrevisScene } from "@/types/previs";
import { copyProductionCasePreviss } from "@/lib/canvas/previs/production-case-director";
import { validateProductionCaseMediaAssets } from "@/lib/production-case-media-contract";

function copyCaseTimeline(source: TimelineProject | undefined, nodes: CanvasNodeData[], nodeIds: Map<string, string>, preview: boolean): TimelineProject | undefined {
    if (source === undefined) return undefined;
    const invalid = () => new Error("案例时间线合同或素材引用不完整，未创建画布。");
    const nonnegative = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value) && value >= 0;
    const identifier = (value: unknown): value is string => typeof value === "string" && value.trim().length > 0;
    if (!source || source.version !== 2 || !Array.isArray(source.tracks) || !Array.isArray(source.clips) || !nonnegative(source.durationMs)) throw invalid();
    const kinds = new Set(["video", "audio", "subtitle", "text", "image"]);
    const tracks = new Set<string>();
    for (const track of source.tracks) {
        if (!track || !identifier(track.id) || tracks.has(track.id) || !kinds.has(track.kind) || typeof track.label !== "string" || !nonnegative(track.order)
            || [track.muted, track.visible, track.locked].some(value => value !== undefined && typeof value !== "boolean")) throw invalid();
        tracks.add(track.id);
    }
    const clipIds = new Set<string>();
    const nodeTypes = new Map(nodes.map(node => [node.id, node.type]));
    let endMs = 0;
    for (const clip of source.clips) {
        const track = clip && source.tracks.find(item => item.id === clip.trackId);
        if (!clip || !identifier(clip.id) || clipIds.has(clip.id) || !track || track.kind !== clip.kind || !nodeIds.has(clip.nodeId)
            || !nonnegative(clip.startMs) || !nonnegative(clip.durationMs) || clip.durationMs === 0
            || [clip.sourceStartMs, clip.sourceDurationMs, clip.volume, clip.fadeInMs, clip.fadeOutMs].some(value => value !== undefined && !nonnegative(value))) throw invalid();
        const nodeType = nodeTypes.get(clip.nodeId);
        if (clip.kind === "subtitle" ? nodeType !== "video" && nodeType !== "text" : nodeType !== clip.kind) throw invalid();
        // Direct media bypasses canvas resources and account-scoped materialization. It needs its own import contract.
        if (clip.directMedia !== undefined) throw invalid();
        if ((clip.kind === "video" || clip.kind === "audio") && clip.sourceDurationMs !== undefined
            && (clip.sourceStartMs ?? 0) + clip.durationMs > clip.sourceDurationMs + 1) throw invalid();
        const end = clip.startMs + clip.durationMs;
        if (!Number.isFinite(end)) throw invalid();
        endMs = Math.max(endMs, end);
        clipIds.add(clip.id);
    }
    if (Math.abs(source.durationMs - endMs) > 1) throw invalid();
    const copiedClipIds = new Map(source.clips.map(clip => [clip.id, preview ? clip.id : nanoid()]));
    return {
        ...source,
        // Track IDs are project-scoped; changing native default IDs would add duplicate empty tracks on reopen.
        tracks: source.tracks.map(track => ({ ...track })),
        clips: source.clips.map(clip => ({ ...clip, id: copiedClipIds.get(clip.id)!, nodeId: nodeIds.get(clip.nodeId)!,
            // Preserve unresolved source links; only remap targets that belong to this timeline copy.
            ...(clip.linkedVideoClipId ? { linkedVideoClipId: copiedClipIds.get(clip.linkedVideoClipId) ?? clip.linkedVideoClipId } : {}),
        })),
    };
}

export async function loadProductionCaseProject(id: string, options: { mode?: "preview" | "copy" | "editable"; signal?: AbortSignal; mediaUrlMap?: Readonly<Record<string, string>> } = {}) {
    if (isCaseWithdrawn(id)) throw new Error("该案例已从作品库下架。");
    const entry = productionProjectEntry(id);
    if (!entry) throw new Error("该案例的完整工程尚未接通。");
    const response = await fetch(entry.snapshotPath, { signal: options.signal });
    if (!response.ok) throw new Error("案例工程读取失败，请重试。");
    const bytes = await response.arrayBuffer();
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    const hash = Array.from(new Uint8Array(digest), n => n.toString(16).padStart(2, "0")).join("");
    if (hash !== entry.sha256) throw new Error("案例工程校验失败，未创建画布。");
    const source = JSON.parse(new TextDecoder().decode(bytes)) as { version: number; id: string; title: string; nodes: CanvasNodeData[]; connections: CanvasConnection[]; timeline?: TimelineProject; previsScenes?: PrevisScene[]; directorScenes?: PrevisScene[]; adaptation?: { models?: { nodeId: string; sourceModel: string; targetModel: string; operation: string }[] } };
    if (source.version !== 1 || source.id !== id || source.nodes.length !== entry.nodeCount || source.connections.length !== entry.connectionCount) throw new Error("案例工程与目录不一致。");
    // Frozen, hash-checked case packages keep their source schema and receipt unchanged.
    // Only the in-memory import is projected onto the current native previs contract.
    if (source.directorScenes !== undefined) {
        if (source.previsScenes !== undefined) throw new Error("案例包含两套预演场景，未创建画布。");
        source.previsScenes = source.directorScenes;
        for (const node of source.nodes) {
            if (!node.metadata) continue;
            const metadata = { ...node.metadata } as Record<string, unknown>;
            for (const suffix of ["SceneId", "ShotId", "PreviewNodeId", "DepthNodeId", "NormalNodeId", "ClayVideoNodeId", "OutputSource", "CaptureSource"]) {
                const previous = `director${suffix}`, current = `previs${suffix}`;
                if (metadata[previous] === undefined) continue;
                if (metadata[current] !== undefined) throw new Error("案例预演节点字段冲突，未创建画布。");
                metadata[current] = metadata[previous];
                delete metadata[previous];
            }
            node.metadata = metadata;
        }
    }
    const mediaAssets = validateProductionCaseMediaAssets(id, source.nodes, (source as typeof source & { mediaAssets?: unknown }).mediaAssets, source.previsScenes);
    const preview = options.mode === "preview";
    const ids = new Map(source.nodes.map(node => [node.id, preview ? node.id : nanoid()]));
    if (ids.size !== source.nodes.length || source.nodes.some(node => node.parentId && !ids.has(node.parentId)) || source.connections.some(edge => !ids.has(edge.fromNodeId) || !ids.has(edge.toNodeId))) throw new Error("案例节点或连接不完整。");
    const timeline = copyCaseTimeline(source.timeline, source.nodes, ids, preview);
    const directors = copyProductionCasePreviss(source.previsScenes, source.nodes, ids, preview);
    const modelProvenance = new Map<string, NonNullable<NonNullable<CanvasNodeData["metadata"]>["generationModelProvenance"]>>();
    for (const record of source.adaptation?.models || []) {
        if (!ids.has(record.nodeId) || modelProvenance.has(record.nodeId) || [record.sourceModel, record.targetModel, record.operation].some(value => typeof value !== "string")) {
            throw new Error("案例模型来源记录不完整，未创建画布。");
        }
        modelProvenance.set(record.nodeId, { sourceModel: record.sourceModel, convertedModel: record.targetModel, operation: record.operation });
    }
    for (const node of source.nodes) {
        const storyboard = node.metadata?.storyboard;
        if (!storyboard) continue;
        const references = [...storyboard.referenceNodeIds, ...storyboard.rows.flatMap(row => [row.imageNodeId, row.videoNodeId,
            ...row.characters.map(character => character.characterImageNodeId), ...row.assetBindings.map(binding => binding.nodeId),
            ...(row.generationReferenceNodeIds?.image || []), ...(row.generationReferenceNodeIds?.video || [])])];
        if (references.some(reference => reference && !ids.has(reference))) throw new Error("案例分镜关联缺少节点，未创建画布。");
    }
    const remapFrame = (nodeId: string | undefined) => {
        if (!nodeId) return undefined;
        const next = ids.get(nodeId);
        if (!next || source.nodes.find(node => node.id === nodeId)?.type !== "image") throw new Error("案例首尾帧缺少有效图片节点，未创建画布。");
        return next;
    };
    // `imported` marks the plan as the author's saved one rather than a shelf the user just bound, so the
    // runtime keeps an out-of-range `@图片N` as prompt text (the source platform never validated it) while a
    // freshly bound plan still rejects a stale number. The flag lives only in the loaded canvas, not in the
    // archived project file, so rebinding always produces a plan without it.
    // Published files are immutable shared inputs. Opening an editable workflow creates
    // independent nodes without downloading and uploading every original into the account.
    const mediaUrlMap = options.mediaUrlMap ?? ((preview || options.mode === "editable") && mediaAssets ? Object.fromEntries(mediaAssets.map(asset => [asset.source, asset.path])) : undefined);
    if (mediaUrlMap) {
        for (const scene of directors.previsScenes ?? []) {
            for (const object of scene.objects) {
                if ((object.kind === "model" || object.kind === "billboard") && object.url && mediaUrlMap[object.url]) object.url = mediaUrlMap[object.url];
            }
        }
    }
    const sourceNodes = mediaUrlMap ? relocateLtvMedia(remapLtvMaskEditMedia(source.nodes, mediaUrlMap), mediaUrlMap) : source.nodes;
    const nodes = sourceNodes.map(node => ({ ...node, id: ids.get(node.id)!, parentId: node.parentId ? ids.get(node.parentId) : undefined, metadata: { ...node.metadata, ...(node.metadata?.ltvReferencePlan ? { ltvReferencePlan: { ...remapLtvReferencePlan(node.metadata.ltvReferencePlan, ids, true), imported: true as const } } : {}),
        // The saved case layout is intentional, even after source URLs become owned resources.
        // Reuse the image renderer's existing size policy instead of relying on a remote URL signature.
        ...(["image", "video"].includes(node.type) && Number.isFinite(node.width) && node.width > 0 && Number.isFinite(node.height) && node.height > 0 ? { manualSize: true } : {}),
        ...(modelProvenance.has(node.id) ? { generationModelProvenance: modelProvenance.get(node.id) } : {}),
        ...directors.metadata.get(node.id),
        ...(node.metadata?.timelineComposition ? { timelineComposition: copyCaseTimeline(node.metadata.timelineComposition, source.nodes, ids, preview) } : {}),
        videoStartFrameNodeId: remapFrame(node.metadata?.videoStartFrameNodeId), videoEndFrameNodeId: remapFrame(node.metadata?.videoEndFrameNodeId),
        storyboardManagedReferenceNodeIds: node.metadata?.storyboardManagedReferenceNodeIds?.map(reference => {
            const mapped=ids.get(reference);if(!mapped)throw new Error("案例分镜制作引用缺少节点，未创建画布。");return mapped;
        }),
        ...(node.metadata?.storyboard ? { storyboard: { ...node.metadata.storyboard,
            rows: node.metadata.storyboard.rows.map(row => copyStoryboardRow(row, ids)),
            referenceNodeIds: node.metadata.storyboard.referenceNodeIds.map(reference => ids.get(reference)!),
            visibleColumns: [...node.metadata.storyboard.visibleColumns],
        } } : {}),
        ...(node.type === "image" && node.metadata?.content ? { previewContent: buildLibTVImagePreviewUrl(node.metadata.content) } : {}) } }));
    const connections = orderLtvReferenceConnections(nodes, source.connections.map(edge => ({ ...edge, id: preview ? edge.id : nanoid(), fromNodeId: ids.get(edge.fromNodeId)!, toNodeId: ids.get(edge.toNodeId)! })));
    assertLibTVImportFitsCanvas({ nodes: [], connections: [], timeline, previsScenes: directors.previsScenes }, nodes, connections);
    return { title: source.title, nodes, connections, ...(mediaAssets ? { mediaAssets } : {}), ...(timeline ? { timeline } : {}), ...(directors.previsScenes ? { previsScenes: directors.previsScenes } : {}) };
}
