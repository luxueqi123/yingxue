import { test, expect, mock } from 'bun:test';
import * as React from 'react';
import * as Antd from 'antd';
import * as Config from '../src/stores/use-config-store';
import { CanvasNodeType, type CanvasNodeData } from '../src/types/canvas';

const model='relay::gpt-image-2';
const config={...Config.defaultConfig,model,imageModel:model,models:[model],imageModels:[model],channels:[{id:'relay',name:'本地测试',baseUrl:'/api',apiKey:'fixture-only',apiFormat:'openai',enabled:true,models:['gpt-image-2'],modelCosts:[{model:'gpt-image-2',capability:'image',billingMode:'fixed_request',unitPriceMicrocredits:1}]}]} as Config.AiConfig;
const errors:string[]=[];let executions=0,skillCalls=0;
mock.module('react',()=>({...React,useCallback:(fn:unknown)=>fn,useRef:(value:unknown)=>({current:value})}));
mock.module('antd',()=>({...Antd,App:{...Antd.App,useApp:()=>({message:{error:(value:string)=>errors.push(value),warning:(value:string)=>errors.push(value),info:()=>{}},modal:{confirm:()=>{throw new Error('unexpected confirmation');}}})}}));
const store=Object.assign((select:any)=>select({isAiConfigReady:()=>true}),Config.useConfigStore);
mock.module('@/stores/use-config-store',()=>({...Config,useEffectiveConfig:()=>config,useConfigStore:store}));
const skill=await import('../src/services/skill-runtime');
mock.module('@/services/skill-runtime',()=>({...skill,skillRuntime:{...skill.skillRuntime,prepare:async({prompt}:any)=>{skillCalls++;return {prompt,metadata:{}};}}}));
mock.module('../src/pages/canvas/canvas-image-generation-executor',()=>({executeImageGeneration:async()=>{executions++;}}));
mock.module('../src/pages/canvas/canvas-media-generation-executors',()=>({executeAudioGeneration:async()=>{executions++;},executeVideoGeneration:async()=>{executions++;}}));
const {useCanvasGenerationExecutor}=await import('../src/pages/canvas/use-canvas-generation-executor');
const {useCanvasGenerationRetry}=await import('../src/pages/canvas/use-canvas-generation-retry');

function fixture() {
    const source:CanvasNodeData={id:'case',type:CanvasNodeType.Image,title:'制作节点',position:{x:0,y:0},width:350,height:240,metadata:{generationMode:'image',model:'',prompt:'测试构图',composerContent:'测试构图',strictGenerationOptions:['model'],ltvReferencePlan:{prompt:'测试构图',references:[]}}};
    const nodesRef={current:[source]};
    const options:any={projectId:'local-test',addedSkills:[],assets:[],nodesRef,connectionsRef:{current:[]},setNodes:(value:any)=>{nodesRef.current=typeof value==='function'?value(nodesRef.current):value;},setConnections:()=>{},setSelectedNodeIds:()=>{},setSelectedConnectionId:()=>{},setDialogNodeId:()=>{},setRunningNodeId:()=>{},startGenerationRequest:()=>new AbortController(),finishGenerationRequest:()=>{},bindGenerationTask:()=>{},applyGenerationTaskResult:async()=>{}};
    return {source,options};
}

test('the actual initial generation hook rejects a default-model substitution before skill or task execution',async()=>{
    errors.length=0;executions=0;skillCalls=0;
    const {source,options}=fixture();
    await useCanvasGenerationExecutor(options)(source.id,'image','测试构图');
    expect(errors.some(value=>value.includes('模型')&&value.includes('停止生成'))).toBe(true);
    expect(executions).toBe(0);expect(skillCalls).toBe(0);
});

test('the actual retry hook rejects a default-model substitution before loading or submitting',async()=>{
    errors.length=0;executions=0;skillCalls=0;
    const {source,options}=fixture();
    await useCanvasGenerationRetry(options)(source);
    expect(errors.some(value=>value.includes('模型')&&value.includes('停止生成'))).toBe(true);
    expect(executions).toBe(0);expect(skillCalls).toBe(0);
});

test('an explicit compatible model reaches the existing executor without an external request',async()=>{
    errors.length=0;executions=0;skillCalls=0;
    const {source,options}=fixture();source.metadata!.model=model;
    await useCanvasGenerationExecutor(options)(source.id,'image','测试构图');
    expect(errors).toEqual([]);expect(skillCalls).toBe(1);expect(executions).toBe(1);
});

test('Seed Audio来源在真实首次和重试钩子中均先阻止误配音',async()=>{
    const previous=structuredClone(config);
    const audio='speech::tts-1';
    Object.assign(config,{model:audio,audioModel:audio,models:[audio],audioModels:[audio],channels:[{id:'speech',name:'夹具',baseUrl:'/api',apiKey:'fixture-only',apiFormat:'openai',interfaceType:'openai-audio',enabled:true,models:['tts-1'],modelCosts:[{model:'tts-1',capability:'audio',protocol:'openai-audio',billingMode:'fixed_request',unitPriceMicrocredits:1}]}]});
    try {
        for(const retry of [false,true]) {
            errors.length=0;executions=0;skillCalls=0;
            const {source,options}=fixture();
            source.type=CanvasNodeType.Audio;
            Object.assign(source.metadata!,{generationMode:'audio',model:audio,audioVoice:'alloy',audioSpeed:'1',audioFormat:'mp3',strictGenerationOptions:[],generationModelProvenance:{sourceModel:'seed-audio-1.0',convertedModel:audio,operation:'text2audio'}});
            if(retry)await useCanvasGenerationRetry(options)(source);
            else await useCanvasGenerationExecutor(options)(source.id,'audio','描述雨声');
            expect(errors.some(value=>value.includes('Seed Audio'))).toBe(true);
            expect(executions).toBe(0);expect(skillCalls).toBe(0);
        }
    } finally {Object.assign(config,previous);}
});
