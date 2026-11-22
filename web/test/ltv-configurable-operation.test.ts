import {test, expect} from 'bun:test';
import {configurableLtvOperation} from '../src/lib/canvas/ltv-configurable-operation';
import {assertCanvasGenerationRequirements} from '../src/lib/canvas/canvas-project-generation';
import {defaultConfig, type AiConfig} from '../src/stores/use-config-store';
import {CanvasNodeType, type CanvasNodeData} from '../src/types/canvas';
import {imageGroundingTaskMetadata} from '../src/lib/canvas/image-grounding';

test('unconfigured image contract preserves resolution, ratio and count without assuming a channel',()=>{
 const result=configurableLtvOperation('image','image2image',{ratio:'16:9',quality:'2K'},{image:3,video:0,audio:0},4)!;
 const [w,h]=result.size!.split('x').map(Number);
 expect(w/h).toBe(16/9);expect(w*h).toBeGreaterThanOrEqual(2048**2);expect(result.count).toBe(4);
 expect(result.ltvExecutionContract).toBe('openai-image');
 expect(configurableLtvOperation('image','image2image',{quality:'3K'},{image:1,video:0,audio:0},1)).toBeUndefined();
 expect(configurableLtvOperation('image','image2image',{quality:'2K'},{image:1,video:1,audio:0},1)).toBeUndefined();
});

test('only documented single-output video shapes may wait for configuration',()=>{
 const f={ratio:'16:9',duration:5,resolution:'720p',enableSound:'on'},counts={image:2,video:0,audio:0};
 expect(configurableLtvOperation('video','frames2video',f,counts,1)?.videoEditOperation).toBe('image_to_video');
 expect(configurableLtvOperation('video','frames2video',f,counts,2)).toBeUndefined();
 expect(configurableLtvOperation('video','frames2video',{...f,quality:'high'},counts,1)).toBeUndefined();
 expect(configurableLtvOperation('video','videoEdit2video',f,counts,1)).toBeUndefined();
});

test('verified ordinary Kling 3.0 retains its declared quality tiers',()=>{
 const counts={image:1,video:0,audio:0};
 for(const [quality,mode,vquality] of [['high','pro','1080p'],['low','std','720p'],['4k','4k','4k']]){
  const result=configurableLtvOperation('video','singleImage2video',{model:'kling-video-o3',quality,duration:3,enableSound:'on',multi_shot:false},counts,1)!;
  expect(result.ltvExecutionContract).toBe('kling-v3-video');
  expect(result.videoKling).toMatchObject({mode,multiShot:false});
  expect(result.vquality).toBe(vquality);expect(result.seconds).toBe('3');expect(result.generateAudio).toBe('true');
 }
 expect(configurableLtvOperation('video','singleImage2video',{model:'kling-video-o3',quality:'invalid',duration:3},counts,1)).toBeUndefined();
 expect(configurableLtvOperation('video','audio2video',{model:'kling-video-o3',quality:'high',duration:3},{image:0,video:0,audio:1},1)).toBeUndefined();
 expect(configurableLtvOperation('video','singleImage2video',{model:'kling-video-o3',quality:'high',duration:20},counts,1)).toBeUndefined();
 expect(configurableLtvOperation('video','singleImage2video',{model:'kling-video-o3',duration:3},counts,1)).toBeUndefined();
});

