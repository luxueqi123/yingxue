import { expect, test } from 'bun:test';
import { adaptLtvNativeProject } from '../src/lib/canvas/ltv-native-project';
import { mapLtvMusicOptions } from '../src/lib/canvas/ltv-music-options';

test('原 Mureka 纯乐器参数不能证明与 ElevenLabs 是同一音乐合同', () => {
    const mapped = mapLtvMusicOptions({ model: 'mureka-8', scene: 'Music', modeType: 'text2audio', force_instrumental: 1 })!;
    expect(mapped.options.audioMusic).toEqual({ provider: 'mureka-instrumental', forceInstrumental: true, sourceModel: 'mureka-8' });
    const result = adaptLtvNativeProject({ nodes: [{ id: 'm', type: 'audio', position: { x: 0, y: 0 }, data: { action: 'audio_generate', params: {
        model: 'mureka-8', scene: 'Music', modeType: 'text2audio', prompt: '雨夜爵士', count: 1, advancedSettings: { force_instrumental: 1 },
    } } }], edges: [] }, { channels: [] }, 'test', '音乐');
    expect(result.adoptable).toBe(true);
    expect(result.issues.some(issue => issue.code === 'channel-configuration-required' && issue.detail.includes('mureka-instrumental'))).toBe(true);
});

test('音乐合同不吞掉它表达不了的操作与参数', () => {
    expect(mapLtvMusicOptions({ model: 'mureka-8', scene: 'Music', modeType: 'lyrics2audio', force_instrumental: 1 })).toBeNull();
    expect(mapLtvMusicOptions({ model: 'mureka-8', scene: 'Music', modeType: 'audio2audio', force_instrumental: 1 })).toBeNull();
    expect(mapLtvMusicOptions({ model: 'mureka-8', scene: 'Music', modeType: 'text2audio', music_length_ms: 60000 })).toBeNull();
    expect(mapLtvMusicOptions({ model: 'mureka-99', scene: 'Music', modeType: 'text2audio' })).toBeNull();
    expect(mapLtvMusicOptions({ model: 'vocal-music', scene: 'Other', modeType: 'text2audio' })).toBeNull();
});
