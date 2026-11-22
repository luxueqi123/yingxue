import {test,expect,mock} from 'bun:test';
import * as React from 'react';
import * as Antd from 'antd';
import * as Config from '../src/stores/use-config-store';
import {adaptLtvNativeProject} from '../src/lib/canvas/ltv-native-project';

const model='music::mureka-8';
const config={...Config.defaultConfig,model,audioModel:model,models:[model],audioModels:[model],count:'1',audioFormat:'mp3',channels:[{
    id:'music',name:'fixture',enabled:true,baseUrl:'/api',apiKey:'fixture',apiFormat:'openai',models:['mureka-8'],modelCosts:[{model:'mureka-8',capability:'audio',protocol:'mureka-instrumental'}],
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

test('normal and retry hooks preserve Mureka identity and reject stored cross-vendor metadata',async()=>{
    for(const retry of [false,true])for(const legacy of [false,true]){
        errors.length=0;submitted.length=0;
        const result=adaptLtvNativeProject({nodes:[{id:'music',type:'audio',position:{x:0,y:0},data:{action:'audio_generate',params:{model:'mureka-8',scene:'Music',prompt:'原始纯音乐描述',count:1,advancedSettings:{force_instrumental:1}}}}],edges:[]},{channels:[]},'music','Music');
        const source=result.project.nodes[0];source.metadata!.model=model;
        if(legacy){source.metadata!.audioMusic!.provider='elevenlabs-music';source.metadata!.ltvExecutionContract='elevenlabs-music';}
        const nodesRef={current:structuredClone(result.project.nodes)};
        const options:any={projectId:'fixture',addedSkills:[],assets:[],nodesRef,connectionsRef:{current:[]},
            setNodes:(f:any)=>{nodesRef.current=typeof f==='function'?f(nodesRef.current):f;},setConnections:()=>{},setSelectedNodeIds:()=>{},setSelectedConnectionId:()=>{},setDialogNodeId:()=>{},setRunningNodeId:()=>{},
            startGenerationRequest:()=>new AbortController(),finishGenerationRequest:()=>{},bindGenerationTask:()=>{},applyGenerationTaskResult:async()=>{}};
        if(retry)await useCanvasGenerationRetry(options)(nodesRef.current[0]);
        else await useCanvasGenerationExecutor(options)('music','audio','原始纯音乐描述');
        if(legacy){expect(submitted).toHaveLength(0);expect(errors.some(e=>e.includes('Mureka'))).toBe(true);continue;}
        expect(errors).toEqual([]);expect(submitted).toHaveLength(1);
        expect(submitted[0].prompt).toBe('原始纯音乐描述');expect(submitted[0].config.model).toBe(model);
        expect(submitted[0].metadata.providerOptions).toEqual({'mureka-instrumental':{forceInstrumental:true}});
    }
});
