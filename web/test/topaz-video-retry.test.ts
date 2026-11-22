import { expect, mock, test } from 'bun:test';
import * as React from 'react';
import * as Antd from 'antd';
import * as Config from '../src/stores/use-config-store';
import { adaptLtvNativeProject } from '../src/lib/canvas/ltv-native-project';
const errors: string[] = []; let submitted: any;
const model = 'topaz::apo-8';
const config = { ...Config.defaultConfig, model, videoModel:model, count:'1', models:[model], videoModels:[model], channels:[{id:'topaz',name:'fixture',baseUrl:'https://example.test',interfaceType:'topaz-video-enhance',enabled:true,models:['apo-8'],modelCosts:[{model:'apo-8',capability:'video',protocol:'topaz-video-enhance'}]}] } as any;
mock.module('react',()=>({...React,useCallback:(fn:unknown)=>fn}));
mock.module('antd',()=>({...Antd,App:{...Antd.App,useApp:()=>({message:{error:(s:string)=>errors.push(s),warning:(s:string)=>errors.push(s)}})}}));
const store=Object.assign((select:any)=>select({isAiConfigReady:()=>true}),Config.useConfigStore);
mock.module('@/stores/use-config-store',()=>({...Config,useEffectiveConfig:()=>config,useConfigStore:store}));
const skill=await import('../src/services/skill-runtime');
mock.module('@/services/skill-runtime',()=>({...skill,skillRuntime:{...skill.skillRuntime,prepare:async({prompt}:any)=>({prompt,metadata:{}})}}));
const upload=await import('../src/lib/canvas/canvas-file-upload');
mock.module('@/lib/canvas/canvas-file-upload',()=>({...upload,readUploadVideoSize:async()=>[1920,1080]}));
const actual=await import('../src/lib/canvas/canvas-project-generation');
mock.module('@/lib/canvas/canvas-project-generation',()=>({...actual,runCanvasGenerationTaskToConsumer:async(input:any)=>{submitted=input}}));
const {useCanvasGenerationRetry}=await import('../src/pages/canvas/use-canvas-generation-retry');

test('真实重试hook保留原片并提交当前帧率和慢放，而不是旧设置',async()=>{
    const url='https://example.test/original.mp4';
    const converted=adaptLtvNativeProject({nodes:[
        {id:'r',type:'video',position:{x:0,y:0},data:{action:'video_resource',url:[url]}},
        {id:'e',type:'video',position:{x:400,y:0},data:{action:'video_generate',generatorType:'enhance',params:{model:'topaz-video-upscaler',specifiedModel:'apo-8',resolution:'2K',fps:30,slowmo:1,videoList:[{nodeId:'r',url}]}}}
    ],edges:[{id:'ref',source:'r',target:'e'}]},{channels:[]},'case','增强');
    const source=converted.project.nodes.find(node=>node.id==='e')!;
    expect(source.metadata?.videoEnhancement).toBeDefined();
    source.metadata!.model=model;
    source.metadata!.videoEnhancement!.fps=60;
    source.metadata!.videoEnhancement!.slowmo=2;
    const nodesRef={current:converted.project.nodes};
    await useCanvasGenerationRetry({projectId:'test',addedSkills:[],assets:[],nodesRef,connectionsRef:{current:converted.project.connections},setNodes:(f:any)=>{nodesRef.current=f(nodesRef.current)},setRunningNodeId:()=>{},startGenerationRequest:()=>new AbortController(),finishGenerationRequest:()=>{},bindGenerationTask:()=>{},applyGenerationTaskResult:async()=>{}} as any)(source);
    expect(errors).toEqual([]);
    expect(submitted?.mode).toBe('video');
    expect(submitted.prompt).toBe('');
    expect(submitted.referenceVideos).toHaveLength(1);
    expect(submitted.metadata.providerOptions.topazVideo.filters).toEqual([{model:'prob-4'},{model:'apo-8',fps:60,slowmo:2}]);
});
