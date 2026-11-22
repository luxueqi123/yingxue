import {expect,test} from 'bun:test';
import {mapLtvKlingOptions,assertKlingRuntimeOptions,klingTaskMetadata} from '../src/lib/canvas/ltv-kling-options';
import {adaptLtvNativeProject} from '../src/lib/canvas/ltv-native-project';
import {assertCanvasGenerationRequirements,buildVideoGenerationMetadata} from '../src/lib/canvas/canvas-project-generation';
import {defaultConfig,type AiConfig} from '../src/stores/use-config-store';
import {defaultModelCapabilityConfig} from '../src/lib/model-capabilities';
import {CanvasNodeType} from '../src/types/canvas';

const fields={model:'kling-v2-6',modeType:'singleImage2video',quality:'high',duration:5,enableSound:'on'};
const counts={image:1,video:0,audio:0};
test('2.6 preserves explicit audio and rejects 720p sound rather than upgrading',()=>{
    expect(mapLtvKlingOptions(fields,counts,1)).toMatchObject({ltvExecutionContract:'kling-v26-video',vquality:'1080p',generateAudio:'true',seconds:'5'});
    expect(mapLtvKlingOptions({...fields,quality:'low',enableSound:'off'},counts,1)).toMatchObject({vquality:'720p',generateAudio:'false'});
    for(const change of [{quality:'low'},{duration:6},{enableSound:undefined},{enableSound:'unexpected'},{ratio:'16:9'},{multi_shot:true},{keep_original_sound:'yes'}])expect(mapLtvKlingOptions({...fields,...change},counts,1)).toBeUndefined();
    expect(mapLtvKlingOptions({...fields,modeType:'frames2video',enableSound:undefined},{...counts,image:2},1)).toBeUndefined();
});
test('2.6 native import binds first frame and independent provider namespace',()=>{
    const source={nodes:[{id:'first',type:'image',position:{x:0,y:0},data:{action:'image_resource',url:['https://example.com/first.png']}},{id:'video',type:'video',position:{x:300,y:0},data:{action:'video_generate',params:{...fields,prompt:'原始镜头',imageList:[{nodeId:'first',url:'https://example.com/first.png'}]}}}],edges:[{source:'first',target:'video'}]};
    const before=structuredClone(source), result=adaptLtvNativeProject(source,{channels:[]},'v26','2.6');
    expect(result.adoptable).toBe(true);
    const metadata=result.project.nodes.find(n=>n.id==='video')?.metadata;
    expect(metadata).toMatchObject({ltvExecutionContract:'kling-v26-video',videoStartFrameNodeId:'first',generateAudio:'true'});
    expect(klingTaskMetadata(metadata)).toEqual({providerOptions:{'kling-v26-video':{mode:'pro',multiShot:false}}});
    expect(source).toEqual(before);
});
test('2.6 retry enforces exact model and audio resolution',()=>{
    const options={mode:'pro' as const,multiShot:false},context={referenceImages:['first'],referenceVideos:[],referenceAudios:[]};
    expect(()=>assertKlingRuntimeOptions(options,'kling-2.6','1080p','5','true',context,'kling-v26-video')).not.toThrow();
    expect(()=>assertKlingRuntimeOptions({...options,mode:'std'},'kling-2.6','720p','10','false',context,'kling-v26-video')).not.toThrow();
    expect(()=>assertKlingRuntimeOptions({...options,mode:'std'},'kling-2.6','720p','5','true',context,'kling-v26-video')).toThrow();
    expect(()=>assertKlingRuntimeOptions(options,'kling-v3','1080p','5','true',context,'kling-v26-video')).toThrow();
    expect(()=>assertKlingRuntimeOptions(options,'kling-2.6','1080p','6','true',context,'kling-v26-video')).toThrow();
});

test('2.6 normal and retry submission preserve audio and enforce independent protocol',()=>{
    const cap=defaultModelCapabilityConfig('newapi-channel-2').video!;
    Object.assign(cap,{operations:['image_to_video'],ratios:['adaptive'],resolutions:['720p','1080p'],duration:{selection:'enum',values:[5,10]},generateAudio:{supported:true}});
    Object.assign(cap.references,{minImages:1,maxImages:1,maxVideos:0,maxAudios:0,promptMaxChars:2500});
    const channel={id:'v26',name:'fixture',enabled:true,apiFormat:'openai' as const,baseUrl:'/api',apiKey:'fixture',models:['kling-2.6'],modelCosts:[{model:'kling-2.6',capability:'video' as const,protocol:'kling-v26-video',capabilityConfig:{version:1 as const,video:cap}}]};
    const config={...defaultConfig,model:'v26::kling-2.6',size:'adaptive',vquality:'1080p',videoSeconds:'5',videoGenerateAudio:'true',count:'1',channels:[channel]} as AiConfig;
    const node={id:'video',type:CanvasNodeType.Video,title:'2.6',position:{x:0,y:0},metadata:{...mapLtvKlingOptions(fields,counts,1)!,model:config.model,prompt:'原始2.6正文',videoStartFrameNodeId:'first',ltvReferencePlan:{prompt:'原始2.6正文',references:[{nodeId:'first',kind:'image' as const,url:'https://example.com/first.png'}]}}};
    const context={referenceImages:[{id:'first',url:'https://example.com/first.png'}],referenceVideos:[],referenceAudios:[]};
    expect(()=>assertCanvasGenerationRequirements(config,node,'video',node.metadata.prompt)).not.toThrow();
    const metadata=buildVideoGenerationMetadata(node,context,config);
    expect(metadata).toMatchObject({videoStartFrameNodeId:'first',videoKling:{mode:'pro',multiShot:false}});
    expect(klingTaskMetadata(metadata)).toEqual({providerOptions:{'kling-v26-video':{mode:'pro',multiShot:false}}});
    expect(()=>buildVideoGenerationMetadata(node,{...context,referenceImages:[]},config)).toThrow();
    expect(()=>buildVideoGenerationMetadata(node,context,{...config,videoSeconds:'6'})).toThrow();
    expect(()=>assertCanvasGenerationRequirements({...config,vquality:'720p'},node,'video',node.metadata.prompt)).toThrow();
    channel.modelCosts[0].protocol='kling-v3-video';
    expect(()=>assertCanvasGenerationRequirements(config,node,'video',node.metadata.prompt)).toThrow('协议');
});
