import { expect, test } from 'bun:test';
import { configurableLtvOperation } from '../src/lib/canvas/ltv-configurable-operation';
import { projectLtvSubmittedFields } from '../src/lib/canvas/ltv-parameter-layers';
import { adaptLtvNativeProject } from '../src/lib/canvas/ltv-native-project';
import { assertCanvasGenerationRequirements, buildVideoGenerationMetadata } from '../src/lib/canvas/canvas-project-generation';
import { happyHorseFirstFrameTaskMetadata } from '../src/lib/canvas/ltv-happyhorse-options';
import { defaultConfig, type AiConfig } from '../src/stores/use-config-store';
import { defaultModelCapabilityConfig } from '../src/lib/model-capabilities';
import { CanvasNodeType, type CanvasNodeMetadata } from '../src/types/canvas';

const fields = { model: 'happy-horse-1.1', modeType: 'frames2video', resolution: '720P', duration: 6 };
const counts = { image: 1, video: 0, audio: 0 };
const schema = { properties: { prompt: { maxLength: 0 }, ratio: { originalField: 'ratio' }, resolution: { originalField: 'resolution' }, duration: { originalField: 'duration' } },
    config: { settings: { frames2video: ['resolution', 'duration'], image2video: ['ratio', 'resolution', 'duration'] } } };

test('HappyHorse 1.1 first frames use their own model and derive output ratio from the input', () => {
    const submitted = projectLtvSubmittedFields({ ...fields, settings: { ratio: '16:9' } }, schema, 'video');
    expect(submitted.removedFields).toEqual(['ratio']);
    expect(configurableLtvOperation('video', 'frames2video', submitted.fields, counts, 1)).toMatchObject({
        ltvExecutionContract: 'happyhorse-first-frame-video', ltvHappyHorseModel: 'happy-horse-1.1',
        videoEditOperation: 'image_to_video', size: 'adaptive', vquality: '720P', seconds: '6', count: 1,
    });
    for (const change of [{ model: 'happy-horse-2' }, { ratio: '16:9' }, { resolution: '2K' }, { duration: 2 }, { duration: 6.5 }, { enableSound: true }]) {
        expect(configurableLtvOperation('video', 'frames2video', { ...fields, ...change }, counts, 1)).toBeUndefined();
    }
    expect(configurableLtvOperation('video', 'frames2video', fields, { ...counts, image: 2 }, 1)).toBeUndefined();
});

test('native first-frame import preserves the source, frame binding and exact prompt while waiting for its own channel', () => {
    const source = { nodes: [
        { id: 'frame', type: 'image', position: { x: 0, y: 0 }, data: { action: 'image_resource', url: ['https://example.com/original.png'] } },
        { id: 'video', type: 'video', position: { x: 400, y: 0 }, data: { action: 'video_generate', params: { ...fields, settings: { ratio: '16:9' }, prompt: '原始正文，不裁切画面。', imageList: [{ nodeId: 'frame', url: 'https://example.com/original.png' }] } } },
    ], edges: [{ source: 'frame', target: 'video' }] };
    const before = structuredClone(source);
    const result = adaptLtvNativeProject(source, { channels: [] }, 'first-frame', 'First frame', { 'video:happy-horse-1.1': schema });
    const metadata = result.project.nodes.find(node => node.id === 'video')?.metadata;
    expect(metadata).toMatchObject({ ltvExecutionContract: 'happyhorse-first-frame-video', ltvHappyHorseModel: 'happy-horse-1.1',
        size: 'adaptive', prompt: '原始正文，不裁切画面。', model: '', videoStartFrameNodeId: 'frame' });
    expect(metadata?.ltvReferencePlan?.references).toMatchObject([{ nodeId: 'frame', kind: 'image', url: 'https://example.com/original.png' }]);
    expect(result.issues).toContainEqual(expect.objectContaining({ nodeId: 'video', code: 'channel-configuration-required' }));
    expect(result.adoptable).toBe(true);
    expect(source).toEqual(before);
});

