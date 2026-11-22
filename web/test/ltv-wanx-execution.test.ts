import { expect, mock, test } from 'bun:test';
import * as React from 'react';
import * as Antd from 'antd';
import * as Config from '../src/stores/use-config-store';
import { adaptLtvNativeProject } from '../src/lib/canvas/ltv-native-project';
import { defaultConfig } from '../src/stores/use-config-store';
import { apiClient } from '../src/services/api/request';
import { applyGenerationTaskResultToNodes } from '../src/lib/canvas/canvas-generation-task-sync';

const model = 'dashscope::wan-target';
const provider = 'dashscope-wan-video';
const protocol = {
    id: 'dashscope',
    name: 'fixture',
    enabled: true,
    baseUrl: 'https://example.test',
    apiKey: 'fixture',
    interfaceType: provider,
    models: ['wan-target'],
    modelCosts: [{
        model: 'wan-target', capability: 'video', protocol: provider,
        capabilityConfig: {
            version: 1,
            video: {
                defaultRatio: '16:9', defaultResolution: '720p', defaultOperation: 'text_to_video',
                references: { promptMaxChars: 1000, maxImages: 9, maxVideos: 3, maxAudios: 3, minImages: 0, maxVideoDurationSeconds: 30, maxAudioDurationSeconds: 30 },
                operations: ['text_to_video'], ratios: ['16:9'], resolutions: ['720p'],
                duration: { selection: 'enum', values: [5], default: 5 },
                generateAudio: { supported: true, default: true }, watermark: { supported: false, default: false },
            },
        },
    }],
};
const config = { ...defaultConfig, model, videoModel: model, models: [model], videoModels: [model], channels: [protocol] } as any;
const project = () => adaptLtvNativeProject({
    nodes: [{
        id: 'wanx-video', type: 'video', position: { x: 0, y: 0 },
        data: { action: 'video_generate', params: {
            model: 'wanx3.0', modeType: 'text2video', prompt: '海边的晨雾缓缓散开', ratio: '16:9', resolution: '720P', duration: 5,
            count: 1, enableSound: 'off', advancedSettings: { extendPrompt: 0 },
        } },
    }],
    edges: [],
}, { channels: [] }, 'case-wanx-execution', 'Wanx').project.nodes[0];

const errors: string[] = [];
let submitted: any;
mock.module('react', () => ({ ...React, useCallback: (fn: unknown) => fn }));
mock.module('antd', () => ({ ...Antd, App: { ...Antd.App, useApp: () => ({ message: { error: (value: string) => errors.push(value), warning: (value: string) => errors.push(value) } }) } }));
const store = Object.assign((select: any) => select({ isAiConfigReady: () => true }), Config.useConfigStore);
mock.module('@/stores/use-config-store', () => ({ ...Config, useEffectiveConfig: () => config, useConfigStore: store }));
const skill = await import('../src/services/skill-runtime');
mock.module('@/services/skill-runtime', () => ({ ...skill, skillRuntime: { ...skill.skillRuntime, prepare: async ({ prompt }: any) => ({ prompt, metadata: {} }) } }));
const actual = await import('../src/lib/canvas/canvas-project-generation');
mock.module('@/lib/canvas/canvas-project-generation', () => ({ ...actual, runCanvasGenerationTaskToConsumer: async (input: any, consumer: any) => {
    submitted = input;
    await consumer?.consumeTask?.({
        id: 'wanx-task', status: 'succeeded', taskType: 'video', inputJson: JSON.stringify(input),
        resultJson: JSON.stringify({ video: { dataUrl: '/api/resources/wanx/file', storageKey: 'resource:wanx', mimeType: 'video/mp4' } }),
    });
} }));
const { executeVideoGeneration } = await import('../src/pages/canvas/canvas-media-generation-executors');
const { useCanvasGenerationRetry } = await import('../src/pages/canvas/use-canvas-generation-retry');

test('Wanx首次视频执行器实际提交 DashScope Wan prompt_extend=false', async () => {
    submitted = undefined;
    const source: any = project();
    source.metadata.model = model;
    let nodes = [source];
    let connections: any[] = [];
    const adapter = apiClient.defaults.adapter;
    apiClient.defaults.adapter = async (request: any) => ({
        data: { code: 0, data: { items: JSON.parse(request.data).map((item: { resourceId: string }) => ({ ...item, access: { url: `/api/resources/${item.resourceId}/file` } })) } },
        status: 200, statusText: 'OK', headers: {}, config: request,
    }) as any;
    try {
        await executeVideoGeneration({
            nodeId: source.id, sourceNode: source, prompt: source.metadata.prompt, effectivePrompt: source.metadata.prompt,
            generationConfig: { ...config, model, videoSeconds: '5', vquality: '720', videoGenerateAudio: 'false' },
            generationContext: { referenceImages: [], referenceVideos: [], referenceAudios: [], resolvedCharacterVersions: [], resolvedCharacterVoices: [] },
            controller: new AbortController(), projectId: 'fixture', canvasConnections: [],
            setNodes: (value: any) => { nodes = typeof value === 'function' ? value(nodes) : value; },
            setConnections: (value: any) => { connections = typeof value === 'function' ? value(connections) : value; },
            startGenerationRequest: () => {}, finishGenerationRequest: () => {}, bindGenerationTask: () => {}, registerPendingNodeIds: () => {},
            applyGenerationTaskResult: async (id: string, task: any) => { nodes = (await applyGenerationTaskResultToNodes(nodes, task, id)).nodes; },
            taskContext: {}, styleMetadata: {}, skillMetadata: {}, retryContext: {},
        } as any);
        expect(submitted.mode).toBe('video');
        expect(submitted.metadata.providerOptions[provider]).toEqual({ prompt_extend: false });
        const result = nodes.find((node) => node.metadata?.storageKey === 'resource:wanx');
        expect(result?.metadata?.wanxPromptExtend).toEqual(source.metadata.wanxPromptExtend);
        expect(result?.metadata?.ltvExecutionContract).toBe('wanx-prompt-extend');
    } finally {
        apiClient.defaults.adapter = adapter;
    }
});

test('Wanx视频重试实际提交 DashScope Wan prompt_extend=false', async () => {
    submitted = undefined;
    errors.length = 0;
    const source: any = project();
    source.metadata.model = model;
    const nodesRef = { current: [source] };
    await useCanvasGenerationRetry({
        projectId: 'fixture', addedSkills: [], assets: [], nodesRef, connectionsRef: { current: [] },
        setNodes: (update: any) => { nodesRef.current = update(nodesRef.current); },
        setRunningNodeId: () => {}, startGenerationRequest: () => new AbortController(), finishGenerationRequest: () => {},
        bindGenerationTask: () => {}, applyGenerationTaskResult: async () => {},
    } as any)(source);
    expect(errors).toEqual([]);
    expect(submitted.mode).toBe('video');
    expect(submitted.metadata.providerOptions[provider]).toEqual({ prompt_extend: false });
});
