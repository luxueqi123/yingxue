import type {CanvasNodeMetadata} from '../../types/canvas';
import {modelOptionName,resolveModelChannel,type AiConfig} from '../../stores/use-config-store';

export const VOLCANO_VIDEO_ENHANCE = 'volcengine-mediakit-video-enhance';
const resolutions = ['720p','1080p','2k','4k'];

export function mapLtvVolcanoVideoEnhance(fields:Record<string,any>,counts:{image:number;video:number;audio:number},count:number):Partial<CanvasNodeMetadata>|undefined {
    if(fields.model!=='volcano-video-upscaler'||count!==1||counts.image||counts.audio||counts.video!==1)return;
    if(!resolutions.includes(fields.resolution)||!Number.isInteger(fields.fps)||fields.fps<1||fields.fps>120)return;
    if(['tool_version','scene','enhance_style','bitrate','bitrate_level','resolution_limit'].some(k=>fields[k]!==undefined))return;
    if(String(fields.prompt??'').trim())return;
    return {ltvExecutionContract:VOLCANO_VIDEO_ENHANCE,videoUpscale:{resolution:fields.resolution,fps:fields.fps},count:1,strictGenerationOptions:['model','count']};
}

export function assertVolcanoVideoEnhance(metadata:CanvasNodeMetadata,config:AiConfig,context:{referenceImages:unknown[];referenceVideos:unknown[];referenceAudios:unknown[]},prompt:string){
    const s=metadata.videoUpscale;
    if(!s||!resolutions.includes(s.resolution)||!Number.isInteger(s.fps)||s.fps<1||s.fps>120)throw new Error('火山超分需要明确原分辨率和1至120整数帧率。');
    const model=modelOptionName(config.model),channel=resolveModelChannel(config,config.model);
    const protocol=channel.modelCosts?.find(m=>m.model===model)?.protocol||channel.interfaceType;
    if(model!=='enhance-video'||protocol!==VOLCANO_VIDEO_ENHANCE||Number(config.count)!==1)throw new Error('此步骤需要火山MediaKit画质增强协议，不能替换普通生成模型。');
    if(context.referenceImages.length||context.referenceAudios.length||context.referenceVideos.length!==1||prompt.trim())throw new Error('火山超分只处理一段原视频，不接受创作文本或额外参考。');
}

export function volcanoVideoEnhanceTaskMetadata(metadata:CanvasNodeMetadata|undefined){
    if(metadata?.ltvExecutionContract!==VOLCANO_VIDEO_ENHANCE||!metadata.videoUpscale)return {};
    return {providerOptions:{[VOLCANO_VIDEO_ENHANCE]:{...metadata.videoUpscale}}};
}
