type MediaKind = "image" | "video" | "audio";
export type LtvReference = { nodeId: string; url: string; kind: MediaKind; durationSec?: number; deferred?: true };
export type LtvTextReference = {
    nodeId: string;
    /** The saved text exactly as the source project stores it; used to detect user edits. */
    content: string;
    /** Model-facing text after editor markers are rewritten; only set when it differs from content. */
    resolved?: string;
    deferred?: true;
};
export type LtvReferencePlan = {
    prompt: string;
    references: LtvReference[];
    texts?: LtvTextReference[];
    /**
     * Set by the archived-case importer (`production-case-project.ts`) on the plan it hands to the canvas.
     * The source platform passes `@图片N` to the model as plain text and never validates the number, so an
     * imported plan keeps the author's number as body text instead of rejecting the case or inventing a
     * slot. Re-binding the shelf builds a fresh plan without this flag, so a user edit keeps the strict
     * range check. It is deliberately not written into the published project files.
     */
    imported?: true;
};

function record(value: unknown): Record<string, unknown> {
    return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

// LTV 1di1-3y--egfx.js: applyMediaListOrder/buildMixedList keep unspecified items last.
export function orderLtvReferences(list: LtvReference[], value: unknown): LtvReference[] {
    if (value === undefined || value === null) return list;
    if (!Array.isArray(value) || value.some(id => typeof id !== "string")) throw new Error("素材顺序不是节点ID数组");
    const remaining = new Map(list.map(ref => [ref.nodeId, ref]));
    const result: LtvReference[] = [];
    for (const id of value) {
        const ref = remaining.get(id);
        if (ref) { result.push(ref); remaining.delete(id); }
    }
    return [...result, ...remaining.values()];
}

/**
 * Reads the saved reference lists once and applies the source's own slot ordering, so the prompt
 * rewrite and the text-body rewrite always resolve an index to the same node.
 */
function readLtvSlots(value: unknown, resources: ReadonlyMap<string, { kind: string; urls: readonly string[] }>) {
    const params = record(value);
    if (params.prompt !== undefined && typeof params.prompt !== "string") throw new Error("原提示词格式无效");
    const seen = new Set<string>();
    const readList = (kind: MediaKind): LtvReference[] => {
        const list = params[`${kind}List`];
        if (list === undefined || list === null) return [];
        if (!Array.isArray(list)) throw new Error("参考素材列表不是数组");
        return list.map(value => {
            const ref = record(value);
            if (typeof ref.nodeId !== "string" || !ref.nodeId || typeof ref.url !== "string") throw new Error("参考素材缺少节点ID或地址");
            if (seen.has(ref.nodeId)) throw new Error("参考节点重复，不能合并原槽位");
            seen.add(ref.nodeId);
            const resource = resources.get(ref.nodeId);
            const deferred = ref.url === "";
            if (!resource || resource.kind !== kind || (!deferred && !resource.urls.includes(ref.url))) throw new Error("参考素材缺失、类型或版本不一致");
            if (ref.durationSec !== undefined && (typeof ref.durationSec !== "number" || !Number.isFinite(ref.durationSec) || ref.durationSec < 0 || (!deferred && ref.durationSec === 0))) throw new Error("参考素材时长无效");
            // An empty saved URL binds the node, not an invented media version.
            // Resolve its output only when generation runs; never substitute another node.
            return { nodeId: ref.nodeId, url: ref.url, kind, ...(deferred ? { deferred: true as const } : {}), ...(typeof ref.durationSec === "number" && ref.durationSec > 0 ? { durationSec: ref.durationSec } : {}) };
        });
    };
    const original = { image: readList("image"), video: readList("video"), audio: readList("audio") };
    const sorted = { image: orderLtvReferences(original.image, params.imageListOrder), video: orderLtvReferences(original.video, params.videoListOrder), audio: orderLtvReferences(original.audio, params.audioListOrder) };
    const mixed = orderLtvReferences([...original.image, ...original.video, ...original.audio], params.mixedListOrder);
    return { original, sorted, mixed };
}

/**
 * The ordered slot node ids a saved text body's `{{Image|Portrait|Video|Audio|Mixed N}}` markers
 * resolve against, using the same lists the prompt rewrite uses.
 */
export function ltvReferenceSlotNodeIds(value: unknown, resources: ReadonlyMap<string, { kind: string; urls: readonly string[] }>) {
    const { original, sorted, mixed } = readLtvSlots(value, resources);
    return {
        original: {
            image: original.image.map(ref => ref.nodeId),
            video: original.video.map(ref => ref.nodeId),
            audio: original.audio.map(ref => ref.nodeId),
            mixed: mixed.map(ref => ref.nodeId),
        },
        sorted: {
            image: sorted.image.map(ref => ref.nodeId),
            video: sorted.video.map(ref => ref.nodeId),
            audio: sorted.audio.map(ref => ref.nodeId),
        },
    };
}

/** Converts saved LTV slots to Yingxue labels; callers must submit ALL returned references in order. */
export function buildLtvReferencePlan(value: unknown, resources: ReadonlyMap<string, { kind: string; urls: readonly string[] }>): LtvReferencePlan {
    const params = record(value);
    const { original, sorted, mixed } = readLtvSlots(value, resources);
    const slots: Record<string, LtvReference[]> = { Image: original.image, Portrait: original.image, Video: original.video, Audio: original.audio, Mixed: mixed };
    const labels = { image: "图片", video: "视频", audio: "音频" };
    const prompt = String(params.prompt || "").replace(/\{\{(Image|Portrait|Video|Audio|Mixed)\s+(\d+)\}\}/g, (marker: string, type: string, index: string, offset: number, text: string) => {
        const ref = slots[type][Number(index) - 1];
        if (!ref) throw new Error(`提示词引用不存在：${type} ${index}`);
        // The source marker has a closing delimiter; keep that boundary when prose starts with a digit.
        const separator = /^\d/.test(text.slice(offset + marker.length)) ? " " : "";
        return `@${labels[ref.kind]}${sorted[ref.kind].findIndex(item => item.nodeId === ref.nodeId) + 1}${separator}`;
    });
    if (/\{\{(?:Image|Portrait|Video|Audio|Mixed)\b/.test(prompt)) throw new Error("提示词含无法解析的素材引用");
    return { prompt, references: [...sorted.image, ...sorted.video, ...sorted.audio] };
}
