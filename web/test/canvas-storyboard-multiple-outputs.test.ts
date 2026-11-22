import { expect, spyOn, test } from 'bun:test';
import { CanvasNodeType, type CanvasConnection, type CanvasNodeMetadata } from '../src/types/canvas';
import { createCanvasNode, createStoryboardRow } from '../src/lib/canvas/canvas-project-domain';
import { deriveStoryboardPipelineProgress } from '../src/lib/canvas/canvas-storyboard-progress';
import { createElement } from 'react';
import * as React from 'react';
import { renderToString } from 'react-dom/server';
import { App } from 'antd';
import { useCanvasStoryboard } from '../src/pages/canvas/use-canvas-storyboard';
import { useCanvasGenerationBatches } from '../src/pages/canvas/use-canvas-generation-batches';
import { useCanvasNodeOperations } from '../src/pages/canvas/use-canvas-node-operations';
import { storyboardRowImageOutputs } from '../src/lib/canvas/canvas-storyboard-outputs';
import { useConfigStore } from '../src/stores/use-config-store';
import * as TaskCenter from '../src/services/api/task-center';

test('actual batch scheduler reconciles and retries siblings independently despite their shared row ID', async () => {
    const first = createCanvasNode(CanvasNodeType.Image, { x: 0, y: 0 }, { prompt: 'first prompt' });
    const second = createCanvasNode(CanvasNodeType.Image, { x: 400, y: 0 }, { prompt: 'second prompt' });
    const row = createStoryboardRow(1, { imageNodeId: first.id });
    const script = createCanvasNode(CanvasNodeType.Script, { x: -400, y: 0 }, { storyboard: { rows: [row], visibleColumns: [], referenceNodeIds: [] } });
    const nodesRef = { current: [script, first, second] };
    const effects: React.EffectCallback[] = [];
    const cleanup: Array<() => void> = [];
    const submitted: string[] = [];
    const initial = useConfigStore.getInitialState();
    const ready = initial.isAiConfigReady;
    initial.isAiConfigReady = () => true;
    const effectSpy = spyOn(React, 'useEffect').mockImplementation(callback => { effects.push(callback); });
    const taskSpy = spyOn(TaskCenter, 'listGenerationTasks').mockResolvedValue([]);
    const appSpy = spyOn(App, 'useApp').mockReturnValue({ message: { success: () => {}, info: () => {}, warning: () => {} }, modal: {} } as unknown as ReturnType<typeof App.useApp>);
    const oldWindow = globalThis.window;
    let tick: (() => void) | undefined;
    let retrySucceeds = false;
    let batches: ReturnType<typeof useCanvasGenerationBatches>;
    const drain = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); };
    try {
        function Harness() {
            batches = useCanvasGenerationBatches({ projectId: 'fixture', projectLoaded: true, nodes: nodesRef.current, nodesRef,
                setNodes: value => { nodesRef.current = typeof value === 'function' ? value(nodesRef.current) : value; },
                handleGenerateNode: async (nodeId, mode, prompt) => {
                    expect(mode).toBe('image');
                    expect(prompt).toBe(nodeId === first.id ? 'first prompt' : 'second prompt');
                    submitted.push(nodeId);
                    nodesRef.current = nodesRef.current.map(node => node.id !== nodeId ? node : {
                        ...node, metadata: { ...node.metadata, status: nodeId === first.id || retrySucceeds ? 'success' : 'error',
                            content: nodeId === first.id || retrySucceeds ? `https://example.test/${nodeId}.png` : '', errorDetails: nodeId === second.id && !retrySucceeds ? 'fixture failure' : undefined },
                    });
                },
            });
            return null;
        }
        renderToString(createElement(Harness));
        effectSpy.mockRestore();
        const batchId = batches!.enqueueGenerationBatch(script.id, 'storyboard_image', [{ rowId: row.id, nodeId: first.id }, { rowId: row.id, nodeId: second.id }])!;
        Object.defineProperty(globalThis, 'window', { configurable: true, value: { setInterval: (callback: () => void) => { tick = callback; return 1; }, clearInterval: () => {} } });
        for (const effect of effects) { const dispose = effect(); if (dispose) cleanup.push(dispose); }
        await drain();
        const currentBatch = () => nodesRef.current.find(node => node.id === script.id)!.metadata!.generationBatches!.find(batch => batch.id === batchId)!;
        expect(submitted).toEqual([first.id, second.id]);
        expect(currentBatch().items.map(item => item.status)).toEqual(['succeeded', 'failed']);
        expect(currentBatch().status).toBe('partial_failed');
        tick!(); await drain();
        expect(submitted).toHaveLength(2);
        retrySucceeds = true;
        batches!.retryFailedBatchItems(script.id, batchId);
        await drain(); tick!(); await drain();
        expect(submitted).toEqual([first.id, second.id, second.id]);
        expect(currentBatch().items.map(item => item.status)).toEqual(['succeeded', 'succeeded']);
        expect(currentBatch().items.map(item => item.retryCount)).toEqual([0, 1]);
        expect(currentBatch().status).toBe('completed');
    } finally {
        cleanup.forEach(dispose => dispose());
        effectSpy.mockRestore(); taskSpy.mockRestore(); appSpy.mockRestore();
        initial.isAiConfigReady = ready;
        if (oldWindow === undefined) Reflect.deleteProperty(globalThis, 'window');
        else Object.defineProperty(globalThis, 'window', { configurable: true, value: oldWindow });
    }
});

