import {expect, test} from 'bun:test';
import {mapLtvHailuoOptions, assertHailuoRuntimeOptions} from '../src/lib/canvas/ltv-hailuo-options';
import {configurableLtvOperation} from '../src/lib/canvas/ltv-configurable-operation';
import {assertCanvasGenerationRequirements, buildVideoGenerationMetadata} from '../src/lib/canvas/canvas-project-generation';
import {defaultConfig, type AiConfig} from '../src/stores/use-config-store';
import {defaultModelCapabilityConfig} from '../src/lib/model-capabilities';
import {CanvasNodeType, type CanvasNodeData} from '../src/types/canvas';
import {adaptLtvNativeProject} from '../src/lib/canvas/ltv-native-project';

const inputs = {image: 1, video: 0, audio: 0};
const fields = {model: 'MiniMax-Hailuo-2.3', modeType: 'singleImage2video', ratio: 'auto', resolution: '1080P', duration: 6};

test('legacy single-frame Hailuo uses the V1 contract and preserves its source version', () => {
    for (const model of ['MiniMax-Hailuo-2.3', 'MiniMax-Hailuo-2.3-Fast']) {
        const options = mapLtvHailuoOptions({...fields, model}, inputs, 1);
        expect(options).toMatchObject({ltvExecutionContract: 'minimax-video-v1', ltvHailuoModel: model, size: 'auto', vquality: '1080P', seconds: '6', count: 1, videoEditOperation: 'image_to_video', generateAudio: 'false'});
        expect(configurableLtvOperation('video', 'singleImage2video', {...fields, model}, inputs, 1)).toEqual(options);
    }
});

test('legacy Hailuo retains unsupported requests as gaps', () => {
    for (const change of [{resolution: '2K'}, {resolution:'1080P', duration:10}, {duration: 5}, {duration: 6.5}, {ratio:'16:9'}, {modeType:'frames2video'},  {enableSound:'on'}, {cameraMovement:'[Zoom in]'}]) {
        expect(mapLtvHailuoOptions({...fields, ...change}, inputs, 1)).toBeUndefined();
    }
    for (const counts of [{image:0,video:0,audio:0}, {image:2,video:0,audio:0}, {image:1,video:1,audio:0}, {image:1,video:0,audio:1}]) expect(mapLtvHailuoOptions(fields, counts, 1)).toBeUndefined();
    expect(mapLtvHailuoOptions(fields, inputs, 2)).toBeUndefined();
    expect(mapLtvHailuoOptions({...fields,resolution:'768P',duration:10},inputs,1)).toMatchObject({seconds:'10',vquality:'768P'});
});

test('V1 runtime preserves model version, duration and tier instead of falling into V2', () => {
    expect(() => assertHailuoRuntimeOptions('MiniMax-Hailuo-2.3','1080P','6','false','MiniMax-Hailuo-2.3','minimax-video-v1')).not.toThrow();
    expect(() => assertHailuoRuntimeOptions('MiniMax-Hailuo-2.3-Fast','1080P','6','false','MiniMax-Hailuo-2.3','minimax-video-v1')).toThrow();
    expect(() => assertHailuoRuntimeOptions('MiniMax-H3','768P','6','false',undefined,'minimax-video-v1')).toThrow();
    expect(() => assertHailuoRuntimeOptions('MiniMax-Hailuo-2.3','1080P','10','false','MiniMax-Hailuo-2.3','minimax-video-v1')).toThrow();
});

test('canvas generation accepts V1 only with declared matching capabilities and source version', () => {
    const options = mapLtvHailuoOptions(fields, inputs, 1)!;
    const profile = defaultModelCapabilityConfig('minimax-video-v1').video!;
    Object.assign(profile,{ratios:['auto'],resolutions:['768P','1080P'],operations:['image_to_video'],duration:{selection:'enum',values:[6,10],default:6},maxOutputs:1});
    Object.assign(profile.references,{minImages:1,maxImages:1,maxVideos:0,maxAudios:0,promptMaxChars:2000});
    const channel = {id:'v1',name:'contract fixture',enabled:true,baseUrl:'/api',apiKey:'fixture',apiFormat:'openai',interfaceType:'minimax-video-v1',models:[fields.model],modelCosts:[{model:fields.model,capability:'video',protocol:'minimax-video-v1',capabilityConfig:{version:1,video:profile}}]};
    const model = 'v1::'+fields.model;
    const config = {...defaultConfig,channels:[channel],model,size:'auto',vquality:'1080P',videoSeconds:'6',videoGenerateAudio:'false',count:'1'} as AiConfig;
    const node:CanvasNodeData = {id:'n',type:CanvasNodeType.Video,title:'Hailuo 2.3',position:{x:0,y:0},metadata:{...options,model,prompt:'Original prompt',ltvReferencePlan:{prompt:'Original prompt',references:[{nodeId:'ref',kind:'image',url:'https://example.com/source.png'}]}}};
    expect(()=>assertCanvasGenerationRequirements(config,node,'video','Original prompt')).not.toThrow();
    channel.modelCosts[0].protocol='minimax-video';
    expect(()=>assertCanvasGenerationRequirements(config,node,'video','Original prompt')).toThrow('协议');
    channel.modelCosts[0].protocol='minimax-video-v1';
    node.metadata!.ltvHailuoModel='MiniMax-Hailuo-2.3-Fast';
    expect(()=>assertCanvasGenerationRequirements(config,node,'video','Original prompt')).toThrow('版本');
});

test('a matching generic video catalogue cannot replace a Hailuo source version', () => {
    const source = {nodes:[{id:'video',type:'video',position:{x:0,y:0},data:{action:'video_generate',params:{...fields,prompt:'Original prompt',count:1,imageList:[{nodeId:'ref',url:'https://example.com/original.png'}]}}}],edges:[]};
    const before=JSON.stringify(source);
    const catalogue={channels:[{id:'other',models:[{modelKey:'different-model',capability:'video',available:true,protocol:'ctmo-video',capabilityConfig:{video:{operations:['image_to_video'],ratios:['auto'],resolutions:['1080P'],duration:{min:6,max:10,step:1},references:{minImages:1,maxImages:1,maxVideos:0,maxAudios:0,promptMaxChars:2000}}}}]}]};
    const result=adaptLtvNativeProject(source,catalogue,'case','Case');
    const metadata=result.project.nodes.find(n=>n.id==='video')!.metadata!;
    expect(metadata.model).not.toBe('other::different-model');
    expect(metadata.ltvExecutionContract).toBe('minimax-video-v1');
    expect(metadata.ltvHailuoModel).toBe(fields.model);
    expect(JSON.stringify(source)).toBe(before);
});

test('generated video metadata keeps the original Hailuo version for later retries', () => {
    for (const sourceModel of ['MiniMax-Hailuo-2.3','MiniMax-Hailuo-H3'] as const) {
        const node:CanvasNodeData={id:'n',type:CanvasNodeType.Video,title:'Original',position:{x:0,y:0},metadata:{ltvHailuoModel:sourceModel,ltvExecutionContract:sourceModel==='MiniMax-Hailuo-2.3'?'minimax-video-v1':'minimax-video'}};
        const result=buildVideoGenerationMetadata(node);
        expect(result.ltvHailuoModel).toBe(sourceModel);
        expect(result.ltvExecutionContract).toBe(node.metadata!.ltvExecutionContract);
    }
});
