import {test,expect} from 'bun:test';
import {mapLtvSpeechOptions} from '../src/lib/canvas/ltv-audio-options';
import {adaptLtvNativeProject} from '../src/lib/canvas/ltv-native-project';
import {assertMiniMaxSpeech,miniMaxSpeechTaskMetadata} from '../src/lib/canvas/ltv-minimax-speech';
import {defaultConfig,type AiConfig} from '../src/stores/use-config-store';

const fields={model:'speech-2.8-hd',scene:'Text-to-Speech',prompt:'你好',voice_setting_voice_id:'female-shaonv',voice_setting_speed:1,voice_setting_vol:1,voice_setting_pitch:0};
test('Speech 2.8 retains exact provider identity and non-neutral source voice controls',()=>{
    const mapped=mapLtvSpeechOptions({...fields,voice_setting_vol:2,voice_setting_pitch:-3,voice_modify_timbre:20,voice_modify_sound_effects:'robotic'});
    expect(mapped?.options).toMatchObject({ltvExecutionContract:'minimax-speech28-audio',audioVoice:'female-shaonv',audioSpeech:{volume:2,pitch:-3,timbre:20,soundEffects:'robotic'}});
    expect(mapLtvSpeechOptions(fields)?.options.ltvExecutionContract).toBe('minimax-speech28-audio');
});
test('Speech 2.8 source nodes require their own protocol instead of generic speech',()=>{
    const source={nodes:[{id:'speech',type:'audio',position:{x:0,y:0},data:{action:'audio_generate',params:fields}}],edges:[]};
    const result=adaptLtvNativeProject(source,{channels:[]},'speech','Speech');
    expect(result.project.nodes[0].metadata).toMatchObject({model:'',ltvExecutionContract:'minimax-speech28-audio'});
    expect(result.issues.some(i=>i.code==='channel-configuration-required'&&i.detail.includes('minimax-speech28-audio'))).toBe(true);
});

test('Speech 2.8 rejects unsupported controls without falling into generic speech',()=>{
    for(const patch of [{voice_setting_speed:3},{voice_setting_vol:0},{voice_setting_pitch:1.5},{voice_modify_timbre:101},{voice_modify_sound_effects:'unknown'},{sample_rate:44100},{language:'auto'},{format:'wav'}]){
        expect(mapLtvSpeechOptions({...fields,...patch})).toBeNull();
    }
});

test('Speech 2.8 submission preserves its namespace and stops model, text or media loss',()=>{
    const metadata=mapLtvSpeechOptions({...fields,voice_modify_timbre:-10})!.options;
    const config={...defaultConfig,model:'voice::speech-2.8-hd',count:'1',audioVoice:'female-shaonv',audioSpeed:'1',audioFormat:'mp3',channels:[{
        id:'voice',name:'voice',enabled:true,apiFormat:'openai',baseUrl:'/api',apiKey:'fixture',models:['speech-2.8-hd'],modelCosts:[{model:'speech-2.8-hd',capability:'audio',protocol:'minimax-speech28-audio'}],
    }]} as AiConfig;
    expect(()=>assertMiniMaxSpeech(metadata,config,'你好',0)).not.toThrow();
    expect(miniMaxSpeechTaskMetadata(metadata)).toEqual({providerOptions:{'minimax-speech28-audio':{volume:1,pitch:0,modifyPitch:0,intensity:0,timbre:-10,soundEffects:''}}});
    expect(()=>assertMiniMaxSpeech(metadata,config,'文'.repeat(10000),0)).toThrow();
    expect(()=>assertMiniMaxSpeech(metadata,config,'你好',1)).toThrow();
    expect(()=>assertMiniMaxSpeech(metadata,{...config,audioFormat:'wav'},'你好',0)).toThrow();
    config.channels[0].modelCosts![0].protocol='openai-audio';
    expect(()=>assertMiniMaxSpeech(metadata,config,'你好',0)).toThrow();
});
