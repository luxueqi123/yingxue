import { test, expect } from 'bun:test';
import { mapLtvMusicOptions, assertMurekaMusic, musicTaskMetadata } from '../src/lib/canvas/ltv-music-options';
import { adaptLtvNativeProject } from '../src/lib/canvas/ltv-native-project';
import { defaultConfig, type AiConfig } from '../src/stores/use-config-store';

const fields = { model:'mureka-8',scene:'Music',force_instrumental:1,prompt:'保留完整纯音乐描述' };
const config = { ...defaultConfig, model:'music::mureka-8',count:'1',channels:[{
    id:'music',name:'music',enabled:true,apiFormat:'openai',baseUrl:'/api',apiKey:'fixture',models:['mureka-8'],modelCosts:[{model:'mureka-8',capability:'audio',protocol:'mureka-instrumental'}],
}] } as AiConfig;
test('Mureka 8 preserves explicit instrumental selection and exact provider', () => {
    const metadata=mapLtvMusicOptions(fields)!.options;
    expect(()=>assertMurekaMusic(metadata,config,fields.prompt,0)).not.toThrow();
    expect(musicTaskMetadata(metadata.audioMusic)).toEqual({providerOptions:{'mureka-instrumental':{forceInstrumental:true}}});
    for(const patch of [{force_instrumental:0},{force_instrumental:undefined},{music_length_ms:60000},{modeType:'audio2audio'},{model:'mureka-9'}])expect(mapLtvMusicOptions({...fields,...patch})).toBeNull();
});
test('Mureka 8 rejects lossy runtime changes', () => {
    const metadata=mapLtvMusicOptions(fields)!.options;
    expect(()=>assertMurekaMusic(metadata,config,'文'.repeat(1024),0)).not.toThrow();
    expect(()=>assertMurekaMusic(metadata,config,'文'.repeat(1025),0)).toThrow();
    expect(()=>assertMurekaMusic(metadata,config,'  ',0)).toThrow();
    expect(()=>assertMurekaMusic(metadata,config,'音乐',1)).toThrow();
    expect(()=>assertMurekaMusic(metadata,{...config,count:'2'},'音乐',0)).toThrow();
    expect(()=>assertMurekaMusic(metadata,{...config,model:'music::music_v2_5'},'音乐',0)).toThrow();
    expect(()=>musicTaskMetadata({...metadata.audioMusic!,durationMs:60000})).toThrow();
});
test('combined text references cannot exceed the original prompt contract', () => {
    const source={nodes:[{id:'m',type:'audio',position:{x:0,y:0},data:{action:'audio_generate',params:{...fields,prompt:'文'.repeat(1025),count:1}}}],edges:[]};
    const result=adaptLtvNativeProject(source,{channels:[]},'m','music');
    expect(result.adoptable).toBe(false);
    expect(result.issues.some(i=>i.code==='audio-adapter-required'&&i.detail.includes('1024'))).toBe(true);
});
