import { expect, test } from 'bun:test';
import { adaptLtvNativeProject } from '../src/lib/canvas/ltv-native-project';
import { mapLtvSpeechOptions } from '../src/lib/canvas/ltv-audio-options';
import { assertCanvasGenerationRequirements } from '../src/lib/canvas/canvas-project-generation';
import { defaultConfig } from '../src/stores/use-config-store';
import { CanvasNodeType, type CanvasNodeData } from '../src/types/canvas';

function convert(extra: Record<string, unknown> = {}) {
    return adaptLtvNativeProject({ nodes: [{ id: 'speech', type: 'audio', position: { x: 0, y: 0 }, data: { action: 'audio_generate', params: {
        model: 'seed-audio-1.0', scene: 'Text-to-Speech', modeType: 'text2audio', prompt: '旁白正文', count: 1,
        settings: { language: 'zh', sample_rate: 24000, format: 'wav', ...(extra.settings as object || {}) },
        advancedSettings: { voice_setting_speed: 1, voice_setting_pitch: 0, voice_setting_vol: 1, ...(extra.advancedSettings as object || {}) },
        ...(extra.root as object || {}),
    } } }], edges: [] }, { channels: [] }, 'test', '语音');
}

test('Seed Audio音效生成保留适配缺口，不误标为OpenAI配音配置', () => {
    const result = convert();
    expect(result.readiness.status).toBe('adaptation-required');
    expect(result.adoptable).toBe(false);
    expect(result.issues.some(issue => issue.code === 'audio-adapter-required')).toBe(true);
    expect(result.issues.some(issue => issue.code === 'channel-configuration-required' && issue.detail.includes('openai-audio'))).toBe(false);
    expect(mapLtvSpeechOptions({model:'seed-audio-1.0',scene:'Text-to-Speech',modeType:'text2audio',voice_setting_voice_id:'voice'})).toBeNull();
});

test('宿主没有落点的音频参数保留为待适配，不静默丢弃', () => {
    // language and sample_rate have no host field; a changed value must stay reported.
    expect(convert({ settings: { language: 'en' } }).issues.some(issue => issue.code === 'unmapped-production-parameters')).toBe(true);
    expect(convert({ settings: { sample_rate: 48000 } }).issues.some(issue => issue.code === 'unmapped-production-parameters')).toBe(true);
    // Non-neutral effect values and unsupported formats must not be replaced or dropped.
    expect(convert({ advancedSettings: { voice_setting_vol: 2.5 } }).issues.some(issue => issue.code === 'unmapped-production-parameters')).toBe(true);
    expect(convert({ settings: { format: 'ogg_opus' } }).issues.some(issue => issue.code === 'unmapped-production-parameters')).toBe(true);
});

test('参考音频操作仍需要独立协议，不被普通文本配音放行', () => {
    const result = convert({ root: { modeType: 'audio2audio' } });
    expect(result.adoptable).toBe(false);
    expect(result.issues.some(issue => issue.code === 'audio-adapter-required')).toBe(true);
});

test('已有来源可追溯的Seed Audio工程在首次生成与重试共用守卫中拦截误配音', () => {
    const node: CanvasNodeData = {id:'audio',title:'音效',type:CanvasNodeType.Audio,position:{x:0,y:0},width:350,height:240,
        metadata:{generationMode:'audio',generationModelProvenance:{sourceModel:'seed-audio-1.0',convertedModel:'speech::tts',operation:'text2audio'}}};
    expect(()=>assertCanvasGenerationRequirements(defaultConfig,node,'audio')).toThrow('音效');
    node.metadata!.strictGenerationOptions=['model'];
    expect(()=>assertCanvasGenerationRequirements(defaultConfig,node,'audio')).toThrow('音效');
});

test('有明确Text-to-Speech语义的语音字段仍保留原合同', () => {
    const fields={model:'speech-2.8-hd',scene:'Text-to-Speech',modeType:'text2audio',voice_setting_voice_id:'narrator',voice_setting_speed:1.25,voice_setting_vol:1};
    const mapping=mapLtvSpeechOptions(fields);
    expect(mapping?.options.audioVoice).toBe('narrator');
    expect(mapping?.options.audioSpeed).toBe('1.25');
    expect(mapping?.options.audioFormat).toBe('mp3');
    expect(mapLtvSpeechOptions({...fields,format:'wav'})).toBeNull();
});
