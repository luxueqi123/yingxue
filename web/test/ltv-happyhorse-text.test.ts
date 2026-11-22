import {expect,test} from 'bun:test';
import {configurableLtvOperation} from '../src/lib/canvas/ltv-configurable-operation';

const fields={model:'happy-horse-1.1',modeType:'text2video',prompt:'一只黏土小熊走过纸板城市',ratio:'16:9',resolution:'720P',duration:6};
const none={image:0,video:0,audio:0};

test('HappyHorse 1.1 pure text keeps its model, ratio and saved duration',()=>{
 expect(configurableLtvOperation('video','text2video',fields,none,1)).toMatchObject({ltvExecutionContract:'happyhorse-text-video',ltvHappyHorseModel:'happy-horse-1.1',seconds:'6',size:'16:9',vquality:'720P',videoEditOperation:'text_to_video'});
});

test('text mode cannot discard an unresolved image mention or actual media',()=>{
 expect(configurableLtvOperation('video','text2video',{...fields,prompt:'参考图引用：@图片16（符纸墙）'},none,1)).toBeUndefined();
 expect(configurableLtvOperation('video','text2video',fields,{...none,image:1},1)).toBeUndefined();
 for(const change of [{duration:2},{duration:6.5},{enableSound:'on'},{model:'happy-horse-1'},{prompt:''},{prompt:'文'.repeat(2501)}])expect(configurableLtvOperation('video','text2video',{...fields,...change},none,1)).toBeUndefined();
});
