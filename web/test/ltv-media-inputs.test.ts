import { test } from 'node:test';
import assert from 'node:assert/strict';
import { projectLtvMediaInputs, restoreLtvMediaMetadata, restoreLtvProjectAssetUrls } from '../src/lib/canvas/ltv-media-inputs';
import { buildLtvReferencePlan } from '../src/lib/canvas/ltv-reference-plan';

test('project-local asset identity restores missing URLs without copying other slot metadata', () => {
    const nodes = [{ data: { params: { imageList: [{ assetId: 'asset-one', url: 'https://example.test/original', width: 300 }] } } },
        { data: { params: { imageList: [{ nodeId: 'asset://asset-one', url: 'asset://asset-one', width: 900 }],
            mixedList: [{ mediaType: 'image', url: 'asset://asset-one' }] } } }];
    const before = JSON.stringify(nodes);
    const result = restoreLtvProjectAssetUrls(nodes);
    assert.deepEqual(result[1].data.params.imageList[0], { nodeId: 'asset://asset-one', url: 'asset://asset-one', width: 900, _httpUrl: 'https://example.test/original' });
    assert.equal(result[1].data.params.mixedList![0]._httpUrl, 'https://example.test/original');
    assert.equal(JSON.stringify(nodes), before);
    assert.equal(restoreLtvProjectAssetUrls([nodes[1]])[0].data.params.imageList[0]._httpUrl, undefined);
});

test('asset recovery rejects conflicting URLs, media kinds and unsafe locators', () => {
    const missing = { data: { params: { imageList: [{ url: 'asset://asset-one' }] } } };
    for (const params of [
        { imageList: [{ assetId: 'asset-one', url: 'https://example.test/a' }, { assetId: 'asset-one', url: 'https://example.test/b' }] },
        { videoList: [{ assetId: 'asset-one', url: 'https://example.test/a' }] },
        { imageList: [{ assetId: 'asset-one', url: 'javascript:alert(1)' }] },
        { imageList: [{ assetId: 'asset-one', nodeId: 'asset://asset-other', url: 'https://example.test/a' }] },
    ]) {
        assert.equal(restoreLtvProjectAssetUrls([{ data: { params } }, missing])[1].data.params.imageList![0]._httpUrl, undefined);
    }
    const existing = { data: { params: { imageList: [{ url: 'asset://asset-one', _httpUrl: 'https://example.test/explicit' }] } } };
    assert.equal(restoreLtvProjectAssetUrls([existing])[0].data.params.imageList[0]._httpUrl, 'https://example.test/explicit');
});

test('V2 restores selected asset metadata without adding stale versions or mutating source', () => {
    const input={videoList:[{nodeId:'clip',url:'asset://asset-clip',width:1280}],videoListV2:[{assetId:'asset://asset-clip',url:'https://example.test/clip',width:640,height:720,duration:4.25},{url:'https://example.test/stale',duration:9}],imageList:[],imageListV2:[{url:'https://example.test/stale-image'}]};
    const before=JSON.stringify(input),result=restoreLtvMediaMetadata(input);
    assert.deepEqual(result.videoList,[{assetId:'asset://asset-clip',nodeId:'clip',url:'asset://asset-clip',width:1280,height:720,duration:4.25,durationSec:4.25,_httpUrl:'https://example.test/clip'}]);
    assert.deepEqual(result.imageList,[]);assert.equal(result.videoListV2,undefined);assert.equal(result.imageListV2,undefined);assert.equal(JSON.stringify(input),before);
});

test('V2 duration reaches mixed references and explicit input metadata wins', () => {
    const result=projectLtvMediaInputs(restoreLtvMediaMetadata({modeType:'mixed2video',videoList:[{nodeId:'clip',url:['https://example.test/clip','https://example.test/old'],durationSec:5}],videoListV2:[{url:'https://example.test/clip',duration:4}],mixedList:[{nodeId:'clip',url:'https://example.test/clip',mediaType:'video'}]}));
    assert.equal((result.videoList as any[])[0].durationSec,5);
});

test('mixed mode uses the ordered mixed list and recovers metadata without stale typed slots', () => {
    const params={modeType:'mixed2video',prompt:'{{Mixed 1}} 与 {{Mixed 2}}',imageList:[{nodeId:'old',url:'https://example.test/old'},{nodeId:'image',url:'https://example.test/image',width:1920}],videoList:[{nodeId:'video',url:'https://example.test/video',durationSec:5}],mixedList:[{nodeId:'image',url:'https://example.test/image',mediaType:'image'},{nodeId:'video',url:'https://example.test/video',mediaType:'video'}],mixedListOrder:['video','image']};
    const before=JSON.stringify(params),projected=projectLtvMediaInputs(params);
    const plan=buildLtvReferencePlan(projected,new Map([['image',{kind:'image',urls:['https://example.test/image']}],['video',{kind:'video',urls:['https://example.test/video']}]]));
    assert.equal(plan.prompt,'@视频1 与 @图片1');assert.equal(plan.references.length,2);assert.equal(plan.references.find(ref=>ref.kind==='video')?.durationSec,5);
    assert.equal(JSON.stringify(params),before);
    assert.deepEqual(projected._ltvInactiveReferenceNodeIds,['old']);
});

test('inactive mixed selections do not override a different operation and unknown types fail', () => {
    const value={modeType:'text2video',mixedList:[{mediaType:'unknown'}]};
    assert.equal(projectLtvMediaInputs(value),value);
    assert.throws(()=>projectLtvMediaInputs({...value,modeType:'mixed2video'},'owner'),/未知媒体类型/);
});

test('external uploads preserve cross-media numbering even without original node IDs', () => {
    const result=projectLtvMediaInputs({modeType:'mixed2video',mixedList:[{mediaType:'video',url:'https://example.test/video'},{mediaType:'image',url:'https://example.test/image'}]},'owner');
    assert.deepEqual(result.mixedListOrder,['owner::mixed::0','owner::mixed::1']);
    assert.equal((result.videoList as any[])[0].nodeId,'owner::mixed::0');
    assert.equal((result.imageList as any[])[0].nodeId,'owner::mixed::1');
});
