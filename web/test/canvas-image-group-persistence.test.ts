import { expect, test } from 'bun:test';
import localforage from 'localforage';
import { applyCanvasImageGroupOutputEffect } from '../src/services/canvas-generation-consumer';
import { planCanvasImageGroupOutputs } from '../src/lib/canvas/canvas-image-group-outputs';
import { useCanvasStore, withCanvasStorePersistenceSuppressed, type CanvasProject } from '../src/stores/canvas/use-canvas-store';
import { useAssetStore, flushAssetStorePersistence } from '../src/stores/use-asset-store';
import { getActiveUserScope, setActiveUserScope } from '../src/lib/user-scope';
import { CanvasNodeType, type CanvasNodeData } from '../src/types/canvas';
import type { GenerationTask } from '../src/services/api/task-center';
import { installResourceAccessFixture } from './resource-access-fixture';
import { consumeGenerationTaskNodeOutputs } from '../src/services/project-asset-sync';
import { createGenerationTaskMaterializer, attachNodeEffectKey } from '../src/services/generation-task-materializer';

test('group outputs persist all resources, survive reload, and retry a failed durable write', async () => {
    const oldWindow = globalThis.window;
    const oldGet = localforage.getItem;
    const oldSet = localforage.setItem;
    const oldScope = getActiveUserScope();
    const oldProjects = useCanvasStore.getState().projects;
    const oldAssets = useAssetStore.getState().assets;
    const values = new Map<string, string>();
    const preferences = new Map<string, string>();
    Object.defineProperty(globalThis, 'window', { configurable: true, value: { localStorage: {
        getItem: (key: string) => preferences.get(key) ?? null,
        setItem: (key: string, value: string) => preferences.set(key, value),
        removeItem: (key: string) => preferences.delete(key),
    } } });
    const scope = 'group-persistence-test';
    const storageKey = `infinite-canvas:canvas_store:user:${scope}`;
    let failSecond = false;
    let beforeCanvasRead: (() => void) | undefined;
    localforage.getItem = (async (key: string) => {
        if (key === storageKey && beforeCanvasRead) {
            const callback = beforeCanvasRead;
            beforeCanvasRead = undefined;
            callback();
        }
        return values.get(key) ?? null;
    }) as typeof localforage.getItem;
    localforage.setItem = (async (key: string, value: string) => {
        if (failSecond && key === storageKey && value.includes('group-effect-1')) throw new Error('second output write failed');
        values.set(key, value);
        return value;
    }) as typeof localforage.setItem;
    const restoreAccess = installResourceAccessFixture(Object.fromEntries([0, 1, 2].map(i => [`group-${i}`, `https://example.invalid/${i}.png`])));
    let nodes: CanvasNodeData[] = [{ id: 'root', type: CanvasNodeType.Image, title: 'source', position: { x: 0, y: 0 }, width: 320, height: 180,
        metadata: { taskId: 'group-task', status: 'loading', versionOfNodeId: 'version-root', versionPrimary: true, ltvExecutionContract: 'ark-image-sequential',
            arkImageSequential: { provider: 'volcengine-ark-image', maxImages: 3 } } }];
    const project: CanvasProject = { id: 'group-project', title: 'group', createdAt: '', updatedAt: '', nodes,
        connections: [], chatSessions: [], activeChatId: null, backgroundMode: 'dots', showImageInfo: false,
        viewport: { x: 0, y: 0, k: 1 }, directorScenes: [] };
    const task: GenerationTask = { id: 'group-task', type: 'canvas_image', status: 'succeeded', prompt: '', attempts: 1, createdAt: '', updatedAt: '',
        resultJson: JSON.stringify({ images: [0, 1, 2].map(i => ({ dataUrl: `https://example.invalid/${i}.png`, storageKey: `resource:group-${i}`, width: 640, height: 360 })) }),
        outputs: [0, 1, 2].map(outputIndex => ({ outputIndex, mediaType: 'image', materializedAssetId: `asset-${outputIndex}` })) };
    const apply = async (index: number, signal?: AbortSignal) => {
        const target = planCanvasImageGroupOutputs(nodes, 'root', task)[index];
        await applyCanvasImageGroupOutputEffect({ projectId: project.id, rootNodeId: 'root', nodeId: target.nodeId,
            task, output: task.outputs![index], effectKey: `group-effect-${index}`, signal,
            nodesRef: { get current() { return nodes; }, set current(value) { nodes = value; } },
            setNodes: value => { nodes = typeof value === 'function' ? value(nodes) : value; } });
    };
    try {
        setActiveUserScope(scope);
        withCanvasStorePersistenceSuppressed(() => useCanvasStore.setState({ projects: [project] }));
        values.set(storageKey, JSON.stringify({ state: { projects: [project] }, version: 0, storageRevision: 1,
            tombstones: { projects: {}, nodes: {}, connections: {}, sessions: {}, messages: {} } }));
        useAssetStore.getState().replaceAssets([0, 1, 2].map(i => ({ id: `asset-${i}`, kind: 'image' as const, title: `output ${i}`,
            coverUrl: `https://example.invalid/${i}.png`, tags: [], metadata: {}, createdAt: '', updatedAt: '',
            data: { dataUrl: `https://example.invalid/${i}.png`, storageKey: `resource:group-${i}`, width: 640, height: 360, bytes: 1, mimeType: 'image/png' } })));
        await apply(0);
        expect(nodes[0].metadata?.status).toBe('loading');
        failSecond = true;
        await expect(apply(1)).rejects.toThrow('second output write failed');
        expect(nodes).toHaveLength(1);
        expect(values.get(storageKey)).not.toContain('group-effect-1');
        expect(JSON.parse(values.get(storageKey)!).state.projects[0].nodes[0].metadata.status).toBe('loading');
        failSecond = false;
        await apply(1);
        expect(nodes[0].metadata?.status).toBe('loading');
        await apply(2);
        expect(nodes[0].metadata?.status).toBe('success');
        const saved = JSON.parse(values.get(storageKey)!).state.projects[0] as CanvasProject;
        expect(saved.nodes).toHaveLength(3);
        expect(saved.nodes.map(n => n.metadata?.assetId)).toEqual(['asset-0', 'asset-1', 'asset-2']);
        expect(saved.nodes.map(n => n.metadata?.storageKey)).toEqual(['resource:group-0', 'resource:group-1', 'resource:group-2']);
        nodes = saved.nodes.map((node, index) => ({ ...node, metadata: { ...node.metadata, versionPrimary: index === 1 } }));
        const selected = { ...saved, nodes };
        withCanvasStorePersistenceSuppressed(() => useCanvasStore.setState({ projects: [selected] }));
        const savedDocument = JSON.parse(values.get(storageKey)!);
        savedDocument.state.projects = [selected];
        values.set(storageKey, JSON.stringify(savedDocument));
        await apply(0);
        await apply(1);
        await apply(2);
        expect(nodes).toHaveLength(3);
        expect(new Set(nodes.map(n => n.id)).size).toBe(3);
        expect(nodes.map(n => n.metadata?.versionPrimary)).toEqual([false, true, false]);
        // A completed effect must not make an older persisted canvas silently lose the other outputs.
        nodes = project.nodes;
        withCanvasStorePersistenceSuppressed(() => useCanvasStore.setState({ projects: [project] }));
        savedDocument.state.projects = [project];
        values.set(storageKey, JSON.stringify(savedDocument));
        const completedEffects = createGenerationTaskMaterializer({
            effects: { claim: async () => ({ status: 'completed', result: {} }),
                renew: async () => { throw new Error('completed effects must not renew'); },
                complete: async () => { throw new Error('completed effects must not acknowledge again'); },
                release: async () => { throw new Error('completed effects own no lease'); } },
            materializeOutput: async () => { throw new Error('assets already exist'); },
        });
        await consumeGenerationTaskNodeOutputs(task, planCanvasImageGroupOutputs(nodes, 'root', task),
            async ({ nodeId, output, effectKey, signal }) => {
                await applyCanvasImageGroupOutputEffect({ projectId: project.id, rootNodeId: 'root', nodeId, task, output, effectKey, signal,
                    nodesRef: { get current() { return nodes; }, set current(value) { nodes = value; } },
                    setNodes: value => { nodes = typeof value === 'function' ? value(nodes) : value; } });
            }, { managed: true, replayCompleted: true, materialize: async () => task, attachNode: completedEffects.attachNode });
        const restored = JSON.parse(values.get(storageKey)!).state.projects[0] as CanvasProject;
        expect(restored.nodes.map(n => n.metadata?.assetId)).toEqual(['asset-0', 'asset-1', 'asset-2']);
        restored.nodes.forEach((node, index) => expect(node.metadata?.generationEffectKeys)
            .toContain(attachNodeEffectKey(task.id, node.id, index)));
        const durableBefore = values.get(storageKey);
        const liveBefore = nodes;
        const aborted = new AbortController();
        aborted.abort();
        await expect(apply(1, aborted.signal)).rejects.toThrow();
        expect(values.get(storageKey)).toBe(durableBefore);
        nodes = liveBefore.map(node => node.id === 'root' ? { ...node, metadata: { ...node.metadata, taskId: 'new-task' } } : node);
        await expect(apply(1)).rejects.toThrow('不匹配');
        expect(values.get(storageKey)).toBe(durableBefore);
        nodes = liveBefore.filter(node => node.id !== 'root');
        await expect(apply(1)).rejects.toThrow('缺失');
        expect(values.get(storageKey)).toBe(durableBefore);
        nodes = liveBefore.map((node, index) => index === 1 ? { ...node, metadata: { ...node.metadata, imageGroupOutput: undefined } } : node);
        await expect(apply(1)).rejects.toThrow('冲突');
        expect(values.get(storageKey)).toBe(durableBefore);
        nodes = liveBefore;
        const deletedId = nodes[1].id;
        beforeCanvasRead = () => {
            const latest = JSON.parse(values.get(storageKey)!);
            latest.storageRevision += 100;
            latest.state.projects[0].nodes = latest.state.projects[0].nodes.filter((node: CanvasNodeData) => node.id !== deletedId);
            latest.tombstones.nodes[project.id] = { [deletedId]: latest.storageRevision };
            values.set(storageKey, JSON.stringify(latest));
        };
        await expect(apply(1)).rejects.toThrow('已删除内容冲突');
        const concurrent = JSON.parse(values.get(storageKey)!);
        expect(concurrent.state.projects[0].nodes.some((node: CanvasNodeData) => node.id === deletedId)).toBe(false);
        expect(concurrent.tombstones.nodes[project.id][deletedId]).toBe(concurrent.storageRevision);
    } finally {
        beforeCanvasRead = undefined;
        failSecond = false;
        setActiveUserScope(oldScope);
        withCanvasStorePersistenceSuppressed(() => useCanvasStore.setState({ projects: oldProjects }));
        useAssetStore.getState().replaceAssets(oldAssets);
        await flushAssetStorePersistence();
        restoreAccess();
        localforage.getItem = oldGet;
        localforage.setItem = oldSet;
        if (oldWindow === undefined) delete (globalThis as { window?: unknown }).window;
        else Object.defineProperty(globalThis, 'window', { configurable: true, value: oldWindow });
    }
});
