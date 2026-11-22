import { expect, test } from 'bun:test';
import { restoreLtvConnectedInputs, expandLtvGroupInputEdges, findLtvSavedReferenceOwner } from '../src/lib/canvas/ltv-connected-inputs';
import { adaptLtvNativeProject } from '../src/lib/canvas/ltv-native-project';

test('无节点ID的保存URL只恢复唯一真实入边，保留原视频版本而不新增重复输入', () => {
    const url = 'https://example.test/original.mp4';
    const source = { id: 'original', type: 'video', position: { x: 0, y: 0 }, data: { action: 'video_resource', url: [url] } };
    const target = { id: 'enhanced', type: 'video', position: { x: 400, y: 0 }, data: { action: 'video_generate', generatorType: 'enhance', params: { model: 'topaz-video-upscaler', resolution: '4K', specifiedModel: 'prob-4', fps: 30, slowmo: '1', videoList: [url], videoListV2: [{ url, width: 1470, height: 630, duration: 30.08 }] } } };
    const edges = [{ source: 'original', target: 'enhanced' }];
    expect(findLtvSavedReferenceOwner([source,target],edges,'enhanced','video',url)).toBe('original');
    expect(findLtvSavedReferenceOwner([source,target],edges,'enhanced','image',url)).toBeUndefined();
    expect(findLtvSavedReferenceOwner([source,target],edges,'enhanced','video',url+'?different=1')).toBeUndefined();
    expect(findLtvSavedReferenceOwner([source,target,{...source,id:'second'}],[...edges,{source:'second',target:'enhanced'}],'enhanced','video',url)).toBeUndefined();
    expect(findLtvSavedReferenceOwner([source,target],[{...edges[0],data:{assetVirtual:true}}],'enhanced','video',url)).toBeUndefined();
    const snapshot = {nodes:[source,target],edges};
    const before=JSON.stringify(snapshot);
    const result=adaptLtvNativeProject(snapshot,{channels:[]},'fixture','视频增强');
    expect(result.issues.filter(issue=>issue.code==='unbound-input')).toEqual([]);
    expect(result.project.nodes.some(node=>node.id.includes('::inline::'))).toBe(false);
    expect(JSON.stringify(snapshot)).toBe(before);
    // The Topaz Express contract and its retry/cancellation path were implemented after this test
    // was written, so an unconfigured channel now reports configuration-required (adoptable)
    // instead of a missing executor. Confirm the executor really is mapped, not merely assumed.
    expect(result.readiness.status).toBe('configuration-required');
    expect(result.adoptable).toBe(true);
    const settings = result.project.nodes.find(node => node.id === 'enhanced')?.metadata?.videoEnhancement;
    expect(settings).toEqual({ provider: 'topaz-video-enhance', model: 'prob-4', resolution: '4K', fps: 30, slowmo: 1 });
});

test('按源实际入边恢复空列表，保持类型、顺序及待生成依赖', () => {
    const target: any = { id: 'target', type: 'video', data: { params: { imageList: [], videoList: [], audioList: [] } } };
    const nodes = [target, { id: 'a', type: 'image', data: { url: ['https://example.test/a'], action: 'image_resource' } },
        { id: 'b', type: 'image', data: { url: ['https://example.test/previous'], action: 'image_generate' } },
        { id: 'v', type: 'video', data: { url: ['https://example.test/v'] }, resourceMeta: { items: [{ kind: 'video', durationSec: 4 }] } }];
    restoreLtvConnectedInputs(nodes, [{ source: 'b', target: 'target' }, { source: 'a', target: 'target' }, { source: 'v', target: 'target' }]);
    expect(target.data.params.imageList).toEqual([{ nodeId: 'b', url: '' }, { nodeId: 'a', url: 'https://example.test/a' }]);
    expect(target.data.params.videoList[0].durationSec).toBe(4);
});

test('不覆盖保存的版本、混合输入或推测原图；虚拟连线不变成生成输入', () => {
    for (const params of [{ imageList: [{ nodeId: 'saved', url: 'https://example.test/saved' }] }, { imageList: [], modeType: 'mixed2video', mixedList: [{ nodeId: 'saved' }] }]) {
        const target = { id: 'target', data: { params } };
        const before = JSON.stringify(params);
        restoreLtvConnectedInputs([target, { id: 'a', type: 'image', data: { url: ['https://example.test/a'] } }], [{ source: 'a', target: 'target' }]);
        expect(JSON.stringify(params)).toBe(before);
    }
    const target: any = { id: 'target', data: { params: {} } };
    restoreLtvConnectedInputs([target, { id: 'a', type: 'image', data: { url: ['https://example.test/a'], originalUrl: ['https://example.test/original'] } }], [{ source: 'a', target: 'target' }]);
    expect(target.data.params.imageList).toBeUndefined();
    restoreLtvConnectedInputs([target, { id: 'a', type: 'image', data: { url: ['https://example.test/a'] } }], [{ source: 'a', target: 'target', data: { assetVirtual: true } }]);
    expect(target.data.params.imageList).toBeUndefined();
});

