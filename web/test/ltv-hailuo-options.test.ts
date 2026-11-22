import {test, expect} from 'bun:test';
import {mapLtvHailuoOptions, assertHailuoRuntimeOptions} from '../src/lib/canvas/ltv-hailuo-options';
import {configurableLtvOperation} from '../src/lib/canvas/ltv-configurable-operation';
import {assertCanvasGenerationRequirements} from '../src/lib/canvas/canvas-project-generation';
import {defaultModelCapabilityConfig} from '../src/lib/model-capabilities';
import {defaultConfig, type AiConfig} from '../src/stores/use-config-store';
import {CanvasNodeType, type CanvasNodeData, type CanvasNodeMetadata} from '../src/types/canvas';

const none={image:0,video:0,audio:0};

test('native V2 refuses legacy Hailuo versions even with matching saved source metadata',()=>{
 for(const model of ['MiniMax-Hailuo-2.3','MiniMax-Hailuo-2.3-Fast','MiniMax-Hailuo-o2']){
  expect(()=>assertHailuoRuntimeOptions(model,'768P','6','false',model as never)).toThrow('V2');
  const mapped=mapLtvHailuoOptions({model,modeType:'singleImage2video',ratio:'auto',resolution:'768P',duration:6},{image:1,video:0,audio:0},1);
  if(model==='MiniMax-Hailuo-o2')expect(mapped).toMatchObject({ltvExecutionContract:'minimax-hailuo02-video'});
  else expect(mapped?.ltvExecutionContract).toBe('minimax-video-v1');
 }
});

test('native H3-Max uses its documented API model ID while retaining the source version',()=>{
 const options=mapLtvHailuoOptions({model:'MiniMax-Hailuo-H3-Max',modeType:'singleImage2video',resolution:'768P',duration:6},{image:1,video:0,audio:0},1)!;
 expect(options.ltvHailuoModel).toBe('MiniMax-Hailuo-H3-Max');
 expect(()=>assertHailuoRuntimeOptions('MiniMax-H3-Max','768P','6','false',options.ltvHailuoModel)).not.toThrow();
 expect(()=>assertHailuoRuntimeOptions('MiniMax-Hailuo-H3-Max','768P','6','false',options.ltvHailuoModel)).toThrow('V2');
});

test('a rejected Hailuo request cannot fall through to a different provider contract',()=>{
 for(const model of ['MiniMax-Hailuo-H3','MiniMax-Hailuo-2.3']){
  expect(configurableLtvOperation('video','singleImage2video',{model,ratio:'16:9',resolution:'1080P',duration:6},{image:1,video:0,audio:0},1)).toBeUndefined();
 }
});

test('H3 requests map onto the host MiniMax V2 contract that already exists',()=>{
 expect(mapLtvHailuoOptions({model:'MiniMax-Hailuo-H3',modeType:'mixed2video',ratio:'21:9',resolution:'768P',duration:8}, {image:4,video:1,audio:2}, 1)).toEqual({
  size:'21:9',seconds:'8',vquality:'768P',generateAudio:'false',count:1,videoEditOperation:'reference_to_video',
  ltvExecutionContract:'minimax-video',ltvHailuoModel:'MiniMax-Hailuo-H3',strictGenerationOptions:['model','size','seconds','vquality','generateAudio','count'],
 });
 expect(mapLtvHailuoOptions({model:'MiniMax-Hailuo-H3',modeType:'text2video',ratio:'16:9',resolution:'2K',duration:6}, none, 1)).toMatchObject({seconds:'6',vquality:'2K',videoEditOperation:'text_to_video'});
 expect(mapLtvHailuoOptions({model:'MiniMax-Hailuo-H3',modeType:'frames2video',resolution:'2K',duration:5}, {image:2,video:0,audio:0}, 1)).toMatchObject({size:'adaptive',vquality:'2K',videoEditOperation:'image_to_video'});
 expect(mapLtvHailuoOptions({model:'MiniMax-Hailuo-H3',modeType:'singleImage2video',resolution:'2K',duration:5}, {image:1,video:0,audio:0}, 1)).toMatchObject({size:'adaptive',videoEditOperation:'image_to_video'});
});

