import { expect, test } from 'bun:test';
import { adaptLtvNativeProject } from '../src/lib/canvas/ltv-native-project';
import { ltvMaskEditMask, prepareLtvMaskEditInputs, remapLtvMaskEditMedia } from '../src/lib/canvas/ltv-mask-edit';
import { assertCanvasGenerationRequirements } from '../src/lib/canvas/canvas-project-generation';
import { defaultConfig, type AiConfig } from '../src/stores/use-config-store';

const sourceUrl = 'https://example.test/source.png';
const markUrl = 'https://example.test/mark.png';
const erasedUrl = 'https://example.test/erased.png';
const source = (scene: 'erase' | 'redraw', overrides: Record<string, unknown> = {}) => ({
    nodes: [
        { id: 'source', type: 'image', position: { x: 0, y: 0 }, data: { action: 'image_resource', url: [sourceUrl] } },
        { id: 'edit', type: 'image', position: { x: 400, y: 0 }, resourceMeta: { items: [{ width: 2752, height: 1536 }] }, data: { action: 'image_generate', params: {
            modeType: 'image2image', scene, originImage: scene === 'erase' ? erasedUrl : sourceUrl,
            ...(scene === 'redraw' ? { mark: markUrl, prompt: 'Change only the selected area' } : {}),
            ratio: '16:9', quality: '2K', n: 2, infiniteSwitch: 0, ...overrides,
        } } },
    ], edges: [{ id: 'edge', source: 'source', target: 'edit' }],
});

test('square erase retains its declared output pixels and the saved composited input', () => {
    const snapshot = source('erase', { ratio: '1:1', n: 1 });
    snapshot.nodes[1].resourceMeta = { items: [{ width: 2048, height: 2048 }] };
    const result = adaptLtvNativeProject(snapshot, { channels: [] }, 'square', 'Square erase');
    expect(result.adoptable, JSON.stringify(result.issues)).toBe(true);
    expect(result.project.nodes.find(node => node.id === 'edit')?.metadata).toMatchObject({
        size: '2048x2048', count: 1, ltvExecutionContract: 'ltv-mask-edit',
        ltvMaskEdit: { scene: 'erase', sourceUrl, maskUrl: erasedUrl, outputSize: '2048x2048' },
    });
    snapshot.nodes[1].resourceMeta = { items: [{ width: 2048, height: 1024 }] };
    expect(adaptLtvNativeProject(snapshot, { channels: [] }, 'mismatch', 'Mismatch').adoptable).toBe(false);
});

test('standalone portrait redraw restores its explicit input and retains exact 4K output', () => {
    const snapshot = source('redraw', { ratio: '3:4', quality: '4K', n: 1, imageList: [], textList: [], videoList: [], audioList: [] });
    snapshot.nodes = [snapshot.nodes[1]];
    snapshot.edges = [];
    snapshot.nodes[0].resourceMeta = { items: [{ width: 3584, height: 4800 }] };
    const before = JSON.stringify(snapshot);
    const result = adaptLtvNativeProject(snapshot, { channels: [] }, 'portrait', 'Portrait redraw');
    expect(result.adoptable, JSON.stringify(result.issues)).toBe(true);
    const node = result.project.nodes.find(n => n.id === 'edit')!;
    expect(node.metadata).toMatchObject({ size: '3584x4800', count: 1, ltvExecutionContract: 'ltv-mask-edit',
        ltvMaskEdit: { scene: 'redraw', sourceUrl, maskUrl: markUrl, sourceQuality: '4K', outputSize: '3584x4800' } });
    expect(node.metadata?.ltvReferencePlan?.references).toHaveLength(1);
    expect(result.project.connections.some(e => e.toNodeId === 'edit')).toBe(true);
    expect(JSON.stringify(snapshot)).toBe(before);
    for (const patch of [{ quality: '3K' }, { ratio: '4:3' }, { mark: '' }, { mark: 'https://user:secret@example.test/mark.png' }, { imageList: 'invalid' }]) {
        const invalid = structuredClone(snapshot);
        Object.assign(invalid.nodes[0].data.params!, patch);
        expect(adaptLtvNativeProject(invalid, { channels: [] }, 'invalid', 'Invalid redraw').adoptable).toBe(false);
    }
});

