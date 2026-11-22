import type { CanvasNodeMetadata } from '../../types/canvas';
import { normalizeLtvVideoEnhancementFields } from './ltv-parameter-layers';
import { modelOptionName, resolveModelChannel, type AiConfig } from '../../stores/use-config-store';
import type { ReferenceVideo } from '../../types/media';
import { getMediaBlob } from '../../services/file-storage';
import { readUploadVideoSize } from './canvas-file-upload';

type Settings = NonNullable<CanvasNodeMetadata['videoEnhancement']>;
const tiers = { '1080p': 1920, '2K': 2560, '4K': 3840 } as const;

/**
 * 该节点自己声明的增强参数能否被宿主 topaz-video-enhance 合同等价承接（不含素材输入）。
 * 源 schema 的默认值在这里补齐：specifiedModel 缺省 prob-4、resolution 缺省 1080p、
 * fps 缺省 30、slowmo 缺省 1，与源 0zme995kos_wy.js 的提交默认一致。
 */
export function ltvTopazVideoDeclaredFieldsAreMapped(raw: Record<string, unknown>) {
    const fields = normalizeLtvVideoEnhancementFields(raw);
    if (fields.model !== 'topaz-video-upscaler') return false;
    const model = fields.specifiedModel ?? 'prob-4', resolution = fields.resolution ?? '1080p';
    const fps = Number(fields.fps ?? 30), slowmo = Number(fields.slowmo ?? 1);
    if (!['prob-4', 'apo-8'].includes(String(model)) || !Object.hasOwn(tiers, String(resolution))) return false;
    if (![24, 30, 60, 90, 120].includes(fps) || ![1, 2, 3, 5].includes(slowmo)) return false;
    // The source has an ambiguous non-interpolating slowmo record. Keep it
    // pending rather than ignore speed or invent interpolation for this mode.
    if (model === 'prob-4' && slowmo !== 1) return false;
    return true;
}

/** 参数合法时构造宿主合同选项；素材输入是否存在由调用方单独判定。 */
export function topazVideoContractOptions(raw: Record<string, unknown>): Partial<CanvasNodeMetadata> {
    const fields = normalizeLtvVideoEnhancementFields(raw);
    const model = fields.specifiedModel ?? 'prob-4', resolution = fields.resolution ?? '1080p';
    const fps = Number(fields.fps ?? 30), slowmo = Number(fields.slowmo ?? 1);
    return { videoEnhancement: { provider: 'topaz-video-enhance', model: model as Settings['model'], resolution: resolution as Settings['resolution'], fps: fps as Settings['fps'], slowmo: slowmo as Settings['slowmo'] }, ltvExecutionContract: 'topaz-video-enhance', count: 1, strictGenerationOptions: ['model', 'count'] };
}

export function mapLtvTopazVideoOptions(raw: Record<string, unknown>, counts: { image: number; video: number; audio: number }, count: number): Partial<CanvasNodeMetadata> | undefined {
    const fields = normalizeLtvVideoEnhancementFields(raw);
    if (fields.model !== 'topaz-video-upscaler' || counts.video !== 1 || counts.image || counts.audio || count !== 1) return;
    if (!ltvTopazVideoDeclaredFieldsAreMapped(raw)) return;
    return topazVideoContractOptions(raw);
}

export function assertTopazVideoConfig(metadata: CanvasNodeMetadata, config: AiConfig) {
    const settings = metadata.videoEnhancement;
    if (!settings || settings.provider !== 'topaz-video-enhance' || !['prob-4', 'apo-8'].includes(settings.model) || !Object.hasOwn(tiers, settings.resolution) || ![24,30,60,90,120].includes(settings.fps) || ![1,2,3,5].includes(settings.slowmo) || (settings.model === 'prob-4' && settings.slowmo !== 1)) throw new Error('视频增强参数不完整或慢放方式尚未适配。');
    const channel = resolveModelChannel(config, config.model);
    const model = modelOptionName(config.model);
    const protocol = channel.modelCosts?.find(item => item.model === model)?.protocol || channel.interfaceType;
    if (protocol !== 'topaz-video-enhance' || model !== settings.model || Number(config.count) !== 1) throw new Error('请选择对应的 Topaz 视频增强模型，且一次处理一段原片。');
}

