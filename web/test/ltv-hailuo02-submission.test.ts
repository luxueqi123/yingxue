import {test,expect,mock} from 'bun:test';
import * as React from 'react';
import * as Antd from 'antd';
import * as Config from '../src/stores/use-config-store';
import {adaptLtvNativeProject} from '../src/lib/canvas/ltv-native-project';
import {defaultModelCapabilityConfig} from '../src/lib/model-capabilities';

const model='hailuo::MiniMax-Hailuo-02';
const cap=defaultModelCapabilityConfig('newapi-channel-2').video!;
Object.assign(cap,{ratios:['auto'],defaultRatio:'auto',resolutions:['768P','1080P'],defaultResolution:'1080P',durationSupported:true,duration:{selection:'enum',values:[6,10],default:6},operations:['image_to_video']});
Object.assign(cap.references,{minImages:1,maxImages:2,maxVideos:0,maxAudios:0,promptMaxChars:3000});
const config={...Config.defaultConfig,model,videoModel:model,models:[model],videoModels:[model],count:'1',channels:[{
 id:'hailuo',name:'fixture',enabled:true,baseUrl:'/api',apiKey:'fixture',apiFormat:'openai',models:['MiniMax-Hailuo-02'],modelCosts:[{model:'MiniMax-Hailuo-02',capability:'video',protocol:'minimax-hailuo02-video',capabilityConfig:{version:1,video:cap}}],
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

test('normal and retry Hailuo02 hooks preserve original first and last frames',async()=>{
 for(const retry of [false,true])for(const twoFrames of [false,true]){
  errors.length=0;submitted.length=0;
  const images=[{nodeId:'first',url:'https://example.com/first.png'},...(twoFrames?[{nodeId:'last',url:'https://example.com/last.png'}]:[])];
  const result=adaptLtvNativeProject({nodes:[
   ...images.map((r,i)=>({id:r.nodeId,type:'image',position:{x:0,y:i*300},data:{action:'image_resource',url:[r.url]}})),
   {id:'output',type:'video',position:{x:400,y:0},data:{action:'video_generate',generatorType:'default',params:{model:'MiniMax-Hailuo-o2',modeType:twoFrames?'frames2video':'singleImage2video',count:1,prompt:'原始镜头 [Zoom in]',settings:{ratio:'auto',resolution:'1080P',duration:6},imageList:images}}},
  ],edges:[]},{channels:[]},'hailuo','Hailuo');
  const source=result.project.nodes.find(n=>n.id==='output')!;source.metadata!.model=model;
  const nodesRef={current:structuredClone(result.project.nodes)};
  const options:any={projectId:'fixture',addedSkills:[],assets:[],nodesRef,connectionsRef:{current:result.project.connections},
   setNodes:(f:any)=>{nodesRef.current=typeof f==='function'?f(nodesRef.current):f;},setConnections:()=>{},setSelectedNodeIds:()=>{},setSelectedConnectionId:()=>{},setDialogNodeId:()=>{},setRunningNodeId:()=>{},
   startGenerationRequest:()=>new AbortController(),finishGenerationRequest:()=>{},bindGenerationTask:()=>{},applyGenerationTaskResult:async()=>{}};
  if(retry)await useCanvasGenerationRetry(options)(nodesRef.current.find(n=>n.id==='output')!);
  else await useCanvasGenerationExecutor(options)('output','video','原始镜头 [Zoom in]');
  expect(errors).toEqual([]);expect(submitted).toHaveLength(1);
  const request=submitted[0];expect(request.prompt).toBe('原始镜头 [Zoom in]');expect(request.config.model).toBe(model);
  expect(request.config.videoSeconds).toBe('6');expect(request.config.vquality).toBe(cap.defaultResolution);
  expect(request.referenceImages).toHaveLength(twoFrames?2:1);
  expect(request.metadata.videoStartFrameNodeId).toBe('first');
  if(twoFrames)expect(request.metadata.videoEndFrameNodeId).toBe('last');
 }
});
