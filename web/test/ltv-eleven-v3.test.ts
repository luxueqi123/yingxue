import { test, expect } from 'bun:test';
import { mapLtvSpeechOptions, assertLtvAudioSemantics } from '../src/lib/canvas/ltv-audio-options';
import { adaptLtvNativeProject } from '../src/lib/canvas/ltv-native-project';

const fields={model:'vocal-v3',scene:'Text-to-Speech',voice_id:'vZZLclMx4wouUtKBRfZn',stability:0.5,prompt:'[excited] 原配音！'};
test('Eleven V3 retains voice ID and stability in its own protocol',()=>{
    const mapped=mapLtvSpeechOptions(fields);
    expect(mapped?.options).toMatchObject({ltvExecutionContract:'elevenlabs-v3-audio',audioVoice:fields.voice_id,audioEleven:{stability:0.5}});
    for(const stability of [0,0.5,1])expect(mapLtvSpeechOptions({...fields,stability})?.options.audioEleven).toEqual({stability});
});
test('Eleven V3 does not default a missing voice or discard unsupported parameters',()=>{
    for(const patch of [{voice_id:undefined},{voice_id:'bad/voice'},{stability:0.25},{voice_setting_speed:2},{format:'wav'},{sample_rate:48000},{modeType:'audio2audio'}])expect(mapLtvSpeechOptions({...fields,...patch})).toBeNull();
});
test('old generic speech mapping cannot substitute another model for Eleven V3',()=>{
    expect(()=>assertLtvAudioSemantics({generationModelProvenance:{sourceModel:'vocal-v3',convertedModel:'speech::tts',operation:'text2audio'}})).toThrow('Eleven');
});
test('native Eleven V3 source binds exact model instead of generic speech',()=>{
    const result=adaptLtvNativeProject({nodes:[{id:'v',type:'audio',position:{x:0,y:0},data:{action:'audio_generate',params:fields}}],edges:[]},{channels:[]},'v','voice');
    expect(result.adoptable).toBe(true);
    expect(result.issues.some(i=>i.code==='channel-configuration-required'&&i.detail.includes('elevenlabs-v3-audio'))).toBe(true);
});
