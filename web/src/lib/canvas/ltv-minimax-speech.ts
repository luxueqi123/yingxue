import type {CanvasNodeMetadata} from '../../types/canvas';
import {modelOptionName,resolveModelChannel,type AiConfig} from '../../stores/use-config-store';

export const MINIMAX_SPEECH = 'minimax-speech28-audio';
const effects=['','spacious_echo','auditorium_echo','lofi_telephone','robotic'];
const integerIn=(value:number,min:number,max:number)=>Number.isInteger(value)&&value>=min&&value<=max;

function validControls(value:NonNullable<CanvasNodeMetadata['audioSpeech']>) {
    return Number.isFinite(value.volume)&&value.volume>0&&value.volume<=10
        &&integerIn(value.pitch,-12,12)&&integerIn(value.modifyPitch,-100,100)
        &&integerIn(value.intensity,-100,100)&&integerIn(value.timbre,-100,100)&&effects.includes(value.soundEffects);
}

export function mapLtvMiniMaxSpeech(fields:Record<string,unknown>) {
    if(fields.model!=='speech-2.8-hd'||fields.scene!=='Text-to-Speech'||!['text2audio','',undefined].includes(fields.modeType as string|undefined))return null;
    const raw=fields.voice_setting_voice_id??fields.voice_id;
    const voice=typeof raw==='string'?raw:raw&&typeof raw==='object'?(raw as Record<string,unknown>).voiceId:undefined;
    const speed=Number(fields.voice_setting_speed??1);
    if(typeof voice!=='string'||!voice.trim()||voice.length>256||/[\x00-\x1f\x7f]/.test(voice)||!Number.isFinite(speed)||speed<0.5||speed>2)return null;
    // Sampling/language overrides are absent from this source schema; never discard them if encountered.
    if(['sample_rate','language','format'].some(k=>fields[k]!==undefined))return null;
    const controls={volume:Number(fields.voice_setting_vol??1),pitch:Number(fields.voice_setting_pitch??0),
        modifyPitch:Number(fields.voice_modify_pitch??0),intensity:Number(fields.voice_modify_intensity??0),
        timbre:Number(fields.voice_modify_timbre??0),soundEffects:String(fields.voice_modify_sound_effects??'')};
    if(!validControls(controls))return null;
    const options:Partial<CanvasNodeMetadata>={ltvExecutionContract:MINIMAX_SPEECH,audioVoice:voice.trim(),audioSpeed:String(speed),audioFormat:'mp3',audioSpeech:controls,count:1,
        strictGenerationOptions:['model','audioVoice','audioSpeed','audioFormat','count']};
    return {options,consumed:new Set(['scene','voice_setting_voice_id','voice_id','voice_setting_speed','voice_setting_vol','voice_setting_pitch','voice_modify_pitch','voice_modify_intensity','voice_modify_timbre','voice_modify_sound_effects'])};
}

export function miniMaxSpeechTaskMetadata(metadata:CanvasNodeMetadata|undefined) {
    if(metadata?.ltvExecutionContract!==MINIMAX_SPEECH&&!metadata?.audioSpeech)return {};
    if(metadata.ltvExecutionContract!==MINIMAX_SPEECH||!metadata.audioSpeech||!validControls(metadata.audioSpeech))throw new Error('MiniMax配音参数不完整或越界，已停止生成。');
    return {providerOptions:{[MINIMAX_SPEECH]:metadata.audioSpeech}};
}

export function assertMiniMaxSpeech(metadata:CanvasNodeMetadata,config:AiConfig,prompt:string,referenceCount:number) {
    miniMaxSpeechTaskMetadata(metadata);
    const channel=resolveModelChannel(config,config.model),model=modelOptionName(config.model);
    const protocol=channel.modelCosts?.find(m=>m.model===model)?.protocol||channel.interfaceType;
    if(model!=='speech-2.8-hd'||protocol!==MINIMAX_SPEECH)throw new Error('原案例需要MiniMax Speech 2.8 HD，不能替换配音模型或版本。');
    if(referenceCount||Number(config.count)!==1||config.audioFormat!=='mp3')throw new Error('此配音入口只接受一份文本及原音色，不接受参考媒体或格式替换。');
    if(!prompt.trim()||[...prompt].length>=10000)throw new Error('同步配音文本必须非空且少于10000字符，不能静默截断。');
    if(!config.audioVoice.trim()||!Number.isFinite(Number(config.audioSpeed))||Number(config.audioSpeed)<0.5||Number(config.audioSpeed)>2)throw new Error('MiniMax音色或语速无效。');
}
