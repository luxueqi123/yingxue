import { expect, test } from 'bun:test';
import { adaptLtvNativeProject } from '../src/lib/canvas/ltv-native-project';
import { mapLtvAngleOperation, isLtvAngleOperation } from '../src/lib/canvas/ltv-angle-operation';
import { buildAngleLabel } from '../src/lib/canvas/canvas-project-domain';

const catalog = { channels: [{ id: 'native', models: [{ modelKey: 'native-image', available: true, capability: 'image', protocol: 'openai-image', capabilityConfig: { image: { maxOutputs: 4, references: { maxImages: 4, promptMaxChars: 4000 }, size: { values: ['1:1', '2048x2048'] }, quality: { values: ['high', 'medium', 'auto'] } } } }] }] };
const snapshot = (params: Record<string, unknown> = {}) => ({
    nodes: [{ id: 'origin', type: 'image', position: { x: 0, y: 0 }, data: { action: 'image_resource', url: ['https://example.test/origin.png'] } },
        { id: 'angle', type: 'image', position: { x: 400, y: 0 }, data: { action: 'image_generate', name: '多角度', params: {
            modeType: 'image2image', prompt: '', images: ['https://example.test/origin.png'],
            imageList: [{ nodeId: 'origin', url: 'https://example.test/origin.png' }],
            horizontal_angle: '45', vertical_angle: '-30', zoom: '5', infiniteSwitch: 0, ...params,
        } } }],
    edges: [{ id: 'e1', source: 'origin', target: 'angle' }] as any[],
});

test('源多角度请求映射到映雪多角度面板，角度指令进入可编辑提示词', () => {
    const result = adaptLtvNativeProject(snapshot(), catalog, 'case', '案例');
    expect(result.adoptable).toBe(true);
    expect(result.issues.map(issue => issue.code)).not.toContain('unmapped-production-parameters');
    const node = result.project.nodes.find(node => node.id === 'angle')!;
    // The host angle panel writes exactly this prompt, so the imported node stays editable there.
    const expected = buildAngleLabel({ horizontalAngle: 45, pitchAngle: -30, cameraDistance: 5, wideAngle: false });
    expect(node.metadata!.prompt).toContain(expected);
    expect(node.metadata!.prompt).toContain('基于参考图重新生成同一主体的新视角');
    // The source picture stays the node's real reference, not a fabricated one.
    expect(node.metadata!.ltvReferencePlan!.references.map(ref => ref.nodeId)).toEqual(['origin']);
    expect(result.project.connections.some(edge => edge.fromNodeId === 'origin' && edge.toNodeId === 'angle')).toBe(true);
});

test('图片镜像只能匹配实际选中的版本，不能接受节点中的其它历史版本', () => {
    const other = 'https://example.test/other.png';
    const source = snapshot({ images: [other] });
    source.nodes[0].data.url!.push(other);
    const before = JSON.stringify(source);
    const result = adaptLtvNativeProject(source, catalog, 'case', '案例');
    expect(result.issues.some(issue => issue.code === 'unmapped-production-parameters' && issue.detail === 'images')).toBe(true);
    expect(JSON.stringify(source)).toBe(before);

    const selected = snapshot({ images: [other], imageList: [{ nodeId: 'origin', url: other }] });
    selected.nodes[0].data.url!.push(other);
    const matching = adaptLtvNativeProject(selected, catalog, 'case', '案例');
    expect(matching.issues.some(issue => issue.code === 'unmapped-production-parameters')).toBe(false);
    expect(matching.project.nodes.find(node => node.id === 'angle')!.metadata!.ltvReferencePlan!.references[0].url).toBe(other);
});