test('erase submission uses the exact composite for both image and mask without stale original bytes', () => {
    const node = adaptLtvNativeProject(source('erase'), { channels: [] }, 'case', 'Erase').project.nodes.find(n => n.id === 'edit')!;
    const references = [{ id: 'source', name: 'original.png', type: 'image/png', url: sourceUrl, dataUrl: 'data:image/png;base64,AAAA', storageKey: 'original-cache' }];
    const before = JSON.stringify(references);
    const prepared = prepareLtvMaskEditInputs(node.metadata, references);
    expect(prepared.references).toEqual([{ id: 'source', name: 'ltv-erase-composite.png', type: 'image/png', dataUrl: '', url: erasedUrl }]);
    expect(prepared.mask?.url).toBe(erasedUrl);
    expect(JSON.stringify(references)).toBe(before);
    expect(prepareLtvMaskEditInputs(JSON.parse(JSON.stringify(node.metadata)), references)).toEqual(prepared);
    expect(() => prepareLtvMaskEditInputs(node.metadata, [{ ...references[0], url: 'https://example.test/changed.png' }])).toThrow('原图已变化');
    const hydrated = [{ ...references[0], url: undefined }];
    const owner = { ...node, id: 'source', metadata: { content: sourceUrl } };
    expect(prepareLtvMaskEditInputs(node.metadata, hydrated, [owner])).toEqual(prepared);
    expect(() => prepareLtvMaskEditInputs(node.metadata, hydrated)).toThrow('原图已变化');
    expect(() => prepareLtvMaskEditInputs(node.metadata, hydrated, [{ ...owner, metadata: { content: 'https://example.test/changed.png' } }])).toThrow('原图已变化');
    const redraw = adaptLtvNativeProject(source('redraw'), { channels: [] }, 'case', 'Redraw').project.nodes.find(n => n.id === 'edit')!;
    expect(prepareLtvMaskEditInputs(redraw.metadata, references).references).toBe(references);
});

test('submission requires a mask-capable protocol and never reduces the preserved pixel size', () => {
    const node = adaptLtvNativeProject(source('redraw'), { channels: [] }, 'case', 'Grid').project.nodes.find(item => item.id === 'edit')!;
    const model = 'native::image';
    node.metadata!.model = model;
    const capabilityConfig = { version: 1, image: {
        references: { promptMaxChars: 1000, maxImages: 1, maxImageBytes: 10000000, maskSupported: true },
        size: { parameter: 'size', values: ['2752x1536', '1024x1024'], default: '2752x1536', allowCustom: false },
        quality: { supported: true, values: ['high'], default: 'high' },
        transparentBackground: { supported: false, default: false }, responseFormat: { supported: true },
        outputFormat: { supported: true }, maxOutputs: 2,
    } };
    const config = { ...defaultConfig, model, size: '2752x1536', quality: 'high', count: '2', models: [model], imageModels: [model],
        channels: [{ id: 'native', name: 'fixture', enabled: true, apiFormat: 'openai', baseUrl: '/api', models: ['image'],
            modelCosts: [{ model: 'image', capability: 'image', protocol: 'openai-image', capabilityConfig }] }],
    } as unknown as AiConfig;
    expect(() => assertCanvasGenerationRequirements(config, node, 'image', 'Only edit the mask')).not.toThrow();
    expect(() => assertCanvasGenerationRequirements({ ...config, size: '1024x1024' }, node, 'image')).toThrow('画幅');
    capabilityConfig.image.references.maskSupported = false;
    expect(() => assertCanvasGenerationRequirements(config, node, 'image')).toThrow('蒙版');
    capabilityConfig.image.references.maskSupported = true;
    config.channels[0].modelCosts![0].protocol = 'gemini-image';
    expect(() => assertCanvasGenerationRequirements(config, node, 'image')).toThrow('蒙版');
    config.channels[0].modelCosts![0].protocol = 'openai-image';
    node.metadata!.ltvMaskEdit!.sourceQuality = '4K';
    node.metadata!.ltvMaskEdit!.outputSize = '3584x4800';
    node.metadata!.size = config.size = '3584x4800';
    expect(() => assertCanvasGenerationRequirements(config, node, 'image')).toThrow('精确输出尺寸');
    capabilityConfig.image.size.values.push('3584x4800');
    expect(() => assertCanvasGenerationRequirements(config, node, 'image')).not.toThrow();
    expect(() => assertCanvasGenerationRequirements({ ...config, size: '2752x1536' }, node, 'image')).toThrow('画幅');
});

