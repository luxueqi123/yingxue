import { expect, mock, test } from 'bun:test';
import * as React from 'react';
import * as Antd from 'antd';
import * as Config from '../src/stores/use-config-store';
import { adaptLtvNativeProject } from '../src/lib/canvas/ltv-native-project';
const errors: string[] = []; let submitted: any;
const model = 'topaz::CGI';
const config = { ...Config.defaultConfig, model, imageModel: model, size: 'auto', count: '1', models: [model], imageModels: [model], channels: [{ id: 'topaz', name: 'fixture', baseUrl: 'https://example.test', interfaceType: 'topaz-image-enhance', enabled: true, models: ['CGI'], modelCosts: [{ model: 'CGI', capability: 'image', protocol: 'topaz-image-enhance' }] }] } as any;
mock.module('react', () => ({ ...React, useCallback: (fn: unknown) => fn }));
mock.module('antd', () => ({ ...Antd, App: { ...Antd.App, useApp: () => ({ message: { error: (s: string) => errors.push(s), warning: (s: string) => errors.push(s) } }) } }));
const store = Object.assign((select: any) => select({ isAiConfigReady: () => true }), Config.useConfigStore);
mock.module('@/stores/use-config-store', () => ({ ...Config, useEffectiveConfig: () => config, useConfigStore: store }));
const skill = await import('../src/services/skill-runtime');
mock.module('@/services/skill-runtime', () => ({ ...skill, skillRuntime: { ...skill.skillRuntime, prepare: async ({ prompt }: any) => ({ prompt, metadata: {} }) } }));
const storage = await import('../src/services/image-storage');
mock.module('@/services/image-storage', () => ({ ...storage, imageToDataUrl: async () => 'data:image/png;base64,AA==' }));
const upload = await import('../src/lib/canvas/canvas-file-upload');
mock.module('@/lib/canvas/canvas-file-upload', () => ({ ...upload, readUploadImageSize: async () => ({ width: 123, height: 77 }) }));
const actual = await import('../src/lib/canvas/canvas-project-generation');
mock.module('@/lib/canvas/canvas-project-generation', () => ({ ...actual, runCanvasGenerationTaskToConsumer: async (input: any) => { submitted = input; } }));
const { useCanvasGenerationRetry } = await import('../src/pages/canvas/use-canvas-generation-retry');

test('空提示词增强节点真实重试沿原图引用，使用当前倍数及重新解码的尺寸', async () => {
    const converted = adaptLtvNativeProject({ nodes: [
        { id: 'r', type: 'image', position: { x: 0, y: 0 }, data: { action: 'image_resource', url: ['https://example.test/original.png'] } },
        { id: 'e', type: 'image', position: { x: 400, y: 0 }, data: { action: 'image_generate', params: { model: 'topaz-image-upscaler', advancedSettings: { style: 'CGI', scale: 4 } } } },
    ], edges: [{ id: 'ref', source: 'r', target: 'e' }] }, { channels: [] }, 'case', '增强');
    expect(converted.issues.filter(issue => issue.code === 'advanced-operation')).toEqual([]);
    const source = converted.project.nodes.find(node => node.id === 'e')!;
    source.metadata!.model = model;
    source.metadata!.imageEnhancement!.scale = 6;
    const nodesRef = { current: converted.project.nodes };
    await useCanvasGenerationRetry({ projectId: 'test', addedSkills: [], assets: [], nodesRef, connectionsRef: { current: converted.project.connections }, setNodes: (f: any) => { nodesRef.current = f(nodesRef.current); }, setRunningNodeId: () => {}, startGenerationRequest: () => new AbortController(), finishGenerationRequest: () => {}, bindGenerationTask: () => {}, applyGenerationTaskResult: async () => {} } as any)(source);
    expect(errors).toEqual([]);
    expect(submitted?.mode).toBe('image');
    expect(submitted.prompt).toBe('');
    expect(submitted.referenceImages).toHaveLength(1);
    expect(submitted.referenceImages[0].width).toBe(123);
    expect(submitted.metadata.providerOptions['topaz-image-enhance']).toEqual({ output_width: 738, output_height: 462 });
});
