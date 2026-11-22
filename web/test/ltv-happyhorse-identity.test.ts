import { expect, test } from 'bun:test';
import { mapLtvKlingOptions } from '../src/lib/canvas/ltv-kling-options';
import { configurableLtvOperation } from '../src/lib/canvas/ltv-configurable-operation';
import { adaptLtvNativeProject } from '../src/lib/canvas/ltv-native-project';

test('HappyHorse first frames cannot use a Kling protocol', () => {
    for (const model of ['happy-horse-1', 'happy-horse-1.1']) {
        const fields = { model, modeType: 'frames2video', resolution: '720P', ratio: '16:9', duration: 6 };
        const counts = { image: 1, video: 0, audio: 0 };
        expect(mapLtvKlingOptions(fields, counts, 1)).toBeUndefined();
        expect(configurableLtvOperation('video', fields.modeType, fields, counts, 1)).toBeUndefined();
    }
});

test('native HappyHorse first frames remain unresolved even with substitute video models configured', () => {
    const source = { nodes: [
        { id: 'frame', type: 'image', position: { x: 0, y: 0 }, data: { action: 'image_resource', url: ['https://example.com/original.png'] } },
        { id: 'video', type: 'video', position: { x: 400, y: 0 }, data: { action: 'video_generate', params: { model: 'happy-horse-1.1', modeType: 'frames2video', resolution: '720P', ratio: '16:9', duration: 6, count: 1, prompt: 'Original prompt', imageList: [{ nodeId: 'frame', url: 'https://example.com/original.png' }] } } },
    ], edges: [{ source: 'frame', target: 'video' }] };
    const original = structuredClone(source);
    const video = { operations: ['image_to_video'], ratios: ['16:9'], resolutions: ['720p'], duration: { min: 3, max: 15, step: 1 }, generateAudio: { supported: true }, references: { minImages: 1, maxImages: 2, maxVideos: 0, maxAudios: 0, promptMaxChars: 5000 } };
    const catalog = { channels: [{ id: 'substitute', enabled: true, models: [
        { modelKey: 'kling-v3', available: true, capability: 'video', protocol: 'kling-v3-video', capabilityConfig: { version: 1, video } },
        { modelKey: 'Artdance 2.5-720p', available: true, capability: 'video', protocol: 'newapi-channel-2', capabilityConfig: { version: 1, video } },
    ] }] };
    const result = adaptLtvNativeProject(source, catalog, 'identity-test', 'Identity test');
    expect(source).toEqual(original);
    expect(result.issues).toContainEqual(expect.objectContaining({ nodeId: 'video', code: 'model-selection-required' }));
    expect(JSON.parse(result.issues.find(issue => issue.nodeId === 'video' && issue.code === 'model-selection-required')!.detail)).toMatchObject({ sourceModel: 'happy-horse-1.1', operation: 'frames2video' });
    const node = result.project.nodes.find(node => node.id === 'video');
    expect(node?.metadata?.ltvExecutionContract).not.toBe('kling-v3-video');
    expect(node?.metadata?.model || '').toBe('');
    expect(result.adoptable).toBe(false);
});
