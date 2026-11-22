import { test, expect, mock } from 'bun:test';
import { CanvasNodeType, type CanvasNodeData, type CanvasConnection } from '../src/types/canvas';
import { canGenerateMediaInPlace } from '../src/lib/canvas/canvas-generation-layout';
import { defaultConfig } from '../src/stores/use-config-store';
import { resolveLtvRuntimeReferences } from '../src/lib/canvas/ltv-runtime-references';
const actual = await import('../src/lib/canvas/canvas-project-generation');
let submitted: any;
mock.module('@/lib/canvas/canvas-project-generation', () => ({ ...actual, runCanvasGenerationTaskToConsumer: async (input: any, consumer: any) => { submitted=input;await consumer.consumeTask({ id:'local-fixture',status:'succeeded' }); } }));
const { executeAudioGeneration } = await import('../src/pages/canvas/canvas-media-generation-executors');

test('rerunning imported media keeps the referenced node while honoring an explicit output placement', () => {
    for (const type of [CanvasNodeType.Image,CanvasNodeType.Video,CanvasNodeType.Audio]) {
        const node:any={type,metadata:{content:'https://example.test/old',generationMode:type,ltvReferencePlan:{prompt:'原指令',references:[]}}};
        expect(canGenerateMediaInPlace(node,type)).toBe(true);
        node.metadata.generationResultPlacement='new-node';
        expect(canGenerateMediaInPlace(node,type)).toBe(false);
    }
});

test('audio execution preserves strict options and dependency plan through result application', async () => {
    const source:CanvasNodeData={id:'speech',type:CanvasNodeType.Audio,title:'旁白',position:{x:0,y:0},width:350,height:240,metadata:{content:'https://example.test/old.mp3',status:'success',generationMode:'audio',model:'speech-channel::model',audioVoice:'narrator',audioSpeed:'1.25',strictGenerationOptions:['model','audioVoice','audioSpeed'],ltvReferencePlan:{prompt:'原始旁白',references:[]}}};
    let nodes=[source],connections:CanvasConnection[]=[];
    const plan={prompt:'下游',references:[{kind:'audio' as const,nodeId:source.id,url:'',deferred:true as const}]};
    await executeAudioGeneration({nodeId:source.id,sourceNode:source,prompt:'原始旁白',effectivePrompt:'原始旁白',generationConfig:{...defaultConfig,model:'speech-channel::model',audioVoice:'narrator',audioSpeed:'1.25'},generationContext:{referenceImages:[],referenceVideos:[],referenceAudios:[],resolvedCharacterVersions:[],resolvedCharacterVoices:[]},controller:new AbortController(),projectId:'test-project',setNodes:(update:any)=>{nodes=update(nodes);},setConnections:(update:any)=>{connections=update(connections);},startGenerationRequest:()=>{},finishGenerationRequest:()=>{},bindGenerationTask:()=>{},registerPendingNodeIds:()=>{},applyGenerationTaskResult:(id:string)=>{nodes=nodes.map(node=>node.id===id?{...node,metadata:{...node.metadata,content:'https://example.test/new.mp3',status:'success' as const}}:node);},taskContext:{},skillMetadata:{},retryContext:{}} as any);
    expect(nodes.length).toBe(1);expect(connections.length).toBe(0);
    expect(nodes[0].metadata?.ltvReferencePlan).toEqual(source.metadata?.ltvReferencePlan);
    expect(nodes[0].metadata?.strictGenerationOptions).toEqual(['model','audioVoice','audioSpeed']);
    expect(submitted.nodeId).toBe(source.id);expect(submitted.config.audioSpeed).toBe('1.25');
    expect(resolveLtvRuntimeReferences(plan,nodes,'下游')[0].metadata?.content).toBe('https://example.test/new.mp3');
});