test('图片镜像保留引用顺序和数量，不把重排或重复输入当成等价', () => {
    for (const images of [
        ['https://example.test/second.png', 'https://example.test/origin.png'],
        ['https://example.test/origin.png', 'https://example.test/origin.png'],
        ['https://example.test/origin.png'],
        ['https://example.test/origin.png', 'https://example.test/second.png'],
    ]) {
        const source = snapshot({ images, imageList: [
            { nodeId: 'origin', url: 'https://example.test/origin.png' },
            { nodeId: 'second', url: 'https://example.test/second.png' },
        ] });
        source.nodes.push({ id: 'second', type: 'image', position: { x: 0, y: 300 }, data: { action: 'image_resource', url: ['https://example.test/second.png'] } });
        source.edges.push({ id: 'e2', source: 'second', target: 'angle' });
        const result = adaptLtvNativeProject(source, catalog, 'case', '案例');
        const sameInputs = images.length === 2 && images[0] === 'https://example.test/origin.png' && images[1] === 'https://example.test/second.png';
        expect(result.issues.some(issue => issue.code === 'unmapped-production-parameters' && issue.detail === 'images')).toBe(!sameInputs);
    }
});

test('生成依赖镜像首个保存输出，同时保留运行时等待语义', () => {
    const source = snapshot();
    Object.assign(source.nodes[0].data, { action: 'image_generate', params: { model: 'source-private-name', modeType: 'text2image', prompt: '原图' } });
    source.nodes[0].data.url!.push('https://example.test/history.png');
    const result = adaptLtvNativeProject(source, catalog, 'case', '案例');
    expect(result.issues.some(issue => issue.nodeId === 'angle' && issue.code === 'unmapped-production-parameters')).toBe(false);
    const ref = result.project.nodes.find(node => node.id === 'angle')!.metadata!.ltvReferencePlan!.references[0];
    expect(ref.deferred).toBe(true);
    expect(ref.url).toBe('');
});

test('编辑器写入的值按源端语义换算，不做静默取整或改写', () => {
    // Source 0wllgknwomk2u.js: horizontal_angle=(rotation%360+360)%360, zoom=scale/10 (0 全景 → 10 特写).
    expect(mapLtvAngleOperation({ horizontal_angle: '315', vertical_angle: '0', zoom: '5' })).toMatchObject({
        source: { horizontalAngle: 315, verticalAngle: 0, zoom: 5 },
        host: { horizontalAngle: -45, pitchAngle: 0, cameraDistance: 5, wideAngle: false },
    });
    // zoom 0 is the panorama end of the source scale, so it becomes the farthest host distance.
    expect(mapLtvAngleOperation({ horizontal_angle: '0', vertical_angle: '0', zoom: '0' })!.host.cameraDistance).toBe(10);
    expect(mapLtvAngleOperation({ horizontal_angle: '0', vertical_angle: '0', zoom: '10' })!.host.cameraDistance).toBe(1);
    expect(isLtvAngleOperation({ horizontal_angle: '0', vertical_angle: '0', zoom: '5' })).toBe(true);
    expect(isLtvAngleOperation({ horizontal_angle: '0', zoom: '5' })).toBe(false);
});

test('无法表达的角度值保持上报，不能被丢弃或猜成默认值', () => {
    for (const params of [{ horizontal_angle: '45', vertical_angle: '0', zoom: '-1' }, { horizontal_angle: '45', vertical_angle: '0', zoom: '11' }, { horizontal_angle: '45', vertical_angle: '90', zoom: '5' }, { horizontal_angle: '', vertical_angle: '0', zoom: '5' }]) {
        expect(mapLtvAngleOperation(params)).toBeNull();
        const result = adaptLtvNativeProject(snapshot(params), catalog, 'case', '案例');
        expect(result.issues.some(issue => issue.code === 'unmapped-production-parameters' && issue.detail.includes('zoom') || issue.detail.includes('vertical_angle') || issue.detail.includes('horizontal_angle'))).toBe(true);
    }
});

test('角度节点保留原有其他参数要求，不靠映射抹掉真实缺口', () => {
    const result = adaptLtvNativeProject(snapshot({ fineTuneModels: ['x'] }), catalog, 'case', '案例');
    expect(result.issues.some(issue => issue.code === 'unmapped-production-parameters' && issue.detail === 'fineTuneModels')).toBe(true);
});
