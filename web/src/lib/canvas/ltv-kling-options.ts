import type {CanvasNodeMetadata} from '../../types/canvas';
import {readLtvSwitch} from './ltv-parameter-layers';
import {normalizeVideoResolution} from '../video-generation-options';

/** Custom shots are a distinct request mode; never degrade them to intelligent shots. */
export function readKlingCustomShots(value:unknown, multiShot:boolean, duration:number):NonNullable<CanvasNodeMetadata['videoKling']>['multiPrompt'] {
    if(value===undefined||Array.isArray(value)&&value.length===0)return;
    if(!multiShot||!Array.isArray(value)||value.length>6)throw new Error('自定义分镜需开启多镜头，并提供1至6个镜头。');
    let total=0;
    const shots=value.map((item,index)=>{
        if(!item||typeof item!=='object'||Array.isArray(item)||Object.keys(item).some(key=>!['index','prompt','duration'].includes(key)))throw new Error('自定义分镜字段无效。');
        if(item.index!==index+1||typeof item.prompt!=='string'||!item.prompt.trim()||item.prompt.length>2500)throw new Error('自定义分镜需连续编号并填写不超过2500字符的镜头正文。');
        const seconds=Number(item.duration);
        if(!['string','number'].includes(typeof item.duration)||(typeof item.duration==='string'&&!/^(?:[1-9]|1[0-5])$/.test(item.duration))||!Number.isInteger(seconds)||seconds<1||seconds>15)throw new Error('每个镜头时长需为1至15秒的十进制整数。');
        total+=seconds;
        return {index:item.index,prompt:item.prompt,duration:String(seconds)};
    });
    if(total!==duration)throw new Error('自定义分镜时长之和必须等于视频总时长。');
    return shots;
}

