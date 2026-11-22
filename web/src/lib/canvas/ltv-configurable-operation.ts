import type { CanvasNodeMetadata } from '../../types/canvas';
import { readLtvSwitch } from './ltv-parameter-layers';
import { configurableArkVideoSearch } from './ark-video-search';
import { mapLtvHailuoOptions } from './ltv-hailuo-options';
import { mapLtvViduQ2 } from './ltv-viduq2';
import { mapLtvKlingOptions } from './ltv-kling-options';
import { mapLtvVolcanoVideoEnhance } from './ltv-volcano-video-enhance';
import { mapLtvSubtitleErase } from './ltv-subtitle-erase';
import { mapLtvOmniHuman } from './ltv-omnihuman';
import { mapLtvHappyHorseReferences, mapLtvHappyHorseFirstFrame, mapLtvHappyHorseText } from './ltv-happyhorse-options';
import { mapLtvTopazImageOptions, ltvTopazImageRequestIsMapped, topazImageContractOptions } from './ltv-topaz-image';
import { mapLtvTopazVideoOptions, ltvTopazVideoDeclaredFieldsAreMapped, topazVideoContractOptions } from './ltv-topaz-video';
import { mapLtvArkImageSequential } from './ltv-ark-image-options';
import { isLtvWanxPromptExtendModel, LTV_WANX_PROMPT_EXTEND_CONTRACT, mapLtvWanxPromptExtend } from './ltv-wanx-options';

type Counts = { image: number; video: number; audio: number };

