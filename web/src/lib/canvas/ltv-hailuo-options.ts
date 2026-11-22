import type {CanvasNodeMetadata} from '../../types/canvas';
import {readLtvSwitch} from './ltv-parameter-layers';
import {normalizeVideoResolution} from '../video-generation-options';

/**
 * Source catalog declarations for MiniMax-Hailuo-H3 / H3-Max (source-tool-spec.json):
 * H3 supports singleImage2video / frames2video / mixed2video / text2video with 768P and 2K,
 * H3-Max supports singleImage2video / frames2video with 480P and 768P. Both declare ratios
 * adaptive / 21:9 / 16:9 / 4:3 / 1:1 / 3:4 / 9:16 and 5-15 second integer durations.
 *
 * The host already ships a MiniMax V2 pass-through for these models: the built-in
 * `minimax-video` adapter, the bundled `minimax-hailuo-video-v2` provider package, the
 * `createMiniMaxVideoTask` client and the `minimax-video` capability profile. Nothing here
 * invents a protocol; it only states which saved source requests that existing contract can
 * carry, so a case waits for a MiniMax channel instead of reporting a missing capability.
 */
const HOST_RATIOS = new Set(['adaptive', '21:9', '16:9', '4:3', '1:1', '3:4', '9:16']);
/**
 * Tiers both sides declare. The host MiniMax profile exposes only 768P and 2K
 * (model-capabilities.ts); the source schema adds 480P for H3-Max. Intersecting them keeps H3's
 * 768P/2K and drops H3-Max's 480P instead of converting it into another tier.
 */
const MODEL_RESOLUTIONS: Record<string, Set<string>> = {
    'MiniMax-Hailuo-H3': new Set(['768p', '2k']),
    'MiniMax-Hailuo-H3-Max': new Set(['768p']),
};
const HOST_OPERATIONS: Record<string, CanvasNodeMetadata['videoEditOperation']> = {
    text2video: 'text_to_video',
    singleImage2video: 'image_to_video',
    frames2video: 'image_to_video',
    mixed2video: 'reference_to_video',
};
/**
 * Declared input ranges from the source tool schema. The frame modes count images only;
 * mixed2video declares a total media range that its `mixed2videoConfig` bounds per kind
 * (image 9 / video 3 / audio 3), so the widest range it can reach is exactly 1-15.
 */
const MODE_INPUTS: Record<string, Record<string, [number, number]>> = {
    'MiniMax-Hailuo-H3': {text2video: [0, 0], singleImage2video: [1, 1], frames2video: [1, 2], mixed2video: [1, 15]},
    'MiniMax-Hailuo-H3-Max': {singleImage2video: [1, 1], frames2video: [1, 2]},
};
const DEFAULT_RATIOS: Record<string, string> = {text2video: '16:9', singleImage2video: 'adaptive', frames2video: 'adaptive', mixed2video: '16:9'};
// Native /v2/video_generation documents only these two API IDs. Legacy 2.3/Fast/o2
// use another wire contract; preserving their source options cannot make them V2 models.
const SOURCE_MODELS_BY_API: Record<string, string> = {
    'MiniMax-H3': 'MiniMax-Hailuo-H3',
    'MiniMax-H3-Max': 'MiniMax-Hailuo-H3-Max',
};
const DEFAULT_RESOLUTION = '768P';
const V1_MODELS = new Set(['MiniMax-Hailuo-2.3', 'MiniMax-Hailuo-2.3-Fast']);

