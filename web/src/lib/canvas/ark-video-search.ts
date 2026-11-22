import type { CanvasNodeMetadata } from '../../types/canvas';
import { readLtvSwitch } from './ltv-parameter-layers';

// Official contents/generations/tasks contract: Seedance 2.0 family and 2.5.
export function arkSearchModelLimits(model: string) {
    if (!/^doubao-seedance-2-(0|5)-/.test(model)) return null;
    const expanded = model.startsWith('doubao-seedance-2-5-');
    return { images: expanded ? 30 : 9, videos: expanded ? 10 : 3, audios: expanded ? 10 : 3, maxDuration: expanded ? 30 : 15,
        resolutions: expanded ? ['480p', '720p', '1080p'] : /-(fast|mini)-/.test(model) ? ['480p', '720p'] : ['480p', '720p', '1080p', '4k'] };
}

// `webSearch` mirrors the source's own search switch. The host contract exposes web search as the
// optional `tools` entry, so a node that never asked for it is submitted on the same contract with
// the tool omitted instead of having the switch silently turned on.
export function configurableArkVideoSearch(fields: Record<string, any>, counts: { image: number; video: number; audio: number }, count: number, schemaDeclaresQuality = true, webSearch = true): Partial<CanvasNodeMetadata> | undefined {
    // `quality` only blocks this contract for models whose own schema declares it. star-video2 /
    // star-video2.5 declare no `quality` property at all (source-tool-spec.json), so a saved
    // `quality:"low"` on those nodes is a leftover from an earlier model and never part of their
    // submission. 实测 2026-09-18：3e71dbba 的 4 个 star-video2 节点与 3074e056 的节点都带这种残留。
    if (count !== 1 || (fields.quality && schemaDeclaresQuality)) return;
    const seconds = Number(fields.duration), resolution = String(fields.resolution).toLowerCase();
    if (!Number.isInteger(seconds) || seconds < 4 || seconds > 30 || !['480p','720p','1080p','4k'].includes(resolution)) return;
    if (!['16:9','9:16','1:1','4:3','3:4','21:9','adaptive'].includes(fields.ratio)) return;
    if (counts.image > 30 || counts.video > 10 || counts.audio > 10) return;
    const modes: Record<string, CanvasNodeMetadata['videoEditOperation']> = { text2video: 'text_to_video', singleImage2video: 'image_to_video', frames2video: 'image_to_video', image2video: 'reference_to_video', mixed2video: 'reference_to_video', audio2video: 'audio_to_video' };
    // Source front-end 2nkeqbyl30agw.js rebuilds the mode before submitting: a saved
    // `text2video` node that actually carries media is submitted as `mixed2video`
    // (`const H = ["text2video","mixed2video"]; r = o[0]?.key ?? (i ? "mixed2video" : "text2video")`).
    // Only the saved mode is stale; the media list is the author's real input, so recomputing here
    // keeps the request the source platform would have sent instead of reporting a missing capability.
    // The same rebuild applies to a saved `image2video` that carries audio or video: the source
    // `mixed2videoConfig`（star-video2 {imageMax:9,videoMax:3,audioMax:3}）is the mode that accepts
    // them, and the host Seedance contract carries images+videos+audios together.
    const declared = String(fields.modeType);
    const seedance = /^star-video2(\.5|-fast|-mini)?$/.test(String(fields.model));
    // The same source expression has a symmetric side: `r = o[0]?.key ?? (i ? "mixed2video" : "text2video")`
    // picks the mode from whether a media list survived, so a saved `mixed2video` whose mixed list is
    // empty is submitted as plain text-to-video. 实测 2026-09-18：case-4fb2c5a4 的 3 个 star-video2
    // 节点保存 mixed2video 但 image/video/audioList 全为空、advancedSettings.search_enabled=1；
    // 该案例在 r38/r39 是已发布工程，若按"混合模式必须有素材"判空会让它退回无联网的 artdance
    // 兜底并误报 search-option-unmapped。
    const emptyMixed = seedance && declared === 'mixed2video' && !counts.image && !counts.video && !counts.audio;
    const operation = emptyMixed ? 'text2video'
        : seedance && declared === 'text2video' && (counts.image || counts.video || counts.audio) ? 'mixed2video'
        : seedance && (declared === 'image2video' || declared === 'singleImage2video') && (counts.video || counts.audio) ? 'mixed2video'
        : declared;
    if (!modes[operation]) return;
    if (operation === 'text2video' && (counts.image || counts.video || counts.audio)) return;
    if (operation === 'singleImage2video' && (counts.image !== 1 || counts.video || counts.audio)) return;
    if (operation === 'frames2video' && (counts.image < 1 || counts.image > 2 || counts.video || counts.audio)) return;
    if (operation === 'image2video' && (!counts.image || counts.video || counts.audio)) return;
    // 源 schema 的 audio2video 只在 star-video2.5 声明为 [1,10]（其它 Seedance 型号是 [0,3]，
    // 按源 y() 里 `0 === n[1]` 的规则仍算可见）。宿主 volcengine-ark-video 的 body 有 audio_url，
    // 2.5 版本允许纯音频参考（2.0 要求同时有图或视频，由 assertArkRuntimeReferences 在运行期拦）。
    if (operation === 'audio2video' && (!counts.audio || counts.image || counts.video)) return;
    // mixed2video 也要核对源 schema 声明的上限，避免把超出该模型能力的素材堆进混合模式。
    if (operation === 'mixed2video' && !counts.image && !counts.video && !counts.audio) return;
    return { size: fields.ratio, seconds: String(seconds), vquality: resolution, generateAudio: readLtvSwitch(fields.enableSound) ? 'true' : 'false', count: 1,
        videoEditOperation: modes[operation], videoWebSearch: webSearch, ltvExecutionContract: 'ark-video-search',
        strictGenerationOptions: ['model','size','seconds','vquality','generateAudio','count'] };
}

export function videoSearchTaskMetadata(metadata: CanvasNodeMetadata | undefined) {
    if (metadata?.videoWebSearch === undefined) return {};
    if (typeof metadata.videoWebSearch !== 'boolean') throw new Error('视频联网设置无效。');
    return { providerOptions: { 'volcengine-ark-video': { webSearch: metadata.videoWebSearch } } };
}

export function assertArkRuntimeReferences(model: string, context: { referenceImages: unknown[]; referenceVideos: { durationMs?: number }[]; referenceAudios: { durationMs?: number }[] }) {
    const limits = arkSearchModelLimits(model);
    if (!limits) throw new Error('视频联网参数需要选择支持的 Seedance 模型。');
    if (context.referenceImages.length > limits.images || context.referenceVideos.length > limits.videos || context.referenceAudios.length > limits.audios) throw new Error('实际参考素材数量超过当前 Seedance 模型限制。');
    if (limits.maxDuration === 15 && context.referenceAudios.length && !context.referenceImages.length && !context.referenceVideos.length) throw new Error('Seedance 2.0 音频参考需要同时提供图片或视频。');
    for (const refs of [context.referenceVideos, context.referenceAudios]) {
        if (refs.some(ref => !Number.isFinite(ref.durationMs) || Number(ref.durationMs) < 2000)) throw new Error('参考视频或音频的实际时长未确认或不足 2 秒，请补全素材信息。');
        if (refs.reduce((sum, ref) => sum + Number(ref.durationMs), 0) > limits.maxDuration * 1000) throw new Error(`实际参考视频或音频总时长超过 ${limits.maxDuration} 秒。`);
    }
}