test('actual paste remaps every storyboard output and isolates the copied first frame and task state', () => {
    const primary = createCanvasNode(CanvasNodeType.Image, { x: 0, y: 0 }, { model: 'model-a', count: 2, content: 'https://example.test/a.png', status: 'success' });
    const alternate = createCanvasNode(CanvasNodeType.Image, { x: 400, y: 0 }, { model: 'model-b', count: 3, taskId: 'source-task', taskStatus: 'running', status: 'loading' });
    const row = createStoryboardRow(1, { imageNodeId: primary.id, imageGenerationPrompt: 'Source shot' });
    const script = createCanvasNode(CanvasNodeType.Script, { x: -400, y: 0 }, { storyboard: { rows: [row], visibleColumns: [], referenceNodeIds: [] } });
    const nodesRef = { current: [script, primary, alternate] };
    const connectionsRef = { current: [primary, alternate].map((node, i): CanvasConnection => ({ id: `edge-${i}`, fromNodeId: script.id, toNodeId: node.id, relation: 'storyboard-output', storyboardRowId: row.id, fromHandleId: `row:${row.id}` })) };
    const savedSource = JSON.stringify({ nodes: nodesRef.current, connections: connectionsRef.current });
    let operations: ReturnType<typeof useCanvasNodeOperations>;
    function Harness() {
        operations = useCanvasNodeOperations({ projectId: 'fixture', defaultDrawingEngine: 'excalidraw', nodesRef, connectionsRef,
            selectedNodeIdsRef: { current: new Set<string>() }, getCanvasCenter: () => ({ x: 0, y: 0 }),
            setNodes: value => { nodesRef.current = typeof value === 'function' ? value(nodesRef.current) : value; },
            setConnections: value => { connectionsRef.current = typeof value === 'function' ? value(connectionsRef.current) : value; },
            setSelectedNodeIds: () => {}, setSelectedConnectionId: () => {}, setContextMenu: () => {}, setDialogNodeId: () => {}, onNodesDeleted: () => {},
        });
        return null;
    }
    renderToString(createElement(App, null, createElement(Harness)));
    expect(operations!.restoreCopiedNodesFromText('open-ai-canvas-nodes-json:' + savedSource)).toBe(true);
    expect(operations!.pasteCopiedNodes({ x: 1200, y: 0 })).toBe(true);
    const copiedScript = nodesRef.current.find(node => node.metadata?.copiedFromNodeId === script.id)!;
    const copiedRow = copiedScript.metadata!.storyboard!.rows[0];
    const copiedOutputs = storyboardRowImageOutputs(copiedScript.id, copiedRow, nodesRef.current, connectionsRef.current);
    expect(copiedOutputs).toHaveLength(2);
    expect(copiedOutputs.map(node => node.metadata?.copiedFromNodeId)).toEqual([primary.id, alternate.id]);
    expect(copiedRow.imageNodeId).toBe(copiedOutputs[0].id);
    expect(copiedOutputs[0].metadata).toMatchObject({ model: 'model-a', count: 2, content: primary.metadata!.content });
    expect(copiedOutputs[1].metadata).toMatchObject({ model: 'model-b', count: 3, status: 'idle' });
    expect(copiedOutputs[1].metadata?.taskId).toBeUndefined();
    expect(copiedOutputs[1].metadata?.taskStatus).toBeUndefined();
    expect(storyboardRowImageOutputs(script.id, row, nodesRef.current, connectionsRef.current).map(node => node.id)).toEqual([primary.id, alternate.id]);
    expect(JSON.stringify({ nodes: nodesRef.current.slice(0, 3), connections: connectionsRef.current.slice(0, 2) })).toBe(savedSource);
});

