import { expect, test } from 'bun:test';
import { configurableLtvOperation } from '../src/lib/canvas/ltv-configurable-operation';
import { assertCanvasGenerationRequirements } from '../src/lib/canvas/canvas-project-generation';
import { imageGroundingTaskMetadata } from '../src/lib/canvas/image-grounding';
import { buildGeminiImageGenerationConfig } from '../src/lib/gemini-image';
import { defaultConfig, type AiConfig } from '../src/stores/use-config-store';
import { CanvasNodeType, type CanvasNodeData } from '../src/types/canvas';
import { adaptLtvNativeProject } from '../src/lib/canvas/ltv-native-project';
import { assessCaseModels } from '../src/lib/canvas/production-case-model-readiness';

const counts = { image: 1, video: 0, audio: 0 };
const fields = { model: 'nebula-ultra', ratio: 'auto', quality: '2K', searchable: 0 };

test('configured OpenAI image channels cannot steal the source Gemini auto contract', () => {
    const config = { channels: [{ id: 'openai', name: 'fixture', enabled: true,
        models: [{ modelKey: 'gpt-image-1', capability: 'image', protocol: 'openai-image',
            capabilityConfig: { version: 1, image: {
                references: { maxImages: 14, promptMaxChars: 1000 }, maxOutputs: 15,
                size: { values: ['auto', '1:1'] }, quality: { values: ['medium', 'high'] },
            } } }],
    }] };
    for (const model of ['nebula-ultra', 'nebula-2-flash']) {
        const source = { nodes: [{ id: 'generate', type: 'image', position: { x: 0, y: 0 },
            data: { action: 'image_generate', params: { ...fields, model, count: 1, modeType: 'text2image', prompt: 'test' } } }], edges: [] };
        const result = adaptLtvNativeProject(source, config, 'auto', 'auto');
        expect(result.adoptable).toBe(true);
        expect(result.project.nodes[0].metadata).toMatchObject({ model: '', size: 'auto', quality: 'medium', ltvExecutionContract: 'gemini-image' });
        expect(result.project.adaptation.models[0].targetModel).toBe('');
        expect(result.issues.some(issue => issue.code === 'channel-configuration-required')).toBe(true);
        for (const patch of [{ quality: '3K' }, { quality: '2K', resolution: '4K' }]) {
            const invalid = structuredClone(source);
            Object.assign(invalid.nodes[0].data.params, patch);
            const rejected = adaptLtvNativeProject(invalid, config, 'invalid', 'invalid');
            expect(rejected.adoptable).toBe(false);
            expect(rejected.issues.some(issue => issue.code === 'model-selection-required')).toBe(true);
        }
    }
    const ordinary = adaptLtvNativeProject({ nodes: [{ id: 'ordinary', type: 'image', position: { x: 0, y: 0 },
        data: { action: 'image_generate', params: { model: 'lib-image-2', ratio: '1:1', quality: 'high', count: 1, modeType: 'text2image', prompt: 'test' } } }], edges: [] }, config, 'ordinary', 'ordinary');
    expect(ordinary.project.adaptation.models[0].targetModel).toBe('openai::gpt-image-1');
    for (const resolution of ['1K', '2K', '4K']) {
        const independent = adaptLtvNativeProject({ nodes: [{ id: 'independent', type: 'image', position: { x: 0, y: 0 },
            data: { action: 'image_generate', params: { model: 'lib-image-2', ratio: 'auto', quality: 'medium', resolution, count: 1, modeType: 'text2image', prompt: 'test' } } }], edges: [] }, config, 'independent', 'Independent resolution');
        expect(independent.adoptable, `auto size does not preserve independent ${resolution}`).toBe(false);
        expect(independent.issues.some(issue => issue.code === 'model-selection-required')).toBe(true);
        expect(independent.project.adaptation.models.some(model => model.targetModel)).toBe(false);
    }
});

