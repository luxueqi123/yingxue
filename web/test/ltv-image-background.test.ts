import { expect, test } from 'bun:test';
import { adaptLtvNativeProject } from '../src/lib/canvas/ltv-native-project';
import { imageBackgroundTaskMetadata, imageBackgroundSelectionPatch, imageTransparencyTogglePatch, resolveImageBackgroundTransparency } from '../src/lib/canvas/ltv-image-background';
import { assertCanvasGenerationRequirements } from '../src/lib/canvas/canvas-project-generation';
import { defaultConfig, type AiConfig } from '../src/stores/use-config-store';
import type { CanvasNodeData } from '../src/types/canvas';

const source = (background: unknown, model = 'lib-image-2.5-s') => ({ nodes: [{ id: 'image', type: 'image', position: { x: 0, y: 0 },
    data: { action: 'image_generate', params: { model, prompt: 'A tree', count: 1,
        modeType: 'text2image', settings: { background, ratio: '1:1', resolution: '2K', quality: 'high' } } } }], edges: [] });

test('background controls keep displayed transparency and submitted provider values aligned', () => {
    for (const background of ['auto', 'transparent', 'opaque'] as const) {
        const metadata = imageBackgroundSelectionPatch(background);
        expect(resolveImageBackgroundTransparency(metadata, 'true')).toBe(background === 'transparent' ? 'true' : 'false');
        expect(imageBackgroundTaskMetadata(metadata)).toEqual({ providerOptions: { 'openai-image': { background } } });
        expect(imageTransparencyTogglePatch(metadata, 'true')).toEqual(imageBackgroundSelectionPatch('transparent'));
        expect(imageTransparencyTogglePatch(metadata, 'false')).toEqual(imageBackgroundSelectionPatch('opaque'));
    }
    expect(resolveImageBackgroundTransparency({ imageBackground: 'opaque', transparentBackground: 'true' }, 'true')).toBe('false');
    expect(resolveImageBackgroundTransparency({ transparentBackground: 'false' }, 'true')).toBe('false');
    expect(resolveImageBackgroundTransparency(undefined, 'true')).toBe('true');
    expect(imageTransparencyTogglePatch(undefined, 'true')).toEqual({ transparentBackground: 'true' });
});

test('all three source backgrounds retain their exact OpenAI provider option', () => {
    for (const model of ['lib-image-2.5-s', 'lib-image-2.5-f']) {
        for (const background of ['auto', 'transparent', 'opaque']) {
            const snapshot = source(background, model);
            const original = JSON.stringify(snapshot);
            const result = adaptLtvNativeProject(snapshot, { channels: [] }, 'case', 'Tree');
            const metadata = result.project.nodes[0].metadata!;
            expect(metadata.imageBackground).toBe(background);
            expect(imageBackgroundTaskMetadata(metadata)).toEqual({ providerOptions: { 'openai-image': { background } } });
            expect(result.issues.some(issue => issue.code === 'unmapped-production-parameters' && issue.detail.includes('background'))).toBe(false);
            expect(JSON.stringify(snapshot)).toBe(original);
        }
    }
});

test('invalid backgrounds remain explicit unmapped source parameters', () => {
    for (const model of ['lib-image-2.5-s', 'lib-image-2.5-f']) {
        const result = adaptLtvNativeProject(source('green', model), { channels: [] }, 'case', 'Tree');
        expect(result.project.nodes[0].metadata?.imageBackground).toBeUndefined();
        expect(result.issues.some(issue => issue.code === 'unmapped-production-parameters' && issue.detail.includes('background'))).toBe(true);
    }
    expect(() => imageBackgroundTaskMetadata({ imageBackground: 'green' } as never)).toThrow();
    expect(imageBackgroundTaskMetadata(undefined)).toEqual({});
});

test('submission refuses incompatible protocols and undeclared transparent capability', () => {
    const node = { metadata: { imageBackground: 'transparent' } } as CanvasNodeData;
    const config = { ...defaultConfig, model: 'native::image', channels: [{ id: 'native', name: 'fixture', enabled: true,
        apiFormat: 'openai', baseUrl: '/api', models: ['image'], modelCosts: [{ model: 'image', capability: 'image',
            protocol: 'openai-image', capabilityConfig: { version: 1, image: { transparentBackground: { supported: true, default: false } } } }] }] } as unknown as AiConfig;
    expect(() => assertCanvasGenerationRequirements(config, node, 'image')).not.toThrow();
    config.channels[0].modelCosts![0].capabilityConfig!.image!.transparentBackground.supported = false;
    expect(() => assertCanvasGenerationRequirements(config, node, 'image')).toThrow('透明背景');
    node.metadata!.imageBackground = 'opaque';
    expect(() => assertCanvasGenerationRequirements(config, node, 'image')).not.toThrow();
    config.channels[0].modelCosts![0].protocol = 'gemini-image';
    expect(() => assertCanvasGenerationRequirements(config, node, 'image')).toThrow('协议');
});

test('background is consumed from advanced settings only for the verified source models', () => {
    for (const model of ['lib-image-2.5-s', 'lib-image-2.5-f']) {
        const snapshot = source('opaque', model);
        Object.assign(snapshot.nodes[0].data.params, { advancedSettings: { background: 'transparent' } });
        const result = adaptLtvNativeProject(snapshot, { channels: [] }, 'case', 'Tree');
        expect(result.project.nodes[0].metadata?.imageBackground).toBe('transparent');
        expect(result.issues.some(issue => issue.code === 'advanced-operation' && issue.detail.includes('background'))).toBe(false);
        snapshot.nodes[0].data.params.model = 'unverified-model';
        const unknown = adaptLtvNativeProject(snapshot, { channels: [] }, 'case', 'Tree');
        expect(unknown.project.nodes[0]?.metadata?.imageBackground).toBeUndefined();
        expect(unknown.issues.some(issue => issue.code === 'unmapped-production-parameters' && issue.detail.includes('background'))).toBe(true);
    }
});