test('erase retains transparent originImage as mask and supplies the native inpainting instruction', () => {
    const result = adaptLtvNativeProject(source('erase'), { channels: [] }, 'case', 'Grid');
    const node = result.project.nodes.find(item => item.id === 'edit')!;
    expect(result.issues.filter(issue => issue.nodeId === 'edit').map(issue => issue.code)).toEqual(['channel-configuration-required']);
    expect(node.metadata?.ltvMaskEdit).toEqual({ scene: 'erase', sourceUrl, maskUrl: erasedUrl, sourceQuality: '2K', outputSize: '2752x1536' });
    expect(node.metadata?.size).toBe('2752x1536');
    expect(node.metadata?.quality).toBeUndefined();
    expect(node.metadata?.ltvReferencePlan?.references.map(ref => ref.nodeId)).toEqual(['source']);
    expect(node.metadata?.prompt).toContain('transparent masked area');
    expect(node.metadata?.ltvExecutionContract).toBe('ltv-mask-edit');
});

test('redraw sends saved mark as mask rather than another image reference', () => {
    const result = adaptLtvNativeProject(source('redraw'), { channels: [] }, 'case', 'Grid');
    const node = result.project.nodes.find(item => item.id === 'edit')!;
    expect(result.issues.filter(issue => issue.nodeId === 'edit').map(issue => issue.code)).toEqual(['channel-configuration-required']);
    expect(node.metadata?.ltvMaskEdit).toEqual({ scene: 'redraw', sourceUrl, maskUrl: markUrl, sourceQuality: '2K', outputSize: '2752x1536' });
    expect(node.metadata?.ltvReferencePlan?.references).toHaveLength(1);
    expect(node.metadata?.prompt).toBe('Change only the selected area');
    expect(ltvMaskEditMask(node.metadata, [{ id: 'source', name: 'source.png', type: 'image/png', dataUrl: sourceUrl }])?.url).toBe(markUrl);
    expect(() => ltvMaskEditMask(node.metadata, [{ id: 'source', name: 'source.png', type: 'image/png', dataUrl: 'https://example.test/changed.png' }])).toThrow(/原图已变化/);
});

test('missing mark or unrelated saved requirements remain blockers', () => {
    const missing = adaptLtvNativeProject(source('redraw', { mark: '' }), { channels: [] }, 'case', 'Grid');
    expect(missing.issues.some(issue => issue.nodeId === 'edit' && issue.code === 'unmapped-production-parameters')).toBe(true);
    const extra = adaptLtvNativeProject(source('redraw', { focusRegion: { x: 1 } }), { channels: [] }, 'case', 'Grid');
    expect(extra.issues.some(issue => issue.nodeId === 'edit' && issue.code === 'unmapped-production-parameters' && issue.detail.includes('focusRegion'))).toBe(true);
});

