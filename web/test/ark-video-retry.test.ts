import {expect,mock,test} from 'bun:test';
import * as React from 'react';
import * as Antd from 'antd';
import * as Config from '../src/stores/use-config-store';
import {CanvasNodeType} from '../src/types/canvas';
const errors:string[]=[];
let submitted:any;
const model='ark::doubao-seedance-2-5-260628';
const config={...Config.defaultConfig,model,videoModel:model,models:[model],videoModels:[model],channels:[{id:'ark',name:'fixture',interfaceType:'volcengine-ark-video',enabled:true,models:['doubao-seedance-2-5-260628'],modelCosts:[{model:'doubao-seedance-2-5-260628',capability:'video',protocol:'volcengine-ark-video'}]}]} as any;
mock.module('react',()=>({...React,useCallback:(fn:unknown)=>fn}));
mock.module('antd',()=>({...Antd,App:{...Antd.App,useApp:()=>({message:{error:(s:string)=>errors.push(s),warning:(s:string)=>errors.push(s)}})}}));
const store=Object.assign((select:any)=>select({isAiConfigReady:()=>true}),Config.useConfigStore);
mock.module('@/stores/use-config-store',()=>({...Config,useEffectiveConfig:()=>config,useConfigStore:store}));
const skill=await import('../src/services/skill-runtime');
mock.module('@/services/skill-runtime',()=>({...skill,skillRuntime:{...skill.skillRuntime,prepare:async({prompt}:any)=>({prompt,metadata:{}})}}));
const actual=await import('../src/lib/canvas/canvas-project-generation');
mock.module('@/lib/canvas/canvas-project-generation',()=>({...actual,runCanvasGenerationTaskToConsumer:async(input:any)=>{submitted=input;}}));
const {useCanvasGenerationRetry}=await import('../src/pages/canvas/use-canvas-generation-retry');
test('actual retry preserves user search selection including false',async()=>{
 for(const enabled of [true,false]){
  const source:any={id:'video',type:CanvasNodeType.Video,title:'story',position:{x:0,y:0},width:350,height:240,metadata:{model,prompt:'雨夜的镜头',videoWebSearch:enabled}};
  const nodesRef={current:[source]};
  await useCanvasGenerationRetry({projectId:'test',addedSkills:[],assets:[],nodesRef,connectionsRef:{current:[]},setNodes:(f:any)=>{nodesRef.current=f(nodesRef.current)},setRunningNodeId:()=>{},startGenerationRequest:()=>new AbortController(),finishGenerationRequest:()=>{},bindGenerationTask:()=>{},applyGenerationTaskResult:async()=>{}} as any)(source);
  expect(errors).toEqual([]);
  expect(submitted.mode).toBe('video');
  expect(submitted.metadata.providerOptions['volcengine-ark-video']).toEqual({webSearch:enabled});
 }
});