test('requirements outside the host contract stay reported instead of being clamped',()=>{
 const base={model:'MiniMax-Hailuo-H3',modeType:'mixed2video',ratio:'16:9',resolution:'2K'};
 // The provider never sends generate_audio, so a saved "on" choice cannot be carried.
 expect(mapLtvHailuoOptions({...base,duration:5,enableSound:'on'}, {image:1,video:0,audio:0}, 1)).toBeUndefined();
 expect(mapLtvHailuoOptions({...base,duration:5,enableSound:'off'}, {image:1,video:0,audio:0}, 1)).toMatchObject({generateAudio:'false'});
 // Duration is an integer 5-15 slider in the source schema, inside the protocol's own 4-15 range.
 for(const duration of [4,3,16,5.5,'x',undefined]) expect(mapLtvHailuoOptions({...base,duration}, {image:1,video:0,audio:0}, 1)).toBeUndefined();
 expect(mapLtvHailuoOptions({...base,duration:15}, {image:1,video:0,audio:0}, 1)).toMatchObject({seconds:'15'});
 for(const resolution of ['480P','1080P','4K']) expect(mapLtvHailuoOptions({...base,duration:5,resolution}, {image:1,video:0,audio:0}, 1)).toBeUndefined();
 for(const ratio of ['2:1','auto','1:4']) expect(mapLtvHailuoOptions({...base,duration:5,ratio}, {image:1,video:0,audio:0}, 1)).toBeUndefined();
 // A blank ratio takes the mode default the source schema declares, not a guessed tier.
 expect(mapLtvHailuoOptions({...base,duration:5,ratio:''}, {image:1,video:0,audio:0}, 1)).toMatchObject({size:'16:9'});
 expect(mapLtvHailuoOptions({model:'MiniMax-Hailuo-H3',modeType:'frames2video',resolution:'2K',duration:5,ratio:''}, {image:2,video:0,audio:0}, 1)).toMatchObject({size:'adaptive'});
 // Batch output and reference ceilings are the protocol's own declared limits.
 expect(mapLtvHailuoOptions({...base,duration:5}, {image:1,video:0,audio:0}, 2)).toBeUndefined();
 expect(mapLtvHailuoOptions({...base,duration:5}, {image:10,video:0,audio:0}, 1)).toBeUndefined();
 expect(mapLtvHailuoOptions({...base,duration:5}, {image:1,video:4,audio:0}, 1)).toBeUndefined();
 expect(mapLtvHailuoOptions({...base,duration:5}, {image:1,video:0,audio:4}, 1)).toBeUndefined();
 expect(mapLtvHailuoOptions({...base,modeType:'text2video',duration:5}, {image:0,video:1,audio:0}, 1)).toBeUndefined();
 expect(mapLtvHailuoOptions({...base,modeType:'mixed2video',duration:5}, none, 1)).toBeUndefined();
 // mixed2video declares a total media range: a reference video alone is a valid request, but
 // audio-only input is rejected by the source rule and must stay unadapted.
 expect(mapLtvHailuoOptions({...base,modeType:'mixed2video',duration:5}, {image:0,video:1,audio:0}, 1)).toMatchObject({videoEditOperation:'reference_to_video'});
 expect(mapLtvHailuoOptions({...base,modeType:'mixed2video',duration:5}, {image:0,video:0,audio:1}, 1)).toBeUndefined();
});

