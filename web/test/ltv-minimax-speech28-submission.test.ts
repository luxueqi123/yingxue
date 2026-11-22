import {test,expect,mock} from 'bun:test';
import * as React from 'react';
import * as Antd from 'antd';
import * as Config from '../src/stores/use-config-store';
import {adaptLtvNativeProject} from '../src/lib/canvas/ltv-native-project';

const model='speech::speech-2.8-hd';
const config={...Config.defaultConfig,model,audioModel:model,models:[model],audioModels:[model],count:'1',audioVoice:'female-shaonv',audioSpeed:'1',audioFormat:'mp3',channels:[{
    id:'speech',name:'fixture',enabled:true,baseUrl:'/api',apiKey:'fixture',apiFormat:'openai',models:['speech-2.8-hd'],modelCosts:[{model:'speech-2.8-hd',capability:'audio',protocol:'minimax-speech28-audio'}],
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

test('normal and retry audio hooks submit original MiniMax voice and effect namespace',async()=>{
    for(const retry of [false,true]){
        errors.length=0;submitted.length=0;
        const result=adaptLtvNativeProject({nodes:[{id:'voice',type:'audio',position:{x:0,y:0},data:{action:'audio_generate',params:{model:'speech-2.8-hd',scene:'Text-to-Speech',prompt:'原始配音文本',voice_setting_voice_id:'female-shaonv',voice_setting_speed:1,voice_setting_pitch:0,voice_setting_vol:1,voice_modify_timbre:-10}}}],edges:[]},{channels:[]},'speech','Speech');
        const source=result.project.nodes[0];source.metadata!.model=model;
        const nodesRef={current:structuredClone(result.project.nodes)};
        const options:any={projectId:'fixture',addedSkills:[],assets:[],nodesRef,connectionsRef:{current:[]},
            setNodes:(f:any)=>{nodesRef.current=typeof f==='function'?f(nodesRef.current):f;},setConnections:()=>{},setSelectedNodeIds:()=>{},setSelectedConnectionId:()=>{},setDialogNodeId:()=>{},setRunningNodeId:()=>{},
            startGenerationRequest:()=>new AbortController(),finishGenerationRequest:()=>{},bindGenerationTask:()=>{},applyGenerationTaskResult:async()=>{}};
        if(retry)await useCanvasGenerationRetry(options)(nodesRef.current[0]);
        else await useCanvasGenerationExecutor(options)('voice','audio','原始配音文本');
        expect(errors).toEqual([]);expect(submitted).toHaveLength(1);
        expect(submitted[0].prompt).toBe('原始配音文本');
        expect(submitted[0].config.audioVoice).toBe('female-shaonv');
        expect(submitted[0].metadata.providerOptions).toEqual({'minimax-speech28-audio':{volume:1,pitch:0,modifyPitch:0,intensity:0,timbre:-10,soundEffects:''}});
    }
});