export function mapLtvKlingOptions(fields:Record<string,any>, counts:{image:number;video:number;audio:number}, count:number):Partial<CanvasNodeMetadata>|undefined {
    if(fields.model==='kling-v2-6'){
        const quality=fields.quality??'high';
        if(fields.modeType!=='singleImage2video'||count!==1||counts.image!==1||counts.video||counts.audio||!['low','high'].includes(quality))return;
        if(!['5','10'].includes(String(fields.duration))||!['on','off'].includes(fields.enableSound)||quality==='low'&&fields.enableSound==='on')return;
        if(!['','auto','adaptive'].includes(String(fields.ratio??'').trim().toLowerCase())||fields.resolution!==undefined)return;
        if([fields.multi_shot,fields.search_enabled,fields.searchEnabled,fields.searchable].some(readLtvSwitch))return;
        if(fields.keep_original_sound!==undefined||[fields.multi_prompt,fields.subjects,fields.elementList,fields.voices].some(value=>value!==undefined&&value!==null&&(!Array.isArray(value)||value.length>0)))return;
        return {size:'adaptive',seconds:String(fields.duration),vquality:quality==='high'?'1080p':'720p',generateAudio:fields.enableSound==='on'?'true':'false',count:1,
            videoEditOperation:'image_to_video',videoKling:{mode:quality==='high'?'pro':'std',multiShot:false},
            ltvExecutionContract:'kling-v26-video',strictGenerationOptions:['model','size','seconds','vquality','generateAudio','count']};
    }
    if(fields.model==='kling-v3-turbo'){
        const resolution=String(fields.resolution??'720p').toLowerCase();
        const tier=({std:'720p',pro:'1080p','720p':'720p','1080p':'1080p'} as Record<string,string>)[resolution];
        if(fields.modeType!=='singleImage2video'||count!==1||counts.image!==1||counts.video||counts.audio||!tier)return;
        if(!Number.isInteger(Number(fields.duration))||Number(fields.duration)<3||Number(fields.duration)>15)return;
        if(!['','auto','adaptive'].includes(String(fields.ratio??'').trim().toLowerCase())||!readLtvSwitch(fields.enableSound??'on'))return;
        if([fields.multi_shot,fields.search_enabled,fields.searchEnabled,fields.searchable].some(readLtvSwitch))return;
        if(fields.quality!==undefined||fields.keep_original_sound!==undefined||[fields.multi_prompt,fields.subjects,fields.elementList].some(value=>value!==undefined&&value!==null&&(!Array.isArray(value)||value.length>0)))return;
        return {size:'adaptive',seconds:String(fields.duration),vquality:tier,generateAudio:'true',count:1,
            videoEditOperation:'image_to_video',videoKling:{mode:tier==='1080p'?'pro':'std',multiShot:false},
            ltvExecutionContract:'kling-v3-turbo-video',strictGenerationOptions:['model','size','seconds','vquality','generateAudio','count']};
    }
    if(fields.model==='kling-video-o1'){
        const op=String(fields.modeType),quality=fields.quality??'low';
        const operations:Record<string,CanvasNodeMetadata['videoEditOperation']>={text2video:'text_to_video',singleImage2video:'image_to_video',frames2video:'image_to_video',mixed2video:'reference_to_video'};
        if(!operations[op]||count!==1||counts.video||counts.audio||!['5','10'].includes(String(fields.duration))||!['low','high'].includes(quality))return;
        if(op==='text2video'?counts.image!==0:op==='singleImage2video'?counts.image!==1:op==='frames2video'?counts.image<1||counts.image>2:counts.image<1||counts.image>7)return;
        if(!['','auto'].includes(String(fields.resolution??'').trim().toLowerCase()))return;
        if([fields.enableSound,fields.multi_shot,fields.search_enabled,fields.searchEnabled,fields.searchable].some(readLtvSwitch))return;
        if([fields.multi_prompt,fields.subjects,fields.elementList].some(value=>value!==undefined&&value!==null&&(!Array.isArray(value)||value.length>0)))return;
        if(fields.keep_original_sound!==undefined||/<<<|>>>|@/.test(String(fields.prompt??'')))return;
        const frame=op==='singleImage2video'||op==='frames2video';
        const ratio=String(fields.ratio??(frame?'adaptive':'16:9')).trim();
        if(!['16:9','9:16','1:1'].includes(ratio)&&!(frame&&['','auto','adaptive'].includes(ratio)))return;
        return {size:['','auto'].includes(ratio)?'adaptive':ratio,seconds:String(fields.duration),vquality:quality==='high'?'1080p':'720p',generateAudio:'false',count:1,
            videoEditOperation:operations[op],videoKling:{mode:quality==='high'?'pro':'std',multiShot:false},
            ltvExecutionContract:'kling-o1-video',strictGenerationOptions:['model','size','seconds','vquality','generateAudio','count']};
    }
    if(fields.model==='kling-v2-5-turbo-pro'){
        const op=String(fields.modeType),quality=fields.quality??'high';
        if(count!==1||counts.video||counts.audio||!['singleImage2video','frames2video'].includes(op)||counts.image!==(op==='frames2video'?2:1))return;
        if(!['low','high'].includes(quality)||!['5','10'].includes(String(fields.duration))||(op==='frames2video'&&quality!=='high'))return;
        if(!['','auto','adaptive'].includes(String(fields.ratio??'').trim().toLowerCase()))return;
        if([fields.enableSound,fields.multi_shot,fields.search_enabled,fields.searchEnabled,fields.searchable].some(readLtvSwitch))return;
        if([fields.multi_prompt,fields.subjects,fields.elementList].some(value=>value!==undefined&&value!==null&&(!Array.isArray(value)||value.length>0)))return;
        return {size:'adaptive',seconds:String(fields.duration),vquality:quality==='high'?'1080p':'720p',generateAudio:'false',count:1,
            videoEditOperation:'image_to_video',videoKling:{mode:quality==='high'?'pro':'std',multiShot:false},
            ltvExecutionContract:'kling-v25-video',strictGenerationOptions:['model','size','seconds','vquality','generateAudio','count']};
    }
    const ordinary=fields.model==='kling-video-o3';
    // Similar fields do not establish model identity for any unverified version.
    if((!ordinary&&fields.model!=='kling-v3-omni')||count!==1||counts.audio||counts.video>1||counts.image>(counts.video?4:7))return;
    if(ordinary&&(counts.video||counts.image>2||!['text2video','singleImage2video','frames2video'].includes(fields.modeType)))return;
    if([fields.search_enabled,fields.searchEnabled,fields.searchable].some(readLtvSwitch))return;
    const quality=String((fields.model==='kling-v3-omni'?fields.quality??'low':fields.quality)??'').toLowerCase();
    const mode=({low:'std',high:'pro','4k':'4k'} as const)[quality as 'low'|'high'|'4k'];
    if(!mode)return;
    const vquality=mode==='std'?'720p':mode==='pro'?'1080p':'4k';
    const op=String(fields.modeType), multiShot=readLtvSwitch(fields.multi_shot),sound=readLtvSwitch(fields.enableSound);
    const multiPrompt=readKlingCustomShots(fields.multi_prompt,multiShot,Number(fields.duration));
    const operations:Record<string,CanvasNodeMetadata['videoEditOperation']>={text2video:'text_to_video',singleImage2video:'image_to_video',frames2video:'image_to_video',image2video:'reference_to_video',mixed2video:'reference_to_video'};
    if(!operations[op]||!Number.isInteger(Number(fields.duration))||Number(fields.duration)<3||Number(fields.duration)>15)return;
    if(op==='text2video'&&(counts.image||counts.video))return;
    if(op==='singleImage2video'&&(counts.image!==1||counts.video))return;
    if(op==='frames2video'&&(counts.image<1||counts.image>2||counts.video))return;
    if((op==='image2video'||op==='mixed2video')&&!counts.image&&!counts.video)return;
    // The source must identify its original-sound choice; do not guess it from generated audio.
    if(counts.video&&(sound||!['yes','no'].includes(fields.keep_original_sound)))return;
    const hasFrame=op==='singleImage2video'||op==='frames2video';
    const ratio=String(fields.ratio||'').trim();
    // The source declares `ratio_auto` for exactly this case: enum [" ","16:9","1:1","9:16"] with
    // default " " and displayName 智能模式 (0wllgknwomk2u/00_主页完整HTML kling-v3-omni schema), i.e.
    // the author left the frame to the model. The omni protocol reproduces that by omitting
    // `aspect_ratio` unless the value is one of 16:9 / 9:16 / 1:1 (kling-omni-video manifest
    // create.body.aspect_ratio), which is what the host's `adaptive` size emits.
    const smartRatio=ratio===''||/^auto$/i.test(ratio);
    // Mirrors the host validation "未提供首帧或待编辑视频时必须指定支持的画幅": a ratio is only
    // optional when a first frame or a base video input lets the upstream derive it. Everything
    // else must name one of the supported ratios or the declared smart mode, so an unadapted value
    // stays reported instead of turning into a project the protocol would reject at execution time.
    if(!['16:9','9:16','1:1'].includes(ratio)&&!hasFrame&&!smartRatio)return;
    return {size:smartRatio?'adaptive':ratio,seconds:String(fields.duration),vquality,generateAudio:sound?'true':'false',count:1,videoEditOperation:operations[op],
        videoKling:{mode,multiShot,...(multiPrompt?{multiPrompt}:{}),...(counts.video?{videoReferenceType:'feature' as const,keepOriginalSound:fields.keep_original_sound}: {})},
        ltvExecutionContract:ordinary?'kling-v3-video':'kling-omni-video',strictGenerationOptions:['model','size','seconds','vquality','generateAudio','count']};
}