/** Only operations with an existing host submission contract can wait for configuration. */
export function configurableLtvOperation(kind: string, operation: string, fields: Record<string, any>, counts: Counts, count: number, schemaDeclaresQuality = true): Partial<CanvasNodeMetadata> | undefined {
    if(kind==='video'&&fields.model==='volcano-subtitle-eraser')return mapLtvSubtitleErase(fields,counts,count);
    if(kind==='video'&&/^vidu/i.test(String(fields.model)))return mapLtvViduQ2({...fields,modeType:operation},counts,count);
    if(kind==='video'&&String(fields.model).startsWith('omnihuman-'))return mapLtvOmniHuman({...fields,modeType:operation},counts,count);
    if(kind==='video'&&fields.model==='volcano-video-upscaler')return mapLtvVolcanoVideoEnhance(fields,counts,count);
    // 增强节点的参数映射与素材绑定是两件事：参数本身可承接、只是原片还没绑定时，这里要回合同选项，
    // 让节点落 channel-configuration-required（等渠道）而不是 model-selection-required（误报为能力缺口）。
    // 已发布 342 份工程里"参数可承接但无素材"的 topaz 节点为 0（.local/cache/w1103-out.txt），
    // 所以这条兜底不改变任何已发布工程。
    if (kind === 'image' && fields.model === 'topaz-image-upscaler') return mapLtvTopazImageOptions(fields, counts, count)
        ?? (count === 1 && !counts.image && !counts.video && !counts.audio && ltvTopazImageRequestIsMapped(fields) ? topazImageContractOptions(fields) : undefined);
    if (kind === 'video' && fields.model === 'topaz-video-upscaler') return mapLtvTopazVideoOptions(fields, counts, count)
        ?? (count === 1 && !counts.image && !counts.video && !counts.audio && ltvTopazVideoDeclaredFieldsAreMapped(fields) ? topazVideoContractOptions(fields) : undefined);
    try {
        if (kind === 'video' && /^happy-?horse-/i.test(String(fields.model))) return operation === 'frames2video'
            ? mapLtvHappyHorseFirstFrame({ ...fields, modeType: operation }, counts, count)
            : operation === 'text2video' ? mapLtvHappyHorseText({ ...fields, modeType: operation }, counts, count)
            : mapLtvHappyHorseReferences({ ...fields, modeType: operation }, counts, count);
        // Keep unverified Kling versions out of the generic video fallback.
        if(kind==='video'&&/^kling-/.test(String(fields.model)))return mapLtvKlingOptions({...fields,modeType:operation},counts,count);
        // Each Hailuo version uses its verified V1 or V2 contract; an unsupported
        // request cannot fall through into another provider or model version.
        if(kind==='video'&&/^MiniMax-Hailuo-/.test(String(fields.model)))return mapLtvHailuoOptions({...fields,modeType:operation},counts,count);
        // Source `search_enabled` is a saved switch, not an implicit part of the Seedance contract:
        // a node that turned it off submits the same request without the `tools` entry, so the
        // switch value is carried into the contract options instead of forcing it on.
        // 关闭联网的 star-video2.5 节点过去落到下面的 artdance25 兜底，而该兜底硬性只收 4–15 秒；
        // 保存了更长时长的节点因此没有落点。实测 2026-09-19：c8f8bd5d 的 v-xBadwcu44C 保存
        // search_enabled=0 / duration=25 / 21:9 / 720p，四条参考图加一条 2.04 秒参考视频，
        // artdance25 因时长越界返回 undefined，而 Seedance 合同最长 30 秒且声明 21:9。
        // 这里只在兜底本身就接不住（时长 > 15）时才改走 Seedance 合同，已发布工程里
        // 时长 ≤ 15 的 star-video2.5 节点仍走原路径，映射结果不变。
        if (kind === 'video' && fields.model === 'star-video2.5'
            && !fields.search_enabled && !fields.searchEnabled && !fields.searchable
            && Number(fields.duration) > 15) return configurableArkVideoSearch({ ...fields, modeType: operation }, counts, count, schemaDeclaresQuality, false);
        if (kind === 'video' && [fields.search_enabled, fields.searchEnabled, fields.searchable].map(readLtvSwitch).some(Boolean)) return configurableArkVideoSearch({ ...fields, modeType: operation }, counts, count, schemaDeclaresQuality);
    } catch { return; }
    const ratio = String(fields.ratio || (kind === 'image' ? '1:1' : ''));
    const match = /^(\d+):(\d+)$/.exec(ratio);
    // 源 schema（nebula-ultra / nebula-2-flash / lib-image-2）把 ratio 的 "auto"（自适应）列为合法枚举，
    // 宿主 gemini-image 合同的 size.values 同样声明 auto，buildGeminiImageGenerationConfig 对 auto 的
    // 行为就是省略 aspectRatio，因此图像联网分支按该合同承接 auto，不把 auto 猜成某个具体比例。
    // 非联网 nebula 节点也可保留这个合同；OpenAI 像素尺寸和视频画幅仍要求显式宽高比。
    const autoRatio = kind === 'image' && /^auto$/i.test(ratio);
    if (!match && !autoRatio) return;
    if (match && ![Number(match[1]), Number(match[2])].every(value => Number.isSafeInteger(value) && value > 0 && value <= 100)) return;
    if (!Number.isInteger(count) || count < 1) return;
    let search: boolean, generateAudio: boolean;
    try {
        search = [fields.search_enabled, fields.searchEnabled, fields.searchable].map(readLtvSwitch).some(Boolean);
        generateAudio = readLtvSwitch(fields.enableSound);
    } catch { return; }
    if (search && kind !== 'image') return;
    const plainAutoImage = autoRatio && !search && ['nebula-ultra', 'nebula-2-flash'].includes(fields.model);
    if (kind === 'image' && (search || plainAutoImage)) {
        const tier = String(fields.resolution || fields.quality || '1K').toUpperCase();
        if (!['text2image', 'image2image'].includes(operation) || counts.video || counts.audio || counts.image > 14 || count > 15) return;
        if (!['1K', '2K', '4K'].includes(tier) || !['auto','1:1','2:3','3:2','3:4','4:3','4:5','5:4','9:16','16:9','21:9'].includes(ratio)) return;
        if (fields.quality && !['1K','2K','4K'].includes(String(fields.quality).toUpperCase())) return;
        if (fields.quality && fields.resolution && String(fields.quality).toUpperCase() !== tier) return;
        return { size: ratio, quality: ({'1K':'low','2K':'medium','4K':'high'} as const)[tier as '1K'|'2K'|'4K'], count,
            ...(search ? { imageGrounding: { provider: 'google-search' as const } } : {}),
            ltvExecutionContract: search ? 'gemini-image-search' : 'gemini-image', strictGenerationOptions: ['model','size','quality','count'] };
    }
    if (kind === 'image' && match && ['text2image', 'image2image'].includes(operation) && !counts.video && !counts.audio && count <= 15) {
        let size = ratio;
        const tier = String(fields.resolution || (/^[124]K$/.test(String(fields.quality)) ? fields.quality : ''));
        if (tier) {
            const pixels = ({ '1K': 1024 ** 2, '2K': 2048 ** 2, '4K': 3840 * 2160 } as Record<string, number>)[tier];
            if (!pixels) return;
            const a = Number(match[1]), b = Number(match[2]);
            const factor = Math.ceil(Math.sqrt(pixels / (a * b)) / 16) * 16;
            size = `${a * factor}x${b * factor}`;
        }
        if (fields.quality && !['1K', '2K', '4K', 'low', 'medium', 'high', 'auto'].includes(fields.quality)) return;
        const base = { size, quality: ['low','medium','high','auto'].includes(fields.quality) ? fields.quality : 'high', count,
            ltvExecutionContract: 'openai-image', strictGenerationOptions: ['model', 'size', 'quality', 'count'] } as Partial<CanvasNodeMetadata>;
        // 组图（Seedream 组图模式）：宿主 volcengine-ark-seedream 插件已具备
        // sequential_image_generation 透传，所以保留组图要求等待配置火山方舟 Seedream 渠道；
        // 不能退回 openai-image 合同，否则提交时组图要求会被静默丢掉。
        // 组图（Seedream 组图模式）：宿主 volcengine-ark-seedream 插件已具备
        // sequential_image_generation 透传，所以保留组图要求等待配置火山方舟 Seedream 渠道；
        // 不能退回 openai-image 合同，否则提交时组图要求会被静默丢掉。
        const ark = mapLtvArkImageSequential(fields, counts, count);
        return ark ? { ...base, ...ark, ltvExecutionContract: 'ark-image-sequential' } : base;
    }
    const modes: Record<string, string> = { text2video: 'text_to_video', singleImage2video: 'image_to_video', image2video: 'image_to_video', frames2video: 'image_to_video', mixed2video: 'reference_to_video' };
    const seconds = Number(fields.duration), resolution = String(fields.resolution).toLowerCase();
    if (kind !== 'video' || count !== 1 || !modes[operation] || !['480p','720p','1080p'].includes(resolution) || !Number.isInteger(seconds) || seconds < 4 || seconds > 15) return;
    if (!['16:9','9:16','1:1','4:3','3:4','21:9'].includes(ratio) || fields.quality) return;
    if (counts.image > 30 || counts.video > 10 || counts.audio > 10) return;
    if (operation === 'frames2video' && (counts.image < 1 || counts.image > 2 || counts.video || counts.audio)) return;
    if (operation === 'singleImage2video' && (counts.image !== 1 || counts.video || counts.audio)) return;
    if (operation === 'text2video' && (counts.image || counts.video || counts.audio)) return;
    if (operation === 'image2video' && (!counts.image || counts.video || counts.audio)) return;
    const videoOptions: Partial<CanvasNodeMetadata> = { size: ratio, seconds: String(seconds), vquality: resolution, count: 1,
        generateAudio: generateAudio ? 'true' : 'false',
        videoEditOperation: modes[operation] as CanvasNodeMetadata['videoEditOperation'],
        ltvExecutionContract: 'artdance25', strictGenerationOptions: ['model','size','seconds','vquality','generateAudio','count'] };
    if (isLtvWanxPromptExtendModel(fields.model)) {
        const wanx = mapLtvWanxPromptExtend(fields);
        if (!wanx) return undefined;
        return { ...videoOptions, wanxPromptExtend: wanx.wanxPromptExtend, ltvExecutionContract: LTV_WANX_PROMPT_EXTEND_CONTRACT };
    }
    return videoOptions;
}
