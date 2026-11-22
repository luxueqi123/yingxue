import { CanvasNodeType, type CanvasAssistantReference, type CanvasNodeData } from "@/types/canvas";

export function nodeToReference(node: CanvasNodeData): CanvasAssistantReference | null {
    if (node.type === CanvasNodeType.Image && (node.metadata?.content || node.metadata?.storageKey)) {
        return { id: node.id, type: node.type, title: node.title, dataUrl: node.metadata.content, storageKey: node.metadata.storageKey };
    }
    if (node.type === CanvasNodeType.Text && node.metadata?.content) {
        return { id: node.id, type: node.type, title: node.title, text: node.metadata.content };
    }
    if (node.type === CanvasNodeType.Skill && node.metadata?.skillSnapshot) {
        return { id: node.id, type: node.type, title: node.title, text: [node.metadata.skillSnapshot.name, node.metadata.skillSnapshot.template, node.metadata.skillSnapshot.outputContract].filter(Boolean).join("\n\n") };
    }
    if ((node.type === CanvasNodeType.Video || node.type === CanvasNodeType.Audio) && (node.metadata?.content || node.metadata?.storageKey)) {
        const duration = node.metadata.durationMs;
        const timing = typeof duration === "number" && Number.isFinite(duration) ? `，时长 ${duration / 1000} 秒` : "";
        return { id: node.id, type: node.type, title: node.title, text: `真实${node.type === CanvasNodeType.Video ? "视频" : "音频"}节点 ${node.id}${timing}；用 canvas_get_node / canvas_get_resources 读取并引用原资源。` };
    }
    return null;
}

export function buildAssistantReferences(nodes: CanvasNodeData[], selectedNodeIds: Set<string>) {
    const nodeById = new Map(nodes.map(node => [node.id, node]));
    return Array.from(selectedNodeIds)
        .map(id => nodeById.get(id))
        .filter((node): node is CanvasNodeData => Boolean(node))
        .map(nodeToReference)
        .filter((item): item is CanvasAssistantReference => Boolean(item));
}