test('erase submits originImage and ignores its source-only watermark mirror without using it as a fallback', () => {
    const mirror = 'https://example.test/wm/erased.png';
    const snapshot = source('erase', { originImage_wm: mirror });
    const before = JSON.stringify(snapshot);
    const result = adaptLtvNativeProject(snapshot, maskCatalog(), 'case', 'Erase mirror');
    expect(result.issues).toEqual([]);
    expect(result.project.nodes.find(node => node.id === 'edit')?.metadata?.ltvMaskEdit?.maskUrl).toBe(erasedUrl);
    expect(JSON.stringify(result.project)).not.toContain(mirror);
    expect(JSON.stringify(snapshot)).toBe(before);
    const missing = adaptLtvNativeProject(source('erase', { originImage: '', originImage_wm: mirror }), maskCatalog(), 'case', 'Missing actual input');
    expect(missing.adoptable).toBe(false);
    expect(missing.project.nodes.find(node => node.id === 'edit')?.metadata?.ltvMaskEdit).toBeUndefined();
    const redraw = adaptLtvNativeProject(source('redraw', { originImage_wm: mirror }), maskCatalog(), 'case', 'Other operation');
    expect(redraw.issues.some(issue => issue.code === 'unmapped-production-parameters' && issue.detail.includes('originImage_wm'))).toBe(true);
});

test('cleaned source and mask URLs remap together, never one without the other', () => {
    const result = adaptLtvNativeProject(source('redraw'), { channels: [] }, 'case', 'Grid');
    expect(() => remapLtvMaskEditMedia(result.project.nodes, { [sourceUrl]: '/production-library/clean/source.png' })).toThrow(/同时映射/);
    const nodes = remapLtvMaskEditMedia(result.project.nodes, {
        [sourceUrl]: '/production-library/clean/source.png',
        [markUrl]: '/production-library/clean/mark.png',
    });
    const edited = nodes.find(node => node.id === 'edit')!;
    expect(nodes.find(node => node.id === 'source')?.metadata?.content).toBe('/production-library/clean/source.png');
    expect(edited.metadata?.ltvMaskEdit?.sourceUrl).toBe('/production-library/clean/source.png');
    expect(edited.metadata?.ltvMaskEdit?.maskUrl).toBe('/production-library/clean/mark.png');
    expect(edited.metadata?.ltvReferencePlan?.references[0].url).toBe('/production-library/clean/source.png');
    expect(ltvMaskEditMask(edited.metadata, [{ id: 'source', name: 'source.png', type: 'image/png', dataUrl: '/production-library/clean/source.png' }])?.url).toBe('/production-library/clean/mark.png');
});

test('a chained edit keeps both its own remapped mask and its remapped output for the next edit', () => {
    const initial = adaptLtvNativeProject(source('redraw'), { channels: [] }, 'case', 'Grid').project.nodes;
    const intermediate = 'https://example.test/intermediate.png';
    const nextMask = 'https://example.test/next-mask.png';
    const first = initial.find(node => node.id === 'edit')!;
    first.metadata = { ...first.metadata, content: intermediate };
    const second = { ...first, id: 'second', metadata: { ...first.metadata,
        ltvMaskEdit: { ...first.metadata!.ltvMaskEdit!, sourceUrl: intermediate, maskUrl: nextMask },
        ltvReferencePlan: { prompt: 'Next edit', references: [{ nodeId: 'edit', kind: 'image' as const, url: intermediate }] },
    } };
    const nodes = remapLtvMaskEditMedia([...initial, second], {
        [sourceUrl]: '/production-library/clean/source.png', [markUrl]: '/production-library/clean/mark.png',
        [intermediate]: '/production-library/clean/intermediate.png', [nextMask]: '/production-library/clean/next-mask.png',
    });
    const edited = nodes.find(node => node.id === 'edit')!;
    expect(edited.metadata?.content).toBe('/production-library/clean/intermediate.png');
    expect(edited.metadata?.ltvMaskEdit?.maskUrl).toBe('/production-library/clean/mark.png');
    expect(nodes.find(node => node.id === 'second')?.metadata?.ltvMaskEdit?.sourceUrl).toBe('/production-library/clean/intermediate.png');
});

