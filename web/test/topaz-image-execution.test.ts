import { expect, mock, test, beforeEach, afterEach } from 'bun:test';
import { installResourceAccessFixture } from './resource-access-fixture';
let restoreResourceAccess: () => void;
beforeEach(() => { restoreResourceAccess = installResourceAccessFixture({enhanced: 'data:image/png;base64,AA=='}); });
afterEach(() => restoreResourceAccess());
import { defaultConfig } from '../src/stores/use-config-store';
import { mapLtvTopazImageOptions } from '../src/lib/canvas/ltv-topaz-image';
import { applyGenerationTaskResultToNodes } from '../src/lib/canvas/canvas-generation-task-sync';
import { isolateCopiedNodeMetadata } from '../src/lib/canvas/canvas-node-copy';
const actual = await import('../src/lib/canvas/canvas-project-generation');
let submitted: any;
const upload = await import('../src/lib/canvas/canvas-file-upload');
mock.module('@/lib/canvas/canvas-file-upload', () => ({ ...upload, readUploadImageSize: async (file: File) => {
    expect(file.size).toBe(1);
    return { width: 321, height: 179 };
} }));
mock.module('@/lib/canvas/canvas-project-generation', () => ({ ...actual, runCanvasGenerationTaskToConsumer: async (input: any, consumer: any) => {
    submitted = input;
    await consumer.consumeTask({ id: 'local', status: 'succeeded', taskType: 'image', inputJson: JSON.stringify(input), resultJson: JSON.stringify({ images: [{ dataUrl: 'data:image/png;base64,AA==', storageKey: 'resource:enhanced', mimeType: 'image/png', width: 1284, height: 716 }] }) });
} }));
const { executeImageGeneration } = await import('../src/pages/canvas/canvas-image-generation-executor?topaz-execution-fixture');

test('实际图像执行器提交增强参数，结果和副本保留合同及原图引用', async () => {
    const options = mapLtvTopazImageOptions({ model: 'topaz-image-upscaler', style: 'CGI', scale: 4 }, { image: 1, video: 0, audio: 0 }, 1)!;
    const source: any = { id: 'enhance', type: 'image', title: '增强', position: { x: 0, y: 0 }, width: 340, height: 240, metadata: { ...options, generationMode: 'image', model: 'topaz::CGI', prompt: '' } };
    let nodes = [source], connections: any[] = [];
    const config = { ...defaultConfig, model: 'topaz::CGI', count: '1', size: 'auto', channels: [{ id: 'topaz', name: 'fixture', baseUrl: 'https://example.test', enabled: true, interfaceType: 'topaz-image-enhance', models: ['CGI'], modelCosts: [{ model: 'CGI', capability: 'image', protocol: 'topaz-image-enhance' }] }] };
    const image = { id: 'original', name: 'original.png', type: 'image/png', dataUrl: 'data:image/png;base64,AA==', width: 99, height: 99 };
    await executeImageGeneration({ nodeId: source.id, sourceNode: source, canvasNodes: nodes, canvasConnections: connections, prompt: '', effectivePrompt: '', generationConfig: config,
        generationContext: { referenceImages: [image], referenceVideos: [], referenceAudios: [], resolvedCharacterVersions: [] }, controller: new AbortController(),
        setNodes: (v: any) => { nodes = typeof v === 'function' ? v(nodes) : v; }, setConnections: (v: any) => { connections = typeof v === 'function' ? v(connections) : v; },
        setSelectedNodeIds: () => {}, setSelectedConnectionId: () => {}, setDialogNodeId: () => {}, startGenerationRequest: () => {}, finishGenerationRequest: () => {}, bindGenerationTask: () => {}, registerPendingNodeIds: () => {},
        applyGenerationTaskResult: async (id: string, task: any) => { nodes = (await applyGenerationTaskResultToNodes(nodes, task, id)).nodes; }, showError: (s: string) => { throw new Error(s); }, taskContext: {}, styleMetadata: {}, skillMetadata: {}, retryContext: {} } as any);
    expect(submitted.referenceImages).toEqual([{ ...image, width: 321, height: 179, bytes: 1 }]);
    expect(image.width).toBe(99);
    expect(submitted.metadata.providerOptions['topaz-image-enhance']).toEqual({ output_width: 1284, output_height: 716 });
    const restored = JSON.parse(JSON.stringify(nodes));
    const result = restored.find((node: any) => node.metadata.storageKey === 'resource:enhanced');
    expect(result).toBeDefined();
    expect(result.metadata.imageEnhancement).toEqual(options.imageEnhancement);
    expect(result.metadata.ltvExecutionContract).toBe('topaz-image-enhance');
    const copied = isolateCopiedNodeMetadata(result, new Map());
    copied.imageEnhancement!.scale = 2;
    expect(result.metadata.imageEnhancement.scale).toBe(4);
});
