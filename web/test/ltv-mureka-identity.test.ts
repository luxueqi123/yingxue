import { expect, test } from 'bun:test';
import { mapLtvMusicOptions, musicTaskMetadata } from '../src/lib/canvas/ltv-music-options';
import { assertLtvAudioSemantics } from '../src/lib/canvas/ltv-audio-options';

test.each(['mureka-8', 'mureka-9', 'mureka-9.5'])('%s cannot be mapped to an ElevenLabs contract', (model) => {
    const mapped = mapLtvMusicOptions({ model, scene: 'Music', modeType: 'text2audio', force_instrumental: 1 });
    if (model === 'mureka-8') expect(mapped?.options.audioMusic?.provider).toBe('mureka-instrumental');
    else expect(mapped).toBeNull();
});

test.each(['mureka-8', 'mureka-9', 'mureka-9.5'])('stored %s nodes cannot execute the old cross-vendor mapping', (sourceModel) => {
    const music = { provider: 'elevenlabs-music' as const, sourceModel, forceInstrumental: true };
    expect(() => musicTaskMetadata(music)).toThrow('Mureka');
    expect(() => assertLtvAudioSemantics({ audioMusic: music })).toThrow('Mureka');
});

test('existing ElevenLabs source mapping is preserved', () => {
    const mapped = mapLtvMusicOptions({ model: 'vocal-music', scene: 'Music', music_length_ms: 60000, force_instrumental: 1 });
    expect(mapped?.options.audioMusic?.provider).toBe('elevenlabs-music');
    expect(musicTaskMetadata(mapped!.options.audioMusic)).toEqual({ providerOptions: { 'elevenlabs-music': { music_length_ms: 60000, force_instrumental: true } } });
});