function mapLtvHailuo02Options(fields: Record<string, any>, counts: {image: number; video: number; audio: number}, count: number): Partial<CanvasNodeMetadata> | undefined {
    const frames = fields.modeType === 'frames2video';
    if ((!frames && fields.modeType !== 'singleImage2video') || count !== 1 || counts.image !== (frames ? 2 : 1) || counts.video || counts.audio) return;
    const ratio = String(fields.ratio || 'auto');
    const resolution = String(fields.resolution || '768P').toUpperCase();
    const duration = Number(fields.duration ?? 6);
    if (ratio !== 'auto' || !(frames ? ['768P', '1080P'] : ['512P', '768P', '1080P']).includes(resolution) || ![6, 10].includes(duration) || (resolution === '1080P' && duration !== 6)) return;
    if (readLtvSwitch(fields.enableSound) || readLtvSwitch(fields.multi_shot) || fields.quality || (fields.cameraMovement != null && String(fields.cameraMovement).trim())) return;
    return {
        size: ratio, seconds: String(duration), vquality: resolution, generateAudio: 'false', count: 1,
        videoEditOperation: 'image_to_video', ltvExecutionContract: 'minimax-hailuo02-video',
        ltvHailuoModel: 'MiniMax-Hailuo-o2',
        strictGenerationOptions: ['model', 'size', 'seconds', 'vquality', 'generateAudio', 'count'],
    };
}

function mapLtvHailuoV1Options(fields: Record<string, any>, counts: {image: number; video: number; audio: number}, count: number): Partial<CanvasNodeMetadata> | undefined {
    if (fields.modeType !== 'singleImage2video' || count !== 1 || counts.image !== 1 || counts.video || counts.audio) return;
    const ratio = String(fields.ratio || 'auto');
    const resolution = String(fields.resolution || '1080P').toUpperCase();
    const duration = Number(fields.duration ?? 6);
    if (ratio !== 'auto' || !['768P', '1080P'].includes(resolution) || ![6, 10].includes(duration) || (resolution === '1080P' && duration !== 6)) return;
    if (readLtvSwitch(fields.enableSound) || fields.quality || (fields.cameraMovement != null && String(fields.cameraMovement).trim())) return;
    return {
        size: ratio, seconds: String(duration), vquality: resolution, generateAudio: 'false', count: 1,
        videoEditOperation: 'image_to_video', ltvExecutionContract: 'minimax-video-v1',
        ltvHailuoModel: fields.model as CanvasNodeMetadata['ltvHailuoModel'],
        strictGenerationOptions: ['model', 'size', 'seconds', 'vquality', 'generateAudio', 'count'],
    };
}

function sourceDurationSupported(model: string, seconds: number) {
    return !!MODEL_RESOLUTIONS[model] && Number.isInteger(seconds) && seconds >= 5 && seconds <= 15;
}

/**
 * Maps a source Hailuo H3 request onto the host MiniMax V2 contract.
 * Returns undefined whenever any declared requirement is outside that contract, so the node
 * keeps reporting its gap instead of being converted into a request the host would reject.
 */
export function mapLtvHailuoOptions(fields: Record<string, any>, counts: {image: number; video: number; audio: number}, count: number): Partial<CanvasNodeMetadata> | undefined {
    // The source catalog labels its o2 key as Hailuo 02; its API uses numeric zero.
    if (fields.model === 'MiniMax-Hailuo-o2') return mapLtvHailuo02Options(fields, counts, count);
    if (V1_MODELS.has(String(fields.model))) return mapLtvHailuoV1Options(fields, counts, count);
    const inputs = MODE_INPUTS[String(fields.model)];
    if (!inputs) return;
    if (count !== 1) return;
    const operation = String(fields.modeType || '');
    const range = inputs[operation];
    if (!range || !HOST_OPERATIONS[operation]) return;
    const resolution = String(fields.resolution || DEFAULT_RESOLUTION).toLowerCase();
    if (!MODEL_RESOLUTIONS[String(fields.model)].has(resolution)) return;
    const ratio = String(fields.ratio || DEFAULT_RATIOS[operation]).trim();
    if (!HOST_RATIOS.has(ratio)) return;
    const seconds = Number(fields.duration);
    // Both supported source models declare a 5-15 slider.
    if (!sourceDurationSupported(String(fields.model), seconds)) return;
    if (counts.image > 9 || counts.video > 3 || counts.audio > 3) return;
    const media = operation === 'mixed2video' ? counts.image + counts.video + counts.audio : counts.image;
    if (media < range[0] || media > range[1]) return;
    if (operation === 'text2video' && (counts.video || counts.audio)) return;
    // The all-purpose reference mode rejects audio-only input; it needs an image or a video.
    if (operation === 'mixed2video' && !counts.image && !counts.video) return;
    // The host MiniMax provider neither sends `generate_audio` nor declares audio generation,
    // so a saved request that asks for generated sound cannot be carried by this contract.
    if (readLtvSwitch(fields.enableSound)) return;
    // 2.3 / 2.3-Fast declare a separate `cameraMovement` field (source config.advancedSettings)
    // that the source submits alongside the prompt; the host MiniMax client only sends
    // model/content/resolution/duration/ratio/aigc_watermark, so a saved camera instruction has no
    // landing and the node keeps reporting instead of being published with the field dropped.
    if (fields.cameraMovement !== undefined && fields.cameraMovement !== null && String(fields.cameraMovement).trim()) return;
    return {
        size: ratio,
        seconds: String(seconds),
        vquality: resolution === '2k' ? '2K' : '768P',
        generateAudio: 'false',
        count: 1,
        videoEditOperation: HOST_OPERATIONS[operation],
        ltvExecutionContract: 'minimax-video',
        ltvHailuoModel: fields.model as CanvasNodeMetadata['ltvHailuoModel'],
        strictGenerationOptions: ['model', 'size', 'seconds', 'vquality', 'generateAudio', 'count'],
    };
}

