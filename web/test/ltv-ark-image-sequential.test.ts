import { test, expect } from 'bun:test';
import { mapLtvArkImageSequential, ltvArkImageSequentialDeclared, arkImageTaskMetadata, LTV_ARK_SEQUENTIAL_MAX_IMAGES } from '../src/lib/canvas/ltv-ark-image-options';
import { adaptLtvNativeProject } from '../src/lib/canvas/ltv-native-project';
import { configurableLtvOperation } from '../src/lib/canvas/ltv-configurable-operation';
import { isolateCopiedNodeMetadata } from '../src/lib/canvas/canvas-node-copy';
import { CanvasNodeType } from '../src/types/canvas';

const counts = { image: 1, video: 0, audio: 0 };
const fields = (extra: Record<string, unknown> = {}) => ({ model: 'seedream-5', modeType: 'image2image', quality: '2K', ratio: '16:9', count: 1, sequential: 1, ...extra });

test('configured exact-source Ark model is reachable without selecting another protocol or model', () => {
    const snapshot = { nodes: [{ id: 'g', type: 'image', position: { x: 0, y: 0 }, data: { action: 'image_generate',
        params: { model: 'seedream-4.5', modeType: 'text2image', prompt: '保持源提示词', count: 1,
            settings: { quality: '4K', ratio: '16:9' }, advancedSettings: { sequential: 1 } } } }], edges: [] };
    const model = { modelKey: 'seedream-4.5', available: true, capability: 'image', protocol: 'volcengine-ark-image',
        capabilityConfig: { image: { maxOutputs: 15, references: { minImages: 0, maxImages: 14, promptMaxChars: 10000 },
            size: { values: ['5504x3040'] } } } };
    const adapt = (candidate: typeof model) => adaptLtvNativeProject(snapshot, { channels: [{ id: 'ark', models: [candidate] }] }, 'configured-ark', '组图');
    const result = adapt(model);
    expect(result.issues).toEqual([]);
    const node = result.project.nodes.find(node => node.id === 'g')!;
    expect(node.metadata?.size).toBe('5504x3040');
    expect(node.metadata?.arkImageSequential?.maxImages).toBe(15);
    expect(node.metadata?.ltvExecutionContract).toBe('ark-image-sequential');
    expect(node.metadata?.model).toBe('ark::seedream-4.5');
    expect(node.metadata?.prompt).toBe('保持源提示词');
    for (const candidate of [{ ...model, protocol: 'openai-image' }, { ...model, modelKey: 'seedream-5' },
        { ...model, available: false }, { ...model, capabilityConfig: { image: { ...model.capabilityConfig.image, size: { values: ['2048x2048'] } } } }]) {
        expect(adapt(candidate).issues.some(issue => issue.code === 'channel-configuration-required')).toBe(true);
    }
});

test('copied 4K group settings cannot mutate the source node', () => {
    const options = configurableLtvOperation('image', 'image2image', fields({ model: 'seedream-4.5', quality: '4K' }), counts, 1)!;
    const source = { id: 'source', type: CanvasNodeType.Image, title: '4K', position: { x: 0, y: 0 }, width: 320, height: 180, metadata: options };
    const copied = isolateCopiedNodeMetadata(source, new Map());
    expect(copied.size).toBe('5504x3040');
    expect(copied.arkImageSequential).toEqual(options.arkImageSequential);
    expect(copied.arkImageSequential).not.toBe(options.arkImageSequential);
    copied.arkImageSequential!.maxImages = 3;
    expect(source.metadata.arkImageSequential!.maxImages).toBe(15);
    expect(() => arkImageTaskMetadata(copied)).toThrow();
    expect(() => arkImageTaskMetadata(source.metadata)).not.toThrow();
});

