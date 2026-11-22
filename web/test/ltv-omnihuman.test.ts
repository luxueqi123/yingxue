import {test,expect} from 'bun:test';
import {configurableLtvOperation} from '../src/lib/canvas/ltv-configurable-operation';
import {adaptLtvNativeProject} from '../src/lib/canvas/ltv-native-project';

const fields={model:'omnihuman-1.5',modeType:'singleImage2video',ratio:'auto',resolution:'auto',fastMode:0,prompt:'唱歌，梦核',count:1};
test('OmniHuman keeps one original image/audio pair and explicit slow mode',()=>{
 expect(configurableLtvOperation('video','singleImage2video',fields,{image:1,audio:1,video:0},1)).toMatchObject({ltvExecutionContract:'volcengine-omnihuman-v15',omniHuman:{fastMode:false},vquality:'auto',size:'adaptive'});
 expect(configurableLtvOperation('video','singleImage2video',fields,{image:1,audio:1,video:0},1)?.seconds).toBeUndefined();
 for(const patch of [{model:'omnihuman-1.0'},{fastMode:undefined},{fastMode:'false'},{resolution:'4k'},{ratio:'16:9'},{duration:5},{mask_url:['https://example.com/mask.png']}]) expect(configurableLtvOperation('video','singleImage2video',{...fields,...patch},{image:1,audio:1,video:0},1)).toBeUndefined();
 for(const counts of [{image:0,audio:1,video:0},{image:2,audio:1,video:0},{image:1,audio:0,video:0},{image:1,audio:1,video:1}]) expect(configurableLtvOperation('video','singleImage2video',fields,counts,1)).toBeUndefined();
});

test('OmniHuman native import preserves exact source fields and does not substitute a general video model',()=>{
 const source={nodes:[
  {id:'image',type:'image',position:{x:0,y:0},data:{action:'image_resource',url:['https://example.com/person.png']}},
  {id:'audio',type:'audio',position:{x:0,y:300},data:{action:'audio_resource',url:['https://example.com/song.mp3']}},
  {id:'output',type:'video',position:{x:400,y:0},data:{action:'video_generate',generatorType:'default',params:{...fields,imageList:[{nodeId:'image',url:'https://example.com/person.png'}],audioList:[{nodeId:'audio',url:'https://example.com/song.mp3',durationSec:6.374}]}}}
 ],edges:[]};
 const before=structuredClone(source),result=adaptLtvNativeProject(source,{channels:[]},'omni','Omni');
 expect(source).toEqual(before);
 expect(result.adoptable).toBe(true);
 expect(result.project.nodes.find(n=>n.id==='output')?.metadata).toMatchObject({ltvExecutionContract:'volcengine-omnihuman-v15',omniHuman:{fastMode:false},vquality:'auto',model:''});
});
