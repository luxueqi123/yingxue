import {test,expect,mock} from 'bun:test';
import * as React from 'react';
import * as Antd from 'antd';
import * as Config from '../src/stores/use-config-store';
import {adaptLtvNativeProject} from '../src/lib/canvas/ltv-native-project';
import {defaultModelCapabilityConfig} from '../src/lib/model-capabilities';

const model='omni::omnihuman-1.5';
const cap=defaultModelCapabilityConfig('newapi-channel-2').video!;
Object.assign(cap,{ratios:['adaptive'],defaultRatio:'adaptive',resolutions:['auto'],defaultResolution:'auto',durationSupported:false});
Object.assign(cap.references,{minImages:1,maxImages:1,maxVideos:0,maxAudios:1,maxAudioDurationSeconds:60,promptMaxChars:3000});
const config={...Config.defaultConfig,model,videoModel:model,models:[model],videoModels:[model],count:'1',channels:[{
 id:'omni',name:'fixture',enabled:true,baseUrl:'/api',apiKey:'fixture',apiFormat:'openai',models:['omnihuman-1.5'],modelCosts:[{model:'omnihuman-1.5',capability:'video',protocol:'volcengine-omnihuman-v15',capabilityConfig:{version:1,video:cap}}],
}]} as Config.AiConfig;
const errors:string[]=[],submitted:any[]=[];
mock.module('react',()=>({...React,useCallback:(fn:unknown)=>fn,useRef:(v:unknown)=>({current:v})}));
mock.module('antd',()=>({...Antd,App:{...Antd.App,useApp:()=>({message:{error:(s:string)=>errors.push(s),warning:(s:string)=>errors.push(s),info:()=>{}}})}}));
const store=Object.assign((select:any)=>select({isAiConfigReady:()=>true}),Config.useConfigStore);
mock.module('@/stores/use-config-store',()=>({...Config,useEffectiveConfig:()=>config,useConfigStore:store}));
const skill=await import('../src/services/skill-runtime');
mock.module('@/services/skill-runtime',()=>({...skill,skillRuntime:{...skill.skillRuntime,prepare:async({prompt}:any)=>({prompt,metadata:{}})}}));
const storage=await import('../src/services/image-storage');
mock.module('@/services/image-storage',()=>({...storage,imageToDataUrl:async()=> 'data:image/png;base64,AA=='}));
const actual=await import('../src/lib/canvas/canvas-project-generation');
mock.module('@/lib/canvas/canvas-project-generation',()=>({...actual,runCanvasGenerationTaskToConsumer:async(input:any)=>{submitted.push(input);}}));
const {useCanvasGenerationExecutor}=await import('../src/pages/canvas/use-canvas-generation-executor');
const {useCanvasGenerationRetry}=await import('../src/pages/canvas/use-canvas-generation-retry');

test('normal and retry hooks preserve OmniHuman audio-driven duration and reject missing/long audio',async()=>{
 for(const retry of [false,true])for(const duration of [6374,0,60000]){
  errors.length=0;submitted.length=0;
  const result=adaptLtvNativeProject({nodes:[
   {id:'image',type:'image',position:{x:0,y:0},data:{action:'image_resource',url:['https://example.com/person.png']}},
   {id:'audio',type:'audio',position:{x:0,y:300},data:{action:'audio_resource',url:['https://example.com/song.mp3']}},
   {id:'output',type:'video',position:{x:400,y:0},data:{action:'video_generate',generatorType:'default',params:{model:'omnihuman-1.5',modeType:'singleImage2video',count:1,prompt:'唱歌，梦核',settings:{ratio:'auto',resolution:'auto'},advancedSettings:{fastMode:0},imageList:[{nodeId:'image',url:'https://example.com/person.png'}],audioList:[{nodeId:'audio',url:'https://example.com/song.mp3',durationSec:6.374}]}}},
  ],edges:[]},{channels:[]},'omni','Omni');
  const source=result.project.nodes.find(n=>n.id==='output')!;source.metadata!.model=model;
  result.project.nodes.find(n=>n.id==='audio')!.metadata!.durationMs=duration;
  const nodesRef={current:structuredClone(result.project.nodes)};
  const options:any={projectId:'fixture',addedSkills:[],assets:[],nodesRef,connectionsRef:{current:result.project.connections},
   setNodes:(f:any)=>{nodesRef.current=typeof f==='function'?f(nodesRef.current):f;},setConnections:()=>{},setSelectedNodeIds:()=>{},setSelectedConnectionId:()=>{},setDialogNodeId:()=>{},setRunningNodeId:()=>{},
   startGenerationRequest:()=>new AbortController(),finishGenerationRequest:()=>{},bindGenerationTask:()=>{},applyGenerationTaskResult:async()=>{}};
  if(retry)await useCanvasGenerationRetry(options)(nodesRef.current.find(n=>n.id==='output')!);
  else await useCanvasGenerationExecutor(options)('output','video','唱歌，梦核');
  if(duration!==6374){expect(submitted).toHaveLength(0);expect(errors.length).toBeGreaterThan(0);continue;}
  expect(errors).toEqual([]);expect(submitted).toHaveLength(1);
  expect(submitted[0].prompt).toBe('唱歌，梦核');expect(submitted[0].config.model).toBe(model);
  expect(submitted[0].config.videoSeconds).toBe('');expect(submitted[0].config.vquality).toBe('auto');
  expect(submitted[0].referenceImages).toHaveLength(1);expect(submitted[0].referenceAudios[0].durationMs).toBe(6374);
  expect(submitted[0].metadata.providerOptions).toEqual({'volcengine-omnihuman-v15':{fastMode:false}});
 }
});
