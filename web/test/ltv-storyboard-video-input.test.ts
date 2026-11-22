import { expect, test } from 'bun:test';
import { adaptLtvNativeProject } from '../src/lib/canvas/ltv-native-project';

const first = 'https://example.test/selected.png';
const other = 'https://example.test/other.png';
function source(fields: Record<string, unknown> = {}) {
    return { nodes: [
        { id: 'frame', type: 'image', position: { x: 0, y: 0 }, data: { action: 'image_resource', url: [first, other] } },
        { id: 'second', type: 'image', position: { x: 0, y: 300 }, data: { action: 'image_resource', url: [other] } },
        { id: 'video', type: 'video', position: { x: 400, y: 0 }, data: { action: 'video_generate', params: {
            model: 'kling-v3-omni', modeType: 'singleImage2video', prompt: '原镜头', count: 1,
            settings: { ratio: '16:9', duration: 5, quality: 'low', enableSound: 'on', multi_shot: false },
            scene: 'group-generate', image: first, imageList: [{ nodeId: 'frame', url: first }], ...fields,
        } } },
    ], edges: [{ source: 'frame', target: 'video' }] };
}
function adapt(fields: Record<string, unknown> = {}) {
    const input = source(fields), before = structuredClone(input);
    const result = adaptLtvNativeProject(input, { channels: [] }, 'input-mirror', '原生分镜视频');
    expect(input).toEqual(before);
    return result;
}

test('source storyboard video keeps one exact selected image without a second input', () => {
    const result = adapt();
    expect(result.issues.filter(i => i.code !== 'channel-configuration-required')).toEqual([]);
    expect(result.adoptable).toBe(true);
    const metadata = result.project.nodes.find(n => n.id === 'video')!.metadata;
    expect(metadata?.ltvReferencePlan?.references).toEqual([{ nodeId: 'frame', url: first, kind: 'image' }]);
    expect(metadata?.ltvExecutionContract).toBe('kling-omni-video');
});

test('another saved version, missing selection, multiple images or another scene remains blocked', () => {
    for (const fields of [
        { image: other }, { image: { url: first } },
        { imageList: [{ nodeId: 'frame', url: first }, { nodeId: 'second', url: other }] },
        { scene: 'unverified-scene' }, { modeType: 'text2video', imageList: [] },
        { image: other, imageList: [{ nodeId: 'frame', url: '' }] },
    ]) {
        const result = adapt(fields);
        expect(result.issues).toContainEqual(expect.objectContaining({ nodeId: 'video', code: 'unmapped-production-parameters', detail: expect.stringContaining('image') }));
        expect(result.adoptable).toBe(false);
    }
});

test('a deferred storyboard reference keeps its live binding and the same current first output', () => {
    const result = adapt({ imageList: [{ nodeId: 'frame', url: '' }] });
    expect(result.issues.filter(i => i.code !== 'channel-configuration-required')).toEqual([]);
    expect(result.adoptable).toBe(true);
    expect(result.project.nodes.find(n => n.id === 'video')?.metadata?.ltvReferencePlan?.references)
        .toEqual([{ nodeId: 'frame', url: '', kind: 'image', deferred: true }]);
});

test('a poster alone cannot invent a missing reference', () => {
    const input = source({ imageList: [] });
    input.edges = [];
    const result = adaptLtvNativeProject(input, { channels: [] }, 'missing-input', '原生分镜视频');
    expect(result.issues).toContainEqual(expect.objectContaining({ nodeId: 'video', code: 'unmapped-production-parameters', detail: expect.stringContaining('image') }));
    expect(result.adoptable).toBe(false);
});
