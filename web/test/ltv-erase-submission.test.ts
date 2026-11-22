import { test, expect, mock } from 'bun:test';
import * as React from 'react';
import * as Antd from 'antd';
import * as Config from '../src/stores/use-config-store';
import { adaptLtvNativeProject } from '../src/lib/canvas/ltv-native-project';

const model = 'mask::image';
const capabilityConfig = { version: 1, image: {
    references: { promptMaxChars: 1000, maxImages: 1, maxImageBytes: 10000000, maskSupported: true },
    size: { parameter: 'size', values: ['2048x2048', '3584x4800'], default: '2048x2048', allowCustom: false },
    quality: { supported: true, values: ['high'], default: 'high' },
    transparentBackground: { supported: false, default: false }, responseFormat: { supported: true },
    outputFormat: { supported: true }, maxOutputs: 1,
} };
const config = { ...Config.defaultConfig, model, imageModel: model, size: '2048x2048', count: '1', quality: 'high',
    models: [model], imageModels: [model], channels: [{ id: 'mask', name: 'fixture', enabled: true, baseUrl: '/api', apiKey: 'fixture', apiFormat: 'openai', models: ['image'],
        modelCosts: [{ model: 'image', capability: 'image', protocol: 'openai-image', capabilityConfig }] }],
} as unknown as Config.AiConfig;
const errors: string[] = []; const submitted: any[] = [];
mock.module('react', () => ({ ...React, useCallback: (fn: unknown) => fn, useRef: (value: unknown) => ({ current: value }) }));
mock.module('antd', () => ({ ...Antd, App: { ...Antd.App, useApp: () => ({ message: { error: (s: string) => errors.push(s), warning: (s: string) => errors.push(s), info: () => {} } }) } }));
const store = Object.assign((select: any) => select({ isAiConfigReady: () => true }), Config.useConfigStore);
mock.module('@/stores/use-config-store', () => ({ ...Config, useEffectiveConfig: () => config, useConfigStore: store }));
const skill = await import('../src/services/skill-runtime');
mock.module('@/services/skill-runtime', () => ({ ...skill, skillRuntime: { ...skill.skillRuntime, prepare: async ({ prompt }: any) => ({ prompt, metadata: {} }) } }));
const storage = await import('../src/services/image-storage');
mock.module('@/services/image-storage', () => ({ ...storage, imageToDataUrl: async () => 'data:image/png;base64,AA==' }));
const actual = await import('../src/lib/canvas/canvas-project-generation');
mock.module('@/lib/canvas/canvas-project-generation', () => ({ ...actual, runCanvasGenerationTaskToConsumer: async (input: any) => { submitted.push(input); } }));
const { useCanvasGenerationExecutor } = await import('../src/pages/canvas/use-canvas-generation-executor');
const { useCanvasGenerationRetry } = await import('../src/pages/canvas/use-canvas-generation-retry');

test('initial and retry hooks preserve erase composites and separate 4K redraw masks', async () => {
    for (const [scene, retry] of [['erase', false], ['erase', true], ['redraw', false], ['redraw', true]] as const) {
        const redraw = scene === 'redraw';
        config.size = redraw ? '3584x4800' : '2048x2048';
        errors.length = 0; submitted.length = 0;
        const result = adaptLtvNativeProject({ nodes: [
            { id: 'original', type: 'image', position: { x: 0, y: 0 }, data: { action: 'image_resource', url: ['https://example.test/original.png'] } },
            { id: 'edit', type: 'image', position: { x: 400, y: 0 }, resourceMeta: { items: [{ width: redraw ? 3584 : 2048, height: redraw ? 4800 : 2048 }] },
                data: { action: 'image_generate', params: { scene, originImage: redraw ? 'https://example.test/original.png' : 'https://example.test/composite.png',
                    ...(redraw ? { mark: 'https://example.test/composite.png', prompt: 'Edit selected area' } : {}), quality: redraw ? '4K' : '2K', ratio: redraw ? '3:4' : '1:1', n: 1, modeType: 'image2image' } } },
        ], edges: [{ id: 'ref', source: 'original', target: 'edit' }] }, { channels: [] }, 'square', 'Square');
        expect(result.adoptable).toBe(true);
        const source = result.project.nodes.find(n => n.id === 'edit')!;
        source.metadata!.model = model;
        const nodesRef = { current: JSON.parse(JSON.stringify(result.project.nodes)) };
        const options: any = { projectId: 'fixture', addedSkills: [], assets: [], nodesRef, connectionsRef: { current: result.project.connections },
            setNodes: (f: any) => { nodesRef.current = typeof f === 'function' ? f(nodesRef.current) : f; }, setConnections: () => {},
            setSelectedNodeIds: () => {}, setSelectedConnectionId: () => {}, setDialogNodeId: () => {}, setRunningNodeId: () => {},
            startGenerationRequest: () => new AbortController(), finishGenerationRequest: () => {}, bindGenerationTask: () => {}, applyGenerationTaskResult: async () => {} };
        if (retry) await useCanvasGenerationRetry(options)(nodesRef.current.find((n: any) => n.id === 'edit'));
        else await useCanvasGenerationExecutor(options)('edit', 'image', source.metadata!.prompt!);
        expect(errors).toEqual([]);
        expect(submitted).toHaveLength(1);
        expect(submitted[0].referenceImages).toHaveLength(1);
        if (redraw) expect(submitted[0].referenceImages[0].dataUrl).toBe('data:image/png;base64,AA==');
        else expect(submitted[0].referenceImages[0].url).toBe('https://example.test/composite.png');
        expect(submitted[0].mask.url).toBe('https://example.test/composite.png');
        expect(submitted[0].config.size).toBe(config.size);
        expect(nodesRef.current.find((n: any) => n.id === 'original').metadata.content).toBe('https://example.test/original.png');
        if (!retry) {
            nodesRef.current = JSON.parse(JSON.stringify(nodesRef.current));
            submitted.length = 0;
            await useCanvasGenerationRetry(options)(nodesRef.current.find((n: any) => n.id === 'edit'));
            expect(errors).toEqual([]);
            expect(submitted).toHaveLength(1);
            if (redraw) expect(submitted[0].referenceImages[0].dataUrl).toBe('data:image/png;base64,AA==');
            else expect(submitted[0].referenceImages[0].url).toBe('https://example.test/composite.png');
            expect(submitted[0].mask.url).toBe('https://example.test/composite.png');
        }
    }
});