test.each([
    { state: 'running', cancel: false },
    { state: 'queued', cancel: false },
    { state: 'loading', cancel: false },
    { state: 'waiting', cancel: false },
    { state: 'submitting', cancel: false },
    { state: 'running', cancel: true },
] as const)('real hook submits pending siblings and protects active output (%j)', async ({ state, cancel }) => {
    const primary = createCanvasNode(CanvasNodeType.Image, { x: 0, y: 0 }, { content: 'https://example.test/a.png', status: 'success' });
    const pending = createCanvasNode(CanvasNodeType.Image, { x: 400, y: 0 }, { prompt: 'old', status: 'error' });
    const secondPending = createCanvasNode(CanvasNodeType.Image, { x: 400, y: 400 }, { prompt: 'old-2', status: 'idle' });
    const activeMetadata: CanvasNodeMetadata = { prompt: 'in-flight', status: state === 'loading' ? 'loading' : 'idle', taskId: 'existing-task' };
    if (state === 'running' || state === 'queued') activeMetadata.taskStatus = state;
    const running = createCanvasNode(CanvasNodeType.Image, { x: 800, y: 0 }, activeMetadata);
    const row = createStoryboardRow(1, { imageNodeId: primary.id, imageGenerationPrompt: 'New shot prompt' });
    const script = createCanvasNode(CanvasNodeType.Script, { x: -400, y: 0 }, { storyboard: { rows: [row], visibleColumns: [], referenceNodeIds: [] } });
    if (state === 'waiting' || state === 'submitting') script.metadata!.generationBatches = [{
        id: 'active-batch', projectId: 'fixture', sourceNodeId: script.id, mode: 'storyboard_image', status: 'running', createdAt: '', updatedAt: '',
        items: [{ id: 'active-item', rowId: row.id, nodeId: running.id, status: state, retryCount: 0 }],
    }];
    const nodesRef = { current: [script, primary, pending, secondPending, running] };
    const connectionsRef = { current: [primary, pending, secondPending, running].map((node, i): CanvasConnection => ({ id: `edge-${i}`, fromNodeId: script.id, toNodeId: node.id, relation: 'storyboard-output', storyboardRowId: row.id, fromHandleId: `row:${row.id}` })) };
    connectionsRef.current.push({ ...connectionsRef.current[1], id: 'duplicate' });
    const submitted: Array<{ rowId: string; nodeId: string }> = [];
    const confirmations: string[] = [];
    const warnings: string[] = [];
    // SSR reads Zustand's initial snapshot, not its client-side current state.
    const initial = useConfigStore.getInitialState();
    const ready = initial.isAiConfigReady;
    initial.isAiConfigReady = () => true;
    const app = spyOn(App, 'useApp').mockReturnValue({
        message: { success: () => {}, info: () => {}, warning: (value: string) => warnings.push(value) },
        modal: { confirm: (options: { title: string; onOk: () => void; onCancel: () => void }) => { confirmations.push(options.title); cancel ? options.onCancel() : options.onOk(); } },
    } as unknown as ReturnType<typeof App.useApp>);
    try {
        let controller: ReturnType<typeof useCanvasStoryboard>;
        function Harness() {
            const batches = useCanvasGenerationBatches({ projectId: 'fixture', projectLoaded: false, nodes: nodesRef.current, nodesRef,
                setNodes: value => { nodesRef.current = typeof value === 'function' ? value(nodesRef.current) : value; },
                handleGenerateNode: async () => { throw Error('No external generation in this fixture'); },
            });
            controller = useCanvasStoryboard({ projectId: 'fixture', addedSkills: [], nodesRef, connectionsRef,
                setNodes: value => { nodesRef.current = typeof value === 'function' ? value(nodesRef.current) : value; },
                setConnections: value => { connectionsRef.current = typeof value === 'function' ? value(connectionsRef.current) : value; },
                setSelectedNodeIds: () => {}, enqueueGenerationBatch: (sourceId, mode, targets) => { expect(mode).toBe('storyboard_image'); submitted.push(...targets); return batches.enqueueGenerationBatch(sourceId, mode, targets); },
            });
            return null;
        }
        renderToString(createElement(Harness));
        await controller!.generateScriptImages(script.id, [row.id]);
        expect(warnings).toEqual([]);
        expect(confirmations).toEqual(['确认提交 2 个图片生成任务']);
        expect(submitted).toEqual(cancel ? [] : [{ rowId: row.id, nodeId: pending.id }, { rowId: row.id, nodeId: secondPending.id }]);
        const queued = nodesRef.current.find(node => node.id === script.id)?.metadata?.generationBatches?.filter(batch => batch.id !== 'active-batch') || [];
        expect(queued).toHaveLength(cancel ? 0 : 1);
        if (!cancel) {
            expect(queued[0].items.map(item => ({ rowId: item.rowId, nodeId: item.nodeId, status: item.status }))).toEqual([
                { rowId: row.id, nodeId: pending.id, status: 'waiting' },
                { rowId: row.id, nodeId: secondPending.id, status: 'waiting' },
            ]);
            expect(new Set(queued[0].items.map(item => item.id)).size).toBe(2);
        }
        expect(nodesRef.current.find(node => node.id === running.id)).toBe(running);
        expect(nodesRef.current.find(node => node.id === pending.id)?.metadata?.prompt).toBe('New shot prompt');
        expect(nodesRef.current.find(node => node.id === script.id)?.metadata?.storyboard?.rows[0].imageNodeId).toBe(primary.id);
    } finally {
        app.mockRestore();
        initial.isAiConfigReady = ready;
    }
});

