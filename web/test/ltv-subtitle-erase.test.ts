import {expect,test} from 'bun:test';
import {configurableLtvOperation} from '../src/lib/canvas/ltv-configurable-operation';
import {adaptLtvNativeProject} from '../src/lib/canvas/ltv-native-project';
import {assertSubtitleErase,assertSubtitleEraseMedia,mapLtvSubtitleErase,subtitleEraseTaskMetadata,VOLCANO_SUBTITLE_ERASE} from '../src/lib/canvas/ltv-subtitle-erase';
import {defaultConfig,type AiConfig} from '../src/stores/use-config-store';

test('original subtitle and text erasure modes remain distinct single-video operations',()=>{
 for(const mode of ['Subtitle','Text']){
  const fields={model:'volcano-subtitle-eraser',mode};
  expect(configurableLtvOperation('video','',fields,{image:0,video:1,audio:0},1)).toMatchObject({ltvExecutionContract:'volcengine-mediakit-subtitle-erase',videoSubtitleErase:{mode},count:1});
  for(const changed of [{mode:'all'},{prompt:'replace actor'},{model_version:'v5'},{erase_ratio_location:[]},{resolution:'720p'}])expect(configurableLtvOperation('video','',{...fields,...changed},{image:0,video:1,audio:0},1)).toBeUndefined();
  expect(configurableLtvOperation('video','',fields,{image:0,video:2,audio:0},1)).toBeUndefined();
  expect(configurableLtvOperation('video','',fields,{image:0,video:1,audio:0},2)).toBeUndefined();
 }
});

test('erasure rejects wrong endpoint, protocol, absent mode and unknown media specifications',()=>{
 const metadata={ltvExecutionContract:VOLCANO_SUBTITLE_ERASE,videoSubtitleErase:{mode:'Text'}} as const;
 const config={...defaultConfig,model:'erase::erase-video-subtitle-pro',count:'1',channels:[{id:'erase',name:'fixture',enabled:true,baseUrl:'/api',apiKey:'fixture',apiFormat:'openai',models:['erase-video-subtitle-pro'],modelCosts:[{model:'erase-video-subtitle-pro',capability:'video',protocol:VOLCANO_SUBTITLE_ERASE}]}]} as AiConfig;
 const counts={image:0,video:1,audio:0};
 expect(()=>assertSubtitleErase(metadata,config,counts,'')).not.toThrow();
 expect(()=>assertSubtitleErase(metadata,{...config,model:'erase::erase-video-subtitle'},counts,'')).toThrow();
 const wrong=structuredClone(config);wrong.channels[0].modelCosts![0].protocol='volcengine-mediakit-video-enhance';
 expect(()=>assertSubtitleErase(metadata,wrong,counts,'')).toThrow();
 expect(()=>assertSubtitleErase({...metadata,videoSubtitleErase:undefined},config,counts,'')).toThrow();
 expect(()=>subtitleEraseTaskMetadata({...metadata,videoSubtitleErase:undefined})).toThrow();
 const video={id:'original',name:'original',type:'video/mp4',url:'https://example.com/original.mp4',width:2048,height:1080,durationMs:3000};
 expect(()=>assertSubtitleEraseMedia([video])).not.toThrow();
 for(const changed of [{width:undefined},{height:undefined},{width:0},{height:NaN},{width:2049},{durationMs:2999},{durationMs:undefined},{durationMs:Infinity}])expect(()=>assertSubtitleEraseMedia([{...video,...changed}])).toThrow();
});

test('subtitle erasure import preserves its original video and source mode without a generation substitute',()=>{
 const source={nodes:[{id:'original',type:'video',position:{x:0,y:0},data:{action:'video_resource',url:['https://example.com/original.mp4']}},{id:'erase',type:'video',position:{x:300,y:0},data:{action:'video_generate',generatorType:'subtitle_erase',params:{model:'volcano-subtitle-eraser',mode:'Text',videoList:[{nodeId:'original',url:'https://example.com/original.mp4',durationSec:30.08}]}}}],edges:[{source:'original',target:'erase'}]};
 const before=structuredClone(source),result=adaptLtvNativeProject(source,{channels:[]},'erase','Erase');
 expect(result.issues.filter(i=>i.code!=='channel-configuration-required')).toEqual([]);
 expect(result.adoptable).toBe(true);
 expect(result.project.nodes.find(n=>n.id==='erase')?.metadata).toMatchObject({model:'',ltvExecutionContract:'volcengine-mediakit-subtitle-erase',videoSubtitleErase:{mode:'Text'},ltvReferencePlan:{references:[{nodeId:'original',durationSec:30.08}]}});
 expect(source).toEqual(before);
});

test('original erase rectangles retain exact coordinates and reject invalid or expanded selections',()=>{
 const rect={top_left_x:0.165735,top_left_y:0.86736,bottom_right_x:0.784559,bottom_right_y:0.983955};
 const counts={image:0,video:1,audio:0};
 for(const mode of ['Text','Subtitle']){
  const fields={model:'volcano-subtitle-eraser',mode,erase_ratio_location:[rect]};
  const mapped=mapLtvSubtitleErase(fields,counts,1);
  expect(mapped?.videoSubtitleErase).toEqual({mode,eraseRatioLocation:[rect]});
  expect(subtitleEraseTaskMetadata(mapped)).toEqual({providerOptions:{[VOLCANO_SUBTITLE_ERASE]:{mode,erase_ratio_location:[rect]}}});
  expect(mapped?.videoSubtitleErase?.eraseRatioLocation?.[0]).not.toBe(rect);
 }
 for(const boxes of [[],null,{},[null],[{...rect,top_left_x:-.1}],[{...rect,bottom_right_y:1.01}],[{...rect,top_left_x:.9}],[{...rect,top_left_y:rect.bottom_right_y}],[{...rect,top_left_x:'0.1'}],[{...rect,bottom_right_x:NaN}],[{...rect,extra:1}],Array(21).fill(rect)]){
  expect(mapLtvSubtitleErase({model:'volcano-subtitle-eraser',mode:'Text',erase_ratio_location:boxes},counts,1)).toBeUndefined();
 }
 expect(mapLtvSubtitleErase({model:'volcano-subtitle-eraser',mode:'Text',erase_ratio_location:Array(20).fill(rect)},counts,1)?.videoSubtitleErase?.eraseRatioLocation).toHaveLength(20);
});
