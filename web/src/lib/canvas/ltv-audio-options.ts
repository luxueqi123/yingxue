import type { CanvasNodeMetadata } from '../../types/canvas';
import {mapLtvMiniMaxSpeech} from './ltv-minimax-speech';
import { assertLtvMusicIdentity } from './ltv-music-options';
import { ELEVEN_V3, mapLtvElevenV3 } from './ltv-eleven-v3';

// Seed Audio describes sound generation, including image/audio-conditioned operations.
// Its text2audio label is not proof of a /audio/speech contract; the archived source also
// uses Music for these requests. Keep that semantic gap explicit even at default settings.
export function assertLtvAudioSemantics(metadata: CanvasNodeMetadata | undefined) {
    assertLtvMusicIdentity(metadata?.audioMusic, metadata?.generationModelProvenance?.sourceModel);
    if (metadata?.generationModelProvenance?.sourceModel === 'vocal-v3' && metadata.ltvExecutionContract !== ELEVEN_V3) throw new Error('原Eleven V3配音必须使用同版本独立协议，不能使用通用配音替代。');
    if (metadata?.generationModelProvenance?.sourceModel === 'seed-audio-1.0') {
        throw new Error('源工程的 Seed Audio 音效／音乐生成尚缺已核验协议；已停止提交，避免把音效描述当作配音台词。');
    }
}

/** Maps speech controls only. Music, voice design and reference audio require distinct protocols. */
export function mapLtvSpeechOptions(fields: Record<string, unknown>) {
    if (fields.model === 'vocal-v3') return mapLtvElevenV3(fields);
    if (fields.model === 'speech-2.8-hd') return mapLtvMiniMaxSpeech(fields);
    if (fields.model === 'seed-audio-1.0') return null;
    if (fields.scene !== 'Text-to-Speech' || !['text2audio', undefined, ''].includes(fields.modeType as string | undefined)) return null;
    const voiceValue = fields.voice_setting_voice_id ?? fields.voice_id;
    const voice = typeof voiceValue === 'string' ? voiceValue : voiceValue && typeof voiceValue === 'object' ? (voiceValue as Record<string, unknown>).voiceId : undefined;
    const speed = fields.voice_setting_speed === undefined ? 1 : Number(fields.voice_setting_speed);
    const format = fields.format === undefined ? 'mp3' : String(fields.format);
    if (typeof voice !== 'string' || !voice.trim() || voice.length > 256 || /[\x00-\x1f\x7f]/.test(voice) || !Number.isFinite(speed) || speed < 0.25 || speed > 4 || !['mp3','wav','opus','aac','flac','pcm'].includes(format)) return null;
    // Unity gain and zero pitch/effect controls are neutral; active effects are never dropped.
    if (fields.voice_setting_vol !== undefined && Number(fields.voice_setting_vol) !== 1) return null;
    for (const key of ['voice_setting_pitch','voice_modify_pitch','voice_modify_intensity','voice_modify_timbre']) if (fields[key] !== undefined && Number(fields[key]) !== 0) return null;
    if (fields.voice_modify_sound_effects) return null;
    const consumed = new Set(['scene','voice_setting_voice_id','voice_id','voice_setting_speed','format','voice_setting_vol','voice_setting_pitch','voice_modify_pitch','voice_modify_intensity','voice_modify_timbre','voice_modify_sound_effects']);
    const options: Partial<CanvasNodeMetadata> = { audioVoice: voice.trim(), audioSpeed: String(speed), audioFormat: format, count: 1, strictGenerationOptions: ['model','audioVoice','audioSpeed','audioFormat','count'] };
    return { consumed, options };
}
