import { expect, mock, test } from 'bun:test';
import { useResourceAccessFixture } from './helpers/resource-access-fixture';
useResourceAccessFixture();
import { adaptLtvNativeProject } from '../src/lib/canvas/ltv-native-project';
import { resolveLtvRuntimeReferences } from '../src/lib/canvas/ltv-runtime-references';
import { defaultConfig } from '../src/stores/use-config-store';
import type { CanvasNodeData, CanvasConnection } from '../src/types/canvas';
import { applyGenerationTaskResultToNodes } from '../src/lib/canvas/canvas-generation-task-sync';

const actual = await import('../src/lib/canvas/canvas-project-generation');
let submitted: any;
mock.module('@/lib/canvas/canvas-project-generation', () => ({ ...actual,
    runCanvasGenerationTaskToConsumer: async (input: any, consumer: any) => {
        submitted = input;
        await consumer.consumeTask({ id: 'fixture-task', status: 'succeeded', taskType: 'image', prompt: input.prompt,
            inputJson: JSON.stringify(input), resultJson: JSON.stringify({ images: [{ dataUrl: '/api/resources/result/file', storageKey: 'resource:result', width: 2816, height: 1584, mimeType: 'image/png' }] }) });
    },
}));
const { executeImageGeneration } = await import('../src/pages/canvas/canvas-image-generation-executor');

for (const scene of ['multi_camera_grid_9', 'continuous_storyboard_grid_25']) test(`${scene}沿真实图像执行器提交完整提示词和引用，并由真实结果转换器回写`, async () => {
    const converted = adaptLtvNativeProject({ nodes: [{ id: 'scene', type: 'image', position: { x: 400, y: 0 }, data: { action: 'image_generate', params: {
        scene, modeType: 'text2image', prompt: '红衣旅人穿过雨夜，在黎明找到失散的伙伴', ratio: '16:9', resolution: '2K', count: 1,
    } } }], edges: [] }, { channels: [] }, 'test', '场景');
    let nodes: CanvasNodeData[] = converted.project.nodes;
    let connections: CanvasConnection[] = converted.project.connections;
    const source = nodes.find(node => node.id === 'scene')!;
    const reference = nodes.find(node => node.id === 'scene::native-scene-input')!;
    if (reference) reference.metadata = { ...reference.metadata, content: '/api/resources/reference/file', storageKey: 'resource:reference', status: 'success' };
    const plan = source.metadata!.ltvReferencePlan!;
    const references = resolveLtvRuntimeReferences(plan, nodes, plan.prompt);
    const generationConfig = { ...defaultConfig, model: 'gpt-image-2', imageModel: 'gpt-image-2', count: '1', size: source.metadata!.size!, quality: source.metadata!.quality! };
    const errors: string[] = [];
    await executeImageGeneration({
        nodeId: source.id, sourceNode: source, canvasNodes: nodes, canvasConnections: connections,
        prompt: plan.prompt, effectivePrompt: plan.prompt, generationConfig,
        generationContext: { referenceImages: references.map(node => ({ id: node.id, dataUrl: node.metadata!.content, storageKey: node.metadata!.storageKey })), referenceVideos: [], referenceAudios: [], resolvedCharacterVersions: [], resolvedCharacterVoices: [] },
        controller: new AbortController(), projectId: 'test',
        setNodes: (update: any) => { nodes = typeof update === 'function' ? update(nodes) : update; },
        setConnections: (update: any) => { connections = typeof update === 'function' ? update(connections) : update; },
        setSelectedNodeIds: () => {}, setSelectedConnectionId: () => {}, setDialogNodeId: () => {},
        startGenerationRequest: () => {}, finishGenerationRequest: () => {}, bindGenerationTask: () => {}, registerPendingNodeIds: () => {},
        applyGenerationTaskResult: async (id: string, task: any) => { nodes = (await applyGenerationTaskResultToNodes(nodes, task, id)).nodes; },
        taskContext: {}, skillMetadata: {}, retryContext: {}, styleMetadata: {}, showError: (message: string) => errors.push(message),
    } as any);
    expect(errors).toEqual([]);
    expect(submitted.prompt).toBe(plan.prompt);
    if (reference) expect(submitted.referenceImages[0].storageKey).toBe('resource:reference');
    else {
        expect(submitted.referenceImages || []).toHaveLength(0);
        expect(submitted.prompt).toContain('the supplied story description');
        expect(submitted.prompt).toContain('红衣旅人穿过雨夜，在黎明找到失散的伙伴');
    }
    expect(submitted.config.size).toBe(source.metadata!.size);
    expect(submitted.config.quality).toBe(source.metadata!.quality);
    expect(submitted.nodeId).toBe(source.id);
    const restored: CanvasNodeData[] = JSON.parse(JSON.stringify(nodes));
    const result = restored.find(node => node.id === source.id)!;
    expect(result.metadata!.status).toBe('success');
    expect(result.metadata!.storageKey).toBe('resource:result');
    expect(result.metadata!.ltvReferencePlan).toEqual(plan);
    expect(result.metadata!.strictGenerationOptions).toEqual(source.metadata!.strictGenerationOptions);
    expect(restored).toHaveLength(reference ? 2 : 1);
    if (reference) expect(connections.some(edge => edge.fromNodeId === reference.id && edge.toNodeId === source.id)).toBe(true);
});
