import type { CanvasNodeMetadata } from '../../types/canvas';
import { readLtvSwitch } from './ltv-parameter-layers';
import { normalizeVideoResolution } from '../video-generation-options';

export const HAPPYHORSE_REFERENCE_PROVIDER = 'dashscope-happyhorse-reference-video';
export const HAPPYHORSE_REFERENCE_CONTRACT = 'happyhorse-reference-video';
export const HAPPYHORSE_REFERENCE_MODEL = 'happyhorse-1.1-r2v';
export const HAPPYHORSE_FIRST_FRAME_PROVIDER = 'dashscope-happyhorse-first-frame-video';
export const HAPPYHORSE_FIRST_FRAME_CONTRACT = 'happyhorse-first-frame-video';
export const HAPPYHORSE_FIRST_FRAME_MODEL = 'happyhorse-1.1-i2v';
export const HAPPYHORSE_TEXT_PROVIDER = 'dashscope-happyhorse-text-video';
export const HAPPYHORSE_TEXT_CONTRACT = 'happyhorse-text-video';
export const HAPPYHORSE_TEXT_MODEL = 'happyhorse-1.1-t2v';
const ratios = ['16:9', '9:16', '1:1', '4:3', '3:4'];
type Counts = { image: number; video: number; audio: number };

function happyHorseSourceVersion(model: unknown): '1.0' | '1.1' | undefined {
    return model === 'happy-horse-1' ? '1.0' : model === 'happy-horse-1.1' ? '1.1' : undefined;
}

export function mapLtvHappyHorseText(fields: Record<string, unknown>, counts: Counts, count: number): Partial<CanvasNodeMetadata> | undefined {
    if (fields.model !== 'happy-horse-1.1' || fields.modeType !== 'text2video' || count !== 1 || counts.image || counts.video || counts.audio) return;
    const prompt = String(fields.prompt ?? ''), duration = Number(fields.duration), ratio = String(fields.ratio || '16:9'), resolution = String(fields.resolution || '720P');
    if (!prompt.trim() || /@图片\d+|\[Image\s+\d+\]/i.test(prompt) || Array.from(prompt).length > (/\p{Script=Han}/u.test(prompt) ? 2500 : 5000)) return;
    if (!Number.isInteger(duration) || duration < 3 || duration > 15 || ![...ratios, '4:5', '5:4', '9:21', '21:9'].includes(ratio) || !['480P', '720P', '1080P'].includes(resolution)) return;
    try {
        if ([fields.enableSound, fields.search_enabled, fields.searchEnabled, fields.searchable, fields.multi_shot].some(value => readLtvSwitch(value))) return;
    } catch { return; }
    if (fields.quality || fields.seed != null) return;
    return {size: ratio, seconds: String(duration), vquality: resolution, count: 1, generateAudio: 'false', videoEditOperation: 'text_to_video', ltvExecutionContract: HAPPYHORSE_TEXT_CONTRACT,
        ltvHappyHorseModel: 'happy-horse-1.1', strictGenerationOptions: ['model', 'size', 'seconds', 'vquality', 'generateAudio', 'count']};
}

export function assertHappyHorseText(model: string, resolution: string, seconds: string, ratio: string, sound: string, metadata: CanvasNodeMetadata, counts: Counts, prompt: string) {
    if (model !== HAPPYHORSE_TEXT_MODEL || metadata.ltvHappyHorseModel !== 'happy-horse-1.1' || metadata.videoEditOperation !== 'text_to_video'
        || !mapLtvHappyHorseText({model: metadata.ltvHappyHorseModel, modeType: 'text2video', resolution: `${normalizeVideoResolution(resolution)}P`, duration: seconds, ratio, enableSound: sound, prompt}, counts, metadata.count ?? 1)) {
        throw new Error('HappyHorse 1.1 文生视频参数或正文引用不完整，不能丢弃参考图、改模型或截断正文。');
    }
}

export function mapLtvHappyHorseFirstFrame(fields: Record<string, unknown>, counts: Counts, count: number): Partial<CanvasNodeMetadata> | undefined {
    if (!happyHorseSourceVersion(fields.model) || fields.modeType !== 'frames2video' || count !== 1
        || counts.image !== 1 || counts.video || counts.audio || !['', 'auto', 'adaptive'].includes(String(fields.ratio ?? ''))) return;
    const duration = Number(fields.duration), resolution = String(fields.resolution || '720P');
    if (!Number.isInteger(duration) || duration < 3 || duration > 15 || !['720P', '1080P'].includes(resolution)) return;
    try {
        if ([fields.enableSound, fields.search_enabled, fields.searchEnabled, fields.searchable].some(value => readLtvSwitch(value))) return;
    } catch { return; }
    return { size: 'adaptive', seconds: String(duration), vquality: resolution, count: 1, generateAudio: 'false',
        videoEditOperation: 'image_to_video', ltvExecutionContract: HAPPYHORSE_FIRST_FRAME_CONTRACT,
        ltvHappyHorseModel: fields.model as CanvasNodeMetadata['ltvHappyHorseModel'], strictGenerationOptions: ['model', 'size', 'seconds', 'vquality', 'generateAudio', 'count'] };
}