test('shared source requires both masks and does not partially rewrite the caller project', () => {
    const initial = adaptLtvNativeProject(source('redraw'), { channels: [] }, 'case', 'Grid').project.nodes;
    const extraMask = 'https://example.test/other-mask.png';
    const first = initial.find(node => node.id === 'edit')!;
    const second = { ...first, id: 'other', metadata: { ...first.metadata, ltvMaskEdit: { ...first.metadata!.ltvMaskEdit!, maskUrl: extraMask } } };
    const both = [...initial, second];
    expect(() => remapLtvMaskEditMedia(both, { [sourceUrl]: '/production-library/clean/source.png', [markUrl]: '/production-library/clean/mark.png' })).toThrow(/同时映射/);
    expect(both.find(node => node.id === 'source')?.metadata?.content).toBe(sourceUrl);
    const mapped = remapLtvMaskEditMedia(both, {
        [sourceUrl]: '/production-library/clean/source.png', [markUrl]: '/production-library/clean/mark.png',
        [extraMask]: '/production-library/clean/other-mask.png',
    });
    expect(mapped.find(node => node.id === 'source')?.metadata?.content).toBe('/production-library/clean/source.png');
    expect(mapped.find(node => node.id === 'edit')?.metadata?.ltvMaskEdit?.maskUrl).toBe('/production-library/clean/mark.png');
    expect(mapped.find(node => node.id === 'other')?.metadata?.ltvMaskEdit?.maskUrl).toBe('/production-library/clean/other-mask.png');
});

function maskCatalog() {
    return { channels: [{ id: 'mask-channel', enabled: true, models: [{ modelKey: 'declared-mask-model', capability: 'image', protocol: 'openai-image', capabilityConfig: { image: {
        size: { values: ['2752x1536'] }, references: { maskSupported: true, maxImages: 1, minImages: 1, promptMaxChars: 1000 }, maxOutputs: 2,
    } } }] }] };
}

test('standalone erase preserves the transparent origin as both image input and mask, not the saved output', () => {
    const snapshot: any = source('erase', { imageList: [], videoList: [], audioList: [], textList: [] });
    snapshot.nodes = [snapshot.nodes[1]];
    snapshot.nodes[0].data.url = ['https://example.test/generated-output.png'];
    snapshot.edges = [];
    const before = JSON.stringify(snapshot);
    const result = adaptLtvNativeProject(snapshot, maskCatalog(), 'case', 'Standalone erase');
    expect(result.issues).toEqual([]);
    const edited = result.project.nodes.find(node => node.id === 'edit')!;
    expect(edited.metadata?.content).toBe('https://example.test/generated-output.png');
    expect(edited.metadata?.ltvMaskEdit).toMatchObject({ sourceUrl: erasedUrl, maskUrl: erasedUrl, outputSize: '2752x1536' });
    const references = edited.metadata!.ltvReferencePlan!.references;
    expect(references).toHaveLength(1);
    const owner = result.project.nodes.find(node => node.id === references[0].nodeId)!;
    expect(owner.metadata?.content).toBe(erasedUrl);
    expect(result.project.connections.some(edge => edge.fromNodeId === owner.id && edge.toNodeId === 'edit')).toBe(true);
    expect(ltvMaskEditMask(edited.metadata, [{ id: owner.id, name: 'erase.png', type: 'image/png', dataUrl: '', url: erasedUrl }])?.url).toBe(erasedUrl);
    const clean = '/production-library/clean/standalone-erase.png';
    const mapped = remapLtvMaskEditMedia(result.project.nodes, { [erasedUrl]: clean });
    expect(mapped.find(node => node.id === 'edit')?.metadata?.ltvMaskEdit).toMatchObject({ sourceUrl: clean, maskUrl: clean });
    expect(JSON.stringify(snapshot)).toBe(before);
});