test('原节点的直接参考图恢复为独立真实资源并解析原提示词编号', () => {
    const source = { nodes: [{ id: 'target', type: 'image', position: { x: 0, y: 0 }, data: { action: 'image_generate', refImages: ['https://example.test/ref'], params: { modeType: 'image2image', imageList: [], prompt: '参考{{Image 1}}', ratio: '1:1', resolution: '1K' } } }], edges: [] };
    const result = adaptLtvNativeProject(source, { channels: [] }, 'test', '参考');
    expect(result.adoptable).toBe(true);
    expect(result.project.nodes.find(node => node.id === 'target:ref-0')?.metadata?.content).toBe('https://example.test/ref');
    expect(result.project.nodes.find(node => node.id === 'target')?.metadata?.prompt).toBe('参考@图片1');
});

test('分组引用按真实父级和源顺序展开，排除项仅影响组内节点，不取失效成员表', () => {
    const nodes: any[] = [
        { id: 'group', type: 'group', data: { childNodeIds: ['foreign'] } },
        { id: 'first', type: 'image', parentId: 'group' },
        { id: 'nested', type: 'group', parentId: 'group' },
        { id: 'second', type: 'image', parentId: 'nested' },
        { id: 'excluded', type: 'image', parentId: 'nested' },
        { id: 'foreign', type: 'image' },
        { id: 'target', type: 'image', data: { action: 'image_generate', groupRefExcludedNodeIds: ['excluded', 'foreign'] } },
    ];
    const edges = [{ source: 'group', target: 'target' }, { source: 'second', target: 'target' }, { source: 'foreign', target: 'target' }];
    const before = JSON.stringify({ nodes, edges });
    expect(expandLtvGroupInputEdges(nodes, edges).map(edge => edge.source)).toEqual(['first', 'second', 'foreign']);
    expect(JSON.stringify({ nodes, edges })).toBe(before);
});

test('分组依赖进入可执行引用，原frame及成员布局保持', () => {
    const result = adaptLtvNativeProject({ nodes: [
        { id: 'group', type: 'group', position: { x: 100, y: 100 }, data: { childNodeIds: ['ref'] } },
        { id: 'ref', type: 'image', parentId: 'group', position: { x: 10, y: 20 }, data: { action: 'image_resource', url: ['https://example.test/a'] } },
        { id: 'out', type: 'image', position: { x: 600, y: 100 }, data: { action: 'image_generate', params: { prompt: '参考{{Image 1}}', imageList: [], modeType: 'image2image', ratio: '1:1', resolution: '1K' } } },
    ], edges: [{ source: 'group', target: 'out' }] }, { channels: [] }, 'test', '分组');
    expect(result.adoptable).toBe(true);
    expect(result.project.nodes.find(node => node.id === 'group')?.type).toBe('frame');
    expect(result.project.nodes.find(node => node.id === 'ref')?.position).toEqual({ x: 110, y: 120 });
    expect(result.project.nodes.find(node => node.id === 'out')?.metadata?.ltvReferencePlan?.references[0].nodeId).toBe('ref');
    expect(result.project.connections.map(edge => [edge.fromNodeId, edge.toNodeId])).toEqual([['ref', 'out']]);
});

test('资源图按原保护状态选版本，保留展示文件，不替换受保护图片', () => {
    for (const protectionType of [undefined, 'watermark', 'hidden']) {
        const result = adaptLtvNativeProject({ nodes: [
            { id: 'ref', type: 'image', position: { x: 0, y: 0 }, data: { action: 'image_resource', url: ['https://example.test/display'], originalUrl: ['https://example.test/original'], protectionType } },
            { id: 'out', type: 'image', position: { x: 400, y: 0 }, data: { action: 'image_generate', params: { prompt: '参考{{Image 1}}', imageList: [], modeType: 'image2image', ratio: '1:1', resolution: '1K' } } },
        ], edges: [{ source: 'ref', target: 'out' }] }, { channels: [] }, 'test', '图像');
        expect(result.adoptable).toBe(true);
        const plan = result.project.nodes.find(node => node.id === 'out')!.metadata!.ltvReferencePlan!;
        expect(plan.references[0].url).toBe(protectionType ? 'https://example.test/display' : 'https://example.test/original');
        expect(result.project.nodes.find(node => node.id === 'ref')!.metadata!.content).toBe('https://example.test/display');
    }
});
