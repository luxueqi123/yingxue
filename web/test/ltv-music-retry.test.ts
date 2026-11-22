import { expect, mock, test } from 'bun:test';
import * as React from 'react';
import * as Antd from 'antd';
import * as Config from '../src/stores/use-config-store';
import { adaptLtvNativeProject } from '../src/lib/canvas/ltv-native-project';

const errors: string[] = [];
let submitted: any;
const model = 'music::music_v2_5';
const config = { ...Config.defaultConfig, model, audioModel: model, models: [model], audioModels: [model], channels: [{ id: 'music', name: 'fixture', interfaceType: 'elevenlabs-music', enabled: true, models: ['music_v2_5'], modelCosts: [{ model: 'music_v2_5', capability: 'audio', protocol: 'elevenlabs-music' }] }] } as any;
mock.module('react', () => ({ ...React, useCallback: (fn: unknown) => fn }));
mock.module('antd', () => ({ ...Antd, App: { ...Antd.App, useApp: () => ({ message: { error: (text: string) => errors.push(text), warning: (text: string) => errors.push(text) } }) } }));
const store = Object.assign((select: any) => select({ isAiConfigReady: () => true }), Config.useConfigStore);
mock.module('@/stores/use-config-store', () => ({ ...Config, useEffectiveConfig: () => config, useConfigStore: store }));
const skill = await import('../src/services/skill-runtime');
mock.module('@/services/skill-runtime', () => ({ ...skill, skillRuntime: { ...skill.skillRuntime, prepare: async ({ prompt }: any) => ({ prompt, metadata: {} }) } }));
const actual = await import('../src/lib/canvas/canvas-project-generation');
mock.module('@/lib/canvas/canvas-project-generation', () => ({ ...actual, runCanvasGenerationTaskToConsumer: async (input: any) => { submitted = input; } }));
const { useCanvasGenerationRetry } = await import('../src/pages/canvas/use-canvas-generation-retry');

test('实际重试入口保留用户修改后的曲长和纯音乐要求', async () => {
    const result = adaptLtvNativeProject({ nodes: [{ id: 'music', type: 'audio', position: { x: 0, y: 0 }, data: { action: 'audio_generate', params: {
        model: 'vocal-music', scene: 'Music', prompt: '克制的钢琴', advancedSettings: { music_length_ms: 60000 },
    } } }], edges: [] }, { channels: [] }, 'test', '配乐');
    const source = result.project.nodes[0];
    source.metadata!.model = model;
    source.metadata!.audioMusic = { ...source.metadata!.audioMusic!, durationMs: 90500, forceInstrumental: true };
    const nodesRef = { current: [source] };
    const options: any = { projectId: 'test', addedSkills: [], assets: [], nodesRef, connectionsRef: { current: [] },
        setNodes: (update: any) => { nodesRef.current = update(nodesRef.current); }, setRunningNodeId: () => {},
        startGenerationRequest: () => new AbortController(), finishGenerationRequest: () => {}, bindGenerationTask: () => {}, applyGenerationTaskResult: async () => {} };
    await useCanvasGenerationRetry(options)(source);
    expect(errors).toEqual([]);
    expect(submitted.mode).toBe('audio');
    expect(submitted.metadata.providerOptions['elevenlabs-music']).toEqual({ music_length_ms: 90500, force_instrumental: true });
});
