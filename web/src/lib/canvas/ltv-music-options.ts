import type { CanvasNodeMetadata } from '../../types/canvas';
import { readLtvSwitch } from './ltv-parameter-layers';
import { modelOptionName, resolveModelChannel, type AiConfig } from '../../stores/use-config-store';

export const MUREKA_INSTRUMENTAL = 'mureka-instrumental';

// Matching control names do not establish a shared provider or model identity.
const MUSIC_MODELS = new Set(['vocal-music']);

export function assertLtvMusicIdentity(music: CanvasNodeMetadata['audioMusic'], sourceModel?: string) {
    if ([music?.sourceModel, sourceModel].some(model => model?.startsWith('mureka-')) &&
        !(music?.provider === MUREKA_INSTRUMENTAL && music.sourceModel === 'mureka-8' && (!sourceModel || sourceModel === 'mureka-8'))) {
        throw new Error('原 Mureka 音乐节点需要同版本独立协议，不能用 ElevenLabs 或其他模型替代。');
    }
}

export function mapLtvMusicOptions(fields: Record<string, unknown>) {
    const model = fields.model;
    if (model === 'mureka-8') {
        if (fields.scene !== 'Music' || !['text2audio', '', undefined].includes(fields.modeType as string | undefined) || fields.force_instrumental === undefined || fields.music_length_ms !== undefined) return null;
        try { if (!readLtvSwitch(fields.force_instrumental)) return null; } catch { return null; }
        const options: Partial<CanvasNodeMetadata> = {
            audioMusic: { provider: MUREKA_INSTRUMENTAL, forceInstrumental: true, sourceModel: model },
            audioFormat: 'mp3', count: 1, ltvExecutionContract: MUREKA_INSTRUMENTAL, strictGenerationOptions: ['model', 'count'],
        };
        return { options, consumed: new Set(['scene', 'force_instrumental']) };
    }
    if (typeof model !== 'string' || !MUSIC_MODELS.has(model)) return null;
    // Music composition only. lyrics2audio and audio2audio are different operations that the
    // host music contract does not express, so they must keep reporting their own requirement.
    if (!['text2audio', '', undefined].includes(fields.modeType as string | undefined)) return null;
    // Only the vocal-music source model declares a duration control.
    if (model !== 'vocal-music' && fields.music_length_ms !== undefined) return null;
    // `scene` selects the source editor preset; Music is the declared scene for every music model.
    if (model === 'vocal-music' && fields.scene !== 'Music') return null;
    const durationMs = fields.music_length_ms === undefined ? undefined : Number(fields.music_length_ms);
    if (durationMs !== undefined && (!Number.isInteger(durationMs) || durationMs < 3000 || durationMs > 600000)) return null;
    let forceInstrumental: boolean;
    try { forceInstrumental = readLtvSwitch(fields.force_instrumental); } catch { return null; }
    const options: Partial<CanvasNodeMetadata> = {
        audioMusic: { provider: 'elevenlabs-music', durationMs, forceInstrumental, sourceModel: model },
        audioFormat: 'mp3', count: 1, ltvExecutionContract: 'elevenlabs-music', strictGenerationOptions: ['model', 'count'],
    };
    return { options, consumed: new Set(['scene', 'music_length_ms', 'force_instrumental']) };
}

export function musicTaskMetadata(music: CanvasNodeMetadata['audioMusic']) {
    if (!music) return {};
    assertLtvMusicIdentity(music);
    if (music.provider === MUREKA_INSTRUMENTAL) {
        if (music.sourceModel !== 'mureka-8' || music.forceInstrumental !== true || music.durationMs !== undefined) throw new Error('Mureka 8 纯音乐参数不完整，不能丢弃曲长或改变原版本。');
        return { providerOptions: { [MUREKA_INSTRUMENTAL]: { forceInstrumental: true } } };
    }
    if (music.provider !== 'elevenlabs-music' || typeof music.forceInstrumental !== 'boolean' || (music.durationMs !== undefined && (!Number.isInteger(music.durationMs) || music.durationMs < 3000 || music.durationMs > 600000))) throw new Error('音乐参数无效，请检查曲长和纯音乐选项。');
    return { providerOptions: { 'elevenlabs-music': { ...(music.durationMs !== undefined ? { music_length_ms: music.durationMs } : {}), force_instrumental: music.forceInstrumental } } };
}

export function assertMurekaMusic(metadata: CanvasNodeMetadata, config: AiConfig, prompt: string, referenceCount: number) {
    musicTaskMetadata(metadata.audioMusic);
    const channel = resolveModelChannel(config, config.model), model = modelOptionName(config.model);
    const protocol = channel.modelCosts?.find(m => m.model === model)?.protocol || channel.interfaceType;
    if (metadata.ltvExecutionContract !== MUREKA_INSTRUMENTAL || metadata.audioMusic?.provider !== MUREKA_INSTRUMENTAL || model !== 'mureka-8' || protocol !== MUREKA_INSTRUMENTAL) throw new Error('原音乐需要 Mureka 8 独立协议，不能替换模型或版本。');
    if (Number(config.count) !== 1 || referenceCount) throw new Error('此 Mureka 入口一次生成一份纯音乐，不接受参考媒体。');
    if (!prompt.trim() || Array.from(prompt).length > 1024) throw new Error('Mureka 纯音乐描述必须非空且不超过1024字符，不能截断。');
}
