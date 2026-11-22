import { expect, test } from 'bun:test';
import { defaultConfig } from '../src/stores/use-config-store';
import { TOPAZ_IMAGE_MODELS, mapLtvTopazImageOptions, topazImageTaskMetadata } from '../src/lib/canvas/ltv-topaz-image';
import { assertCanvasGenerationRequirements } from '../src/lib/canvas/canvas-project-generation';
import { adaptLtvNativeProject } from '../src/lib/canvas/ltv-native-project';

const image = { id: 'original', name: '原图', type: 'image/png', dataUrl: 'data:image/png;base64,AA==', width: 321, height: 179 };
function config(model: string) {
    return { ...defaultConfig, model: `topaz::${model}`, count: '1', channels: [{ id: 'topaz', name: 'fixture', baseUrl: 'https://example.test', interfaceType: 'topaz-image-enhance', enabled: true, models: [model], modelCosts: [{ model, capability: 'image', protocol: 'topaz-image-enhance' }] }] } as any;
}

test('五种原模型和三个倍数精确保留，输出尺寸取运行时原图', () => {
    for (const model of TOPAZ_IMAGE_MODELS) for (const scale of [2, 4, 6]) {
        const source = { model: 'topaz-image-upscaler', style: model, scale };
        const options = mapLtvTopazImageOptions(source, { image: 1, video: 0, audio: 0 }, 1)!;
        expect(options.imageEnhancement).toEqual({ provider: 'topaz-image-enhance', model, scale });
        const restored = JSON.parse(JSON.stringify(options));
        expect(topazImageTaskMetadata(restored, config(model), [image])).toEqual({ providerOptions: { 'topaz-image-enhance': { output_width: 321 * scale, output_height: 179 * scale } } });
        expect(() => assertCanvasGenerationRequirements(config(model), { metadata: restored } as any, 'image', '')).not.toThrow();
    }
});

test('未知模型、非法倍数及错误媒体不降级为普通生图', () => {
    const source = { model: 'topaz-image-upscaler', style: 'Standard V2', scale: 2 };
    for (const change of [{ style: 'generic' }, { scale: 3 }, { scale: true }, { scale: '2.0' }, { model: 'other' }]) {
        expect(mapLtvTopazImageOptions({ ...source, ...change }, { image: 1, video: 0, audio: 0 }, 1)).toBeUndefined();
    }
    expect(mapLtvTopazImageOptions(source, { image: 1, video: 1, audio: 0 }, 1)).toBeUndefined();
    const options = mapLtvTopazImageOptions(source, { image: 1, video: 0, audio: 0 }, 1)!;
    for (const images of [[], [image, image], [{ ...image, width: undefined }], [{ ...image, height: 0 }], [{ ...image, width: Number.MAX_SAFE_INTEGER }]]) {
        expect(() => topazImageTaskMetadata(options, config('Standard V2'), images)).toThrow();
    }
    expect(() => topazImageTaskMetadata(options, config('CGI'), [image])).toThrow('对应');
    expect(() => topazImageTaskMetadata(options, { ...config('Standard V2'), count: '2' }, [image])).toThrow();
    expect(() => assertCanvasGenerationRequirements(config('Standard V2'), { metadata: options } as any, 'image', '改变人物')).toThrow('提示词');
});

test('源工程增强操作进入专属合同，未配置渠道仍保留明确配置要求', () => {
    const snapshot = { nodes: [
        { id: 'original', type: 'image', position: { x: 0, y: 0 }, data: { action: 'image_resource', url: ['https://example.test/original.png'] } },
        { id: 'enhance', type: 'image', position: { x: 400, y: 0 }, data: { action: 'image_generate', params: { model: 'topaz-image-upscaler', settings: { style: 'Text Refine', scale: 6 } } } },
    ], edges: [{ id: 'reference', source: 'original', target: 'enhance' }] };
    const before = JSON.stringify(snapshot);
    const result = adaptLtvNativeProject(snapshot, { channels: [] }, 'case', '增强');
    const node = result.project.nodes.find(node => node.id === 'enhance');
    expect(node?.metadata?.imageEnhancement).toEqual({ provider: 'topaz-image-enhance', model: 'Text Refine', scale: 6 });
    expect(result.issues.some(issue => issue.code === 'channel-configuration-required')).toBe(true);
    expect(result.issues.some(issue => issue.code === 'empty-prompt')).toBe(false);
    expect(JSON.stringify(snapshot)).toBe(before);
});
