import {expect,test} from 'bun:test';
import {configurableLtvOperation} from '../src/lib/canvas/ltv-configurable-operation';
import {assertCanvasGenerationRequirements} from '../src/lib/canvas/canvas-project-generation';
import {defaultConfig} from '../src/stores/use-config-store';
import {CanvasNodeType,type CanvasNodeData} from '../src/types/canvas';

const fields={model:'viduq2-pro',modeType:'singleImage2video',ratio:'auto',resolution:'1080p',duration:4,prompt:'原始镜头'};
const one={image:1,video:0,audio:0};
test('Vidu Q2 Pro maps single and paired frames to the native ent-v2 contract',()=>{
 expect(configurableLtvOperation('video','singleImage2video',fields,one,1)).toMatchObject({ltvExecutionContract:'vidu-q2-pro-video',seconds:'4',vquality:'1080p',size:'auto',generateAudio:'false'});
 expect(configurableLtvOperation('video','frames2video',{...fields,modeType:'frames2video',duration:8},{...one,image:2},1)).toMatchObject({ltvExecutionContract:'vidu-q2-pro-video',seconds:'8'});
});

test('old Vidu provenance cannot be retried using a generic substitute contract',()=>{
 const node:CanvasNodeData={id:'n',type:CanvasNodeType.Video,title:'source',position:{x:0,y:0},metadata:{generationModelProvenance:{sourceModel:'viduq2-pro',sourceOperation:'singleImage2video'} as any,ltvExecutionContract:'artdance25'}};
 expect(()=>assertCanvasGenerationRequirements(defaultConfig,node,'video','原始镜头')).toThrow('原Vidu');
});
test('Vidu Q2 does not silently replace version, style, sound, reference mode or frame count',()=>{
 for(const change of [{model:'viduq3-pro'},{model:'viduq2'},{style:'general'},{bgm:1},{enableSound:'on'},{duration:11},{ratio:'16:9'},{seed:7}])expect(configurableLtvOperation('video','singleImage2video',{...fields,...change},one,1)).toBeUndefined();
 expect(configurableLtvOperation('video','singleImage2video',fields,{...one,image:2},1)).toBeUndefined();
 expect(configurableLtvOperation('video','frames2video',{...fields,duration:9},{...one,image:2},1)).toBeUndefined();
});