test('standalone origin recovery never hides malformed references, missing original, redraw or dangling edges', () => {
    for (const overrides of [
        { imageList: 'broken' }, { imageList: [{ url: 'asset://missing' }] },
        { textList: [{ nodeId: 'missing', content: ['Do not replace this input'] }] },
        { mixedList: [{ url: 'https://example.test/extra.png' }] },
        { originImage: '' }, { originImage: 'http://example.test/erase.png' },
        { originImage: 'https://user:secret@example.test/erase.png' },
        { scene: 'redraw', mark: markUrl },
    ]) {
        const snapshot: any = source('erase', overrides);
        snapshot.nodes = [snapshot.nodes[1]];
        snapshot.edges = [];
        const result = adaptLtvNativeProject(snapshot, maskCatalog(), 'case', 'Invalid standalone');
        expect(result.adoptable).toBe(false);
        expect(result.project.nodes.find(node => node.id === 'edit')?.metadata?.ltvMaskEdit).toBeUndefined();
    }
    const snapshot: any = source('erase');
    snapshot.nodes = [snapshot.nodes[1]];
    const result = adaptLtvNativeProject(snapshot, maskCatalog(), 'case', 'Dangling source');
    expect(result.adoptable).toBe(false);
    expect(result.project.nodes.find(node => node.id === 'edit')?.metadata?.ltvMaskEdit).toBeUndefined();
});

test('exact declared mask capability selects the existing native protocol without an invented resolution adapter gap', () => {
    for (const scene of ['erase', 'redraw'] as const) {
        const converted = adaptLtvNativeProject(source(scene), maskCatalog(), 'case', 'Grid');
        expect(converted.issues).toEqual([]);
        expect(converted.supported).toBe(true);
        const node = converted.project.nodes.find(node => node.id === 'edit')!;
        expect(node.metadata).toMatchObject({ model: 'mask-channel::declared-mask-model', size: '2752x1536', count: 2, ltvExecutionContract: 'ltv-mask-edit' });
        expect(node.metadata?.quality).toBeUndefined();
        expect(node.metadata?.ltvMaskEdit?.sourceQuality).toBe('2K');
    }
});

test('incomplete capability remains explicitly unconfigured and never silently shrinks size or count', () => {
    const mutations: Array<(catalog: ReturnType<typeof maskCatalog>) => void> = [
        c => { c.channels[0].models[0].protocol = 'gemini-image'; },
        c => { c.channels[0].models[0].capabilityConfig.image.references.maskSupported = false; },
        c => { c.channels[0].models[0].capabilityConfig.image.size.values = ['16:9', '2K', '1024x1024']; },
        c => { c.channels[0].models[0].capabilityConfig.image.references.maxImages = 0; },
        c => { c.channels[0].models[0].capabilityConfig.image.references.minImages = 2; },
        c => { c.channels[0].models[0].capabilityConfig.image.references.promptMaxChars = 1; },
        c => { c.channels[0].models[0].capabilityConfig.image.maxOutputs = 1; },
    ];
    for (const mutate of mutations) {
        const catalog = maskCatalog(); mutate(catalog);
        const result = adaptLtvNativeProject(source('erase'), catalog, 'case', 'Grid');
        const node = result.project.nodes.find(node => node.id === 'edit')!;
        expect(result.issues.map(i => i.code)).toEqual(['channel-configuration-required']);
        expect(node.metadata).toMatchObject({ model: '', size: '2752x1536', count: 2, ltvExecutionContract: 'ltv-mask-edit' });
    }
    const disabled = maskCatalog(); disabled.channels[0].enabled = false;
    expect(adaptLtvNativeProject(source('erase'), disabled, 'case', 'Grid').issues.map(i => i.code)).toEqual(['channel-configuration-required']);
});