test('real storyboard hook synchronizes every row output and preserves the selected primary and per-node settings', () => {
    const primary = createCanvasNode(CanvasNodeType.Image, { x: 0, y: 0 }, { prompt: 'old-primary', model: 'model-a', count: 2, content: 'https://example.test/a.png', status: 'success' });
    const alternate = createCanvasNode(CanvasNodeType.Image, { x: 400, y: 0 }, { prompt: 'old-alternate', model: 'model-b', count: 3, status: 'idle' });
    const row = createStoryboardRow(1, { imageNodeId: primary.id, imageGenerationPrompt: 'New shot prompt' });
    const script = createCanvasNode(CanvasNodeType.Script, { x: -400, y: 0 }, { storyboard: { rows: [row], visibleColumns: [], referenceNodeIds: [] } });
    const nodesRef = { current: [script, primary, alternate] };
    const connectionsRef = { current: [primary, alternate].map((node, i): CanvasConnection => ({ id: `edge-${i}`, fromNodeId: script.id, toNodeId: node.id, relation: 'storyboard-output', storyboardRowId: row.id })) };
    let controller: ReturnType<typeof useCanvasStoryboard>;
    function Harness() {
        controller = useCanvasStoryboard({ projectId: 'fixture', addedSkills: [], nodesRef, connectionsRef,
            setNodes: value => { nodesRef.current = typeof value === 'function' ? value(nodesRef.current) : value; },
            setConnections: value => { connectionsRef.current = typeof value === 'function' ? value(connectionsRef.current) : value; },
            setSelectedNodeIds: () => {}, enqueueGenerationBatch: () => { throw Error('Editing must not submit'); },
        });
        return null;
    }
    renderToString(createElement(App, null, createElement(Harness)));
    controller!.createScriptImageNodes(script.id, [row.id]);
    expect(nodesRef.current).toHaveLength(3);
    expect(nodesRef.current.find(node => node.id === primary.id)?.metadata).toMatchObject({ prompt: 'New shot prompt', model: 'model-a', count: 2, content: 'https://example.test/a.png' });
    expect(nodesRef.current.find(node => node.id === alternate.id)?.metadata).toMatchObject({ prompt: 'New shot prompt', model: 'model-b', count: 3 });
    expect(nodesRef.current.find(node => node.id === script.id)?.metadata?.storyboard?.rows[0].imageNodeId).toBe(primary.id);
});

