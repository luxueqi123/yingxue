import {expect, test} from 'bun:test';
import {defaultConfig} from '../src/stores/use-config-store';
import {modelCompatibilityError} from '../src/lib/model-selection';

test('增强模型接受原片且不受普通生成时长约束，拒绝额外制作输入',()=>{
 const config:any={...defaultConfig,channels:[{id:'topaz',models:['prob-4','apo-8'],interfaceType:'topaz-video-enhance',modelCosts:[]}]};
 const requirements:any={capability:'video',videoSeconds:'5',input:{textCount:0,imageCount:0,videoCount:1,audioCount:0,characterCount:0}};
 for(const model of ['prob-4','apo-8']) expect(modelCompatibilityError(config,'topaz::'+model,requirements)).toBe('');
 for(const patch of [{videoCount:0},{videoCount:2},{textCount:1},{imageCount:1},{audioCount:1},{characterCount:1}]) expect(modelCompatibilityError(config,'topaz::apo-8',{...requirements,input:{...requirements.input,...patch}})).not.toBe('');
 expect(modelCompatibilityError(config,'topaz::apo-8',{...requirements,videoOperation:'extend'})).not.toBe('');
});