test('H3-Max keeps its own reduced modes and tiers',()=>{
 expect(mapLtvHailuoOptions({model:'MiniMax-Hailuo-H3-Max',modeType:'singleImage2video',resolution:'768P',duration:6}, {image:1,video:0,audio:0}, 1)).toMatchObject({vquality:'768P',videoEditOperation:'image_to_video'});
 expect(mapLtvHailuoOptions({model:'MiniMax-Hailuo-H3-Max',modeType:'frames2video',ratio:'16:9',resolution:'768P',duration:6}, {image:2,video:0,audio:0}, 1)).toMatchObject({vquality:'768P'});
 // The source declares 480P for H3-Max, but the host MiniMax profile exposes 768P and 2K only.
 expect(mapLtvHailuoOptions({model:'MiniMax-Hailuo-H3-Max',modeType:'singleImage2video',resolution:'480P',duration:6}, {image:1,video:0,audio:0}, 1)).toBeUndefined();
 expect(mapLtvHailuoOptions({model:'MiniMax-Hailuo-H3-Max',modeType:'mixed2video',resolution:'768P',duration:6}, {image:2,video:0,audio:0}, 1)).toBeUndefined();
 expect(mapLtvHailuoOptions({model:'MiniMax-Hailuo-H3-Max',modeType:'text2video',ratio:'16:9',resolution:'768P',duration:6}, none, 1)).toBeUndefined();
 expect(mapLtvHailuoOptions({model:'MiniMax-Hailuo-H3-Max',modeType:'singleImage2video',resolution:'2K',duration:6}, {image:1,video:0,audio:0}, 1)).toBeUndefined();
 // Other Hailuo versions stay unadapted: their capability sets are not this contract.
 expect(mapLtvHailuoOptions({model:'MiniMax-Hailuo-2.3',modeType:'singleImage2video',resolution:'2K',duration:6}, {image:1,video:0,audio:0}, 1)).toBeUndefined();
});

test('runtime assertion refuses a substituted model, tier, duration or sound request',()=>{
 expect(()=>assertHailuoRuntimeOptions('MiniMax-Hailuo-2.3','768P','5','false')).toThrow('H3');
 expect(()=>assertHailuoRuntimeOptions('MiniMax-H3','1080p','5','false')).toThrow('分辨率');
 expect(()=>assertHailuoRuntimeOptions('MiniMax-H3','2K','3','false')).toThrow('时长');
 expect(()=>assertHailuoRuntimeOptions('MiniMax-H3','2K','5','true')).toThrow('不生成同步音频');
 expect(()=>assertHailuoRuntimeOptions('MiniMax-H3','2K','15','false')).not.toThrow();
});

test('the execution gate accepts the Hailuo contract only on a MiniMax channel',()=>{
 const model='minimax::MiniMax-H3';
 const capabilityConfig={version:1 as const,video:defaultModelCapabilityConfig('minimax-video').video!};
 const channel={id:'minimax',name:'fixture',enabled:true,apiFormat:'openai' as const,baseUrl:'/api',apiKey:'fixture',models:['MiniMax-H3'],modelCosts:[{model:'MiniMax-H3',capability:'video' as const,protocol:'minimax-video' as const,capabilityConfig}]};
 const options=configurableLtvOperation('video','mixed2video',{model:'MiniMax-Hailuo-H3',ratio:'21:9',resolution:'768P',duration:8},{image:4,video:1,audio:2},1)!;
 expect(options.ltvExecutionContract).toBe('minimax-video');
 const config={...defaultConfig,model,size:'21:9',vquality:'768P',videoSeconds:'8',videoGenerateAudio:'false',count:'1',channels:[channel]} as unknown as AiConfig;
 const node:CanvasNodeData={id:'n',type:CanvasNodeType.Video,title:'MiniMax H3',position:{x:0,y:0},metadata:{...options,model,generationMode:'video',prompt:'a saved H3 request',ltvReferencePlan:{prompt:'a saved H3 request',references:[]}}};
 expect(()=>assertCanvasGenerationRequirements(config,node,'video','a saved H3 request')).not.toThrow();
 // A channel that does not expose the MiniMax protocol cannot carry the case.
 config.channels[0].modelCosts![0].protocol='openai-videos' as never;
 expect(()=>assertCanvasGenerationRequirements(config,node,'video','a saved H3 request')).toThrow('协议');
});

