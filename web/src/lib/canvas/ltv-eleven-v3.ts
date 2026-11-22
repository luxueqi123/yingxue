import type { CanvasNodeMetadata } from '../../types/canvas';
import { modelOptionName, resolveModelChannel, type AiConfig } from '../../stores/use-config-store';

export const ELEVEN_V3 = 'elevenlabs-v3-audio';
const validVoice = (voice: unknown): voice is string => typeof voice === 'string' && /^[A-Za-z0-9]{20}$/.test(voice);

export function mapLtvElevenV3(fields: Record<string, unknown>) {
    if (fields.model !== 'vocal-v3' || fields.scene !== 'Text-to-Speech' || !['text2audio', '', undefined].includes(fields.modeType as string | undefined)) return null;
    if (!validVoice(fields.voice_id)) return null;
    const stability = fields.stability ?? 0.5;
    if (![0, 0.5, 1].includes(stability as number)) return null;
    if (['sample_rate', 'language', 'format', 'voice_setting_speed', 'voice_setting_pitch', 'voice_setting_vol', 'voice_modify_pitch', 'voice_modify_intensity', 'voice_modify_timbre', 'voice_modify_sound_effects', 'music_length_ms'].some(k => fields[k] !== undefined)) return null;
    const options: Partial<CanvasNodeMetadata> = {
        ltvExecutionContract: ELEVEN_V3, audioVoice: fields.voice_id, audioSpeed: '1', audioFormat: 'mp3', audioEleven: { stability: stability as number }, count: 1,
        strictGenerationOptions: ['model', 'audioVoice', 'audioSpeed', 'audioFormat', 'count'],
    };
    return { options, consumed: new Set(['scene', 'voice_id', 'stability']) };
}

export function elevenV3TaskMetadata(metadata: CanvasNodeMetadata | undefined) {
    if (metadata?.ltvExecutionContract !== ELEVEN_V3 && !metadata?.audioEleven) return {};
    if (metadata.ltvExecutionContract !== ELEVEN_V3 || !metadata.audioEleven || ![0, 0.5, 1].includes(metadata.audioEleven.stability)) throw new Error('Eleven V3稳定性参数缺失或无效。');
    return { providerOptions: { [ELEVEN_V3]: { stability: metadata.audioEleven.stability } } };
}

export function assertElevenV3(metadata: CanvasNodeMetadata, config: AiConfig, prompt: string, referenceCount: number) {
    elevenV3TaskMetadata(metadata);
    const channel = resolveModelChannel(config, config.model), model = modelOptionName(config.model);
    const protocol = channel.modelCosts?.find(m => m.model === model)?.protocol || channel.interfaceType;
    if (model !== 'eleven_v3' || protocol !== ELEVEN_V3) throw new Error('原案例需要 Eleven V3，不能替换配音模型或版本。');
    if (referenceCount || Number(config.count) !== 1 || config.audioFormat !== 'mp3' || Number(config.audioSpeed) !== 1) throw new Error('原Eleven V3入口仅接受一份文本、原音色和稳定性设置。');
    if (!validVoice(config.audioVoice) || !prompt.trim() || Array.from(prompt).length > 5000) throw new Error('Eleven V3需要原音色ID及非空、不超过5000字符的完整文本。');
}