test('normal and retry video metadata retain the original HappyHorse version and frame role', () => {
    const metadata = { ltvExecutionContract: 'happyhorse-first-frame-video', ltvHappyHorseModel: 'happy-horse-1.1',
        videoEditOperation: 'image_to_video', videoStartFrameNodeId: 'frame' } as CanvasNodeMetadata;
    const result = buildVideoGenerationMetadata({ id: 'video', type: CanvasNodeType.Video, title: 'First frame', position: { x: 0, y: 0 }, metadata },
        { referenceImages: [{ id: 'frame', url: 'https://example.com/original.png' }], referenceVideos: [], referenceAudios: [] });
    expect(result).toMatchObject({ ltvExecutionContract: 'happyhorse-first-frame-video', ltvHappyHorseModel: 'happy-horse-1.1',
        videoEditOperation: 'image_to_video', videoStartFrameNodeId: 'frame' });
});

test('a valid HappyHorse first frame may generate without an optional text prompt', () => {
    const source = { nodes: [{ id: 'video', type: 'video', position: { x: 0, y: 0 }, data: { action: 'video_generate', params: {
        ...fields, prompt: '', imageList: [{ nodeId: 'original', url: 'https://example.com/original.png' }],
    } } }], edges: [] };
    const result = adaptLtvNativeProject(source, { channels: [] }, 'optional', 'Optional', { 'video:happy-horse-1.1': schema });
    expect(result.issues.some(issue => issue.code === 'empty-prompt')).toBe(false);
    expect(result.project.nodes.find(node => node.id === 'video')?.metadata?.ltvExecutionContract).toBe('happyhorse-first-frame-video');
});

test('first-frame submission and retry enforce native model, single frame, adaptive ratio and unchanged prompt', () => {
    const options = configurableLtvOperation('video', 'frames2video', fields, counts, 1)!;
    const cap = defaultModelCapabilityConfig('newapi-channel-2').video!;
    Object.assign(cap, { operations: ['image_to_video'], ratios: ['adaptive'], resolutions: ['720P'], duration: { min: 3, max: 15, step: 1 }, generateAudio: { supported: false } });
    Object.assign(cap.references, { minImages: 1, maxImages: 1, maxVideos: 0, maxAudios: 0, promptMaxChars: 5000 });
    const channel = { id: 'horse', name: 'fixture', enabled: true, apiFormat: 'openai' as const, baseUrl: '/api', apiKey: 'fixture',
        models: ['happyhorse-1.1-i2v'], modelCosts: [{ model: 'happyhorse-1.1-i2v', capability: 'video' as const, protocol: 'dashscope-happyhorse-first-frame-video', capabilityConfig: { version: 1 as const, video: cap } }] };
    const model = 'horse::happyhorse-1.1-i2v';
    const config = { ...defaultConfig, model, size: 'adaptive', vquality: '720P', videoSeconds: '6', videoGenerateAudio: 'false', count: '1', channels: [channel] } as AiConfig;
    const node = { id: 'video', type: CanvasNodeType.Video, title: 'First frame', position: { x: 0, y: 0 }, metadata: {
        ...options, model, prompt: '保持@图片1原构图。', videoStartFrameNodeId: 'frame', ltvReferencePlan: { prompt: '', references: [{ nodeId: 'frame', kind: 'image' as const, url: 'https://example.com/original.png' }] },
    } };
    expect(() => assertCanvasGenerationRequirements(config, node, 'video', node.metadata.prompt)).not.toThrow();
    expect(happyHorseFirstFrameTaskMetadata(node.metadata, node.metadata.prompt, 1)).toEqual({ providerOptions: { 'dashscope-happyhorse-first-frame-video': { prompt: node.metadata.prompt } } });
    expect(() => happyHorseFirstFrameTaskMetadata(node.metadata, '@图片2', 1)).toThrow('不存在');
    expect(() => happyHorseFirstFrameTaskMetadata(node.metadata, '汉'.repeat(2501), 1)).toThrow('不能截断');
    channel.modelCosts[0].protocol = 'dashscope-happyhorse-reference-video';
    expect(() => assertCanvasGenerationRequirements(config, node, 'video', node.metadata.prompt)).toThrow('协议');
    channel.modelCosts[0].protocol = 'dashscope-happyhorse-first-frame-video';
    node.metadata.videoStartFrameNodeId = 'other';
    expect(() => assertCanvasGenerationRequirements(config, node, 'video', node.metadata.prompt)).toThrow('首帧');
});
