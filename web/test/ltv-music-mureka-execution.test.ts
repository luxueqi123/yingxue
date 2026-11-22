import { expect, mock, test } from 'bun:test';
import { useResourceAccessFixture } from './helpers/resource-access-fixture';
useResourceAccessFixture();
import { adaptLtvNativeProject } from '../src/lib/canvas/ltv-native-project';
import { applyGenerationTaskResultToNodes } from '../src/lib/canvas/canvas-generation-task-sync';
import { defaultConfig } from '../src/stores/use-config-store';

const actual = await import('../src/lib/canvas/canvas-project-generation');
let submitted: any;
mock.module('@/lib/canvas/canvas-project-generation', () => ({ ...actual, runCanvasGenerationTaskToConsumer: async (input: any, consumer: any) => {
    submitted = input;
    await consumer.consumeTask({ id: 'mureka-fixture', status: 'succeeded', taskType: 'audio', inputJson: JSON.stringify(input),
        resultJson: JSON.stringify({ audio: { dataUrl: '/api/resources/mureka/file', storageKey: 'resource:mureka', mimeType: 'audio/mpeg' } }) });
} }));
const { executeAudioGeneration } = await import('../src/pages/canvas/canvas-media-generation-executors');

test('ElevenLabs 音乐节点经实际音频执行器提交纯乐器开关并回写结果', async () => {
    const converted = adaptLtvNativeProject({ nodes: [{ id: 'music', type: 'audio', position: { x: 0, y: 0 }, data: { action: 'audio_generate', params: {
        model: 'vocal-music', scene: 'Music', modeType: 'text2audio', prompt: '弦乐与低音鼓', count: 1, advancedSettings: { force_instrumental: 1 },
    } } }], edges: [] }, { channels: [] }, 'test', '配乐');
    expect(converted.adoptable).toBe(true);
    let nodes = converted.project.nodes; let connections = converted.project.connections;
    const source = nodes[0];
    await executeAudioGeneration({ nodeId: source.id, sourceNode: source, prompt: source.metadata!.prompt, effectivePrompt: source.metadata!.prompt,
        generationConfig: { ...defaultConfig, model: 'music::music_v2_5' },
        generationContext: { referenceImages: [], referenceVideos: [], referenceAudios: [], resolvedCharacterVersions: [], resolvedCharacterVoices: [] },
        controller: new AbortController(), projectId: 'test',
        setNodes: (u: any) => { nodes = u(nodes); }, setConnections: (u: any) => { connections = u(connections); },
        startGenerationRequest: () => {}, finishGenerationRequest: () => {}, bindGenerationTask: () => {}, registerPendingNodeIds: () => {},
        applyGenerationTaskResult: async (id: string, task: any) => { nodes = (await applyGenerationTaskResultToNodes(nodes, task, id)).nodes; },
        taskContext: {}, skillMetadata: {}, retryContext: {},
    } as any);
    expect(submitted.metadata.providerOptions['elevenlabs-music']).toEqual({ force_instrumental: true });
    expect(submitted.prompt).toBe('弦乐与低音鼓');
    const restored = JSON.parse(JSON.stringify(nodes));
    expect(restored[0].metadata.audioMusic).toEqual(source.metadata!.audioMusic);
    expect(restored[0].metadata.audioMusic.sourceModel).toBe('vocal-music');
    expect(restored[0].metadata.storageKey).toBe('resource:mureka');
    expect(connections).toHaveLength(0);
});
