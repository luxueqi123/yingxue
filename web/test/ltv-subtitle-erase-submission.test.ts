import {test,expect,mock} from 'bun:test';
import * as React from 'react';
import * as Antd from 'antd';
import * as Config from '../src/stores/use-config-store';
import {adaptLtvNativeProject} from '../src/lib/canvas/ltv-native-project';
import {defaultModelCapabilityConfig} from '../src/lib/model-capabilities';

const protocol='volcengine-mediakit-subtitle-erase',model='erase::erase-video-subtitle-pro';
const cap=defaultModelCapabilityConfig('newapi-channel-2').video!;
Object.assign(cap,{ratios:['adaptive'],defaultRatio:'adaptive',resolutions:['auto'],defaultResolution:'auto',durationSupported:false,operations:['reference_to_video']});
Object.assign(cap.references,{minImages:0,maxImages:0,maxVideos:1,maxAudios:0,promptMaxChars:0});
const config={...Config.defaultConfig,model,videoModel:model,models:[model],videoModels:[model],count:'1',channels:[{id:'erase',name:'fixture',enabled:true,baseUrl:'/api',apiKey:'fixture',apiFormat:'openai',models:['erase-video-subtitle-pro'],modelCosts:[{model:'erase-video-subtitle-pro',capability:'video',protocol,capabilityConfig:{version:1,video:cap}}]}]} as Config.AiConfig;
const errors:string[]=[],submitted:any[]=[];
mock.module('react',()=>({...React,useCallback:(fn:unknown)=>fn,useRef:(v:unknown)=>({current:v})}));
mock.module('antd',()=>({...Antd,App:{...Antd.App,useApp:()=>({message:{error:(s:string)=>errors.push(s),warning:(s:string)=>errors.push(s),info:()=>{}}})}}));
const store=Object.assign((select:any)=>select({isAiConfigReady:()=>true}),Config.useConfigStore);
mock.module('@/stores/use-config-store',()=>({...Config,useEffectiveConfig:()=>config,useConfigStore:store}));
const skill=await import('../src/services/skill-runtime');
mock.module('@/services/skill-runtime',()=>({...skill,skillRuntime:{...skill.skillRuntime,prepare:async({prompt}:any)=>({prompt,metadata:{}})}}));
const actual=await import('../src/lib/canvas/canvas-project-generation');
mock.module('@/lib/canvas/canvas-project-generation',()=>({...actual,runCanvasGenerationTaskToConsumer:async(input:any)=>{submitted.push(input);}}));
const {useCanvasGenerationExecutor}=await import('../src/pages/canvas/use-canvas-generation-executor');
const {useCanvasGenerationRetry}=await import('../src/pages/canvas/use-canvas-generation-retry');

test('normal and retry preserve full-video Text/Subtitle modes and refuse unverified source dimensions',async()=>{
 for(const retry of [false,true])for(const mode of ['Subtitle','Text'])for(const region of [false,true])for(const invalid of ['', 'short', 'large', 'unknown']) {
  errors.length=0;submitted.length=0;
  const regions=region?{erase_ratio_location:[{top_left_x:0.165735,top_left_y:0.86736,bottom_right_x:0.784559,bottom_right_y:0.983955}]}:{};
  const result=adaptLtvNativeProject({nodes:[{id:'original',type:'video',position:{x:0,y:0},data:{action:'video_resource',url:['https://example.com/original.mp4']}},{id:'output',type:'video',position:{x:400,y:0},data:{action:'video_generate',generatorType:'subtitle_erase',params:{model:'volcano-subtitle-eraser',mode,...regions,videoList:[{nodeId:'original',url:'https://example.com/original.mp4',durationSec:30.08}]}}}],edges:[]},{channels:[]},'erase','Erase');
  expect(result.issues.filter(i=>i.code!=='channel-configuration-required')).toEqual([]);
  result.project.nodes.find(n=>n.id==='output')!.metadata!.model=model;
  Object.assign(result.project.nodes.find(n=>n.id==='original')!.metadata!,{naturalWidth:invalid==='large'?2049:1280,naturalHeight:720,durationMs:invalid==='short'?2999:invalid==='unknown'?undefined:30080});
  const nodesRef={current:structuredClone(result.project.nodes)};
  const options:any={projectId:'fixture',addedSkills:[],assets:[],nodesRef,connectionsRef:{current:result.project.connections},setNodes:(f:any)=>{nodesRef.current=typeof f==='function'?f(nodesRef.current):f;},setConnections:()=>{},setSelectedNodeIds:()=>{},setSelectedConnectionId:()=>{},setDialogNodeId:()=>{},setRunningNodeId:()=>{},startGenerationRequest:()=>new AbortController(),finishGenerationRequest:()=>{},bindGenerationTask:()=>{},applyGenerationTaskResult:async()=>{}};
  if(retry)await useCanvasGenerationRetry(options)(nodesRef.current.find(n=>n.id==='output')!);else await useCanvasGenerationExecutor(options)('output','video','');
  if(invalid){expect(submitted).toHaveLength(0);expect(errors.length).toBeGreaterThan(0);continue;}
  expect(errors).toEqual([]);expect(submitted).toHaveLength(1);
  const request=submitted[0];expect(request.config.model).toBe(model);expect(request.prompt).toBe('');expect(request.config.videoSeconds).toBe('');
  expect(request.referenceVideos).toHaveLength(1);expect(request.referenceVideos[0]).toMatchObject({url:'https://example.com/original.mp4',durationMs:30080,width:1280,height:720});
  expect(request.metadata.providerOptions).toEqual({[protocol]:{mode,...regions}});
 }
});
