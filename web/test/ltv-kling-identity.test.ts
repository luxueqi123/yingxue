import { expect, test } from 'bun:test';
import { mapLtvKlingOptions } from '../src/lib/canvas/ltv-kling-options';
import { configurableLtvOperation } from '../src/lib/canvas/ltv-configurable-operation';
import { adaptLtvNativeProject } from '../src/lib/canvas/ltv-native-project';

const unverifiedModels = ['kling-v2-6'];

for (const model of unverifiedModels) {
    test(`${model} cannot inherit ordinary 3.0 or Omni contracts`, () => {
        for (const modeType of ['singleImage2video', 'frames2video', 'mixed2video', 'text2video']) {
            const fields = { model, modeType, resolution: '720p', quality: 'high', ratio: '16:9', duration: 5 };
            const counts = { image: modeType === 'text2video' ? 0 : modeType === 'frames2video' ? 2 : 1, video: 0, audio: 0 };
            expect(mapLtvKlingOptions(fields, counts, 1)).toBeUndefined();
            expect(configurableLtvOperation('video', modeType, fields, counts, 1)).toBeUndefined();
        }
    });

    test(`${model} stays unresolved with substitute video channels configured`, () => {
        const source = { nodes: [
            { id: 'frame', type: 'image', position: { x: 0, y: 0 }, data: { action: 'image_resource', url: ['https://example.com/original.png'] } },
            { id: 'video', type: 'video', position: { x: 400, y: 0 }, data: { action: 'video_generate', params: { model, modeType: 'singleImage2video', resolution: '720p', ratio: '16:9', duration: 5, count: 1, prompt: 'Original prompt', imageList: [{ nodeId: 'frame', url: 'https://example.com/original.png' }] } } },
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
        const issue = result.issues.find(issue => issue.nodeId === 'video' && issue.code === 'model-selection-required');
        expect(JSON.parse(issue!.detail)).toMatchObject({ sourceModel: model, operation: 'singleImage2video' });
        const node = result.project.nodes.find(node => node.id === 'video');
        expect(node?.metadata?.ltvExecutionContract).toBeUndefined();
        expect(node?.metadata?.model || '').toBe('');
        expect(result.adoptable).toBe(false);
    });
}

test('verified source 3.0 and Omni identities retain their separate contracts', () => {
    const fields = { modeType: 'singleImage2video', quality: 'high', ratio: '16:9', duration: 5 };
    const counts = { image: 1, video: 0, audio: 0 };
    expect(mapLtvKlingOptions({ ...fields, model: 'kling-video-o3' }, counts, 1)).toMatchObject({ ltvExecutionContract: 'kling-v3-video', videoKling: { mode: 'pro' } });
    expect(mapLtvKlingOptions({ ...fields, model: 'kling-v3-omni' }, counts, 1)).toMatchObject({ ltvExecutionContract: 'kling-omni-video', videoKling: { mode: 'pro' } });
});