test('Seedream 4.5 4K grouping uses verified native pixel sizes without changing the prompt', () => {
    for (const [ratio, size] of [['1:1', '4096x4096'], ['4:3', '4704x3520'], ['3:4', '3520x4704'],
        ['16:9', '5504x3040'], ['9:16', '3040x5504'], ['3:2', '4992x3328'], ['2:3', '3328x4992']]) {
        const source = fields({ model: 'seedream-4.5', quality: '4K', ratio });
        expect(ltvArkImageSequentialDeclared(source)).toBe(true);
        const options = configurableLtvOperation('image', 'image2image', source, counts, 1)!;
        expect(options.size).toBe(size);
        expect(options.ltvExecutionContract).toBe('ark-image-sequential');
        expect(options.arkImageSequential?.maxImages).toBe(15);
        expect(options.strictGenerationOptions).toContain('size');
    }
    for (const extra of [{ ratio: 'auto' }, { ratio: '7:5' }, { ratio: '__proto__' }, { ratio: 'constructor' }, { count: 4 }, { quality: '3K' }]) {
        expect(ltvArkImageSequentialDeclared(fields({ model: 'seedream-4.5', quality: '4K', ...extra }))).toBe(false);
    }
});

test('4K native adapter keeps exact size, source prompt and group requirement while awaiting channel configuration', () => {
    const snapshot = { nodes: [{ id: 'g', type: 'image', position: { x: 0, y: 0 }, data: {
        action: 'image_generate', params: { model: 'seedream-4.5', modeType: 'text2image',
            prompt: '源提示词保持原样', count: 1, settings: { quality: '4K', ratio: '16:9' }, advancedSettings: { sequential: 1 } },
    } }], edges: [] };
    const before = JSON.stringify(snapshot);
    const result = adaptLtvNativeProject(snapshot, { channels: [] }, '4k-case', '4K');
    expect(result.issues.map(issue => issue.code)).toEqual(['channel-configuration-required']);
    const metadata = result.project.nodes.find(node => node.id === 'g')!.metadata!;
    expect(metadata.size).toBe('5504x3040');
    expect(metadata.prompt).toBe('源提示词保持原样');
    expect(metadata.ltvExecutionContract).toBe('ark-image-sequential');
    expect(metadata.model).toBe('');
    expect(arkImageTaskMetadata(metadata).providerOptions?.['volcengine-ark-image'].sequential_image_generation).toBe('auto');
    expect(JSON.stringify(snapshot)).toBe(before);
});

test('Seedream 组图开关在 2K 档落到宿主 providerOptions，3K/4K 与多产出继续上报', () => {
    expect(mapLtvArkImageSequential(fields(), counts, 1)).toEqual({ arkImageSequential: { provider: 'volcengine-ark-image', maxImages: LTV_ARK_SEQUENTIAL_MAX_IMAGES } });
    for (const model of ['seedream-4', 'seedream-4.5', 'seedream-5']) expect(ltvArkImageSequentialDeclared({ ...fields(), model })).toBe(true);
    // 插件支持高档位/像素透传，但 LTV 的高档位与比例组合尚未完成源尺寸合同核验。
    expect(ltvArkImageSequentialDeclared(fields({ quality: '3K' }))).toBe(false);
    expect(ltvArkImageSequentialDeclared(fields({ quality: '4K' }))).toBe(false);
    // 源 count 是单张输出数量，组图模式下没有落点，不能当作已承接。
    expect(mapLtvArkImageSequential(fields({ count: 4 }), counts, 4)).toBeUndefined();
    // 非宿主模型的组图开关不是本适配能接的（jimeng-4.6 的插件把 force_single 写死为 true）。
    expect(ltvArkImageSequentialDeclared({ ...fields(), model: 'jimeng-4.6' })).toBe(false);
    expect(ltvArkImageSequentialDeclared({ ...fields(), model: 'lib-image-2' })).toBe(false);
    // 关掉组图不再是组图请求，无需映射；开关值异常时不放行。
    expect(ltvArkImageSequentialDeclared(fields({ sequential: 0 }))).toBe(false);
    expect(ltvArkImageSequentialDeclared(fields({ sequential: 'maybe' }))).toBe(false);
    // 参考图数量 + 输出数量 <= 15，参考图最多 14。
    expect(mapLtvArkImageSequential(fields(), { image: 14, video: 0, audio: 0 }, 1)).toBeDefined();
    expect(mapLtvArkImageSequential(fields(), { image: 15, video: 0, audio: 0 }, 1)).toBeUndefined();
    expect(mapLtvArkImageSequential(fields(), { image: 1, video: 1, audio: 0 }, 1)).toBeUndefined();
});