/** Source pixel dimensions must come from decoded media, never canvas geometry. */
export function topazVideoProviderOptions(settings: Settings, source: { width: number; height: number; container: string }) {
    if (!Number.isSafeInteger(source.width) || !Number.isSafeInteger(source.height) || source.width < 1 || source.height < 1) throw new Error('需要先读取原片的真实像素尺寸。');
    if (!['mp4', 'mov', 'mkv', 'webm'].includes(source.container)) throw new Error('无法确认原片容器，请重新选择可识别的视频文件。');
    if (!Object.hasOwn(tiers, settings.resolution) || !['prob-4','apo-8'].includes(settings.model) || ![24,30,60,90,120].includes(settings.fps) || ![1,2,3,5].includes(settings.slowmo) || (settings.model === 'prob-4' && settings.slowmo !== 1)) throw new Error('视频增强模式或分辨率尚未适配。');
    const factor = Math.max(1, tiers[settings.resolution] / Math.max(source.width, source.height));
    const width = Math.ceil(source.width * factor / 4) * 4, height = Math.ceil(source.height * factor / 4) * 4;
    const filters: Array<Record<string, string | number>> = [{ model: 'prob-4' }];
    if (settings.model === 'apo-8') filters.push({ model: 'apo-8', fps: settings.fps, slowmo: settings.slowmo });
    return { topazVideo: { source: { container: source.container }, filters, output: { resolution: { width, height }, ...(settings.model === 'apo-8' ? { frameRate: settings.fps } : {}), audioTransfer: 'Copy', audioCodec: 'AAC', videoEncoder: 'H264', videoProfile: 'High', dynamicCompressionLevel: 'Low', container: 'mp4', cropToFit: false } } };
}

export async function topazVideoTaskMetadata(metadata: CanvasNodeMetadata | undefined, config: AiConfig, context: { referenceVideos: ReferenceVideo[]; referenceImages: unknown[]; referenceAudios: unknown[] }) {
    if (!metadata?.videoEnhancement && metadata?.ltvExecutionContract !== 'topaz-video-enhance') return {};
    assertTopazVideoConfig(metadata, config);
    if (context.referenceVideos.length !== 1 || context.referenceImages.length || context.referenceAudios.length) throw new Error('视频增强只处理一段原片，不能忽略其它连接的媒体。');
    const source = context.referenceVideos[0];
    const blob = source.storageKey ? await getMediaBlob(source.storageKey) : undefined;
    if (source.storageKey && !blob) throw new Error('原片本地缓存不存在，请重新选择素材。');
    if (!blob && !source.url) throw new Error('缺少原片地址。');
    const mime = (blob?.type || source.type || '').split(';')[0].toLowerCase();
    const byMime: Record<string, string> = { 'video/mp4': 'mp4', 'video/quicktime': 'mov', 'video/webm': 'webm', 'video/x-matroska': 'mkv' };
    const extension = /\.(mp4|mov|mkv|webm)(?:[?#]|$)/i;
    const container = byMime[mime] || (extension.exec(source.name)?.[1] || extension.exec(source.url)?.[1])?.toLowerCase();
    if (!container) throw new Error('无法识别原片容器，请重新选择 MP4、MOV、MKV 或 WebM 视频。');
    const [width, height] = await readUploadVideoSize(blob ? new File([blob], source.name || `source.${container}`, { type: mime }) : source.url);
    return { providerOptions: topazVideoProviderOptions(metadata.videoEnhancement!, { width, height, container }) };
}
