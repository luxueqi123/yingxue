import {test, expect, mock} from 'bun:test';
import * as React from 'react';
import * as Antd from 'antd';
import * as Config from '../src/stores/use-config-store';
import {adaptLtvNativeProject} from '../src/lib/canvas/ltv-native-project';
import {defaultModelCapabilityConfig} from '../src/lib/model-capabilities';

const config = {...Config.defaultConfig, count:'1', channels:[]} as Config.AiConfig;
const errors:string[] = [], submitted:any[] = [];
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

test('both HappyHorse versions retain exact models, frames and prompts through normal and retry hooks', async()=>{
 for(const version of ['1.0','1.1']) for(const reference of [false,true]) for(const retry of [false,true]) for(const mismatch of [false,true]) {
  errors.length=0;submitted.length=0;
  const selectedVersion=mismatch?(version==='1.0'?'1.1':'1.0'):version;
  const modelKey=`happyhorse-${selectedVersion}-${reference?'r2v':'i2v'}`, model=`horse::${modelKey}`;
  const provider=`dashscope-happyhorse-${reference?'reference':'first-frame'}-video`;
  const cap=defaultModelCapabilityConfig('newapi-channel-2').video!;
  Object.assign(cap,{ratios:[reference?'16:9':'adaptive'],defaultRatio:reference?'16:9':'adaptive',resolutions:['720P'],defaultResolution:'720P',durationSupported:true,duration:{selection:'enum',values:[6],default:6},operations:[reference?'reference_to_video':'image_to_video']});
  Object.assign(cap.references,{minImages:1,maxImages:reference?9:1,maxVideos:0,maxAudios:0,promptMaxChars:5000});
  Object.assign(config,{model,videoModel:model,models:[model],videoModels:[model],channels:[{id:'horse',name:'fixture',enabled:true,baseUrl:'/api',apiKey:'fixture',apiFormat:'openai',models:[modelKey],modelCosts:[{model:modelKey,capability:'video',protocol:provider,capabilityConfig:{version:1,video:cap}}]}]});
  const images=[{nodeId:'first',url:'https://example.com/first.png'},...(reference?[{nodeId:'second',url:'https://example.com/second.png'}]:[])];
  const prompt=reference?'@图片2走向@图片1':'保持@图片1构图';
  const result=adaptLtvNativeProject({nodes:[...images.map((r,i)=>({id:r.nodeId,type:'image',position:{x:0,y:i*300},data:{action:'image_resource',url:[r.url]}})),{id:'output',type:'video',position:{x:400,y:0},data:{action:'video_generate',params:{model:version==='1.0'?'happy-horse-1':'happy-horse-1.1',modeType:reference?'image2video':'frames2video',count:1,prompt,settings:{...(reference?{ratio:'16:9'}:{}),resolution:'720P',duration:6},imageList:images}}}],edges:[]},{channels:[]},'happy','Happy');
  const source=result.project.nodes.find(n=>n.id==='output')!;source.metadata!.model=model;
  expect(source.metadata!.ltvExecutionContract).toBe(reference?'happyhorse-reference-video':'happyhorse-first-frame-video');
  const nodesRef={current:structuredClone(result.project.nodes)};
  const options:any={projectId:'fixture',addedSkills:[],assets:[],nodesRef,connectionsRef:{current:result.project.connections},setNodes:(f:any)=>{nodesRef.current=typeof f==='function'?f(nodesRef.current):f;},setConnections:()=>{},setSelectedNodeIds:()=>{},setSelectedConnectionId:()=>{},setDialogNodeId:()=>{},setRunningNodeId:()=>{},startGenerationRequest:()=>new AbortController(),finishGenerationRequest:()=>{},bindGenerationTask:()=>{},applyGenerationTaskResult:async()=>{}};
  if(retry)await useCanvasGenerationRetry(options)(nodesRef.current.find(n=>n.id==='output')!);else await useCanvasGenerationExecutor(options)('output','video',prompt);
  if(mismatch){expect(submitted).toHaveLength(0);expect(errors.length).toBeGreaterThan(0);continue;}
  expect(errors).toEqual([]);expect(submitted).toHaveLength(1);
  const request=submitted[0];expect(request.config.model).toBe(model);expect(request.config.vquality).toBe(cap.defaultResolution);expect(request.config.videoSeconds).toBe('6');
  expect(request.referenceImages.map((r:any)=>r.dataUrl||r.url)).toEqual(images.map(r=>r.url));
  expect(request.metadata.providerOptions[provider].prompt).toBe(reference?'[Image 2]走向[Image 1]':prompt);
  if(!reference)expect(request.metadata.videoStartFrameNodeId).toBe('first');
 }
});