test('image stage counts every explicit row output while keeping the chosen first frame', () => {
    const primary = createCanvasNode(CanvasNodeType.Image, { x: 0, y: 0 }, { content: 'https://example.test/primary.png', status: 'success' });
    const alternate = createCanvasNode(CanvasNodeType.Image, { x: 400, y: 0 }, { status: 'error' });
    const row = createStoryboardRow(1, { imageNodeId: primary.id });
    const script = createCanvasNode(CanvasNodeType.Script, { x: -400, y: 0 }, { storyboard: { rows: [row], visibleColumns: [], referenceNodeIds: [] } });
    const connections: CanvasConnection[] = [primary, alternate].map((node, i) => ({ id: `edge-${i}`, fromNodeId: script.id, toNodeId: node.id, relation: 'storyboard-output', storyboardRowId: row.id, fromHandleId: `row:${row.id}` }));
    // Duplicate edges must not double-charge or inflate progress.
    connections.push({ ...connections[1], id: 'duplicate-edge' });
    const nodes = [script, primary, alternate];
    const result = deriveStoryboardPipelineProgress(script, nodes, connections);
    expect(result.images).toMatchObject({ total: 2, created: 2, success: 1, failed: 1, incomplete: 1 });
    expect(result.images.nodeIds).toEqual([primary.id, alternate.id]);
    expect(result.rows[0].imageNode?.id).toBe(primary.id);
    expect(result.rows[0].imageState).toBe('success');
    alternate.metadata = { status: 'loading' };
    expect(deriveStoryboardPipelineProgress(script, nodes, connections).images).toMatchObject({ total: 2, loading: 1, failed: 0 });
});

test('ordinary references and outputs owned by another script or row do not become extra generation targets', () => {
    const primary = createCanvasNode(CanvasNodeType.Image, { x: 0, y: 0 }, { status: 'success', content: 'https://example.test/primary.png' });
    const foreign = createCanvasNode(CanvasNodeType.Image, { x: 400, y: 0 });
    const video = createCanvasNode(CanvasNodeType.Video, { x: 400, y: 400 });
    const row = createStoryboardRow(1, { imageNodeId: primary.id });
    const empty = createStoryboardRow(2);
    const script = createCanvasNode(CanvasNodeType.Script, { x: -400, y: 0 }, { storyboard: { rows: [row, empty], visibleColumns: [], referenceNodeIds: [] } });
    const connections: CanvasConnection[] = [
        { id: 'input', fromNodeId: script.id, toNodeId: foreign.id },
        { id: 'foreign', fromNodeId: 'other-script', toNodeId: foreign.id, relation: 'storyboard-output', storyboardRowId: row.id },
        { id: 'wrong-row', fromNodeId: script.id, toNodeId: foreign.id, relation: 'storyboard-output', storyboardRowId: 'other-row' },
        { id: 'video', fromNodeId: script.id, toNodeId: video.id, relation: 'storyboard-output', storyboardRowId: row.id },
    ];
    const result = deriveStoryboardPipelineProgress(script, [script, primary, foreign, video], connections);
    expect(result.images).toMatchObject({ total: 2, created: 1, success: 1, incomplete: 1, nodeIds: [primary.id] });
});
