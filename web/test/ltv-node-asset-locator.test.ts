import { test } from 'node:test';
import assert from 'node:assert/strict';
import { restoreLtvProjectAssetUrls } from '../src/lib/canvas/ltv-media-inputs';
import { adaptLtvNativeProject } from '../src/lib/canvas/ltv-native-project';
import { remapLtvReferencePlan, resolveLtvRuntimeReferences } from '../src/lib/canvas/ltv-runtime-references';
import type { CanvasNodeData } from '../src/types/canvas';

test('source node asset identity restores the same saved image without changing source or reference metadata', () => {
    const input = [{ id: 'image', type: 'image', data: { type: 'image', action: 'image_generate',
        portraitAssetId: 'asset-character', url: ['https://example.test/character'] } },
    { id: 'consumer', data: { params: { imageList: [{ url: 'asset://asset-character', width: 720 }],
        mixedList: [{ mediaType: 'image', url: 'asset://asset-character', label: 'saved selection' }] } } }];
    const before = JSON.stringify(input);
    const result = restoreLtvProjectAssetUrls(input);
    assert.deepEqual(result[1].data.params.imageList[0], { url: 'asset://asset-character', width: 720, _httpUrl: 'https://example.test/character' });
    assert.equal(result[1].data.params.mixedList[0]._httpUrl, 'https://example.test/character');
    assert.equal(result[1].data.params.mixedList[0].label, 'saved selection');
    assert.equal(JSON.stringify(input), before);
});

test('video and audio asset identities remain media-scoped and never use a poster', () => {
    const input = [{ id: 'video', type: 'video', data: { type: 'video', assetVideoAssetId: 'asset-shared',
        url: ['https://example.test/clip'], poster: 'https://example.test/poster' } },
    { id: 'audio', type: 'audio', data: { type: 'audio', assetAudioAssetId: 'asset-shared', url: ['https://example.test/music'] } },
    { data: { params: { imageList: [{ url: 'asset://asset-shared' }], videoList: [{ url: 'asset://asset-shared' }], audioList: [{ url: 'asset://asset-shared' }] } } }];
    const result = restoreLtvProjectAssetUrls(input)[2].data.params;
    assert.equal(result.videoList[0]._httpUrl, 'https://example.test/clip');
    assert.equal(result.audioList[0]._httpUrl, 'https://example.test/music');
    assert.equal(result.imageList[0]._httpUrl, undefined);
});

test('source protection state determines whether the first original or visible image is selected', () => {
    for (const protectionType of [undefined, '', 'hidden', 'watermark']) {
        const node = { type: 'image', data: { type: 'image', protectionType, portraitAssetId: 'asset-image',
            url: ['https://example.test/visible', 'https://example.test/other-output'], originalUrl: ['https://example.test/original'] } };
        const ref = { data: { params: { imageList: [{ url: 'asset://asset-image' }] } } };
        const result = restoreLtvProjectAssetUrls([node, ref]);
        assert.equal(result[1].data.params.imageList[0]._httpUrl,
            protectionType === 'hidden' || protectionType === 'watermark' ? 'https://example.test/visible' : 'https://example.test/original');
    }
});

test('node locators do not defeat ambiguity, unsafe URLs, identity mismatches or explicit selections', () => {
    const ref = { data: { params: { imageList: [{ url: 'asset://asset-image' }] } } };
    const image = { type: 'image', data: { type: 'image', portraitAssetId: 'asset-image', url: ['https://example.test/a'] } };
    for (const nodes of [
        [image, { data: { params: { imageList: [{ assetId: 'asset-image', url: 'https://example.test/b' }] } } }],
        [image, { ...image, data: { ...image.data, url: ['https://example.test/b'] } }],
        [{ ...image, data: { ...image.data, url: ['javascript:alert(1)'] } }],
        [{ ...image, type: 'video' }],
        [{ ...image, data: { ...image.data, portraitAssetId: 'not-a-saved-asset' } }],
        [{ type: 'image', data: { type: 'image', portraitAssetId: 'asset-image', poster: 'https://example.test/poster' } }],
    ]) {
        assert.equal(restoreLtvProjectAssetUrls([...nodes, ref]).at(-1)!.data.params.imageList[0]._httpUrl, undefined);
    }
    const selected = { data: { params: { imageList: [{ url: 'asset://asset-image', _httpUrl: 'https://example.test/explicit' }] } } };
    assert.equal(restoreLtvProjectAssetUrls([image, selected])[1].data.params.imageList[0]._httpUrl, 'https://example.test/explicit');
    assert.equal(restoreLtvProjectAssetUrls([ref])[0].data.params.imageList[0]._httpUrl, undefined);
});

test('node asset recovery reaches native import, runtime and copy guards with the exact saved version', () => {
    const snapshot = { nodes: [
        { id: 'saved', type: 'image', position: { x: 0, y: 0 }, data: { type: 'image', action: 'image_resource',
            portraitAssetId: 'asset-image', url: ['https://example.test/saved.png'] } },
        { id: 'target', type: 'image', position: { x: 500, y: 0 }, data: { type: 'image', action: 'image_generate',
            params: { model: 'source-image-model', modeType: 'image2image', prompt: '{{Image 1}}', count: 1,
                settings: { ratio: '1:1', resolution: '2K' }, imageList: [{ nodeId: 'asset://asset-image', url: 'asset://asset-image' }] } } },
    ], edges: [] };
    const before = JSON.stringify(snapshot);
    const result = adaptLtvNativeProject(snapshot, { channels: [] }, 'case', '案例');
    assert.equal(result.issues.some(issue => issue.code === 'invalid-reference'), false);
    const nodes = result.project.nodes as CanvasNodeData[];
    const target = nodes.find(node => node.id === 'target')!;
    const plan = target.metadata!.ltvReferencePlan!;
    assert.equal(plan.references.length, 1);
    assert.equal(plan.references[0].url, 'https://example.test/saved.png');
    assert.ok(result.project.connections.some(edge => edge.fromNodeId === plan.references[0].nodeId && edge.toNodeId === 'target'));
    const refs = resolveLtvRuntimeReferences(plan, nodes, target.metadata!.prompt!);
    assert.equal(refs[0].metadata!.content, 'https://example.test/saved.png');
    const copied = nodes.map(node => ({ ...node, id: 'copy-' + node.id }));
    const ids = new Map(nodes.map(node => [node.id, 'copy-' + node.id]));
    const copiedPlan = remapLtvReferencePlan(plan, ids, true);
    assert.equal(resolveLtvRuntimeReferences(copiedPlan, copied, target.metadata!.prompt!)[0].id, 'copy-' + refs[0].id);
    const reopened = JSON.parse(JSON.stringify(copied)) as CanvasNodeData[];
    assert.equal(resolveLtvRuntimeReferences(copiedPlan, reopened, target.metadata!.prompt!)[0].metadata!.content, 'https://example.test/saved.png');
    reopened.find(node => node.id === 'copy-' + refs[0].id)!.metadata!.content = 'https://example.test/changed.png';
    assert.throws(() => resolveLtvRuntimeReferences(copiedPlan, reopened, target.metadata!.prompt!), /版本已变化/);
    assert.equal(JSON.stringify(snapshot), before);
});