test('Kling O1 and HappyHorse keep their independent verified contracts',()=>{
 const counts={image:1,video:0,audio:0};
 for(const quality of [undefined,'low','high']){
  const fields={model:'kling-video-o1',resolution:'auto',duration:5,...(quality?{quality}:{})};
  expect(configurableLtvOperation('video','singleImage2video',fields,counts,1)).toMatchObject({ltvExecutionContract:'kling-o1-video'});
  expect(configurableLtvOperation('video','frames2video',fields,counts,1)).toMatchObject({ltvExecutionContract:'kling-o1-video'});
  expect(configurableLtvOperation('video','text2video',fields,{image:0,video:0,audio:0},1)).toMatchObject({ltvExecutionContract:'kling-o1-video'});
 }
 const o1={model:'kling-video-o1',resolution:'auto',duration:5,quality:'high'};
 expect(configurableLtvOperation('video','mixed2video',o1,counts,1)).toMatchObject({ltvExecutionContract:'kling-o1-video'});
 expect(configurableLtvOperation('video','videoEdit2video',o1,{image:0,video:1,audio:0},1)).toBeUndefined();
 expect(configurableLtvOperation('video','singleImage2video',{...o1,subjects:[{klingId:'x'}]},counts,1)).toBeUndefined();
 expect(configurableLtvOperation('video','singleImage2video',{...o1,multi_prompt:[{index:1,prompt:'a'}]},counts,1)).toBeUndefined();
 expect(configurableLtvOperation('video','singleImage2video',{...o1,duration:20},counts,1)).toBeUndefined();
 for(const resolution of ['720P','1080P']){
  expect(configurableLtvOperation('video','frames2video',{model:'happy-horse-1.1',resolution,duration:6},counts,1)).toMatchObject({ltvExecutionContract:'happyhorse-first-frame-video',size:'adaptive',vquality:resolution});
 }
 // Both verified 1.1 operations keep their separate HappyHorse identities.
 expect(configurableLtvOperation('video','image2video',{model:'happy-horse-1.1',resolution:'720P',duration:6},counts,1)).toMatchObject({ltvExecutionContract:'happyhorse-reference-video',ltvHappyHorseModel:'happy-horse-1.1',videoEditOperation:'reference_to_video'});
 expect(configurableLtvOperation('video','videoEdit2video',{model:'happy-horse-1.1',resolution:'1080P'},{image:0,video:1,audio:0},1)).toBeUndefined();
 expect(configurableLtvOperation('video','frames2video',{model:'happy-horse-1.1',resolution:'480P',duration:6},counts,1)).toBeUndefined();
});

test('serialized audio switches survive while video search cannot silently disappear',()=>{
 const fields={ratio:'16:9',duration:5,resolution:'720p'},counts={image:0,video:0,audio:0};
 for(const value of [true,1,'1','on','true']){
  expect(configurableLtvOperation('video','text2video',{...fields,enableSound:value},counts,1)?.generateAudio).toBe('true');
  expect(configurableLtvOperation('video','text2video',{...fields,search_enabled:value},counts,1)).toMatchObject({ltvExecutionContract:'ark-video-search',videoWebSearch:true});
 }
 for(const value of [false,0,'0','off','false'])expect(configurableLtvOperation('video','text2video',{...fields,enableSound:value},counts,1)?.generateAudio).toBe('false');
 expect(configurableLtvOperation('video','text2video',{...fields,enableSound:'unknown'},counts,1)).toBeUndefined();
});

test('configured image is checked against protocol, real reference capacity and final prompt',()=>{
 const model='native::image';
 const cap={version:1,image:{references:{promptMaxChars:20,maxImages:1,maxImageBytes:1000,maskSupported:false},size:{parameter:'size',values:['1:1'],default:'1:1',allowCustom:false},quality:{supported:true,values:['high'],default:'high'},transparentBackground:{supported:false,default:false},responseFormat:{supported:true},outputFormat:{supported:true},maxOutputs:1}};
 const config={...defaultConfig,model,size:'1:1',quality:'high',count:'1',models:[model],imageModels:[model],channels:[{id:'native',name:'fixture',enabled:true,apiFormat:'openai',baseUrl:'/api',apiKey:'fixture',models:['image'],modelCosts:[{model:'image',capability:'image',protocol:'openai-image',capabilityConfig:cap}]}]} as unknown as AiConfig;
 const node:CanvasNodeData={id:'n',type:CanvasNodeType.Image,title:'配置型工程',position:{x:0,y:0},width:350,height:240,metadata:{...configurableLtvOperation('image','text2image',{ratio:'1:1'},{image:0,video:0,audio:0},1),model,generationMode:'image',prompt:'test',ltvReferencePlan:{prompt:'test',references:[]}}};
 expect(()=>assertCanvasGenerationRequirements(config,node,'image','test')).not.toThrow();
 node.metadata!.size='2:3';config.size='2:3';
 expect(()=>assertCanvasGenerationRequirements(config,node,'image','test')).toThrow('图片尺寸');
 node.metadata!.size='1:1';config.size='1:1';
 expect(()=>assertCanvasGenerationRequirements(config,node,'image','a'.repeat(21))).toThrow('正文长度');
 node.metadata!.ltvReferencePlan!.references=[{nodeId:'a',url:'https://example.test/a',kind:'image'},{nodeId:'b',url:'https://example.test/b',kind:'image'}];
 expect(()=>assertCanvasGenerationRequirements(config,node,'image','test')).toThrow('参考数量');
 config.channels[0].modelCosts![0].protocol='gemini-image';
 expect(()=>assertCanvasGenerationRequirements(config,node,'image','test')).toThrow('协议');
});

