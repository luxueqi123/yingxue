import {test,expect,mock} from 'bun:test';
import * as React from 'react';
import * as Antd from 'antd';
import * as Config from '../src/stores/use-config-store';
import {adaptLtvNativeProject} from '../src/lib/canvas/ltv-native-project';

const model='speech::eleven_v3';
const config={...Config.defaultConfig,model,audioModel:model,models:[model],audioModels:[model],count:'1',audioVoice:'vZZLclMx4wouUtKBRfZn',audioSpeed:'1',audioFormat:'mp3',channels:[{
    id:'speech',name:'fixture',enabled:true,baseUrl:'/api',apiKey:'fixture',apiFormat:'openai',models:['eleven_v3'],modelCosts:[{model:'eleven_v3',capability:'audio',protocol:'elevenlabs-v3-audio'}],
}]} as Config.AiConfig;
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

test('normal and retry hooks submit original Eleven V3 voice and zero stability',async()=>{
    for(const retry of [false,true]){
        errors.length=0;submitted.length=0;
        const result=adaptLtvNativeProject({nodes:[{id:'voice',type:'audio',position:{x:0,y:0},data:{action:'audio_generate',params:{model:'vocal-v3',scene:'Text-to-Speech',prompt:'原始配音文本',voice_id:'vZZLclMx4wouUtKBRfZn',stability:0}}}],edges:[]},{channels:[]},'speech','Speech');
        const source=result.project.nodes[0];source.metadata!.model=model;
        const nodesRef={current:structuredClone(result.project.nodes)};
        const options:any={projectId:'fixture',addedSkills:[],assets:[],nodesRef,connectionsRef:{current:[]},
            setNodes:(f:any)=>{nodesRef.current=typeof f==='function'?f(nodesRef.current):f;},setConnections:()=>{},setSelectedNodeIds:()=>{},setSelectedConnectionId:()=>{},setDialogNodeId:()=>{},setRunningNodeId:()=>{},
            startGenerationRequest:()=>new AbortController(),finishGenerationRequest:()=>{},bindGenerationTask:()=>{},applyGenerationTaskResult:async()=>{}};
        if(retry)await useCanvasGenerationRetry(options)(nodesRef.current[0]);
        else await useCanvasGenerationExecutor(options)('voice','audio','原始配音文本');
        expect(errors).toEqual([]);expect(submitted).toHaveLength(1);
        expect(submitted[0].prompt).toBe('原始配音文本');
        expect(submitted[0].config.audioVoice).toBe('vZZLclMx4wouUtKBRfZn');
        expect(submitted[0].metadata.providerOptions).toEqual({'elevenlabs-v3-audio':{stability:0}});
    }
});
