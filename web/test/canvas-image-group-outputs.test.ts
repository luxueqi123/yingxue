import { expect, test } from 'bun:test';
import { isCanvasImageGroupRecoveryRoot, planCanvasImageGroupOutputs, reconcileCanvasImageGroupStatus } from '../src/lib/canvas/canvas-image-group-outputs';
import { isolateCopiedNodeMetadata } from '../src/lib/canvas/canvas-node-copy';
import { CanvasNodeType, type CanvasNodeData } from '../src/types/canvas';
import type { GenerationTask } from '../src/services/api/task-center';

const root: CanvasNodeData = { id: 'root', type: CanvasNodeType.Image, title: '原图', position: { x: 0, y: 0 }, width: 320, height: 180,
    metadata: { taskId: 'task/1', ltvExecutionContract: 'ark-image-sequential', size: '5504x3040', arkImageSequential: { provider: 'volcengine-ark-image', maxImages: 15 } } };
const task: GenerationTask = { id: 'task/1', type: 'canvas_image', status: 'succeeded', prompt: '', attempts: 1, createdAt: '', updatedAt: '',
    outputs: [1, 0].map(outputIndex => ({ outputIndex, mediaType: 'image', materializedAssetId: `asset-${outputIndex}` })) };

test('group output IDs survive reorder and JSON reload without mutating source', () => {
    const before = JSON.stringify({ root, task });
    const plan = planCanvasImageGroupOutputs([root], root.id, task);
    expect(plan).toEqual([{ nodeId: 'root', outputIndex: 0, existing: true },
        { nodeId: 'root::image-group::task%2F1::1', outputIndex: 1, existing: false }]);
    const child: CanvasNodeData = { ...root, id: plan[1].nodeId, metadata: { ...root.metadata,
        imageGroupOutput: { rootNodeId: root.id, taskId: task.id, outputIndex: 1 } } };
    const restored = JSON.parse(JSON.stringify([root, child]));
    expect(planCanvasImageGroupOutputs(restored, root.id, { ...task, outputs: [...task.outputs!].reverse() }))
        .toEqual(plan.map(item => ({ ...item, existing: true })));
    expect(JSON.stringify({ root, task })).toBe(before);
    expect(isolateCopiedNodeMetadata(child, new Map()).imageGroupOutput).toBeUndefined();
});

test('stale tasks, missing roots and ID collisions cannot take over another node', () => {
    const childId = planCanvasImageGroupOutputs([root], root.id, task)[1].nodeId;
    expect(() => planCanvasImageGroupOutputs([], root.id, task)).toThrow();
    expect(() => planCanvasImageGroupOutputs([root, root], root.id, task)).toThrow();
    expect(() => planCanvasImageGroupOutputs([root], root.id, { ...task, id: 'older' })).toThrow();
    expect(() => planCanvasImageGroupOutputs([root, { ...root, id: childId }], root.id, task)).toThrow('冲突');
    const otherTask = { ...task, id: 'task/2' };
    const newerRoot = { ...root, metadata: { ...root.metadata, taskId: otherTask.id } };
    expect(planCanvasImageGroupOutputs([newerRoot], root.id, otherTask)[1].nodeId).not.toBe(childId);
});

test('all output assets must be ready and their indices complete before allocation', () => {
    for (const outputs of [[], [task.outputs![0]], [task.outputs![1], task.outputs![1]],
        task.outputs!.map(o => ({ ...o, materializedAssetId: undefined })),
        task.outputs!.map(o => ({ ...o, mediaType: 'video' as const }))]) {
        expect(() => planCanvasImageGroupOutputs([root], root.id, { ...task, outputs })).toThrow();
    }
    const one = { ...task, outputs: [task.outputs![1]] };
    expect(planCanvasImageGroupOutputs([root], root.id, one)).toHaveLength(1);
});

test('group status requires every expected media identity, including one-output groups', () => {
    const first = { ...root, metadata: { ...root.metadata, content: '/first.png', assetId: 'asset-0' } };
    const plan = planCanvasImageGroupOutputs([first], root.id, task);
    const child = { ...root, id: plan[1].nodeId, metadata: { ...root.metadata, content: '/second.png', assetId: 'wrong-asset',
        imageGroupOutput: { rootNodeId: root.id, taskId: task.id, outputIndex: 1 } } };
    expect(reconcileCanvasImageGroupStatus([first], root.id, task)[0].metadata?.status).toBe('loading');
    expect(reconcileCanvasImageGroupStatus([first, child], root.id, task)[0].metadata?.status).toBe('loading');
    expect(reconcileCanvasImageGroupStatus([first, { ...child, metadata: { ...child.metadata, assetId: 'asset-1' } }], root.id, task)[0].metadata?.status).toBe('success');
    expect(reconcileCanvasImageGroupStatus([first], root.id, { ...task, outputs: task.outputs!.filter(o => o.outputIndex === 0) })[0].metadata?.status).toBe('success');
});

test('a child may start its own group without becoming the old task root', () => {
    const childId = planCanvasImageGroupOutputs([root], root.id, task)[1].nodeId;
    const child: CanvasNodeData = { ...root, id: childId, metadata: { ...root.metadata,
        imageGroupOutput: { rootNodeId: root.id, taskId: task.id, outputIndex: 1 } } };
    expect(() => planCanvasImageGroupOutputs([root, child], childId, task)).toThrow('子产物');
    const nextTask = { ...task, id: 'new-child-task' };
    const nextChild = { ...child, metadata: { ...child.metadata, taskId: nextTask.id } };
    expect(isCanvasImageGroupRecoveryRoot({ ...root, metadata: { ...root.metadata, status: 'success' } })).toBe(true);
    expect(isCanvasImageGroupRecoveryRoot(child)).toBe(false);
    expect(isCanvasImageGroupRecoveryRoot(nextChild)).toBe(true);
    expect(isCanvasImageGroupRecoveryRoot({ ...root, metadata: { ...root.metadata, taskId: undefined } })).toBe(false);
    const nextPlan = planCanvasImageGroupOutputs([root, nextChild], childId, nextTask);
    expect(nextPlan[0].nodeId).toBe(childId);
    expect(nextPlan[1].nodeId).toBe(`${childId}::image-group::new-child-task::1`);
    expect(() => planCanvasImageGroupOutputs([root, nextChild], root.id, task)).toThrow('冲突');
});
