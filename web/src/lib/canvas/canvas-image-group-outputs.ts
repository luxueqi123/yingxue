import type { GenerationTask } from '../../services/api/task-center';
import { CanvasNodeType, type CanvasNodeData } from '../../types/canvas';

export type CanvasImageGroupOutputTarget = { nodeId: string; outputIndex: number; existing: boolean };

export function isCanvasImageGroupRecoveryRoot(node: CanvasNodeData): boolean {
    const metadata = node.metadata;
    if (node.type !== CanvasNodeType.Image || metadata?.ltvExecutionContract !== 'ark-image-sequential' || !metadata.taskId) return false;
    const origin = metadata.imageGroupOutput;
    return !origin || origin.taskId !== metadata.taskId || origin.outputIndex === 0;
}

/** Provider success is not canvas group success until every output has its own media identity. */
export function reconcileCanvasImageGroupStatus(nodes: CanvasNodeData[], rootId: string, task: GenerationTask): CanvasNodeData[] {
    const targets = planCanvasImageGroupOutputs(nodes, rootId, task);
    const complete = targets.every(target => {
        const node = nodes.find(candidate => candidate.id === target.nodeId);
        const output = task.outputs?.find(candidate => candidate.outputIndex === target.outputIndex);
        return Boolean(node?.metadata?.content && node.metadata.assetId === output?.materializedAssetId);
    });
    return nodes.map(node => node.id === rootId
        ? { ...node, metadata: { ...node.metadata, status: complete ? 'success' : 'loading' } } : node);
}

/** Stable output identities are required for durable attachment replay, not random copy IDs. */
export function planCanvasImageGroupOutputs(nodes: readonly CanvasNodeData[], rootId: string, task: GenerationTask): CanvasImageGroupOutputTarget[] {
    const roots = nodes.filter(node => node.id === rootId);
    if (roots.length !== 1) throw new Error('组图源节点缺失或重复');
    const root = roots[0];
    if (root.type !== CanvasNodeType.Image || root.metadata?.ltvExecutionContract !== 'ark-image-sequential'
        || root.metadata?.taskId !== task.id || !task.id || task.type !== 'canvas_image' || task.status !== 'succeeded') {
        throw new Error('组图任务与当前源节点不匹配');
    }
    if (root.metadata.imageGroupOutput?.taskId === task.id && root.metadata.imageGroupOutput.outputIndex !== 0) throw new Error('组图子产物不能再次作为恢复根节点');
    const outputs = [...(task.outputs ?? [])].sort((a, b) => a.outputIndex - b.outputIndex);
    if (!outputs.length || outputs.length > 15 || outputs.some((output, index) => output.outputIndex !== index
        || output.mediaType !== 'image' || !output.materializedAssetId)) throw new Error('组图产物尚未完整物化或索引无效');
    return outputs.map(output => {
        const nodeId = output.outputIndex === 0 ? rootId
            : `${rootId}::image-group::${encodeURIComponent(task.id)}::${output.outputIndex}`;
        const matches = nodes.filter(node => node.id === nodeId);
        if (matches.length > 1) throw new Error('组图产物节点 ID 重复');
        if (output.outputIndex > 0 && matches.length) {
            const owner = matches[0].metadata?.imageGroupOutput;
            if (matches[0].type !== CanvasNodeType.Image || owner?.rootNodeId !== rootId || owner.taskId !== task.id
                || owner.outputIndex !== output.outputIndex || matches[0].metadata?.taskId !== task.id) {
                throw new Error('组图产物节点 ID 冲突，拒绝覆盖已有节点');
            }
        }
        return { nodeId, outputIndex: output.outputIndex, existing: matches.length === 1 };
    });
}