test('Hailuo source version survives mapping and gates the selected runtime model',()=>{
 for(const [sourceModel,apiModel] of [['MiniMax-Hailuo-H3','MiniMax-H3'],['MiniMax-Hailuo-H3-Max','MiniMax-H3-Max']]){
  const options=mapLtvHailuoOptions({model:sourceModel,modeType:'singleImage2video',ratio:'adaptive',resolution:'768P',duration:6},{image:1,video:0,audio:0},1)!;
  expect(options.ltvHailuoModel).toBe(sourceModel);
  expect(()=>assertHailuoRuntimeOptions(apiModel,'768P','6','false',options.ltvHailuoModel)).not.toThrow();
  expect(()=>assertHailuoRuntimeOptions('MiniMax-Hailuo-2.3','768P','6','false',options.ltvHailuoModel)).toThrow('版本');
  expect(()=>assertHailuoRuntimeOptions(apiModel,'768P','4','false',options.ltvHailuoModel)).toThrow('时长');
  expect(()=>assertHailuoRuntimeOptions(apiModel,'1080P','6','false',options.ltvHailuoModel)).toThrow('分辨率');
 }
 expect(()=>assertHailuoRuntimeOptions('MiniMax-Hailuo-2.3-Fast','768P','6','false','MiniMax-Hailuo-2.3')).toThrow('版本');
 expect(()=>assertHailuoRuntimeOptions('MiniMax-H3','2K','6','false','MiniMax-Hailuo-H3')).not.toThrow();
 expect(()=>assertHailuoRuntimeOptions('MiniMax-H3','768P','6','false','MiniMax-Hailuo-H3-Max')).toThrow('版本');
});

test('legacy versions use V1 only for their documented durations and never use V2',()=>{
 for(const model of ['MiniMax-Hailuo-2.3','MiniMax-Hailuo-2.3-Fast','MiniMax-Hailuo-o2']){
  for(const duration of [5,8,15]) expect(mapLtvHailuoOptions({model,modeType:'singleImage2video',ratio:'auto',resolution:'768P',duration},{image:1,video:0,audio:0},1)).toBeUndefined();
  for(const duration of [6,10]) {
   const options=mapLtvHailuoOptions({model,modeType:'singleImage2video',ratio:'auto',resolution:'768P',duration},{image:1,video:0,audio:0},1);
   if(model==='MiniMax-Hailuo-o2')expect(options).toMatchObject({ltvExecutionContract:'minimax-hailuo02-video'});
   else expect(options).toMatchObject({ltvExecutionContract:'minimax-video-v1',seconds:String(duration)});
  }
 }
});

test('canvas generation refuses legacy source metadata on the native V2 channel',()=>{
 const sourceModel='MiniMax-Hailuo-2.3';
 // Previously saved projects retain the original model marker and cannot bypass the new gate.
 const options:Partial<CanvasNodeMetadata>={size:'adaptive',seconds:'6',vquality:'768P',generateAudio:'false',count:1,videoEditOperation:'image_to_video',ltvExecutionContract:'minimax-video',ltvHailuoModel:sourceModel,strictGenerationOptions:['model','size','seconds','vquality','generateAudio','count']};
 const capabilityConfig={version:1 as const,video:defaultModelCapabilityConfig('minimax-video').video!};
 const channel={id:'minimax',name:'fixture',enabled:true,apiFormat:'openai' as const,baseUrl:'/api',apiKey:'fixture',models:[sourceModel],modelCosts:[{model:sourceModel,capability:'video' as const,protocol:'minimax-video' as const,capabilityConfig}]};
 const model='minimax::'+sourceModel;
 const config={...defaultConfig,model,size:'adaptive',vquality:'768P',videoSeconds:'6',videoGenerateAudio:'false',count:'1',channels:[channel]} as unknown as AiConfig;
 const node:CanvasNodeData={id:'n',type:CanvasNodeType.Video,title:'Hailuo 2.3',position:{x:0,y:0},metadata:{...options,model,generationMode:'video',prompt:'原提示词',ltvReferencePlan:{prompt:'原提示词',references:[]}}};
 expect(()=>assertCanvasGenerationRequirements(config,node,'video','原提示词')).toThrow('V2');
 node.metadata!.ltvHailuoModel='MiniMax-Hailuo-H3';
 expect(()=>assertCanvasGenerationRequirements(config,node,'video','原提示词')).toThrow('版本');
});