test('native import keeps automatic framing, source provenance and reference without picking a substitute model', () => {
    const source = { nodes: [
        { id: 'input', type: 'image', position: { x: 0, y: 0 }, data: { action: 'image_resource', url: ['https://example.test/original.png'] } },
        { id: 'generate', type: 'image', position: { x: 400, y: 0 }, data: { action: 'image_generate', url: [],
            params: { ...fields, count: 1, modeType: 'image2image', prompt: '保留原来的构图',
                imageList: [{ nodeId: 'input', url: 'https://example.test/original.png' }] } } },
    ], edges: [] };
    const before = JSON.stringify(source);
    const result = adaptLtvNativeProject(source, { channels: [] }, 'case-auto', '自动画幅');
    expect(result.adoptable, JSON.stringify(result.issues)).toBe(true);
    expect(result.issues.some(issue => issue.code === 'model-selection-required')).toBe(false);
    expect(result.issues.some(issue => issue.code === 'channel-configuration-required')).toBe(true);
    const metadata = result.project.nodes.find(node => node.id === 'generate')!.metadata!;
    expect(metadata).toMatchObject({ size: 'auto', quality: 'medium', ltvExecutionContract: 'gemini-image' });
    expect(result.project.adaptation.models.find(model => model.nodeId === 'generate')).toEqual({
        nodeId: 'generate', sourceModel: 'nebula-ultra', targetModel: '', operation: 'image2image',
    });
    expect(metadata.imageGrounding).toBeUndefined();
    expect(metadata.ltvReferencePlan?.references).toEqual([{ nodeId: 'input', kind: 'image', url: 'https://example.test/original.png' }]);
    expect(JSON.stringify(source)).toBe(before);
});

test('plain source auto framing preserves 2K without enabling search or inventing dimensions', () => {
    const options = configurableLtvOperation('image', 'image2image', fields, counts, 1);
    expect(options).toMatchObject({ size: 'auto', quality: 'medium', count: 1, ltvExecutionContract: 'gemini-image' });
    expect(options?.imageGrounding).toBeUndefined();
    expect(buildGeminiImageGenerationConfig(options?.size, options?.quality)).toEqual({
        responseModalities: ['TEXT', 'IMAGE'], imageConfig: { imageSize: '2K' },
    });
    expect(imageGroundingTaskMetadata(options, defaultConfig)).toEqual({});
    for (const patch of [{ quality: '3K' }, { quality: '2K', resolution: '4K' }, { model: 'lib-image-2' }]) {
        expect(configurableLtvOperation('image', 'image2image', { ...fields, ...patch }, counts, 1)).toBeUndefined();
    }
    expect(configurableLtvOperation('image', 'image2image', fields, { ...counts, video: 1 }, 1)).toBeUndefined();
    expect(configurableLtvOperation('image', 'image2image', fields, { ...counts, image: 15 }, 1)).toBeUndefined();
});

test('auto framing runtime accepts only a declared matching image contract and retains strict options', () => {
    const options = configurableLtvOperation('image', 'image2image', fields, counts, 1);
    expect(options).toBeDefined();
    const model = 'native::gemini-3-pro-image-preview';
    const capabilityConfig = { version: 1, image: {
        references: { promptMaxChars: 1000, maxImages: 14, maxImageBytes: 1000000, maskSupported: false },
        size: { parameter: 'aspectRatio', values: ['auto', '1:1'], default: 'auto', allowCustom: false },
        quality: { supported: true, values: ['low', 'medium', 'high'], default: 'medium' },
        transparentBackground: { supported: false, default: false }, responseFormat: { supported: true },
        outputFormat: { supported: true }, maxOutputs: 1,
    } };
    const config = { ...defaultConfig, model, size: 'auto', quality: 'medium', count: '1',
        models: [model], imageModels: [model], channels: [{ id: 'native', name: 'fixture', enabled: true,
            apiFormat: 'gemini', baseUrl: '/api', apiKey: 'fixture', models: ['gemini-3-pro-image-preview'],
            modelCosts: [{ model: 'gemini-3-pro-image-preview', capability: 'image', protocol: 'gemini-image', capabilityConfig }] }],
    } as unknown as AiConfig;
    const node: CanvasNodeData = { id: 'auto', type: CanvasNodeType.Image, title: '自动画幅',
        position: { x: 0, y: 0 }, width: 350, height: 240, metadata: { ...options, model, generationMode: 'image',
            ltvReferencePlan: { prompt: 'test', references: [{ kind: 'image', nodeId: 'source', url: 'https://example.test/source.png' }] } } };
    expect(() => assertCanvasGenerationRequirements(config, node, 'image', 'test')).not.toThrow();
    expect(assessCaseModels([node], config)[0]).toMatchObject({ status: 'ready', models: ['gemini-3-pro-image-preview'], protocol: 'gemini-image' });
    config.channels[0].modelCosts![0].protocol = 'openai-image';
    expect(() => assertCanvasGenerationRequirements(config, node, 'image', 'test')).toThrow('协议');
    config.channels[0].modelCosts![0].protocol = 'gemini-image';
    config.size = '1:1';
    expect(() => assertCanvasGenerationRequirements(config, node, 'image', 'test')).toThrow('制作要求');
});
