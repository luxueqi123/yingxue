import {test,expect} from 'bun:test';
import {configurableLtvOperation} from '../src/lib/canvas/ltv-configurable-operation';
import {adaptLtvNativeProject} from '../src/lib/canvas/ltv-native-project';
import {assertCanvasGenerationRequirements,buildVideoGenerationMetadata} from '../src/lib/canvas/canvas-project-generation';
import {volcanoVideoEnhanceTaskMetadata} from '../src/lib/canvas/ltv-volcano-video-enhance';
import {defaultConfig,type AiConfig} from '../src/stores/use-config-store';
import {defaultModelCapabilityConfig} from '../src/lib/model-capabilities';
import {CanvasNodeType} from '../src/types/canvas';

test('volcano enhancement retains explicit resolution and frame rate without substituting a video generator',()=>{
    const fields={model:'volcano-video-upscaler',resolution:'1080p',fps:24};
    expect(configurableLtvOperation('video','',fields,{image:0,video:1,audio:0},1)).toMatchObject({
        ltvExecutionContract:'volcengine-mediakit-video-enhance',videoUpscale:{resolution:'1080p',fps:24},count:1,
    });
    for(const change of [{fps:0},{fps:121},{fps:24.5},{resolution:'8k'},{tool_version:'professional'},{scene:'aigc'}]){
        expect(configurableLtvOperation('video','',{...fields,...change},{image:0,video:1,audio:0},1)).toBeUndefined();
    }
    expect(configurableLtvOperation('video','',fields,{image:1,video:1,audio:0},1)).toBeUndefined();
});

test('volcano native import retains source identity and avoids unrelated configured models',()=>{
    const source={nodes:[{id:'source',type:'video',position:{x:0,y:0},data:{action:'video_resource',url:['https://example.com/original.mp4']}},{id:'enhance',type:'video',position:{x:300,y:0},data:{action:'video_generate',generatorType:'enhance',params:{model:'volcano-video-upscaler',resolution:'1080p',fps:24,videoList:[{nodeId:'source',url:'https://example.com/original.mp4'}]}}}],edges:[{source:'source',target:'enhance'}]};
    const before=structuredClone(source),result=adaptLtvNativeProject(source,{channels:[]},'volcano','Enhance');
    expect(result.adoptable).toBe(true);
    expect(result.project.nodes.find(n=>n.id==='enhance')?.metadata).toMatchObject({model:'',ltvExecutionContract:'volcengine-mediakit-video-enhance',videoUpscale:{resolution:'1080p',fps:24}});
    expect(source).toEqual(before);
});

test('enhancement normal and retry preserve fps and reject prompt, missing video or generator substitution',()=>{
    const protocol='volcengine-mediakit-video-enhance';
    const cap=defaultModelCapabilityConfig('newapi-channel-2').video!;
    Object.assign(cap.references,{minImages:0,maxImages:0,maxVideos:1,maxAudios:0,promptMaxChars:0});
    const channel={id:'enhance',name:'fixture',enabled:true,apiFormat:'openai' as const,baseUrl:'/api',apiKey:'fixture',models:['enhance-video'],modelCosts:[{model:'enhance-video',capability:'video' as const,protocol,capabilityConfig:{version:1 as const,video:cap}}]};
    const config={...defaultConfig,model:'enhance::enhance-video',count:'1',channels:[channel]} as AiConfig;
    const node={id:'output',type:CanvasNodeType.Video,title:'增强',position:{x:0,y:0},metadata:{...configurableLtvOperation('video','',{model:'volcano-video-upscaler',resolution:'1080p',fps:24},{image:0,video:1,audio:0},1)!,model:config.model,prompt:'',ltvReferencePlan:{prompt:'',references:[{nodeId:'source',kind:'video' as const,url:'https://example.com/original.mp4'}]}}};
    const context={referenceImages:[],referenceVideos:[{id:'source',name:'original.mp4',url:'https://example.com/original.mp4',durationMs:5090}],referenceAudios:[]};
    expect(()=>assertCanvasGenerationRequirements(config,node,'video','')).not.toThrow();
    const metadata=buildVideoGenerationMetadata(node,context,config);
    expect(volcanoVideoEnhanceTaskMetadata(metadata)).toEqual({providerOptions:{[protocol]:{resolution:'1080p',fps:24}}});
    expect(()=>assertCanvasGenerationRequirements(config,node,'video','change the actor')).toThrow();
    expect(()=>buildVideoGenerationMetadata(node,{...context,referenceVideos:[]},config)).toThrow();
    channel.modelCosts[0].protocol='kling-v3-video';
    expect(()=>assertCanvasGenerationRequirements(config,node,'video','')).toThrow();
});
