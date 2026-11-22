import {test,expect} from 'bun:test';
import {adaptLtvNativeProject} from '../src/lib/canvas/ltv-native-project';
import {assertCanvasGenerationRequirements,buildGenerationConfig} from '../src/lib/canvas/canvas-project-generation';
import {defaultConfig} from '../src/stores/use-config-store';

test('native search video waits for configuration and preserves explicit quality and sound',()=>{
 const converted=adaptLtvNativeProject({nodes:[{id:'v',type:'video',position:{x:0,y:0},data:{action:'video_generate',params:{model:'star-video2',modeType:'text2video',prompt:'雨夜镜头',ratio:'16:9',resolution:'4k',duration:5,enableSound:'off',search_enabled:1,count:1}}}],edges:[]},{channels:[]},'test','story');
 const node=converted.project.nodes[0];
 expect(converted.adoptable).toBe(true);
 expect(node.metadata).toMatchObject({model:'',videoWebSearch:true,ltvExecutionContract:'ark-video-search',vquality:'4k',generateAudio:'false',seconds:'5'});
 expect(converted.issues.some(x=>x.code==='channel-configuration-required')).toBe(true);
 expect(()=>assertCanvasGenerationRequirements(defaultConfig,node,'video')).toThrow();
 const name='doubao-seedance-2-0-260128',model='ark::'+name;
 const profile={version:1,video:{defaultRatio:'16:9',defaultResolution:'2160p',defaultOperation:'text_to_video',references:{promptMaxChars:2000,maxImages:9,maxVideos:3,maxAudios:3,minImages:0,maxVideoDurationSeconds:15,maxAudioDurationSeconds:15},operations:['text_to_video'],ratios:['16:9'],resolutions:['2160p'],duration:{selection:'enum',values:[5],default:5},generateAudio:{supported:true,default:true},watermark:{supported:false,default:false}}};
 const config:any={...defaultConfig,model,videoModel:model,models:[model],videoModels:[model],channels:[{id:'ark',name:'fixture',enabled:true,models:[name],interfaceType:'volcengine-ark-video',modelCosts:[{model:name,capability:'video',protocol:'volcengine-ark-video',capabilityConfig:profile}]}]};
 node.metadata!.model=model;
 const requestConfig=buildGenerationConfig(config,node,'video');
 expect(requestConfig.vquality).toBe('2160p');
 expect(requestConfig.videoGenerateAudio).toBe('false');
 expect(()=>assertCanvasGenerationRequirements(requestConfig,node,'video','雨夜镜头')).not.toThrow();
 node.metadata!.seconds='30';
 expect(()=>assertCanvasGenerationRequirements({...requestConfig,videoSeconds:'30'},node,'video','雨夜镜头')).toThrow('时长');
});
