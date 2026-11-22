import { expect, test } from 'bun:test';
import { adaptLtvNativeProject } from '../src/lib/canvas/ltv-native-project';
import { wanxVideoTaskMetadata } from '../src/lib/canvas/ltv-wanx-options';
import { assessCaseModels } from '../src/lib/canvas/production-case-model-readiness';
import { assertCanvasGenerationRequirements } from '../src/lib/canvas/canvas-project-generation';
import { defaultConfig, type AiConfig } from '../src/stores/use-config-store';

const wanxSnapshot = (model: string, extendPrompt?: unknown) => ({
    nodes: [{
        id: 'video',
        type: 'video',
        position: { x: 0, y: 0 },
        data: {
            action: 'video_generate',
            params: {
                model,
                modeType: 'text2video',
                prompt: '清晨的海岸，远处薄雾缓慢散开',
                ratio: '16:9',
                resolution: '720P',
                duration: 5,
                count: 1,
                enableSound: 'off',
                advancedSettings: extendPrompt === undefined ? {} : { extendPrompt },
            },
        },
    }],
    edges: [],
});

const dashScopeVideoModel = (protocol = 'dashscope-wan-video') => ({
    channels: [{
        id: 'dashscope',
        models: [{
            modelKey: 'wan-target',
            available: true,
            capability: 'video',
            protocol,
            capabilityConfig: {
                video: {
                    operations: ['text_to_video'],
                    ratios: ['16:9'],
                    resolutions: ['720p'],
                    duration: { values: [5] },
                    generateAudio: { supported: true },
                    references: { promptMaxChars: 1000, maxImages: 9, maxVideos: 3, maxAudios: 3 },
                },
            },
        }],
    }],
});

test('Wanx 3.0 智能扩写映射到 DashScope Wan 视频协议并保留原始开关值', () => {
    for (const [model, value, enabled] of [
        ['wanx3.0', 1, true],
        ['wanx3.0', 0, false],
        ['wanx3.0', true, true],
        ['wanx3.0', false, false],
        ['wanx3.0-prime', '1', true],
        ['wanx3.0-prime', '0', false],
    ] as const) {
        const result = adaptLtvNativeProject(wanxSnapshot(model, value), { channels: [] }, 'case-wanx', 'Wanx');
        const metadata = result.project.nodes.find(node => node.id === 'video')?.metadata;
        expect(result.adoptable).toBe(true);
        expect(metadata).toMatchObject({
            ltvExecutionContract: 'wanx-prompt-extend',
            wanxPromptExtend: {
                provider: 'dashscope-wan-video',
                enabled,
                sourceValue: value,
                sourceDefaulted: false,
            },
        });
        expect(result.issues.map(issue => issue.code)).not.toContain('advanced-operation');
        expect(result.issues.map(issue => issue.code)).not.toContain('unmapped-production-parameters');
    }
});

test('源 schema 默认开启的 Wanx 智能扩写在快照未显式保存时仍保留默认值证据', () => {
    const result = adaptLtvNativeProject(wanxSnapshot('wanx3.0-prime'), { channels: [] }, 'case-wanx-default', 'Wanx默认');
    expect(result.project.nodes[0].metadata).toMatchObject({
        ltvExecutionContract: 'wanx-prompt-extend',
        wanxPromptExtend: { provider: 'dashscope-wan-video', enabled: true, sourceValue: 1, sourceDefaulted: true },
    });
});

test('Wanx 参数要求只匹配 DashScope Wan 视频模型，不回退到 Artdance 等其它协议', () => {
    const result = adaptLtvNativeProject(wanxSnapshot('wanx3.0', 1), dashScopeVideoModel('newapi-channel-2'), 'case-wanx-protocol', 'Wanx协议');
    const metadata = result.project.nodes.find(node => node.id === 'video')?.metadata;
    expect(result.adoptable).toBe(true);
    expect(metadata?.model).toBe('');
    expect(metadata?.ltvExecutionContract).toBe('wanx-prompt-extend');
    expect(result.issues.some(issue => issue.code === 'channel-configuration-required')).toBe(true);
});

test('已配置 DashScope Wan 视频目标可被转换器选择并携带扩写要求', () => {
    const result = adaptLtvNativeProject(wanxSnapshot('wanx3.0', 0), dashScopeVideoModel(), 'case-wanx-target', 'Wanx目标');
    const metadata = result.project.nodes.find(node => node.id === 'video')?.metadata;
    expect(result.supported).toBe(true);
    expect(metadata).toMatchObject({
        model: 'dashscope::wan-target',
        ltvExecutionContract: 'wanx-prompt-extend',
        wanxPromptExtend: { provider: 'dashscope-wan-video', enabled: false, sourceValue: 0, sourceDefaulted: false },
    });
});

