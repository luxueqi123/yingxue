import type {CanvasNodeMetadata} from '../../types/canvas';
import type {ReferenceVideo} from '../../types/media';
import {modelOptionName,resolveModelChannel,type AiConfig} from '../../stores/use-config-store';

export const VOLCANO_SUBTITLE_ERASE = 'volcengine-mediakit-subtitle-erase';
const modes = ['Subtitle','Text'];
const unsupported = ['model_version','output_encode_mode','time_segment_filter','subtitle_filter','resolution','duration','ratio','fps','quality'];
type Region = NonNullable<NonNullable<CanvasNodeMetadata['videoSubtitleErase']>['eraseRatioLocation']>[number];
const coordinates = ['top_left_x','top_left_y','bottom_right_x','bottom_right_y'] as const;

function originalRegions(value:unknown):Region[]|undefined {
    if(!Array.isArray(value)||value.length<1||value.length>20)return;
    const regions:Region[]=[];
    for(const box of value){
        if(!box||typeof box!=='object'||Array.isArray(box)||Object.keys(box).length!==4||coordinates.some(key=>typeof box[key]!=='number'||!Number.isFinite(box[key])||box[key]<0||box[key]>1))return;
        if(box.top_left_x>=box.bottom_right_x||box.top_left_y>=box.bottom_right_y)return;
        regions.push({top_left_x:box.top_left_x,top_left_y:box.top_left_y,bottom_right_x:box.bottom_right_x,bottom_right_y:box.bottom_right_y});
    }
    return regions;
}

export function mapLtvSubtitleErase(fields:Record<string,unknown>,counts:{image:number;video:number;audio:number},count:number):Partial<CanvasNodeMetadata>|undefined {
    if(fields.model!=='volcano-subtitle-eraser'||count!==1||counts.image||counts.audio||counts.video!==1)return;
    if(!modes.includes(String(fields.mode))||String(fields.prompt??'').trim()||unsupported.some(k=>fields[k]!==undefined))return;
    const regions=fields.erase_ratio_location===undefined?undefined:originalRegions(fields.erase_ratio_location);
    if(fields.erase_ratio_location!==undefined&&!regions)return;
    return {ltvExecutionContract:VOLCANO_SUBTITLE_ERASE,videoSubtitleErase:{mode:fields.mode as 'Subtitle'|'Text',...(regions?{eraseRatioLocation:regions}:{})},count:1,strictGenerationOptions:['model','count']};
}

export function assertSubtitleErase(metadata:CanvasNodeMetadata,config:AiConfig,counts:{image:number;video:number;audio:number},prompt:string) {
    const model=modelOptionName(config.model),channel=resolveModelChannel(config,config.model);
    const protocol=channel.modelCosts?.find(m=>m.model===model)?.protocol||channel.interfaceType;
    if(model!=='erase-video-subtitle-pro'||protocol!==VOLCANO_SUBTITLE_ERASE)throw new Error('字幕擦除需要火山精细化擦除协议，不能替换为标准版或生成模型。');
    if(!mapLtvSubtitleErase({model:'volcano-subtitle-eraser',mode:metadata.videoSubtitleErase?.mode,erase_ratio_location:metadata.videoSubtitleErase?.eraseRatioLocation,prompt},counts,Number(config.count)))throw new Error('字幕擦除需要原模式、有效原框选及一段原视频，不能忽略正文或其他参考。');
}

export function assertSubtitleEraseMedia(videos:ReferenceVideo[]) {
    const video=videos[0];
    if(videos.length!==1||!video||!Number.isFinite(video.durationMs)||Number(video.durationMs)<3000||!Number.isFinite(video.width)||!Number.isFinite(video.height)||Number(video.width)<=0||Number(video.height)<=0||Math.max(Number(video.width),Number(video.height))>2048)throw new Error('字幕擦除需要已确认尺寸不超过2048、时长至少3秒的原视频。');
}

export function subtitleEraseTaskMetadata(metadata:CanvasNodeMetadata|undefined) {
    if(metadata?.ltvExecutionContract!==VOLCANO_SUBTITLE_ERASE)return {};
    if(!modes.includes(String(metadata.videoSubtitleErase?.mode)))throw new Error('字幕擦除原模式缺失，不能使用默认模式代替。');
    const original=metadata.videoSubtitleErase!.eraseRatioLocation;
    const regions=original===undefined?undefined:originalRegions(original);
    if(original!==undefined&&!regions)throw new Error('字幕擦除原框选无效，不能丢弃或扩大区域。');
    return {providerOptions:{[VOLCANO_SUBTITLE_ERASE]:{mode:metadata.videoSubtitleErase!.mode,...(regions?{erase_ratio_location:regions}:{})}}};
}
