import { expect, test } from 'bun:test';
import { adaptLtvNativeProject } from '../src/lib/canvas/ltv-native-project';
import { mapLtvMusicOptions, musicTaskMetadata } from '../src/lib/canvas/ltv-music-options';
import { assertCanvasGenerationRequirements } from '../src/lib/canvas/canvas-project-generation';
import { defaultConfig } from '../src/stores/use-config-store';
import { isolateCopiedNodeMetadata } from '../src/lib/canvas/canvas-node-copy';

function convert(extra: Record<string, unknown> = {}) {
    return adaptLtvNativeProject({ nodes: [{ id: 'music', type: 'audio', position: { x: 0, y: 0 }, data: { action: 'audio_generate', params: {
        model: 'vocal-music', scene: 'Music', modeType: 'text2audio', prompt: '雨夜中克制的钢琴与弦乐', count: 1, advancedSettings: { music_length_ms: 60000 }, ...extra,
    } } }], edges: [] }, { channels: [] }, 'test', '音乐');
}

test('原音乐曲长完整导入，缺渠道保留明确配置入口，不猜测源模型别名', () => {
    const result = convert();
    expect(result.adoptable).toBe(true);
    expect(result.readiness.status).toBe('configuration-required');
    const node = JSON.parse(JSON.stringify(result.project.nodes[0]));
    expect(node.metadata.audioMusic).toEqual({ provider: 'elevenlabs-music', durationMs: 60000, forceInstrumental: false, sourceModel: 'vocal-music' });
    expect(node.metadata.model).toBe('');
    expect(musicTaskMetadata(node.metadata.audioMusic)).toEqual({ providerOptions: { 'elevenlabs-music': { music_length_ms: 60000, force_instrumental: false } } });
    const copy = isolateCopiedNodeMetadata(node, new Map([['music','copy']]));
    copy.audioMusic!.durationMs = 90000;
    expect(node.metadata.audioMusic.durationMs).toBe(60000);
});

test('音乐参数和能力不足不能用普通配音或忽略输入放行', () => {
    expect(mapLtvMusicOptions({ model: 'vocal-music', scene: 'Music', music_length_ms: 2 })).toBeNull();
    expect(mapLtvMusicOptions({ model: 'seed-audio-1.0', scene: 'Music' })).toBeNull();
    expect(convert({ modeType: 'audio2audio' }).adoptable).toBe(false);
    expect(convert({ count: 2 }).adoptable).toBe(false);
    const node = convert().project.nodes[0];
    node.metadata!.model = 'music_v2_5';
    const config = { ...defaultConfig, model: 'music::music_v2_5', count: '1', channels: [{ id: 'music', name: 'music', models: ['music_v2_5'], interfaceType: 'elevenlabs-music', modelCosts: [{ model: 'music_v2_5', capability: 'audio', protocol: 'elevenlabs-music' }] }] } as any;
    expect(() => assertCanvasGenerationRequirements(config, node, 'audio')).not.toThrow();
    config.channels[0].interfaceType = 'openai-audio';
    config.channels[0].modelCosts[0].protocol = 'openai-audio';
    expect(() => assertCanvasGenerationRequirements(config, node, 'audio')).toThrow('配音模型');
});
