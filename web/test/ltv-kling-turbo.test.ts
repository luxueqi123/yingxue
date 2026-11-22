import {expect,test} from 'bun:test';
import {mapLtvKlingOptions,assertKlingRuntimeOptions,klingTaskMetadata} from '../src/lib/canvas/ltv-kling-options';
import {adaptLtvNativeProject} from '../src/lib/canvas/ltv-native-project';
import {assertCanvasGenerationRequirements,buildVideoGenerationMetadata} from '../src/lib/canvas/canvas-project-generation';
import {defaultConfig,type AiConfig} from '../src/stores/use-config-store';
import {defaultModelCapabilityConfig} from '../src/lib/model-capabilities';
import {CanvasNodeType} from '../src/types/canvas';

const fields={model:'kling-v3-turbo',modeType:'singleImage2video',resolution:'pro',duration:6,enableSound:'on',multi_shot:false};
const counts={image:1,video:0,audio:0};
test('Turbo retains original resolution enums, integer duration and sound-on choice',()=>{
    for(const [resolution,tier,mode] of [['720p','720p','std'],['std','720p','std'],['pro','1080p','pro'],['1080p','1080p','pro']]){
        expect(mapLtvKlingOptions({...fields,resolution},counts,1)).toMatchObject({ltvExecutionContract:'kling-v3-turbo-video',vquality:tier,seconds:'6',generateAudio:'true',size:'adaptive',videoKling:{mode,multiShot:false}});
    }
    for(const change of [{duration:2},{duration:16},{duration:5.5},{enableSound:'off'},{multi_shot:true},{ratio:'16:9'},{resolution:'4k'},{modeType:'frames2video'}])expect(mapLtvKlingOptions({...fields,...change},counts,1)).toBeUndefined();
    expect(mapLtvKlingOptions(fields,{...counts,image:2},1)).toBeUndefined();
});
test('Turbo native import preserves source and binds its unique first frame',()=>{
    const source={nodes:[{id:'first',type:'image',position:{x:0,y:0},data:{action:'image_resource',url:['https://example.com/first.png']}},{id:'video',type:'video',position:{x:300,y:0},data:{action:'video_generate',params:{...fields,prompt:'原始镜头',imageList:[{nodeId:'first',url:'https://example.com/first.png'}]}}}],edges:[{source:'first',target:'video'}]};
    const before=structuredClone(source),result=adaptLtvNativeProject(source,{channels:[]},'turbo','Turbo');
    expect(result.adoptable).toBe(true);
    const metadata=result.project.nodes.find(n=>n.id==='video')?.metadata;
    expect(metadata).toMatchObject({ltvExecutionContract:'kling-v3-turbo-video',videoStartFrameNodeId:'first',model:'',generateAudio:'true',seconds:'6'});
    expect(klingTaskMetadata(metadata)).toEqual({providerOptions:{'kling-v3-turbo-video':{mode:'pro',multiShot:false}}});
    expect(source).toEqual(before);
});
test('Turbo retry rejects substituted models, audio-off and tail frames',()=>{
    const options={mode:'pro' as const,multiShot:false},context={referenceImages:['first'],referenceVideos:[],referenceAudios:[]};
    expect(()=>assertKlingRuntimeOptions(options,'kling-3.0-turbo','1080p','6','true',context,'kling-v3-turbo-video')).not.toThrow();
    expect(()=>assertKlingRuntimeOptions(options,'kling-v3','1080p','6','true',context,'kling-v3-turbo-video')).toThrow();
    expect(()=>assertKlingRuntimeOptions(options,'kling-3.0-turbo','1080p','6','false',context,'kling-v3-turbo-video')).toThrow();
    expect(()=>assertKlingRuntimeOptions(options,'kling-3.0-turbo','1080p','6','true',{...context,referenceImages:['first','last']},'kling-v3-turbo-video')).toThrow();
});

test('Turbo normal and retry submission require its exact configured protocol',()=>{
    const cap=defaultModelCapabilityConfig('newapi-channel-2').video!;
    Object.assign(cap,{operations:['image_to_video'],ratios:['adaptive'],resolutions:['1080p'],duration:{selection:'enum',values:[3,4,5,6,7,8,9,10,11,12,13,14,15]},generateAudio:{supported:true}});
    Object.assign(cap.references,{minImages:1,maxImages:1,maxVideos:0,maxAudios:0,promptMaxChars:2500});
    const channel={id:'turbo',name:'fixture',enabled:true,apiFormat:'openai' as const,baseUrl:'/api',apiKey:'fixture',models:['kling-3.0-turbo'],modelCosts:[{model:'kling-3.0-turbo',capability:'video' as const,protocol:'kling-v3-turbo-video',capabilityConfig:{version:1 as const,video:cap}}]};
    const config={...defaultConfig,model:'turbo::kling-3.0-turbo',size:'adaptive',vquality:'1080p',videoSeconds:'6',videoGenerateAudio:'true',count:'1',channels:[channel]} as AiConfig;
    const node={id:'video',type:CanvasNodeType.Video,title:'Turbo',position:{x:0,y:0},metadata:{...mapLtvKlingOptions(fields,counts,1)!,model:config.model,prompt:'原始Turbo正文',videoStartFrameNodeId:'first',ltvReferencePlan:{prompt:'原始Turbo正文',references:[{nodeId:'first',kind:'image' as const,url:'https://example.com/first.png'}]}}};
    const context={referenceImages:[{id:'first',url:'https://example.com/first.png'}],referenceVideos:[],referenceAudios:[]};
    expect(()=>assertCanvasGenerationRequirements(config,node,'video',node.metadata.prompt)).not.toThrow();
    expect(buildVideoGenerationMetadata(node,context,config)).toMatchObject({videoStartFrameNodeId:'first',videoEditOperation:'image_to_video'});
    expect(()=>buildVideoGenerationMetadata(node,{...context,referenceImages:[]},config)).toThrow();
    expect(()=>buildVideoGenerationMetadata(node,context,{...config,videoGenerateAudio:'false'})).toThrow();
    channel.modelCosts[0].protocol='kling-v3-video';
    expect(()=>assertCanvasGenerationRequirements(config,node,'video',node.metadata.prompt)).toThrow('协议');
});
