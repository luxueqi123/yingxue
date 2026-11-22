import { CanvasNodeType, type CanvasConnection, type CanvasNodeData, type StoryboardRow } from '../../types/canvas';

/** The selected first frame stays first; additional outputs are owned by the script and row. */
export function storyboardRowImageOutputs(scriptId: string, row: StoryboardRow, nodes: CanvasNodeData[], connections: CanvasConnection[]): CanvasNodeData[] {
    const ids = new Set([
        ...(row.imageNodeId ? [row.imageNodeId] : []),
        ...connections.filter(edge => edge.fromNodeId === scriptId && edge.relation === 'storyboard-output' && edge.storyboardRowId === row.id).map(edge => edge.toNodeId),
    ]);
    const byId = new Map(nodes.map(node => [node.id, node]));
    return [...ids].flatMap(id => {
        const node = byId.get(id);
        return node?.type === CanvasNodeType.Image ? [node] : [];
    });
}
