import {expect,mock,test} from 'bun:test';
import * as React from 'react';
import * as Antd from 'antd';
import * as Config from '../src/stores/use-config-store';
import {CanvasNodeType} from '../src/types/canvas';
const errors:string[]=[];let submitted:any;
const model='kling::kling-v3-omni';
const config={...Config.defaultConfig,model,videoModel:model,vquality:'1080',videoSeconds:'5',videoGenerateAudio:'false',models:[model],videoModels:[model],channels:[{id:'kling',name:'fixture',baseUrl:'https://example.test',interfaceType:'kling-omni-video',enabled:true,models:['kling-v3-omni'],modelCosts:[{model:'kling-v3-omni',capability:'video',protocol:'kling-omni-video'}]}]} as any;
mock.module('react',()=>({...React,useCallback:(fn:unknown)=>fn}));
mock.module('antd',()=>({...Antd,App:{...Antd.App,useApp:()=>({message:{error:(s:string)=>errors.push(s),warning:(s:string)=>errors.push(s)}})}}));
const store=Object.assign((select:any)=>select({isAiConfigReady:()=>true}),Config.useConfigStore);
mock.module('@/stores/use-config-store',()=>({...Config,useEffectiveConfig:()=>config,useConfigStore:store}));
const skill=await import('../src/services/skill-runtime');
mock.module('@/services/skill-runtime',()=>({...skill,skillRuntime:{...skill.skillRuntime,prepare:async({prompt}:any)=>({prompt,metadata:{}})}}));
const actual=await import('../src/lib/canvas/canvas-project-generation');
mock.module('@/lib/canvas/canvas-project-generation',()=>({...actual,runCanvasGenerationTaskToConsumer:async(input:any)=>{submitted=input;}}));
const {useCanvasGenerationRetry}=await import('../src/pages/canvas/use-canvas-generation-retry');
test('retry preserves modified Omni quality and storyboard setting',async()=>{
 for(const protocol of ['kling-omni-video','kling-v3-video']){
 const activeModel=protocol==='kling-v3-video'?'kling::kling-v3':model;
 config.model=config.videoModel=activeModel;config.models=config.videoModels=[activeModel];
 config.channels[0].models=[activeModel.split('::')[1]];config.channels[0].modelCosts=[{model:activeModel.split('::')[1],capability:'video',protocol}];config.channels[0].interfaceType=protocol;
 for(const multiShot of [true,false]){
 const multiPrompt=multiShot?[{index:1,prompt:'推近',duration:'2'},{index:2,prompt:'拉远',duration:'3'}]:undefined;
 const source:any={id:'v',type:CanvasNodeType.Video,title:'story',position:{x:0,y:0},width:350,height:240,metadata:{model:activeModel,ltvExecutionContract:protocol,prompt:'雨夜镜头',vquality:'1080',seconds:'5',generateAudio:'false',videoKling:{mode:'pro',multiShot,...(multiPrompt?{multiPrompt}:{})}}};
 const nodesRef={current:[source]};
 await useCanvasGenerationRetry({projectId:'test',addedSkills:[],assets:[],nodesRef,connectionsRef:{current:[]},setNodes:(f:any)=>{nodesRef.current=f(nodesRef.current)},setRunningNodeId:()=>{},startGenerationRequest:()=>new AbortController(),finishGenerationRequest:()=>{},bindGenerationTask:()=>{},applyGenerationTaskResult:async()=>{}} as any)(source);
 expect(errors).toEqual([]);expect(submitted.mode).toBe('video');expect(submitted.metadata.providerOptions[protocol]).toEqual({mode:'pro',multiShot,...(multiPrompt?{multiPrompt}:{})});
 }
 }
});
