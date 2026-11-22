import { expect, test } from 'bun:test';
import { configurableLtvOperation } from '../src/lib/canvas/ltv-configurable-operation';
import { adaptLtvNativeProject } from '../src/lib/canvas/ltv-native-project';
import { klingTaskMetadata } from '../src/lib/canvas/ltv-kling-options';
import { assertCanvasGenerationRequirements, buildVideoGenerationMetadata } from '../src/lib/canvas/canvas-project-generation';
import { defaultConfig, type AiConfig } from '../src/stores/use-config-store';
import { defaultModelCapabilityConfig } from '../src/lib/model-capabilities';
import { CanvasNodeType } from '../src/types/canvas';

const fields = { model: 'kling-v2-5-turbo-pro', modeType: 'singleImage2video', quality: 'high', ratio: 'auto', duration: 5 };
const counts = { image: 1, video: 0, audio: 0 };

test('same-version Kling 2.5 preserves its tier, duration and adaptive frame', () => {
    for (const [quality, mode, vquality] of [['low', 'std', '720p'], ['high', 'pro', '1080p']]) {
        expect(configurableLtvOperation('video', fields.modeType, { ...fields, quality }, counts, 1)).toMatchObject({
            ltvExecutionContract: 'kling-v25-video', size: 'adaptive', seconds: '5', vquality, generateAudio: 'false',
            videoEditOperation: 'image_to_video', videoKling: { mode, multiShot: false },
        });
    }
    expect(configurableLtvOperation('video', 'frames2video', { ...fields, duration: 10 }, { ...counts, image: 2 }, 1)).toMatchObject({ ltvExecutionContract: 'kling-v25-video', seconds: '10' });
    for (const overrides of [{ duration: 6 }, { quality: '4k' }, { ratio: '16:9' }, { enableSound: 'on' }, { multi_shot: true }, { search_enabled: true }]) {
        expect(configurableLtvOperation('video', fields.modeType, { ...fields, ...overrides }, counts, 1)).toBeUndefined();
    }
    expect(configurableLtvOperation('video', 'frames2video', { ...fields, quality: 'low' }, { ...counts, image: 2 }, 1)).toBeUndefined();
    expect(configurableLtvOperation('video', fields.modeType, fields, { ...counts, image: 0 }, 1)).toBeUndefined();
    expect(configurableLtvOperation('video', fields.modeType, fields, { ...counts, image: 2 }, 1)).toBeUndefined();
});

test('native 2.5 import preserves both frame identities without replacing source data', () => {
    const source = { nodes: [
        { id: 'first', type: 'image', position: { x: 0, y: 0 }, data: { action: 'image_resource', url: ['https://example.com/first.png'] } },
        { id: 'last', type: 'image', position: { x: 0, y: 200 }, data: { action: 'image_resource', url: ['https://example.com/last.png'] } },
        { id: 'video', type: 'video', position: { x: 400, y: 0 }, data: { action: 'video_generate', params: { ...fields, modeType: 'frames2video', prompt: 'Original prompt', imageList: [{ nodeId: 'first', url: 'https://example.com/first.png' }, { nodeId: 'last', url: 'https://example.com/last.png' }] } } },
    ], edges: [{ source: 'first', target: 'video' }, { source: 'last', target: 'video' }] };
    const before = structuredClone(source);
    const result = adaptLtvNativeProject(source, { channels: [] }, 'v25', '2.5');
    expect(result.adoptable).toBe(true);
    expect(result.project.nodes.find(n => n.id === 'video')?.metadata).toMatchObject({ ltvExecutionContract: 'kling-v25-video', model: '', videoStartFrameNodeId: 'first', videoEndFrameNodeId: 'last', prompt: 'Original prompt' });
    expect(source).toEqual(before);
});

test('normal and retry 2.5 submission enforce its exact model, tier and frame count', () => {
    const options = configurableLtvOperation('video', fields.modeType, fields, counts, 1)!;
    const cap = defaultModelCapabilityConfig('newapi-channel-2').video!;
    Object.assign(cap, { operations: ['image_to_video'], ratios: ['adaptive'], resolutions: ['1080p'], duration: { selection: 'enum', values: [5, 10] }, generateAudio: { supported: false } });
    Object.assign(cap.references, { minImages: 1, maxImages: 2, maxVideos: 0, maxAudios: 0, promptMaxChars: 2500 });
    const channel = { id: 'kling25', name: 'fixture', enabled: true, apiFormat: 'openai' as const, baseUrl: '/api', apiKey: 'fixture',
        models: ['kling-v2-5-turbo'], modelCosts: [{ model: 'kling-v2-5-turbo', capability: 'video' as const, protocol: 'kling-v25-video', capabilityConfig: { version: 1 as const, video: cap } }] };
    const model = 'kling25::kling-v2-5-turbo';
    const config = { ...defaultConfig, model, size: 'adaptive', vquality: '1080p', videoSeconds: '5', videoGenerateAudio: 'false', count: '1', channels: [channel] } as AiConfig;
    const node = { id: 'video', type: CanvasNodeType.Video, title: '2.5', position: { x: 0, y: 0 }, metadata: {
        ...options, model, prompt: '原始正文', videoStartFrameNodeId: 'first', ltvReferencePlan: { prompt: '', references: [{ nodeId: 'first', kind: 'image' as const, url: 'https://example.com/first.png' }] },
    } };
    const context = { referenceImages: [{ id: 'first', url: 'https://example.com/first.png' }], referenceVideos: [], referenceAudios: [] };
    expect(() => assertCanvasGenerationRequirements(config, node, 'video', node.metadata.prompt)).not.toThrow();
    expect(() => buildVideoGenerationMetadata(node, context, config)).not.toThrow();
    expect(klingTaskMetadata(node.metadata)).toEqual({ providerOptions: { 'kling-v25-video': { mode: 'pro', multiShot: false } } });
    expect(() => buildVideoGenerationMetadata(node, { ...context, referenceImages: [] }, config)).toThrow();
    expect(() => buildVideoGenerationMetadata(node, context, { ...config, videoSeconds: '6' })).toThrow();
    expect(() => buildVideoGenerationMetadata(node, context, { ...config, model: 'kling25::kling-v3' })).toThrow();
    channel.modelCosts[0].protocol = 'kling-v3-video';
    expect(() => assertCanvasGenerationRequirements(config, node, 'video', node.metadata.prompt)).toThrow('协议');
});
