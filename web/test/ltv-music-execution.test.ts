import { expect, mock, test } from 'bun:test';
import { useResourceAccessFixture } from './helpers/resource-access-fixture';
useResourceAccessFixture();
import { adaptLtvNativeProject } from '../src/lib/canvas/ltv-native-project';
import { applyGenerationTaskResultToNodes } from '../src/lib/canvas/canvas-generation-task-sync';
import { defaultConfig } from '../src/stores/use-config-store';
import { resolveLtvRuntimeReferences } from '../src/lib/canvas/ltv-runtime-references';

const actual = await import('../src/lib/canvas/canvas-project-generation');
let submitted: any;
mock.module('@/lib/canvas/canvas-project-generation', () => ({ ...actual, runCanvasGenerationTaskToConsumer: async (input: any, consumer: any) => {
    submitted = input;
    await consumer.consumeTask({ id: 'music-fixture', status: 'succeeded', taskType: 'audio', inputJson: JSON.stringify(input),
        resultJson: JSON.stringify({ audio: { dataUrl: '/api/resources/music-result/file', storageKey: 'resource:music-result', mimeType: 'audio/mpeg', durationMs: 60000 } }) });
} }));
const { executeAudioGeneration } = await import('../src/pages/canvas/canvas-media-generation-executors');

test('音乐节点经实际音频执行器提交曲长，真实结果转换器回写并保留下游绑定', async () => {
    const converted = adaptLtvNativeProject({ nodes: [{ id: 'music', type: 'audio', position: { x: 0, y: 0 }, data: { action: 'audio_generate', params: {
        model: 'vocal-music', scene: 'Music', modeType: 'text2audio', prompt: '雨夜，克制钢琴与弦乐', advancedSettings: { music_length_ms: 60000 },
    } } }], edges: [] }, { channels: [] }, 'test', '配乐');
    let nodes = converted.project.nodes;
    let connections = converted.project.connections;
    const source = nodes[0];
    await executeAudioGeneration({ nodeId: source.id, sourceNode: source, prompt: source.metadata!.prompt, effectivePrompt: source.metadata!.prompt,
        generationConfig: { ...defaultConfig, model: 'music::music_v2_5' },
        generationContext: { referenceImages: [], referenceVideos: [], referenceAudios: [], resolvedCharacterVersions: [], resolvedCharacterVoices: [] },
        controller: new AbortController(), projectId: 'test',
        setNodes: (update: any) => { nodes = update(nodes); }, setConnections: (update: any) => { connections = update(connections); },
        startGenerationRequest: () => {}, finishGenerationRequest: () => {}, bindGenerationTask: () => {}, registerPendingNodeIds: () => {},
        applyGenerationTaskResult: async (id: string, task: any) => { nodes = (await applyGenerationTaskResultToNodes(nodes, task, id)).nodes; },
        taskContext: {}, skillMetadata: {}, retryContext: {},
    } as any);
    expect(submitted.metadata.providerOptions['elevenlabs-music']).toEqual({ music_length_ms: 60000, force_instrumental: false });
    expect(submitted.prompt).toBe('雨夜，克制钢琴与弦乐');
    const restored = JSON.parse(JSON.stringify(nodes));
    expect(restored).toHaveLength(1);
    expect(restored[0].metadata.audioMusic).toEqual(source.metadata!.audioMusic);
    expect(restored[0].metadata.storageKey).toBe('resource:music-result');
    const next = resolveLtvRuntimeReferences({ prompt: '按配乐制作视频', references: [{ kind: 'audio', nodeId: 'music', url: '', deferred: true }] }, restored, '按配乐制作视频');
    expect(next[0].metadata!.status).toBe('success');
    expect(connections).toHaveLength(0);
});
