import type {CanvasNodeMetadata} from '../../types/canvas';
import {modelOptionName,resolveModelChannel,type AiConfig} from '../../stores/use-config-store';

export const OMNIHUMAN_V15 = 'volcengine-omnihuman-v15';
type Counts = {image:number;video:number;audio:number};

export function mapLtvOmniHuman(fields:Record<string,unknown>,counts:Counts,count:number):Partial<CanvasNodeMetadata>|undefined {
    if(fields.model!=='omnihuman-1.5'||fields.modeType!=='singleImage2video'||count!==1||counts.image!==1||counts.audio!==1||counts.video)return;
    if(fields.ratio!=='auto'||fields.resolution!=='auto'||![0,1].includes(fields.fastMode as number))return;
    if(['duration','seed','mask_url','maskUrls','output_resolution','quality','enableSound'].some(k=>fields[k]!==undefined))return;
    return {ltvExecutionContract:OMNIHUMAN_V15,omniHuman:{fastMode:fields.fastMode===1},size:'adaptive',vquality:'auto',count:1,videoEditOperation:'image_to_video',strictGenerationOptions:['model','size','vquality','count']};
}

export function assertOmniHumanConfig(metadata:CanvasNodeMetadata,config:AiConfig,counts:Counts) {
    const model=modelOptionName(config.model),channel=resolveModelChannel(config,config.model);
    const protocol=channel.modelCosts?.find(m=>m.model===model)?.protocol||channel.interfaceType;
    if(metadata.ltvExecutionContract!==OMNIHUMAN_V15||typeof metadata.omniHuman?.fastMode!=='boolean'||model!=='omnihuman-1.5'||protocol!==OMNIHUMAN_V15)throw new Error('此节点需要OmniHuman 1.5原版本协议和明确快速模式，不能替换普通视频模型。');
    if(metadata.seconds!==undefined||config.size!=='adaptive'||config.vquality!=='auto'||config.videoSeconds!==''||Number(config.count)!==1)throw new Error('OmniHuman需保留原图画幅、自动分辨率和音频驱动时长。');
    if(counts.image!==1||counts.audio!==1||counts.video!==0)throw new Error('OmniHuman需恰好一张主体图和一段驱动音频。');
}

export function assertOmniHumanRuntime(metadata:CanvasNodeMetadata,config:AiConfig,context:{referenceImages:unknown[];referenceVideos:unknown[];referenceAudios:Array<{durationMs?:number}>}) {
    assertOmniHumanConfig(metadata,config,{image:context.referenceImages.length,video:context.referenceVideos.length,audio:context.referenceAudios.length});
    const duration=context.referenceAudios[0]?.durationMs;
    if(typeof duration!=='number'||!Number.isFinite(duration)||duration<=0||duration>=60000)throw new Error('OmniHuman驱动音频需验证有效时长且小于60秒。');
}

export function omniHumanTaskMetadata(metadata:CanvasNodeMetadata|undefined) {
    if(metadata?.ltvExecutionContract!==OMNIHUMAN_V15||!metadata.omniHuman)return {};
    return {providerOptions:{[OMNIHUMAN_V15]:{fastMode:metadata.omniHuman.fastMode}}};
}
