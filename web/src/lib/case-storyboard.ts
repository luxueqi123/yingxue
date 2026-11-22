import { CanvasNodeType, type CanvasNodeData } from "@/types/canvas";

export type StoryboardKind = "text" | "audio" | "image" | "video";
export type StoryboardEntry = { node: CanvasNodeData; category: string; variants: number };

export function buildCaseStoryboard(nodes: CanvasNodeData[], search = "") {
    const groups: Record<StoryboardKind, StoryboardEntry[]> = { text: [], audio: [], image: [], video: [] };
    const byId = new Map(nodes.map(node => [node.id, node]));
    const query = search.trim().toLocaleLowerCase();
    for (const node of nodes) {
        if (node.type === CanvasNodeType.Frame) continue;
        const parent = node.parentId ? byId.get(node.parentId)?.title || "" : "";
        const metadata = node.metadata;
        if (query && ![node.title, parent, metadata?.prompt, metadata?.composerContent, node.type === CanvasNodeType.Text || node.type === CanvasNodeType.Script ? metadata?.content : ""].filter(Boolean).join(" ").toLocaleLowerCase().includes(query)) continue;
        const kind: StoryboardKind = node.type === CanvasNodeType.Video ? "video" : node.type === CanvasNodeType.Audio ? "audio" : ([CanvasNodeType.Image, CanvasNodeType.Drawing, CanvasNodeType.Panorama, CanvasNodeType.ColorGrade] as string[]).includes(node.type) ? "image" : "text";
        let category = "other";
        if (kind === "image") {
            const saved = metadata?.assetCategory;
            if (saved) category = saved === "environment" ? "scene" : ["character", "prop"].includes(saved) ? saved : "other";
            // Imported snapshots may only retain the author's named grouping.
            else if (/^(角色|人物)(设定|设计|参考|素材)?$/.test(parent.trim())) category = "character";
            else if (/^场景(设定|设计|参考|素材)?$/.test(parent.trim())) category = "scene";
            else if (/^(道具|物品)(设定|设计|参考|素材)?$/.test(parent.trim())) category = "prop";
        } else if (kind === "video") category = metadata?.videoEditOperation === "concat" ? "film" : "clip";
        else if (kind === "text") category = node.type === CanvasNodeType.Script ? "script" : "other";
        groups[kind].push({ node, category, variants: Math.max(1, 1 + (metadata?.batchChildIds?.filter(id => byId.has(id)).length || 0)) });
    }
    return groups;
}
