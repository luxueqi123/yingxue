import type { CanvasNodeData } from "../../types/canvas";

/** Rebind verified equivalent media locations without accepting a different reference version. */
export function relocateLtvMedia(nodes: CanvasNodeData[], replacements: Readonly<Record<string, string>>): CanvasNodeData[] {
    const byId = new Map(nodes.map(node => [node.id, node]));
    const replacement = (url: string) => {
        if (!Object.hasOwn(replacements, url)) return undefined;
        const next = replacements[url];
        if (typeof next !== "string" || !next.trim()) throw new Error("素材迁移目标地址无效。");
        return next;
    };
    return nodes.map(node => {
        const metadata = node.metadata;
        if (!metadata) return node;
        const media = ["image", "video", "audio"].includes(node.type);
        const content = media && metadata.content ? replacement(metadata.content) : undefined;
        const plan = metadata.ltvReferencePlan;
        let changed = false;
        const references = plan?.references.map(ref => {
            if (ref.deferred || !ref.url) return ref;
            const url = replacement(ref.url);
            if (url === undefined || url === ref.url) return ref;
            const owner = byId.get(ref.nodeId);
            if (!owner || owner.type !== ref.kind || (owner.metadata?.content !== ref.url && owner.metadata?.content !== url)) {
                throw new Error("参考节点与已核验迁移素材不一致，停止迁移。");
            }
            changed = true;
            return { ...ref, url };
        });
        if (content === undefined && !changed) return node;
        return { ...node, metadata: { ...metadata, ...(content !== undefined ? { content } : {}),
            ...(changed && plan ? { ltvReferencePlan: { ...plan, references: references! } } : {}) } };
    });
}
