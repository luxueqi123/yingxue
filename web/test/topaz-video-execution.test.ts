import { expect, mock, test, beforeEach, afterEach } from 'bun:test';
import { installResourceAccessFixture } from './resource-access-fixture';
let restoreResourceAccess: () => void;
beforeEach(() => { restoreResourceAccess = installResourceAccessFixture({'enhanced-video': 'data:video/mp4;base64,eA=='}); });
afterEach(() => restoreResourceAccess());
import { defaultConfig } from '../src/stores/use-config-store';
import { mapLtvTopazVideoOptions } from '../src/lib/canvas/ltv-topaz-video';
import { applyGenerationTaskResultToNodes } from '../src/lib/canvas/canvas-generation-task-sync';
import { isolateCopiedNodeMetadata } from '../src/lib/canvas/canvas-node-copy';
const actual = await import('../src/lib/canvas/canvas-project-generation');
const upload = await import('../src/lib/canvas/canvas-file-upload');
let submitted: any;
mock.module('@/lib/canvas/canvas-file-upload', () => ({ ...upload, readUploadVideoSize: async (source: string) => {
    expect(source).toBe('https://example.test/original.mp4');
    return [1470,630];
} }));
mock.module('@/lib/canvas/canvas-project-generation', () => ({ ...actual, runCanvasGenerationTaskToConsumer: async (input: any, consumer: any) => {
    submitted = input;
    await consumer.consumeTask({ id: 'mock-video', status: 'succeeded', taskType: 'video', inputJson: JSON.stringify(input), resultJson: JSON.stringify({ video: { dataUrl: 'data:video/mp4;base64,eA==', storageKey: 'resource:enhanced-video', mimeType: 'video/mp4', width: 3840, height: 1648 } }) });
} }));
const { executeVideoGeneration } = await import('../src/pages/canvas/canvas-media-generation-executors');

test('视频增强实际首次执行器读取原片尺寸，提交和结果恢复保留增强合同', async () => {
    const options = mapLtvTopazVideoOptions({ model: 'topaz-video-upscaler', specifiedModel: 'prob-4', resolution: '4K' }, { image: 0, video: 1, audio: 0 }, 1)!;
    const source: any = { id: 'enhance-video', type: 'video', title: '增强', position: {x:0,y:0}, width:320, height:180, metadata: { ...options, model: 'topaz::prob-4', generationMode: 'video', prompt: '' } };
    let nodes = [source], connections: any[] = [];
    const config = { ...defaultConfig, model:'topaz::prob-4', count:'1', channels: [{ id:'topaz', name:'fixture', enabled:true, baseUrl:'https://example.test', interfaceType:'topaz-video-enhance', models:['prob-4'], modelCosts:[{model:'prob-4',capability:'video',protocol:'topaz-video-enhance'}] }] };
    const video = { id:'source', name:'original.mp4', type:'video/mp4', url:'https://example.test/original.mp4', width:99, height:99 };
    await executeVideoGeneration({ nodeId:source.id, sourceNode:source, prompt:'', effectivePrompt:'', generationConfig:config, generationContext:{referenceVideos:[video],referenceImages:[],referenceAudios:[],resolvedCharacterVersions:[],resolvedCharacterVoices:[]},controller:new AbortController(),projectId:'fixture',canvasConnections:connections,
        setNodes:(v:any)=>{nodes=typeof v==='function'?v(nodes):v},setConnections:(v:any)=>{connections=typeof v==='function'?v(connections):v},startGenerationRequest:()=>{},finishGenerationRequest:()=>{},bindGenerationTask:()=>{},registerPendingNodeIds:()=>{},
        applyGenerationTaskResult:async(id:string,task:any)=>{nodes=(await applyGenerationTaskResultToNodes(nodes,task,id)).nodes},taskContext:{},styleMetadata:{},skillMetadata:{},retryContext:{} } as any);
    expect(submitted.metadata.providerOptions.topazVideo.output.resolution).toEqual({width:3840,height:1648});
    expect(submitted.metadata.providerOptions.topazVideo.filters).toEqual([{model:'prob-4'}]);
    expect(video.width).toBe(99);
    const restored=JSON.parse(JSON.stringify(nodes));
    const result=restored.find((node:any)=>node.metadata.storageKey==='resource:enhanced-video');
    expect(result).toBeDefined();
    expect(result.metadata.videoEnhancement).toEqual(options.videoEnhancement);
    const copied=isolateCopiedNodeMetadata(result,new Map());
    copied.videoEnhancement!.resolution='2K';
    expect(result.metadata.videoEnhancement.resolution).toBe('4K');
});