export function assertHappyHorseFirstFrame(model: string, resolution: string, seconds: string, ratio: string, sound: string, metadata: CanvasNodeMetadata, counts: Counts) {
    if (!happyHorseSourceVersion(metadata.ltvHappyHorseModel) || model !== `happyhorse-${happyHorseSourceVersion(metadata.ltvHappyHorseModel)}-i2v`
        || metadata.videoEditOperation !== 'image_to_video' || metadata.videoEndFrameNodeId
        || !metadata.videoStartFrameNodeId || metadata.ltvReferencePlan?.references[0]?.nodeId !== metadata.videoStartFrameNodeId
        || !mapLtvHappyHorseFirstFrame({ model: metadata.ltvHappyHorseModel, modeType: 'frames2video',
            resolution: `${normalizeVideoResolution(resolution)}P`, duration: seconds, ratio, enableSound: sound }, counts, metadata.count ?? 1)) {
        throw new Error('HappyHorse 首帧的原模型、输入比例、时长或首帧绑定不符合要求，已停止生成。');
    }
}

export function happyHorseFirstFrameTaskMetadata(metadata: CanvasNodeMetadata | undefined, prompt: string, imageCount: number) {
    if (metadata?.ltvExecutionContract !== HAPPYHORSE_FIRST_FRAME_CONTRACT) return {};
    if (!happyHorseSourceVersion(metadata.ltvHappyHorseModel) || imageCount !== 1) throw new Error('HappyHorse 首帧原模型或参考数量无效。');
    for (const match of prompt.matchAll(/@图片(\d+)/g)) if (Number(match[1]) !== 1) throw new Error('HappyHorse 首帧正文引用不存在的图片，已停止生成。');
    if (Array.from(prompt).length > (/\p{Script=Han}/u.test(prompt) ? 2500 : 5000)) throw new Error('HappyHorse 首帧正文超过官方限制，不能截断原文提交。');
    return { providerOptions: { [HAPPYHORSE_FIRST_FRAME_PROVIDER]: { prompt } } };
}

export function mapLtvHappyHorseReferences(fields: Record<string, unknown>, counts: Counts, count: number): Partial<CanvasNodeMetadata> | undefined {
    if (!happyHorseSourceVersion(fields.model) || fields.modeType !== 'image2video' || count !== 1
        || !Number.isInteger(counts.image) || counts.image < 1 || counts.image > 9 || counts.video || counts.audio) return;
    const duration = Number(fields.duration), ratio = String(fields.ratio || '16:9'), resolution = String(fields.resolution || '720P');
    if (!Number.isInteger(duration) || duration < 3 || duration > 15 || !ratios.includes(ratio) || !['720P', '1080P'].includes(resolution)) return;
    try {
        if ([fields.enableSound, fields.search_enabled, fields.searchEnabled, fields.searchable].some(value => readLtvSwitch(value))) return;
    } catch { return; }
    return { size: ratio, seconds: String(duration), vquality: resolution, count: 1, generateAudio: 'false',
        videoEditOperation: 'reference_to_video', ltvExecutionContract: HAPPYHORSE_REFERENCE_CONTRACT,
        ltvHappyHorseModel: fields.model as CanvasNodeMetadata['ltvHappyHorseModel'], strictGenerationOptions: ['model', 'size', 'seconds', 'vquality', 'generateAudio', 'count'] };
}

export function assertHappyHorseReferences(model: string, resolution: string, seconds: string, ratio: string, sound: string, metadata: CanvasNodeMetadata, counts: Counts) {
    if (!happyHorseSourceVersion(metadata.ltvHappyHorseModel) || model !== `happyhorse-${happyHorseSourceVersion(metadata.ltvHappyHorseModel)}-r2v`
        || metadata.videoEditOperation !== 'reference_to_video'
        || !mapLtvHappyHorseReferences({ model: metadata.ltvHappyHorseModel, modeType: 'image2video',
            resolution: `${normalizeVideoResolution(resolution)}P`, duration: seconds, ratio, enableSound: sound }, counts, metadata.count ?? 1)) {
        throw new Error('HappyHorse 参考生视频的模型、画幅、时长或参考素材不符合原始要求，已停止生成。');
    }
}

/** LTV resolves source slots to ordered @图片N labels; DashScope requires [Image N]. */
export function happyHorseReferenceTaskMetadata(metadata: CanvasNodeMetadata | undefined, prompt: string, imageCount: number) {
    if (metadata?.ltvExecutionContract !== HAPPYHORSE_REFERENCE_CONTRACT) return {};
    if (!happyHorseSourceVersion(metadata.ltvHappyHorseModel) || !Number.isInteger(imageCount) || imageCount < 1 || imageCount > 9) throw new Error('HappyHorse 原始模型或参考数量无效。');
    const converted = prompt.replace(/@图片(\d+)/g, (_, index: string) => `[Image ${Number(index)}]`);
    for (const match of converted.matchAll(/\[Image\s+(\d+)\]/g)) {
        if (Number(match[1]) < 1 || Number(match[1]) > imageCount) throw new Error('HappyHorse 提示词引用不存在的参考图，已停止生成。');
    }
    if (!converted.trim() || Array.from(converted).length > (/\p{Script=Han}/u.test(converted) ? 2500 : 5000)) throw new Error('HappyHorse 正文超过官方限制，不能截断原文提交。');
    return { providerOptions: { [HAPPYHORSE_REFERENCE_PROVIDER]: { prompt: converted } } };
}