export function klingTaskMetadata(metadata:CanvasNodeMetadata|undefined){
    if(!metadata?.videoKling)return {};
    const protocol=metadata.ltvExecutionContract==='kling-v26-video'?'kling-v26-video':metadata.ltvExecutionContract==='kling-v3-turbo-video'?'kling-v3-turbo-video':metadata.ltvExecutionContract==='kling-o1-video'?'kling-o1-video':metadata.ltvExecutionContract==='kling-v25-video'?'kling-v25-video':metadata.ltvExecutionContract==='kling-v3-video'?'kling-v3-video':'kling-omni-video';
    return {providerOptions:{[protocol]:{...metadata.videoKling}}};
}

export function assertKlingRuntimeOptions(options:NonNullable<CanvasNodeMetadata['videoKling']>, model:string, resolution:string, seconds:string, sound:string, context:{referenceImages:unknown[];referenceVideos:{durationMs?:number}[];referenceAudios:unknown[]},contract?:string){
    if(contract==='kling-v26-video'){
        if(model!=='kling-2.6')throw new Error('此制作步骤需要原版本可灵2.6模型。');
        if(!['std','pro'].includes(options.mode)||normalizeVideoResolution(resolution)!==(options.mode==='pro'?'1080':'720')||!['5','10'].includes(seconds)||!['true','false'].includes(sound)||sound==='true'&&options.mode!=='pro')throw new Error('可灵2.6仅支持5/10秒，有声仅支持1080p，不能自动升档。');
        if(options.multiShot!==false||options.multiPrompt?.length||options.videoReferenceType||options.keepOriginalSound||context.referenceImages.length!==1||context.referenceVideos.length||context.referenceAudios.length)throw new Error('此案例入口仅接入声音选择明确的单首帧2.6，首尾帧默认声音仍待确认。');
        return;
    }
    if(contract==='kling-v3-turbo-video'){
        if(model!=='kling-3.0-turbo')throw new Error('此制作步骤需要原版本可灵3.0 Turbo模型。');
        if(!['std','pro'].includes(options.mode)||normalizeVideoResolution(resolution)!==(options.mode==='pro'?'1080':'720')||!Number.isInteger(Number(seconds))||Number(seconds)<3||Number(seconds)>15||sound!=='true')throw new Error('可灵Turbo需保留3至15秒、原分辨率和音画同出。');
        if(options.multiShot!==false||options.multiPrompt?.length||options.videoReferenceType||options.keepOriginalSound||context.referenceImages.length!==1||context.referenceVideos.length||context.referenceAudios.length)throw new Error('可灵Turbo此入口仅接受一个首帧，不支持尾帧、分镜和其他参考。');
        return;
    }
    if(contract==='kling-o1-video'){
        if(model!=='kling-video-o1')throw new Error('此制作步骤需要原版本可灵O1模型。');
        if(!['std','pro'].includes(options.mode)||normalizeVideoResolution(resolution)!==(options.mode==='pro'?'1080':'720')||!['5','10'].includes(seconds)||sound!=='false')throw new Error('可灵O1档位、时长或声音设置不符合源合同。');
        if(options.multiShot!==false||options.multiPrompt?.length||options.videoReferenceType||options.keepOriginalSound)throw new Error('此可灵O1入口未接入分镜或视频编辑。');
        if(context.referenceVideos.length||context.referenceAudios.length||context.referenceImages.length>7)throw new Error('此可灵O1入口只支持文生、首尾帧或至多7张参考图。');
        return;
    }
    if(contract==='kling-v25-video'){
        if(model!=='kling-v2-5-turbo')throw new Error('此制作步骤需要原版本可灵2.5模型。');
        if(!['std','pro'].includes(options.mode)||normalizeVideoResolution(resolution)!==(options.mode==='pro'?'1080':'720')||!['5','10'].includes(seconds)||sound!=='false')throw new Error('可灵2.5档位、时长或声音设置不符合原合同。');
        if(options.multiShot!==false||options.multiPrompt?.length||options.videoReferenceType||options.keepOriginalSound)throw new Error('可灵2.5此入口不支持分镜、主体或视频编辑控制。');
        if(context.referenceVideos.length||context.referenceAudios.length||context.referenceImages.length<1||context.referenceImages.length>2||(context.referenceImages.length===2&&options.mode!=='pro'))throw new Error('可灵2.5需要首帧，首尾帧仅支持高品质模式。');
        return;
    }
    if(!['kling-v3-omni','kling-v3'].includes(model))throw new Error('此制作步骤需要对应的可灵3.0模型。');
    if(model==='kling-v3'&&(context.referenceImages.length>2||context.referenceVideos.length))throw new Error('普通可灵3.0此入口只支持首尾帧，不支持Omni多模态输入。');
    const tier=({std:'720',pro:'1080','4k':'2160'} as const)[options.mode];
    if(!tier||normalizeVideoResolution(resolution)!==tier||typeof options.multiShot!=='boolean')throw new Error('可灵质量档位与分辨率或分镜设置不一致。');
    if(context.referenceAudios.length||context.referenceVideos.length>1||context.referenceImages.length>(context.referenceVideos.length?4:7))throw new Error('可灵实际参考数量或类型不符合该操作要求。');
    if(!Number.isInteger(Number(seconds))||Number(seconds)<3||Number(seconds)>15)throw new Error('可灵视频生成时长需为3至15秒。');
    readKlingCustomShots(options.multiPrompt,options.multiShot,Number(seconds));
    if(context.referenceVideos.length){
        if(sound!=='false'||!['feature','base'].includes(options.videoReferenceType||'')||!['yes','no'].includes(options.keepOriginalSound||''))throw new Error('参考视频需要关闭生成声音并明确参考用途及原声设置。');
        const duration=context.referenceVideos[0].durationMs;
        if(!Number.isFinite(duration)||Number(duration)<3000||Number(duration)>10000)throw new Error('原案例参考视频需要确认3至10秒的完整时长。');
    }
}
