import {test,expect,mock} from 'bun:test';
import * as React from 'react';
import * as Antd from 'antd';
import * as Config from '../src/stores/use-config-store';
import {adaptLtvNativeProject} from '../src/lib/canvas/ltv-native-project';
import {defaultModelCapabilityConfig} from '../src/lib/model-capabilities';

const model='happytext::happyhorse-1.1-t2v';
const cap=defaultModelCapabilityConfig('newapi-channel-2').video!;
Object.assign(cap,{ratios:['16:9'],defaultRatio:'16:9',resolutions:['720P','1080P'],defaultResolution:'720P',durationSupported:true,duration:{selection:'enum',values:[6,10],default:6},operations:['text_to_video']});
Object.assign(cap.references,{minImages:0,maxImages:0,maxVideos:0,maxAudios:0,promptMaxChars:3000});
const config={...Config.defaultConfig,model,videoModel:model,models:[model],videoModels:[model],count:'1',channels:[{
 id:'happytext',name:'fixture',enabled:true,baseUrl:'/api',apiKey:'fixture',apiFormat:'openai',models:['happyhorse-1.1-t2v'],modelCosts:[{model:'happyhorse-1.1-t2v',capability:'video',protocol:'dashscope-happyhorse-text-video',capabilityConfig:{version:1,video:cap}}],
}]} as Config.AiConfig;
const errors:string[]=[],submitted:any[]=[];
mock.module('react',()=>({...React,useCallback:(fn:unknown)=>fn,useRef:(v:unknown)=>({current:v})}));
mock.module('antd',()=>({...Antd,App:{...Antd.App,useApp:()=>({message:{error:(s:string)=>errors.push(s),warning:(s:string)=>errors.push(s),info:()=>{}}})}}));
const store=Object.assign((select:any)=>select({isAiConfigReady:()=>true}),Config.useConfigStore);
mock.module('@/stores/use-config-store',()=>({...Config,useEffectiveConfig:()=>config,useConfigStore:store}));
const skill=await import('../src/services/skill-runtime');
mock.module('@/services/skill-runtime',()=>({...skill,skillRuntime:{...skill.skillRuntime,prepare:async({prompt}:any)=>({prompt,metadata:{}})}}));
const storage=await import('../src/services/image-storage');
mock.module('@/services/image-storage',()=>({...storage,imageToDataUrl:async(image:{url?:string;dataUrl?:string})=>image.dataUrl||image.url||''}));
const actual=await import('../src/lib/canvas/canvas-project-generation');
mock.module('@/lib/canvas/canvas-project-generation',()=>({...actual,runCanvasGenerationTaskToConsumer:async(input:any)=>{submitted.push(input);}}));
const {useCanvasGenerationExecutor}=await import('../src/pages/canvas/use-canvas-generation-executor');
const {useCanvasGenerationRetry}=await import('../src/pages/canvas/use-canvas-generation-retry');

test('normal and retry text hooks preserve source settings and reject unresolved image references',async()=>{
 for(const retry of [false,true])for(const invalid of [false,true]){
  errors.length=0;submitted.length=0;
  const prompt='黏土小熊走过纸板城市';
  const result=adaptLtvNativeProject({nodes:[{id:'output',type:'video',position:{x:0,y:0},data:{action:'video_generate',params:{model:'happy-horse-1.1',modeType:'text2video',count:1,prompt,settings:{ratio:'16:9',resolution:'720P',duration:6},imageList:[]}}}],edges:[]},{channels:[]},'text','Text');
  const source=result.project.nodes[0];source.metadata!.model=model;
  if(invalid){source.metadata!.prompt='参考@图片16';source.metadata!.composerContent='参考@图片16';}
  const nodesRef={current:structuredClone(result.project.nodes)};
  const options:any={projectId:'fixture',addedSkills:[],assets:[],nodesRef,connectionsRef:{current:result.project.connections},setNodes:(f:any)=>{nodesRef.current=typeof f==='function'?f(nodesRef.current):f;},setConnections:()=>{},setSelectedNodeIds:()=>{},setSelectedConnectionId:()=>{},setDialogNodeId:()=>{},setRunningNodeId:()=>{},startGenerationRequest:()=>new AbortController(),finishGenerationRequest:()=>{},bindGenerationTask:()=>{},applyGenerationTaskResult:async()=>{}};
  if(retry)await useCanvasGenerationRetry(options)(nodesRef.current[0]);else await useCanvasGenerationExecutor(options)('output','video',invalid?'参考@图片16':prompt);
  if(invalid){expect(submitted).toHaveLength(0);expect(errors.length).toBeGreaterThan(0);continue;}
  expect(errors).toEqual([]);expect(submitted).toHaveLength(1);
  const request=submitted[0];expect(request.prompt).toBe(prompt);expect(request.config.model).toBe(model);expect(request.config.videoSeconds).toBe('6');expect(request.config.vquality).toBe(cap.defaultResolution);expect(request.config.size).toBe('16:9');expect(request.referenceImages).toHaveLength(0);expect(request.metadata.videoEditOperation).toBe('text_to_video');
 }
});
