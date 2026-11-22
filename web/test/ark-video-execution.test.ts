import {test,expect,mock, beforeEach, afterEach} from 'bun:test';
import {installResourceAccessFixture} from './resource-access-fixture';
let restoreResourceAccess: () => void;
beforeEach(() => { restoreResourceAccess = installResourceAccessFixture({clip: '/api/resources/clip/file'}); });
afterEach(() => restoreResourceAccess());
import {CanvasNodeType} from '../src/types/canvas';
import {defaultConfig} from '../src/stores/use-config-store';
import {applyGenerationTaskResultToNodes} from '../src/lib/canvas/canvas-generation-task-sync';
import {assertArkRuntimeReferences} from '../src/lib/canvas/ark-video-search';

const actual=await import('../src/lib/canvas/canvas-project-generation');
let submitted:any, usage:any=0;
mock.module('@/lib/canvas/canvas-project-generation',()=>({...actual,runCanvasGenerationTaskToConsumer:async(input:any,consumer:any)=>{
 submitted=input;
 await consumer.consumeTask({id:'local-video',status:'succeeded',taskType:'video',inputJson:JSON.stringify(input),resultJson:JSON.stringify({video:{dataUrl:'/api/resources/clip/file',storageKey:'resource:clip',mimeType:'video/mp4'},usage:{tool_usage:{web_search:usage}}})});
}}));
const {executeVideoGeneration}=await import('../src/pages/canvas/canvas-media-generation-executors');

test('actual video executor retains search setting through result versions and JSON restore',async()=>{
 for(const count of [0,3,undefined]){
  usage=count;
  const source:any={id:'video',type:CanvasNodeType.Video,title:'story',position:{x:0,y:0},width:350,height:240,metadata:{prompt:'story',videoWebSearch:true,videoSearchUsage:9,content:'https://example.test/old.mp4',status:'success',ltvExecutionContract:'ark-video-search',ltvReferencePlan:{prompt:'story',references:[]},strictGenerationOptions:['model','seconds']}};
  let nodes:any[]=[source],connections:any[]=[];
  await executeVideoGeneration({nodeId:source.id,sourceNode:source,prompt:'story',effectivePrompt:'story',generationConfig:{...defaultConfig,model:'ark::doubao-seedance-2-5-260628'},generationContext:{referenceImages:[],referenceVideos:[],referenceAudios:[],resolvedCharacterVersions:[],resolvedCharacterVoices:[]},controller:new AbortController(),projectId:'fixture',canvasConnections:[],setNodes:(f:any)=>{nodes=f(nodes)},setConnections:(f:any)=>{connections=f(connections)},startGenerationRequest:()=>{},finishGenerationRequest:()=>{},bindGenerationTask:()=>{},registerPendingNodeIds:()=>{},applyGenerationTaskResult:async(id:string,task:any)=>{nodes=(await applyGenerationTaskResultToNodes(nodes,task,id)).nodes},taskContext:{},skillMetadata:{},retryContext:{}} as any);
  expect(submitted.metadata.providerOptions['volcengine-ark-video']).toEqual({webSearch:true});
  const result=JSON.parse(JSON.stringify(nodes)).find((n:any)=>n.metadata.storageKey==='resource:clip');
  expect(result).toBeDefined();
  expect(result.metadata.videoWebSearch).toBe(true);
  expect(result.metadata.ltvExecutionContract).toBe('ark-video-search');
  expect(result.metadata.ltvReferencePlan).toEqual(source.metadata.ltvReferencePlan);
  expect(result.metadata.strictGenerationOptions).toEqual(['model','seconds']);
  expect(result.metadata.videoSearchUsage).toBe(count);
  expect(connections).toHaveLength(0);
 }
});

test('resolved upstream media durations are validated before task submission',()=>{
 const model='doubao-seedance-2-5-260628';
 expect(()=>assertArkRuntimeReferences(model,{referenceImages:[],referenceVideos:[],referenceAudios:[{}]})).toThrow('时长未确认');
 expect(()=>assertArkRuntimeReferences(model,{referenceImages:[],referenceVideos:[{durationMs:20000},{durationMs:20000}],referenceAudios:[]})).toThrow('总时长');
 expect(()=>assertArkRuntimeReferences(model,{referenceImages:[],referenceVideos:[],referenceAudios:[{durationMs:25000}]})).not.toThrow();
});