test('image search retains source tiers and cannot use a plain image protocol',()=>{
 const options=configurableLtvOperation('image','image2image',{ratio:'16:9',quality:'2K',search_enabled:1},{image:2,video:0,audio:0},4)!;
 expect(options.size).toBe('16:9');expect(options.quality).toBe('medium');expect(options.count).toBe(4);
 expect(options.imageGrounding).toEqual({provider:'google-search'});
 const model='native::gemini-3-pro-image-preview';
 const config={...defaultConfig,model,channels:[{id:'native',models:['gemini-3-pro-image-preview'],modelCosts:[{model:'gemini-3-pro-image-preview',protocol:'gemini-image'}]}]} as unknown as AiConfig;
 expect(imageGroundingTaskMetadata(options,config)).toEqual({providerOptions:{'gemini-image':{googleSearch:true}}});
 expect(imageGroundingTaskMetadata(undefined,config)).toEqual({});
 config.channels[0].modelCosts![0].protocol='openai-image';
 expect(()=>imageGroundingTaskMetadata(options,config)).toThrow('联网辅助');
 expect(configurableLtvOperation('image','image2image',{quality:'high',search_enabled:1},{image:2,video:0,audio:0},1)).toBeUndefined();
 expect(configurableLtvOperation('image','image2image',{quality:'2K',resolution:'4K',search_enabled:1},{image:2,video:0,audio:0},1)).toBeUndefined();
});

// nebula-ultra／nebula-2-flash／lib-image-2 的源 schema 把 ratio 的 auto（自适应）列为合法枚举，
// 宿主 gemini-image 合同的 size.values 同样声明 auto，buildGeminiImageGenerationConfig 对 auto
// 的行为就是省略 aspectRatio。此前联网分支用 ^(\d+):(\d+)$ 硬校验，auto 被判返回，62 个 nebula
// 联网节点因此固定落在 search-option-unmapped；这条签名不是宿主不支持，而是适配层漏项。
test('image search accepts the declared auto ratio without inventing a fixed aspect',()=>{
 const options=configurableLtvOperation('image','image2image',{ratio:'auto',quality:'2K',searchable:1},{image:1,video:0,audio:0},1)!;
 expect(options.size).toBe('auto');expect(options.quality).toBe('medium');expect(options.imageGrounding).toEqual({provider:'google-search'});
 expect(options.ltvExecutionContract).toBe('gemini-image-search');
 expect(configurableLtvOperation('image','text2image',{ratio:'auto',quality:'2K',searchable:1},{image:0,video:0,audio:0},1)?.size).toBe('auto');
 // 没有联网开关时仍是普通图像分支，auto 不能算出像素尺寸，继续上报而不是猜一个比例。
 expect(configurableLtvOperation('image','image2image',{ratio:'auto',quality:'2K'},{image:1,video:0,audio:0},1)).toBeUndefined();
 // 非法档位与 artdance25 视频画幅不受影响。
 expect(configurableLtvOperation('image','image2image',{ratio:'auto',quality:'3K',searchable:1},{image:1,video:0,audio:0},1)).toBeUndefined();
 expect(configurableLtvOperation('video','image2video',{ratio:'auto',duration:5,resolution:'720p'},{image:1,video:0,audio:0},1)).toBeUndefined();
});