export function assertHailuoRuntimeOptions(model: string, resolution: string, seconds: string, sound: string, sourceModel?: CanvasNodeMetadata['ltvHailuoModel'], contract: 'minimax-video' | 'minimax-video-v1' | 'minimax-hailuo02-video' = 'minimax-video') {
    const apiModel = model.trim();
    if (contract === 'minimax-hailuo02-video') {
        if (apiModel !== 'MiniMax-Hailuo-02' || (sourceModel && sourceModel !== 'MiniMax-Hailuo-o2')) throw new Error('请选择与案例原版本一致的 MiniMax-Hailuo-02 模型，不能替换版本。');
        const tier = normalizeVideoResolution(resolution);
        const duration = Number(seconds);
        if (!['512', '768', '1080'].includes(tier) || ![6, 10].includes(duration) || (tier === '1080' && duration !== 6)) throw new Error('海螺02不支持此分辨率和时长组合，不能替换或截断。');
        if (sound === 'true') throw new Error('海螺02不生成同步音频，不能忽略声音要求。');
        return;
    }
    if (contract === 'minimax-video-v1') {
        if (!V1_MODELS.has(apiModel) || (sourceModel && apiModel !== sourceModel)) throw new Error('请选择与案例原版本一致的 MiniMax V1 海螺模型，不能替换版本。');
        const tier = normalizeVideoResolution(resolution);
        const duration = Number(seconds);
        if (!['768','1080'].includes(tier) || ![6,10].includes(duration) || (tier === '1080' && duration !== 6)) throw new Error('当前海螺版本不支持此分辨率和时长组合，不能替换或截断。');
        if (sound === 'true') throw new Error('此海螺接口不生成同步音频，不能忽略声音要求。');
        return;
    }
    const selectedSource = SOURCE_MODELS_BY_API[apiModel];
    if (sourceModel && (selectedSource || apiModel) !== sourceModel) throw new Error('请选择与案例原海螺版本一致的模型，不能自动替换版本。');
    if (!selectedSource) throw new Error('MiniMax V2 只接通 MiniMax-H3 或 MiniMax-H3-Max，旧海螺版本不能使用此接口。');
    const normalized = normalizeVideoResolution(resolution);
    const tier = normalized === '1440' ? '2k' : `${normalized}p`;
    if (!MODEL_RESOLUTIONS[selectedSource].has(tier)) throw new Error('当前海螺版本未接通此分辨率档位，不能替换。');
    const duration = Number(seconds);
    const minimum = sourceModel || apiModel === 'MiniMax-H3-Max' ? 5 : 4;
    if (!Number.isInteger(duration) || duration < minimum || duration > 15) throw new Error(`当前海螺版本的视频时长需为 ${minimum} 至 15 秒。`);
    // Sending generated sound would be silently dropped by this provider.
    if (sound === 'true') throw new Error('MiniMax H3 不生成同步音频，不能忽略节点的声音要求。');
}
