import {expect, test} from 'bun:test';
import {mapLtvHailuoOptions, assertHailuoRuntimeOptions} from '../src/lib/canvas/ltv-hailuo-options';

const fields = {model:'MiniMax-Hailuo-o2',modeType:'singleImage2video',ratio:'auto',resolution:'1080P',duration:6};
const one = {image:1,video:0,audio:0};

test('Hailuo 02 source identity maps to its own contract with both frame modes intact',()=>{
    expect(mapLtvHailuoOptions(fields,one,1)).toMatchObject({ltvExecutionContract:'minimax-hailuo02-video',ltvHailuoModel:'MiniMax-Hailuo-o2',seconds:'6',vquality:'1080P'});
    expect(mapLtvHailuoOptions({...fields,modeType:'frames2video'},{...one,image:2},1)).toMatchObject({ltvExecutionContract:'minimax-hailuo02-video'});
    expect(mapLtvHailuoOptions({...fields,resolution:'512P',duration:10},one,1)).toMatchObject({vquality:'512P',seconds:'10'});
});

test('Hailuo 02 keeps ambiguous two-image single-frame and unsupported settings blocked',()=>{
    expect(mapLtvHailuoOptions(fields,{...one,image:2},1)).toBeUndefined();
    for(const change of [{resolution:'1080P',duration:10},{resolution:'512P',modeType:'frames2video'},{duration:6.5},{enableSound:'on'},{cameraMovement:'pan'},{ratio:'16:9'},{multi_shot:true}]){
        expect(mapLtvHailuoOptions({...fields,...change},change.modeType?{...one,image:2}:one,1)).toBeUndefined();
    }
});

test('Hailuo 02 runtime requires the documented numeric-zero API model',()=>{
    expect(()=>assertHailuoRuntimeOptions('MiniMax-Hailuo-02','1080P','6','false','MiniMax-Hailuo-o2','minimax-hailuo02-video')).not.toThrow();
    for(const model of ['MiniMax-Hailuo-o2','MiniMax-Hailuo-2.3','MiniMax-H3']) expect(()=>assertHailuoRuntimeOptions(model,'1080P','6','false','MiniMax-Hailuo-o2','minimax-hailuo02-video')).toThrow();
});
