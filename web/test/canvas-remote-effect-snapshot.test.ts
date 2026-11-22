import { expect, test } from 'bun:test';
import localforage from 'localforage';
import { acceptRemoteCanvasProject, flushCanvasStorePersistence, useCanvasStore, withCanvasStorePersistenceSuppressed, type CanvasProject } from '../src/stores/canvas/use-canvas-store';
import { getActiveUserScope, setActiveUserScope } from '../src/lib/user-scope';
import { CanvasNodeType } from '../src/types/canvas';

test.each(['before', 'during', 'retry'] as const)('remote stamps survive edits %s the first durable write', async scenario => {
    const previousScope = getActiveUserScope(), previousProjects = useCanvasStore.getState().projects;
    const get = localforage.getItem, set = localforage.setItem;
    const oldWindow = globalThis.window;
    const values = new Map<string, string>(), preferences = new Map<string, string>();
    Object.defineProperty(globalThis, 'window', { configurable: true, value: { localStorage: {
        getItem: (key: string) => preferences.get(key) ?? null,
        setItem: (key: string, value: string) => preferences.set(key, value), removeItem: (key: string) => preferences.delete(key),
    } } });
    localforage.getItem = (async (key: string) => values.get(key) ?? null) as typeof get;
    let firstWrite = true;
    localforage.setItem = (async (key: string, value: string) => {
        if (firstWrite) {
            firstWrite = false;
            if (scenario === 'retry') throw new Error('first snapshot write failed');
            if (scenario === 'during') useCanvasStore.getState().updateProject(project.id, {
                nodes: project.nodes.map(node => ({ ...node, title: 'edited during write' })),
            });
        }
        values.set(key, value); return value;
    }) as typeof set;
    const scope = `remote-confirmed-stamp-${scenario}`, key = `infinite-canvas:canvas_store:user:${scope}`;
    const project: CanvasProject = { id: 'remote', title: 'remote', revision: 2, createdAt: '', updatedAt: '', connections: [], chatSessions: [], activeChatId: null,
        backgroundMode: 'dots', showImageInfo: false, directorScenes: [], viewport: { x: 0, y: 0, k: 1 },
        nodes: [{ id: 'output', type: CanvasNodeType.Image, title: 'output', position: { x: 0, y: 0 }, width: 320, height: 180,
            metadata: { content: '/persisted.png', generationEffectKeys: ['attach-node:task:output:0'], versionPrimary: false } }] };
    try {
        setActiveUserScope(scope);
        withCanvasStorePersistenceSuppressed(() => useCanvasStore.setState({ projects: [] }));
        acceptRemoteCanvasProject(project);
        useCanvasStore.getState().updateProject(project.id, { nodes: project.nodes.map(node => ({ ...node, title: 'edited before first flush' })) });
        if (scenario === 'retry') {
            await expect(flushCanvasStorePersistence()).rejects.toThrow('first snapshot write failed');
            useCanvasStore.getState().updateProject(project.id, { nodes: project.nodes.map(node => ({ ...node, title: 'edited after failure' })) });
        }
        await flushCanvasStorePersistence();
        const read = () => JSON.parse(values.get(key)!).state.projects[0] as CanvasProject;
        expect(read().nodes[0].metadata?.generationEffectKeys).toEqual(project.nodes[0].metadata?.generationEffectKeys);
        expect(read().nodes[0].title).toBe(scenario === 'during' ? 'edited during write' : scenario === 'retry' ? 'edited after failure' : 'edited before first flush');
        useCanvasStore.getState().updateProject(project.id, { nodes: project.nodes.map(node => ({ ...node, metadata: { ...node.metadata, versionPrimary: true } })) });
        await flushCanvasStorePersistence();
        expect(read().nodes[0].metadata?.versionPrimary).toBe(true);
        const current = useCanvasStore.getState().openProject(project.id)!;
        useCanvasStore.getState().updateProject(project.id, { nodes: current.nodes.map(node => ({ ...node, metadata: { ...node.metadata,
            content: '/not-committed.png', generationEffectKeys: [...node.metadata!.generationEffectKeys!, 'uncommitted-new-effect'], versionPrimary: false } })) });
        await flushCanvasStorePersistence();
        expect(read().nodes[0].metadata?.content).toBe('/persisted.png');
        expect(read().nodes[0].metadata?.generationEffectKeys).toEqual(['attach-node:task:output:0']);
        expect(read().nodes[0].metadata?.versionPrimary).toBe(true);
    } finally {
        setActiveUserScope(previousScope);
        withCanvasStorePersistenceSuppressed(() => useCanvasStore.setState({ projects: previousProjects }));
        localforage.getItem = get; localforage.setItem = set;
        if (oldWindow === undefined) delete (globalThis as { window?: unknown }).window;
        else Object.defineProperty(globalThis, 'window', { configurable: true, value: oldWindow });
    }
});
