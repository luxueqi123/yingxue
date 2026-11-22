import { expect, spyOn, test } from 'bun:test';
import localforage from 'localforage';
import { apiClient } from '../src/services/api/request';
import { initializeRemoteUserDataSession, loadCanvasProjectForEditing, resetRemoteUserDataSync, saveRemoteUserDataNow } from '../src/services/user-data-sync';
import { useCanvasStore, flushCanvasStorePersistence, withCanvasStorePersistenceSuppressed, type CanvasProject } from '../src/stores/canvas/use-canvas-store';
import { useAssetStore } from '../src/stores/use-asset-store';
import { getActiveUserScope, setActiveUserScope } from '../src/lib/user-scope';
import { createCanvasNode, createStoryboardRow } from '../src/lib/canvas/canvas-project-domain';
import { storyboardRowImageOutputs } from '../src/lib/canvas/canvas-storyboard-outputs';
import { CanvasNodeType, type CanvasConnection } from '../src/types/canvas';
import { createCanvasOperationsServer } from './helpers/canvas-operations-server';

test('native save and reopen preserve every row output, chosen first frame, independent settings and failed-save state', async () => {
    const oldWindow = globalThis.window;
    const oldAdapter = apiClient.defaults.adapter;
    const oldGet = localforage.getItem;
    const oldSet = localforage.setItem;
    const oldScope = getActiveUserScope();
    const oldProjects = useCanvasStore.getState().projects;
    const oldAssets = useAssetStore.getState().assets;
    const durable = new Map<string, unknown>();
    const preferences = new Map<string, string>();
    localforage.getItem = (async (key: string) => durable.get(key) ?? null) as typeof localforage.getItem;
    localforage.setItem = (async (key: string, value: unknown) => { durable.set(key, structuredClone(value)); return value; }) as typeof localforage.setItem;
    Object.defineProperty(globalThis, 'window', { configurable: true, value: { setTimeout: () => 1, clearTimeout: () => {}, localStorage: { getItem: (key: string) => preferences.get(key) ?? null, setItem: (key: string, value: string) => preferences.set(key, value), removeItem: (key: string) => preferences.delete(key) } } });
    const fetchSpy = spyOn(globalThis, 'fetch').mockRejectedValue(new Error('No external requests in persistence fixture'));
    let remote: CanvasProject | undefined;
    const remoteProjects = new Map<string, CanvasProject>();
    const applyOperations = createCanvasOperationsServer(remoteProjects);
    let fail = false;
    apiClient.defaults.adapter = async config => {
        if (config.url === '/canvas-projects/multi-output-fixture/operations' && config.method === 'patch') {
            if (fail) throw new Error('fixture save failure');
            const response = applyOperations('multi-output-fixture', JSON.parse(config.data));
            remote = response.project;
            return { data: { code: 0, data: response, msg: '' }, status: 200, statusText: 'OK', headers: {}, config };
        }
        if (config.url !== '/canvas-projects/multi-output-fixture') throw new Error(`Unexpected request ${config.url}`);
        if (config.method === 'put') {
            if (fail) throw new Error('fixture save failure');
            remote = { ...JSON.parse(config.data).project, revision: (remote?.revision ?? 0) + 1 };
            remoteProjects.set('multi-output-fixture', remote!);
        } else if (config.method !== 'get') throw new Error('Unexpected method');
        return { data: { code: 0, data: { project: structuredClone(remote) }, msg: '' }, status: 200, statusText: 'OK', headers: {}, config };
    };
    try {
        setActiveUserScope('multi-output-owner-a');
        useCanvasStore.setState({ projects: [] });
        useAssetStore.setState({ assets: [] });
        await initializeRemoteUserDataSession('multi-output-owner-a');
        const primary = createCanvasNode(CanvasNodeType.Image, { x: 0, y: 0 }, { prompt: 'Primary', model: 'model-a', count: 2 });
        const alternate = createCanvasNode(CanvasNodeType.Image, { x: 400, y: 0 }, { prompt: 'Alternate', model: 'model-b', count: 3 });
        const row = createStoryboardRow(1, { imageNodeId: primary.id, imageGenerationPrompt: 'Source shot' });
        const script = createCanvasNode(CanvasNodeType.Script, { x: -400, y: 0 }, { storyboard: { rows: [row], visibleColumns: [], referenceNodeIds: [] } });
        const connections: CanvasConnection[] = [primary, alternate].map((node, i) => ({ id: `edge-${i}`, fromNodeId: script.id, toNodeId: node.id, relation: 'storyboard-output', storyboardRowId: row.id, fromHandleId: `row:${row.id}` }));
        const project: CanvasProject = { id: 'multi-output-fixture', title: 'Multiple outputs', nodes: [script, primary, alternate], connections, chatSessions: [], activeChatId: null, viewport: { x: 0, y: 0, k: 1 }, createdAt: '2026-09-30T00:00:00Z', updatedAt: '2026-09-30T00:00:00Z', revision: 0, backgroundMode: 'dots', showImageInfo: false, directorScenes: [] };
        const check = (saved: CanvasProject) => {
            const savedRow = saved.nodes.find(node => node.id === script.id)!.metadata!.storyboard!.rows[0];
            expect(savedRow.imageNodeId).toBe(primary.id);
            expect(saved.connections).toEqual(connections);
            expect(storyboardRowImageOutputs(script.id, savedRow, saved.nodes, saved.connections).map(node => [node.id, node.metadata?.model, node.metadata?.count])).toEqual([[primary.id, 'model-a', 2], [alternate.id, 'model-b', 3]]);
        };
        useCanvasStore.setState({ projects: [project] });
        await flushCanvasStorePersistence();
        await saveRemoteUserDataNow();
        check(remote!);
        resetRemoteUserDataSync();
        withCanvasStorePersistenceSuppressed(() => useCanvasStore.setState({ projects: [] }));
        await initializeRemoteUserDataSession('multi-output-owner-a');
        const loaded = (await loadCanvasProjectForEditing(project.id))!;
        check(loaded);
        useCanvasStore.getState().updateProject(project.id, { nodes: loaded.nodes.map(node => node.id === alternate.id ? { ...node, metadata: { ...node.metadata, prompt: 'Edited alternate' } } : node) });
        fail = true;
        await expect(saveRemoteUserDataNow()).rejects.toThrow('fixture save failure');
        expect(remote!.nodes.find(node => node.id === alternate.id)?.metadata?.prompt).toBe('Alternate');
        fail = false;
        await saveRemoteUserDataNow();
        check(remote!);
        expect(remote!.nodes.find(node => node.id === alternate.id)?.metadata?.prompt).toBe('Edited alternate');
        await flushCanvasStorePersistence();
        resetRemoteUserDataSync();
        setActiveUserScope('multi-output-owner-b');
        withCanvasStorePersistenceSuppressed(() => useCanvasStore.setState({ projects: [] }));
        await useCanvasStore.persist.rehydrate();
        expect(useCanvasStore.getState().projects).toEqual([]);
        setActiveUserScope('multi-output-owner-a');
        await useCanvasStore.persist.rehydrate();
        check(useCanvasStore.getState().projects[0]);
        expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
        resetRemoteUserDataSync();
        await flushCanvasStorePersistence();
        apiClient.defaults.adapter = oldAdapter;
        setActiveUserScope(oldScope);
        withCanvasStorePersistenceSuppressed(() => useCanvasStore.setState({ projects: oldProjects }));
        useAssetStore.setState({ assets: oldAssets });
        localforage.getItem = oldGet;
        localforage.setItem = oldSet;
        fetchSpy.mockRestore();
        if (oldWindow === undefined) Reflect.deleteProperty(globalThis, 'window');
        else Object.defineProperty(globalThis, 'window', { configurable: true, value: oldWindow });
    }
});