test('Wanx协议约束不依赖strictGenerationOptions存在', () => {
    const node: any = {
        id: 'wanx-runtime',
        type: 'video',
        title: 'Wanx',
        position: { x: 0, y: 0 },
        metadata: {
            generationMode: 'video',
            ltvExecutionContract: 'wanx-prompt-extend',
            wanxPromptExtend: { provider: 'dashscope-wan-video', enabled: false, sourceValue: 0, sourceDefaulted: false },
        },
    };
    const model = 'dashscope::wan-target';
    const config = {
        ...defaultConfig,
        model,
        channels: [{
            id: 'dashscope', name: 'fixture', enabled: true, baseUrl: 'https://example.test', apiKey: 'fixture',
            interfaceType: 'dashscope-wan-video', models: ['wan-target'],
            modelCosts: [{ model: 'wan-target', capability: 'video', protocol: 'dashscope-wan-video' }],
        }],
    } as AiConfig;
    expect(() => assertCanvasGenerationRequirements(config, node, 'video')).not.toThrow();
    config.channels[0].modelCosts![0].protocol = 'newapi-channel-2';
    expect(() => assertCanvasGenerationRequirements(config, node, 'video')).toThrow('DashScope Wan');
});

test('Wanx 扩写执行元数据只透传协议 bool，并拒绝与源证据不一致的标记', () => {
    for (const enabled of [true, false]) {
        expect(wanxVideoTaskMetadata({
            ltvExecutionContract: 'wanx-prompt-extend',
            wanxPromptExtend: { provider: 'dashscope-wan-video', enabled, sourceValue: enabled, sourceDefaulted: false },
        })).toEqual({ providerOptions: { 'dashscope-wan-video': { prompt_extend: enabled } } });
    }
    expect(() => wanxVideoTaskMetadata({
        ltvExecutionContract: 'wanx-prompt-extend',
        wanxPromptExtend: { provider: 'dashscope-wan-video', enabled: true, sourceValue: false, sourceDefaulted: false },
    })).toThrow();
});

test('模型预检只把 Wanx 扩写节点交给已配置的 DashScope Wan 视频协议', () => {
    const converted = adaptLtvNativeProject(wanxSnapshot('wanx3.0', 1), { channels: [] }, 'case-wanx-readiness', 'Wanx预检');
    const node = converted.project.nodes.find(item => item.id === 'video')!;
    const model = 'dashscope::wan-target';
    const capabilityConfig = {
        version: 1,
        video: {
            defaultRatio: '16:9', defaultResolution: '720p', defaultOperation: 'text_to_video',
            references: { promptMaxChars: 1000, maxImages: 9, maxVideos: 3, maxAudios: 3, minImages: 0, maxVideoDurationSeconds: 30, maxAudioDurationSeconds: 30 },
            operations: ['text_to_video'], ratios: ['16:9'], resolutions: ['720p'],
            duration: { selection: 'enum', values: [5], default: 5 },
            generateAudio: { supported: true, default: true }, watermark: { supported: false, default: false },
        },
    };
    const config = {
        ...defaultConfig,
        model,
        videoModel: model,
        models: [model],
        videoModels: [model],
        channels: [{ id: 'dashscope', name: 'fixture', enabled: true, baseUrl: 'https://example.test', apiKey: 'fixture', models: ['wan-target'], interfaceType: 'dashscope-wan-video', modelCosts: [{ model: 'wan-target', capability: 'video', protocol: 'dashscope-wan-video', capabilityConfig }] }],
    } as AiConfig;
    expect(assessCaseModels([node], { ...config, channels: [] })[0].status).toBe('unconnected');
    expect(assessCaseModels([node], config)[0].status).toBe('ready');
    config.channels[0].modelCosts![0].protocol = 'newapi-channel-2';
    expect(assessCaseModels([node], config)[0].status).toBe('unconnected');
});

test('Wanx 扩写字段不外溢到其它源模型', () => {
    const result = adaptLtvNativeProject(wanxSnapshot('star-video2.5', 1), { channels: [] }, 'case-not-wanx', '非Wanx');
    const metadata = result.project.nodes.find(node => node.id === 'video')?.metadata;
    expect(metadata?.wanxPromptExtend).toBeUndefined();
    expect(metadata?.ltvExecutionContract).toBe('artdance25');
    expect(result.issues.some(issue => issue.code === 'unmapped-production-parameters' && issue.detail.includes('extendPrompt'))).toBe(true);
});
