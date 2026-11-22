import { expect, test } from 'bun:test';
import { configurableLtvOperation } from '../src/lib/canvas/ltv-configurable-operation';
import { assertCanvasGenerationRequirements } from '../src/lib/canvas/canvas-project-generation';
import { happyHorseReferenceTaskMetadata } from '../src/lib/canvas/ltv-happyhorse-options';
import { defaultModelCapabilityConfig } from '../src/lib/model-capabilities';
import { defaultConfig, type AiConfig } from '../src/stores/use-config-store';
import { CanvasNodeType, type CanvasNodeData, type CanvasNodeMetadata } from '../src/types/canvas';

test('HappyHorse 1.1 carries multiple references and exact output requirements into its native contract', () => {
    const result = configurableLtvOperation('video', 'image2video', {
        model: 'happy-horse-1.1', ratio: '4:3', resolution: '720P', duration: 7,
    }, { image: 4, video: 0, audio: 0 }, 1);
    expect(result).toMatchObject({
        ltvExecutionContract: 'happyhorse-reference-video', ltvHappyHorseModel: 'happy-horse-1.1',
        size: '4:3', seconds: '7', vquality: '720P', count: 1, videoEditOperation: 'reference_to_video',
    });
});

test('normal generation and retry convert source image bindings without truncating or reordering them', () => {
    const metadata: CanvasNodeMetadata = { ltvExecutionContract: 'happyhorse-reference-video', ltvHappyHorseModel: 'happy-horse-1.1' };
    expect(happyHorseReferenceTaskMetadata(metadata, '先@图片2，再@图片1，最后@图片4。', 4)).toEqual({
        providerOptions: { 'dashscope-happyhorse-reference-video': { prompt: '先[Image 2]，再[Image 1]，最后[Image 4]。' } },
    });
    expect(() => happyHorseReferenceTaskMetadata(metadata, '@图片5', 4)).toThrow('不存在');
    expect(() => happyHorseReferenceTaskMetadata(metadata, '@图片10', 4)).toThrow('不存在');
    expect(() => happyHorseReferenceTaskMetadata(metadata, '[Image 0]', 4)).toThrow('不存在');
    expect(() => happyHorseReferenceTaskMetadata(metadata, '汉'.repeat(2501), 4)).toThrow('不能截断');
    expect(() => happyHorseReferenceTaskMetadata(metadata, 'a'.repeat(5001), 4)).toThrow('不能截断');
    expect(happyHorseReferenceTaskMetadata(undefined, '@图片1', 1)).toEqual({});
});

test('canvas submission enforces native version, reference mode and registered capabilities', () => {
    const options = configurableLtvOperation('video', 'image2video', { model: 'happy-horse-1.1', ratio: '4:3', resolution: '720P', duration: 7 }, { image: 4, video: 0, audio: 0 }, 1)!;
    const capabilityConfig = { version: 1 as const, video: defaultModelCapabilityConfig('newapi-channel-2').video! };
    Object.assign(capabilityConfig.video, { operations: ['reference_to_video'], ratios: ['4:3'], resolutions: ['720P'], duration: { min: 3, max: 15, step: 1 }, generateAudio: { supported: false } });
    Object.assign(capabilityConfig.video.references, { minImages: 1, maxImages: 9, maxVideos: 0, maxAudios: 0, promptMaxChars: 2500 });
    const channel = { id: 'horse', name: 'fixture', enabled: true, apiFormat: 'openai' as const, baseUrl: '/api', apiKey: 'fixture',
        models: ['happyhorse-1.1-r2v'], modelCosts: [{ model: 'happyhorse-1.1-r2v', capability: 'video' as const, protocol: 'dashscope-happyhorse-reference-video', capabilityConfig }] };
    const model = 'horse::happyhorse-1.1-r2v';
    const config = { ...defaultConfig, model, size: '4:3', vquality: '720P', videoSeconds: '7', videoGenerateAudio: 'false', count: '1', channels: [channel] } as unknown as AiConfig;
    const node: CanvasNodeData = { id: 'horse-node', type: CanvasNodeType.Video, title: 'HappyHorse', position: { x: 0, y: 0 },
        metadata: { ...options, model, generationMode: 'video', prompt: '看@图片1', ltvReferencePlan: { prompt: '看@图片1', references: Array.from({ length: 4 }, (_, i) => ({ nodeId: 'image-' + i, kind: 'image' as const, url: 'https://example.com/' + i + '.png' })) } } };
    expect(() => assertCanvasGenerationRequirements(config, node, 'video', '看@图片1')).not.toThrow();
    channel.modelCosts[0].protocol = 'kling-v3-video';
    expect(() => assertCanvasGenerationRequirements(config, node, 'video', '看@图片1')).toThrow('协议');
    channel.modelCosts[0].protocol = 'dashscope-happyhorse-reference-video';
    delete node.metadata!.ltvHappyHorseModel;
    expect(() => assertCanvasGenerationRequirements(config, node, 'video', '看@图片1')).toThrow('原始要求');
    node.metadata!.ltvHappyHorseModel = 'happy-horse-1.1';
    capabilityConfig.video.references.maxImages = 3;
    expect(() => assertCanvasGenerationRequirements(config, node, 'video', '看@图片1')).toThrow('数量不足');
});

test('HappyHorse reference requests outside the official and saved source contract stay rejected', () => {
    const base = { model: 'happy-horse-1.1', ratio: '4:3', resolution: '720P', duration: 7 };
    const refs = { image: 4, video: 0, audio: 0 };
    for (const fields of [{ model: 'happy-horse-2' }, { duration: 2 }, { duration: 16 }, { duration: 7.5 },
        { resolution: '2K' }, { ratio: '2:1' }, { enableSound: 'on' }, { search_enabled: true }]) {
        expect(configurableLtvOperation('video', 'image2video', { ...base, ...fields }, refs, 1)).toBeUndefined();
    }
    for (const counts of [{ ...refs, image: 0 }, { ...refs, image: 10 }, { ...refs, video: 1 }, { ...refs, audio: 1 }]) {
        expect(configurableLtvOperation('video', 'image2video', base, counts, 1)).toBeUndefined();
    }
    expect(configurableLtvOperation('video', 'image2video', base, refs, 2)).toBeUndefined();
});