test('legacy supported modes use V1 while unverified modes and camera fields stay gaps',()=>{
 expect(mapLtvHailuoOptions({model:'MiniMax-Hailuo-2.3',modeType:'singleImage2video',ratio:'auto',resolution:'768P',duration:6}, {image:1,video:0,audio:0}, 1)).toMatchObject({ltvExecutionContract:'minimax-video-v1'});
 expect(mapLtvHailuoOptions({model:'MiniMax-Hailuo-2.3-Fast',modeType:'singleImage2video',ratio:'auto',resolution:'768P',duration:10}, {image:1,video:0,audio:0}, 1)).toMatchObject({ltvExecutionContract:'minimax-video-v1'});
 expect(mapLtvHailuoOptions({model:'MiniMax-Hailuo-o2',modeType:'frames2video',ratio:'auto',resolution:'768P',duration:6}, {image:2,video:0,audio:0}, 1)).toMatchObject({ltvExecutionContract:'minimax-hailuo02-video'});
 expect(mapLtvHailuoOptions({model:'MiniMax-Hailuo-2.3',modeType:'singleImage2video',ratio:'auto',resolution:'1080P',duration:6}, {image:1,video:0,audio:0}, 1)).toMatchObject({ltvExecutionContract:'minimax-video-v1'});
 expect(mapLtvHailuoOptions({model:'MiniMax-Hailuo-o2',modeType:'singleImage2video',ratio:'auto',resolution:'512P',duration:6}, {image:1,video:0,audio:0}, 1)).toMatchObject({ltvExecutionContract:'minimax-hailuo02-video'});
 expect(mapLtvHailuoOptions({model:'MiniMax-Hailuo-2.3',modeType:'singleImage2video',ratio:'auto',resolution:'768P',duration:6,cameraMovement:'[Zoom in]'}, {image:1,video:0,audio:0}, 1)).toBeUndefined();
 expect(mapLtvHailuoOptions({model:'MiniMax-Hailuo-2.3',modeType:'singleImage2video',ratio:'auto',resolution:'768P',duration:6,cameraMovement:''}, {image:1,video:0,audio:0}, 1)).toMatchObject({ltvExecutionContract:'minimax-video-v1'});
 // An H3 node never declares `auto`, so a stale auto ratio is not a declared value for that model.
 expect(mapLtvHailuoOptions({model:'MiniMax-Hailuo-H3',modeType:'mixed2video',ratio:'auto',resolution:'768P',duration:6}, {image:1,video:0,audio:0}, 1)).toBeUndefined();
 // Modes outside the model's own schema can never be guessed into another operation.
 expect(mapLtvHailuoOptions({model:'MiniMax-Hailuo-2.3-Fast',modeType:'text2video',ratio:'auto',resolution:'768P',duration:6}, {image:0,video:0,audio:0}, 1)).toBeUndefined();
 expect(mapLtvHailuoOptions({model:'MiniMax-Hailuo-2.3',modeType:'singleImage2video',ratio:'auto',resolution:'768P',duration:6}, {image:3,video:0,audio:0}, 1)).toBeUndefined();
});
