import {expect, test} from 'bun:test';
import {mapLtvKlingOptions, assertKlingRuntimeOptions, klingTaskMetadata} from '../src/lib/canvas/ltv-kling-options';
import {adaptLtvNativeProject} from '../src/lib/canvas/ltv-native-project';
import {assertCanvasGenerationRequirements, buildVideoGenerationMetadata} from '../src/lib/canvas/canvas-project-generation';
import {defaultConfig, type AiConfig} from '../src/stores/use-config-store';
import {defaultModelCapabilityConfig} from '../src/lib/model-capabilities';
import {CanvasNodeType} from '../src/types/canvas';

const fields={model:'kling-video-o1',modeType:'singleImage2video',quality:'low',resolution:'auto',duration:5};
const counts={image:1,video:0,audio:0};

test('O1 keeps its source model, quality, duration and frame operation',()=>{
    expect(mapLtvKlingOptions(fields,counts,1)).toMatchObject({ltvExecutionContract:'kling-o1-video',size:'adaptive',seconds:'5',vquality:'720p',generateAudio:'false',videoKling:{mode:'std',multiShot:false}});
    expect(mapLtvKlingOptions({...fields,quality:'high',modeType:'frames2video'},counts,1)).toMatchObject({ltvExecutionContract:'kling-o1-video',vquality:'1080p',videoEditOperation:'image_to_video'});
    expect(mapLtvKlingOptions({...fields,modeType:'text2video',ratio:'9:16'},{...counts,image:0},1)).toMatchObject({videoEditOperation:'text_to_video',size:'9:16'});
    expect(mapLtvKlingOptions({...fields,modeType:'mixed2video',quality:undefined,ratio:'16:9'},{...counts,image:7},1)).toMatchObject({videoEditOperation:'reference_to_video',size:'16:9',vquality:'720p'});
});

test('O1 unsupported source fields stay unresolved',()=>{
    for(const change of [{quality:'4k'},{duration:6},{resolution:'1080p'},{enableSound:'on'},{multi_shot:true},{elementList:['subject']},{prompt:'<<<image_1>>>'},{prompt:'@image_1'},{modeType:'videoEdit2video'}]){
        expect(mapLtvKlingOptions({...fields,...change},counts,1)).toBeUndefined();
    }
    expect(mapLtvKlingOptions(fields,{...counts,image:2},1)).toBeUndefined();
    expect(mapLtvKlingOptions({...fields,modeType:'mixed2video'},{...counts,video:1},1)).toBeUndefined();
    expect(mapLtvKlingOptions({...fields,modeType:'mixed2video'},{...counts,image:8},1)).toBeUndefined();
});

test('native O1 import preserves source and does not select substitute models',()=>{
    const source={nodes:[
        {id:'first',type:'image',position:{x:0,y:0},data:{action:'image_resource',url:['https://example.com/first.png']}},
        {id:'video',type:'video',position:{x:300,y:0},data:{action:'video_generate',params:{...fields,prompt:'原始镜头',imageList:[{nodeId:'first',url:'https://example.com/first.png'}]}}},
    ],edges:[{source:'first',target:'video'}]};
    const original=structuredClone(source);
    const result=adaptLtvNativeProject(source,{channels:[]},'o1','O1');
    expect(result.adoptable).toBe(true);
    const metadata=result.project.nodes.find(n=>n.id==='video')?.metadata;
    expect(metadata).toMatchObject({ltvExecutionContract:'kling-o1-video',model:'',videoStartFrameNodeId:'first',prompt:'原始镜头'});
    expect(klingTaskMetadata(metadata)).toEqual({providerOptions:{'kling-o1-video':{mode:'std',multiShot:false}}});
    expect(source).toEqual(original);
});

test('retry O1 checks exact model and supported mode before submitting',()=>{
    const options={mode:'std' as const,multiShot:false};
    const context={referenceImages:['first'],referenceVideos:[],referenceAudios:[]};
    const run=(model='kling-video-o1',resolution='720p',seconds='5',sound='false')=>assertKlingRuntimeOptions(options,model,resolution,seconds,sound,context,'kling-o1-video');
    expect(()=>run()).not.toThrow();
    expect(()=>run('kling-v3-omni')).toThrow();
    expect(()=>run('kling-video-o1','1080p')).toThrow();
    expect(()=>run('kling-video-o1','720p','6')).toThrow();
    expect(()=>run('kling-video-o1','720p','5','true')).toThrow();
});

test('O1 normal and retry submission preserve the selected protocol and explicit frame',()=>{
    const options=mapLtvKlingOptions(fields,counts,1)!;
    const cap=defaultModelCapabilityConfig('newapi-channel-2').video!;
    Object.assign(cap,{operations:['image_to_video'],ratios:['adaptive'],resolutions:['720p'],duration:{selection:'enum',values:[5,10]},generateAudio:{supported:false}});
    Object.assign(cap.references,{minImages:1,maxImages:2,maxVideos:0,maxAudios:0,promptMaxChars:2500});
    const channel={id:'o1',name:'fixture',enabled:true,apiFormat:'openai' as const,baseUrl:'/api',apiKey:'fixture',models:['kling-video-o1'],modelCosts:[{model:'kling-video-o1',capability:'video' as const,protocol:'kling-o1-video',capabilityConfig:{version:1 as const,video:cap}}]};
    const config={...defaultConfig,model:'o1::kling-video-o1',size:'adaptive',vquality:'720p',videoSeconds:'5',videoGenerateAudio:'false',count:'1',channels:[channel]} as AiConfig;
    const node={id:'video',type:CanvasNodeType.Video,title:'O1',position:{x:0,y:0},metadata:{...options,model:config.model,prompt:'原始O1正文',videoStartFrameNodeId:'first',ltvReferencePlan:{prompt:'原始O1正文',references:[{nodeId:'first',kind:'image' as const,url:'https://example.com/first.png'}]}}};
    const context={referenceImages:[{id:'first',url:'https://example.com/first.png'}],referenceVideos:[],referenceAudios:[]};
    expect(()=>assertCanvasGenerationRequirements(config,node,'video',node.metadata.prompt)).not.toThrow();
    expect(buildVideoGenerationMetadata(node,context,config)).toMatchObject({videoStartFrameNodeId:'first',videoEditOperation:'image_to_video'});
    expect(()=>buildVideoGenerationMetadata(node,{...context,referenceImages:[]},config)).toThrow();
    expect(()=>buildVideoGenerationMetadata(node,context,{...config,model:'o1::kling-v3-omni'})).toThrow();
    channel.modelCosts[0].protocol='kling-omni-video';
    expect(()=>assertCanvasGenerationRequirements(config,node,'video',node.metadata.prompt)).toThrow('协议');
});
