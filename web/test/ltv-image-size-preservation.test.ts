import { expect, test } from 'bun:test';
import { adaptLtvNativeProject } from '../src/lib/canvas/ltv-native-project';
import { assertCanvasGenerationRequirements } from '../src/lib/canvas/canvas-project-generation';
import { defaultConfig, type AiConfig } from '../src/stores/use-config-store';
import { defaultModelCapabilityConfig } from '../src/lib/model-capabilities';

function adapt(allowCustom: boolean, values = ['2752x1536']) {
    return adaptLtvNativeProject({nodes:[{id:'image',type:'image',position:{x:0,y:0},data:{action:'image_generate',params:{
        model:'lib-image-2',modeType:'text2image',prompt:'保持原构图',count:1,settings:{ratio:'16:9',resolution:'2K',quality:'medium'},
    }}}],edges:[]},{channels:[{id:'image-channel',models:[{modelKey:'image-model',available:true,capability:'image',protocol:'openai-image',
        capabilityConfig:{image:{maxOutputs:15,references:{maxImages:16,promptMaxChars:32000},size:{parameter:'size',values,allowCustom},quality:{values:['medium','high','auto']}}},
    }]}]},'case','尺寸保留');
}

test('自定义尺寸能力保留2K和16:9，不选择近似比例的预设',()=>{
    const result=adapt(true);
    expect(result.project.nodes[0].metadata?.size).toBe('2816x1584');
    expect(result.project.nodes[0].metadata?.model).toBe('image-channel::image-model');
    expect(result.project.nodes[0].metadata?.quality).toBe('medium');
    expect(result.project.nodes[0].metadata?.ltvExecutionContract).toBe('openai-image');
});
test('只有近似尺寸且不允许自定义时保留原尺寸等待配置',()=>{
    const result=adapt(false);
    expect(result.project.nodes[0].metadata?.size).toBe('2816x1584');
    expect(result.project.nodes[0].metadata?.model).toBe('');
    expect(result.issues.some(issue=>issue.code==='channel-configuration-required')).toBe(true);
});
test('声明精确尺寸的模型仍可直接匹配',()=>{
    const result=adapt(false,['2816x1584']);
    expect(result.project.nodes[0].metadata?.size).toBe('2816x1584');
    expect(result.project.nodes[0].metadata?.model).toBe('image-channel::image-model');
});

test('已绑定图片节点保留协议检查，不能换为另一协议悄悄提交',()=>{
    const node=adapt(true).project.nodes[0];
    const capabilityConfig=defaultModelCapabilityConfig();
    capabilityConfig.image!.references.maxImages=16;
    capabilityConfig.image!.references.promptMaxChars=32000;
    capabilityConfig.image!.size={parameter:'size',values:['2816x1584'],default:'2816x1584',allowCustom:true};
    capabilityConfig.image!.quality={supported:true,values:['medium'],default:'medium'};
    const config={...defaultConfig,model:'image-channel::image-model',channels:[{id:'image-channel',name:'fixture',baseUrl:'https://example.test',apiKey:'fixture',enabled:true,
        models:['image-model'],modelCosts:[{model:'image-model',capability:'image',protocol:'gemini-image',capabilityConfig}]}]} as AiConfig;
    // Match the retained scalar options so the rejection must come from protocol enforcement.
    config.size=String(node.metadata!.size);
    config.quality=String(node.metadata!.quality);
    config.count=1;
    expect(()=>assertCanvasGenerationRequirements(config,node,'image')).toThrow('当前模型的协议不能完整承接此案例操作');
    config.channels[0].modelCosts![0].protocol='openai-image';
    expect(()=>assertCanvasGenerationRequirements(config,node,'image')).not.toThrow();
});
