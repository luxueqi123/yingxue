import {test, expect} from 'bun:test';
import {createSeedanceTask} from '../src/services/api/video-provider-seedance';
import {defaultConfig} from '../src/stores/use-config-store';
import {videoResponseTools} from '../src/services/api/video-response';
import type {VideoProviderDeps} from '../src/services/api/video-provider-deps';

test('Ark direct request preserves 30 ordered references, search and overflow rejection',async()=>{
 const model='doubao-seedance-2-5-260628';
 const config={...defaultConfig,interfaceType:'volcengine-ark-video',baseUrl:'https://example.test/api/v3',videoSeconds:'10',vquality:'720p'};
 let body:any, requests=0;
 const deps={transport:{post:async(_url:string,value:any)=>{body=value;requests++;return {id:'local-only'};}},response:videoResponseTools} as unknown as VideoProviderDeps;
 const images=Array.from({length:30},(_,i)=>({id:String(i),name:`${i}.png`,type:'image/png',dataUrl:'',url:`https://example.test/${i}.png`}));
 await createSeedanceTask(deps,config as never,model,'story',images,[],[],{videoWebSearch:true,videoEditOperation:'reference_to_video'});
 expect(body.content).toHaveLength(31);
 expect(body.content.slice(1).map((x:any)=>x.image_url.url)).toEqual(images.map(x=>x.url));
 expect(body.tools).toEqual([{type:'web_search'}]);
 await expect(createSeedanceTask(deps,config as never,model,'story',[...images,images[0]],[],[])).rejects.toThrow('30');
 expect(requests).toBe(1);
 await expect(createSeedanceTask(deps,config as never,'doubao-seedance-2-0-260128','story',images,[],[])).rejects.toThrow('9');
 expect(requests).toBe(1);
 await createSeedanceTask(deps,config as never,model,'story',[],[],[{id:'a',name:'a.mp3',type:'audio/mpeg',url:'https://example.test/a.mp3',durationMs:25000}],{videoWebSearch:false});
 expect(body.tools).toBeUndefined();
 expect(body.content[1].role).toBe('reference_audio');
 await expect(createSeedanceTask(deps,config as never,'doubao-seedance-1-5-pro','story',[],[],[],{videoWebSearch:true})).rejects.toThrow('联网');
 expect(requests).toBe(2);
});