test('组图 metadata 翻译成 volcengine-ark-image 命名空间，缺失或损坏时明确失败', () => {
    expect(arkImageTaskMetadata(undefined)).toEqual({});
    expect(arkImageTaskMetadata({})).toEqual({});
    expect(arkImageTaskMetadata({ arkImageSequential: { provider: 'volcengine-ark-image', maxImages: 15 } })).toEqual({
        providerOptions: { 'volcengine-ark-image': { sequential_image_generation: 'auto', sequential_image_generation_options: { max_images: 15 } } },
    });
    expect(() => arkImageTaskMetadata({ arkImageSequential: { provider: 'volcengine-ark-image', maxImages: 3 } as any })).toThrow();
});

test('适配层：Seedream 组图节点不再报 advanced-operation，但组图要求仍被保留', () => {
    const snapshot = { nodes: [
        { id: 'r', type: 'image', position: { x: 0, y: 0 }, data: { action: 'image_resource', url: ['https://example.test/ref.png'] } },
        { id: 'g', type: 'image', position: { x: 400, y: 0 }, data: { action: 'image_generate', params: { model: 'seedream-5', modeType: 'image2image', quality: '2K', ratio: '16:9', count: 1, prompt: '海边日落', imageList: [{ nodeId: 'r', url: 'https://example.test/ref.png' }], advancedSettings: { sequential: 1 } } } },
    ], edges: [{ id: 'e', source: 'r', target: 'g' }] };
    const result = adaptLtvNativeProject(snapshot, { channels: [] }, 'case-sequential', '组图');
    const codes = result.issues.map(issue => issue.code);
    expect(codes).not.toContain('advanced-operation');
    expect(codes).not.toContain('unmapped-production-parameters');
    expect(result.adoptable).toBe(true);
    const node = result.project.nodes.find(item => item.id === 'g')!;
    expect(node.metadata!.arkImageSequential).toEqual({ provider: 'volcengine-ark-image', maxImages: 15 });
    expect(arkImageTaskMetadata(node.metadata)).toEqual({
        providerOptions: { 'volcengine-ark-image': { sequential_image_generation: 'auto', sequential_image_generation_options: { max_images: 15 } } },
    });
});

test('适配层：3K 档的组图节点继续按未映射参数上报，不静默降档', () => {
    const snapshot = { nodes: [
        { id: 'r', type: 'image', position: { x: 0, y: 0 }, data: { action: 'image_resource', url: ['https://example.test/ref.png'] } },
        { id: 'g', type: 'image', position: { x: 400, y: 0 }, data: { action: 'image_generate', params: { model: 'seedream-5', modeType: 'image2image', quality: '3K', ratio: '16:9', count: 1, prompt: '海边日落', imageList: [{ nodeId: 'r', url: 'https://example.test/ref.png' }], advancedSettings: { sequential: 1 } } } },
    ], edges: [{ id: 'e', source: 'r', target: 'g' }] };
    const result = adaptLtvNativeProject(snapshot, { channels: [] }, 'case-3k', '组图3K');
    const sequential = result.issues.filter(issue => issue.detail.includes('sequential'));
    expect(sequential.map(issue => issue.code)).toEqual(['advanced-operation', 'unmapped-production-parameters']);
    const node = result.project.nodes.find(item => item.id === 'g');
    expect(node?.metadata?.arkImageSequential).toBeUndefined();
});

test('无渠道匹配时组图节点按火山方舟 Seedream 渠道等待配置，而不是退回 openai-image', () => {
    const options = configurableLtvOperation('image', 'image2image', { model: 'seedream-5', modeType: 'image2image', quality: '2K', ratio: '16:9', count: 1, sequential: 1 }, counts, 1)!;
    expect(options.ltvExecutionContract).toBe('ark-image-sequential');
    expect(options.arkImageSequential).toEqual({ provider: 'volcengine-ark-image', maxImages: 15 });
    // 非组图节点保持原有 openai-image 行为。
    expect(configurableLtvOperation('image', 'image2image', { quality: '2K', ratio: '16:9' }, counts, 1)?.ltvExecutionContract).toBe('openai-image');
});
