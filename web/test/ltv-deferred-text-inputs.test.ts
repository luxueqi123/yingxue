import { test } from 'node:test';
import assert from 'node:assert/strict';
import { adaptLtvNativeProject } from '../src/lib/canvas/ltv-native-project';
import { remapLtvReferencePlan, resolveLtvRuntimeTexts } from '../src/lib/canvas/ltv-runtime-references';
import type { CanvasNodeData } from '../src/types/canvas';

function snapshot() {
    return {
        nodes: [
            { id: 'upstream', type: 'text', position: { x: 0, y: 0 }, data: {
                action: 'text_generate', content: [], params: { model: 'source-text', prompt: '编写场景说明', count: 1 },
            } },
            { id: 'target', type: 'image', position: { x: 400, y: 0 }, data: {
                action: 'image_generate', url: [], params: {
                    model: 'source-image', modeType: 'text2image', prompt: '按上游说明绘制', count: 1,
                    textList: [{ nodeId: 'upstream', content: [] }],
                },
            } },
        ],
        edges: [{ source: 'upstream', target: 'target' }],
    };
}

test('empty saved generated text is a deferred dependency, not a damaged reference', () => {
    const source = snapshot(), before = JSON.stringify(source);
    const result = adaptLtvNativeProject(source, { channels: [] }, 'case', '待生成文字');
    assert.ok(!result.issues.some(issue => issue.code === 'invalid-text-input'), JSON.stringify(result.issues));
    const target = result.project.nodes.find(node => node.id === 'target')!;
    const plan = target.metadata!.ltvReferencePlan!;
    assert.deepEqual(plan.texts, [{ nodeId: 'upstream', content: '', deferred: true }]);
    assert.equal(result.project.connections.filter(edge => edge.fromNodeId === 'upstream' && edge.toNodeId === 'target').length, 1);
    assert.throws(() => resolveLtvRuntimeTexts(plan, result.project.nodes), /上游文字尚未生成成功/);
    for (const status of ['idle', 'running', 'error'] as const) {
        const nodes = structuredClone(result.project.nodes);
        Object.assign(nodes.find(node => node.id === 'upstream')!.metadata!, { status, content: '尚未确认的结果' });
        assert.throws(() => resolveLtvRuntimeTexts(plan, nodes), /上游文字尚未生成成功/);
    }
    const copied = JSON.parse(JSON.stringify(remapLtvReferencePlan(plan, new Map([['upstream', 'copy-upstream']]), true)));
    const upstream = { ...result.project.nodes.find(node => node.id === 'upstream')!, id: 'copy-upstream',
        metadata: { content: '真实上游生成正文', status: 'success' } } as CanvasNodeData;
    assert.deepEqual(resolveLtvRuntimeTexts(copied, [upstream]), ['真实上游生成正文']);
    upstream.metadata!.content = '';
    assert.throws(() => resolveLtvRuntimeTexts(copied, [upstream]), /上游文字尚未生成成功/);
    assert.equal(JSON.stringify(source), before);
});

test('malformed, missing and empty static text inputs are not accepted as generated dependencies', () => {
    for (const scenario of ['static', 'missing', 'wrong-type', 'object', 'number', 'null'] as const) {
        const source: any = snapshot();
        if (scenario === 'static') source.nodes[0].data.action = 'text_resource';
        if (scenario === 'missing') source.nodes.shift();
        if (scenario === 'wrong-type') { source.nodes[0].type = 'image'; source.nodes[0].data.action = 'image_generate'; }
        if (scenario === 'object') source.nodes[1].data.params.textList[0].content = {};
        if (scenario === 'number') source.nodes[1].data.params.textList[0].content = [7];
        if (scenario === 'null') source.nodes[1].data.params.textList[0].content = null;
        const result = adaptLtvNativeProject(source, { channels: [] }, 'case', scenario);
        assert.ok(result.issues.some(issue => issue.code === 'invalid-text-input'), scenario);
    }
});

test('a deferred saved slot reconstructs its edge and remains subject to cycle validation', () => {
    const source: any = snapshot();
    source.edges = [];
    source.nodes[1].data.params.textList[0].content = '';
    const result = adaptLtvNativeProject(source, { channels: [] }, 'case', '待生成输入');
    assert.ok(!result.issues.some(issue => issue.code === 'invalid-text-input'));
    assert.ok(result.project.connections.some(edge => edge.fromNodeId === 'upstream' && edge.toNodeId === 'target'));
    source.nodes[0].data.params.textList = [{ nodeId: 'upstream', content: [] }];
    const cyclic = adaptLtvNativeProject(source, { channels: [] }, 'case', '循环输入');
    assert.ok(cyclic.issues.some(issue => issue.code === 'cyclic-workflow' || issue.code === 'cyclic-reference-dependency'));
    assert.equal(cyclic.adoptable, false);
});
