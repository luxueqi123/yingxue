import { expect, test } from 'bun:test';
import { consumeGenerationTaskNode, consumeGenerationTaskNodeOutputs } from '../src/services/project-asset-sync';
import type { GenerationTask } from '../src/services/api/task-center';
import { attachNodeEffectKey } from '../src/services/generation-task-materializer';
import { withGenerationConsumersPaused } from '../src/services/generation-consumer-lifecycle';

const task: GenerationTask = { id: 'group-task', type: 'canvas_image', status: 'succeeded', prompt: '', attempts: 1, createdAt: '', updatedAt: '',
    outputs: [0, 1, 2].map(outputIndex => ({ outputIndex, mediaType: 'image', materializedAssetId: `asset-${outputIndex}` })) };
const targets = [0, 1, 2].map(outputIndex => ({ outputIndex, nodeId: `node-${outputIndex}` }));

function fixture(value: GenerationTask = task) {
    const acknowledged = new Set<number>();
    let materializations = 0;
    return { acknowledged, get materializations() { return materializations; }, dependencies: {
        managed: true as const,
        materialize: async () => { materializations++; return value; },
        attachNode: async (_task: GenerationTask, nodeId: string, index: number, consume: any, signal?: AbortSignal) => {
            if (acknowledged.has(index)) return;
            await consume({ effectKey: `${nodeId}:${index}`, signal });
            acknowledged.add(index);
        },
    } };
}

test('all requested outputs are consumed once after one materialization', async () => {
    const f = fixture(), received: unknown[] = [];
    const result = await consumeGenerationTaskNodeOutputs(task, targets, item => {
        received.push([item.nodeId, item.output.outputIndex, item.output.materializedAssetId]);
    }, f.dependencies);
    expect(result).toBe(task);
    expect(f.materializations).toBe(1);
    expect(received).toEqual(targets.map(t => [t.nodeId, t.outputIndex, `asset-${t.outputIndex}`]));
    expect([...f.acknowledged]).toEqual([0, 1, 2]);
});

test('explicit snapshot recovery replays completed outputs with their original effect identity', async () => {
    const seen: string[] = [];
    await consumeGenerationTaskNodeOutputs(task, targets, item => { seen.push(item.effectKey); }, {
        managed: true, replayCompleted: true, materialize: async () => task,
        attachNode: async () => 'completed' as const,
    });
    expect(seen).toEqual(targets.map(t => attachNodeEffectKey(task.id, t.nodeId, t.outputIndex)));
});

test('completed-output restoration failures propagate and do not restore later outputs', async () => {
    const seen: number[] = [];
    await expect(consumeGenerationTaskNodeOutputs(task, targets, item => {
        seen.push(item.output.outputIndex);
        if (item.output.outputIndex === 1) throw new Error('snapshot restore failed');
    }, { managed: true, replayCompleted: true, materialize: async () => task,
        attachNode: async () => 'completed' as const })).rejects.toThrow('snapshot restore failed');
    expect(seen).toEqual([0, 1]);
});

test('account transition drains completed-output recovery before changing scope', async () => {
    let entered!: () => void;
    const started = new Promise<void>(resolve => { entered = resolve; });
    const events: string[] = [];
    const consuming = consumeGenerationTaskNodeOutputs(task, targets, async ({ signal, output }) => {
        events.push(`output-${output.outputIndex}`);
        entered();
        await new Promise<void>((_, reject) => {
            signal!.addEventListener('abort', () => { events.push('aborted'); reject(new DOMException('aborted', 'AbortError')); }, { once: true });
        });
    }, { replayCompleted: true, materialize: async () => task, attachNode: async () => 'completed' as const });
    const outcome = consuming.then(() => null, error => error);
    await started;
    await withGenerationConsumersPaused(async () => { events.push('scope-transition'); });
    expect((await outcome)?.name).toBe('AbortError');
    expect(events).toEqual(['output-0', 'aborted', 'scope-transition']);
});

test('a failed output is not acknowledged and replay can finish the remaining outputs', async () => {
    const f = fixture();
    await expect(consumeGenerationTaskNodeOutputs(task, targets, item => {
        if (item.output.outputIndex === 1) throw Error('persistence rejected');
    }, f.dependencies)).rejects.toThrow('persistence rejected');
    expect([...f.acknowledged]).toEqual([0]);
    const resumed: number[] = [];
    await consumeGenerationTaskNodeOutputs(task, targets, item => { resumed.push(item.output.outputIndex); }, f.dependencies);
    expect(resumed).toEqual([1, 2]);
    expect([...f.acknowledged]).toEqual([0, 1, 2]);
});

test('missing assets or duplicate output indices fail before any node is consumed', async () => {
    for (const outputs of [task.outputs!.slice(0, 2), [...task.outputs!, task.outputs![1]],
        task.outputs!.map(o => o.outputIndex === 2 ? { ...o, materializedAssetId: undefined } : o)]) {
        const f = fixture({ ...task, outputs });
        let calls = 0;
        await expect(consumeGenerationTaskNodeOutputs(task, targets, () => { calls++; }, f.dependencies)).rejects.toThrow();
        expect(calls).toBe(0);
        expect(f.acknowledged.size).toBe(0);
    }
});

test('invalid target mappings are rejected before materialization', async () => {
    for (const mapping of [[], [targets[0], targets[0]], [{ ...targets[0], nodeId: '' }], [{ ...targets[0], outputIndex: -1 }],
        [{ ...targets[0], outputIndex: 0.5 }], [targets[0], { ...targets[1], nodeId: targets[0].nodeId }]]) {
        const f = fixture();
        await expect(consumeGenerationTaskNodeOutputs(task, mapping, () => {}, f.dependencies)).rejects.toThrow();
        expect(f.materializations).toBe(0);
    }
});

test('abort between outputs stops the next write; single-output consumer retains its selected index', async () => {
    const f = fixture(), controller = new AbortController();
    await expect(consumeGenerationTaskNodeOutputs(task, targets, () => { controller.abort(); },
        { ...f.dependencies, signal: controller.signal })).rejects.toThrow();
    expect([...f.acknowledged]).toEqual([0]);
    const single = fixture();
    let seen = -1;
    await consumeGenerationTaskNode(task, 'chosen', 2, item => { seen = item.output.outputIndex; }, single.dependencies);
    expect(seen).toBe(2);
});
