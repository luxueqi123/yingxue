import type {CanvasNodeMetadata} from '../../types/canvas';
import {readLtvSwitch} from './ltv-parameter-layers';
import {normalizeVideoResolution} from '../video-generation-options';

export const VIDU_Q2_PRO = 'vidu-q2-pro-video';
type Counts = {image:number;video:number;audio:number};

export function mapLtvViduQ2(fields:Record<string,unknown>,counts:Counts,count:number):Partial<CanvasNodeMetadata>|undefined {
    if(fields.model!=='viduq2-pro'||count!==1||counts.video||counts.audio)return;
    const frames=fields.modeType==='frames2video';
    if((!frames&&fields.modeType!=='singleImage2video')||counts.image!==(frames?2:1))return;
    const seconds=Number(fields.duration),resolution=String(fields.resolution||'1080p').toLowerCase();
    if(fields.ratio!=='auto'||!Number.isInteger(seconds)||seconds<1||seconds>8||!['720p','1080p'].includes(resolution))return;
    if(['style','seed','quality','cameraMovement','voice_id','audio_type','movement_amplitude'].some(k=>fields[k]!=null&&fields[k]!==''))return;
    try {if([fields.bgm,fields.enableSound,fields.is_rec,fields.off_peak].some(v=>readLtvSwitch(v)))return;}catch{return;}
    return {ltvExecutionContract:VIDU_Q2_PRO,ltvViduModel:'viduq2-pro',size:'auto',vquality:resolution,seconds:String(seconds),count:1,generateAudio:'false',videoEditOperation:'image_to_video',strictGenerationOptions:['model','size','vquality','seconds','count','generateAudio']};
}

export function assertViduQ2(model:string,resolution:string,seconds:string,ratio:string,sound:string,metadata:CanvasNodeMetadata,counts:Counts) {
    if(model!=='viduq2-pro'||metadata.ltvViduModel!=='viduq2-pro'||metadata.videoEditOperation!=='image_to_video'||!metadata.videoStartFrameNodeId
        ||(counts.image===2&&!metadata.videoEndFrameNodeId)||(counts.image===1&&metadata.videoEndFrameNodeId)
        ||!mapLtvViduQ2({model,modeType:counts.image===2?'frames2video':'singleImage2video',duration:seconds,resolution:`${normalizeVideoResolution(resolution)}p`,ratio,enableSound:sound},counts,metadata.count??1))throw new Error('Vidu Q2 Pro需要原版本、原始首尾帧及制作参数，不能换模型或丢图。');
}
