import type { CanvasNodeMetadata } from '../../types/canvas';
import type { ReferenceImage } from '../../types/image';
import { modelOptionName, resolveModelChannel, type AiConfig } from '../../stores/use-config-store';
import { readLtvSwitch } from './ltv-parameter-layers';

export const TOPAZ_IMAGE_MODELS = ['Standard V2', 'Low Resolution V2', 'CGI', 'High Fidelity V2', 'Text Refine'] as const;
type Enhancement = NonNullable<CanvasNodeMetadata['imageEnhancement']>;

export function mapLtvTopazImageOptions(fields: Record<string, unknown>, counts: { image: number; video: number; audio: number }, count: number): Partial<CanvasNodeMetadata> | undefined {
    if (fields.model !== 'topaz-image-upscaler' || counts.image !== 1 || counts.video || counts.audio || count !== 1) return;
    if ([fields.ratio, fields.resolution, fields.quality].some(value => value !== undefined && value !== '')) return;
    try { if ([fields.search_enabled, fields.searchEnabled, fields.searchable].some(readLtvSwitch)) return; } catch { return; }
    if (!ltvTopazImageDeclaredFieldsAreMapped(fields)) return;
    return topazImageContractOptions(fields);
}

/**
 * 该节点自己声明的增强参数对应的宿主合同选项（不含素材输入）。源 schema 的默认值在这里补齐：
 * style 缺省 Standard V2、scale 缺省 2，与源提交默认一致。
 */
export function topazImageContractOptions(fields: Record<string, unknown>): Partial<CanvasNodeMetadata> {
    const model = fields.style === undefined ? 'Standard V2' : fields.style;
    const scale = fields.scale === undefined ? 2 : fields.scale;
    return { imageEnhancement: { provider: 'topaz-image-enhance', model: model as Enhancement['model'], scale: Number(scale) as Enhancement['scale'] },
        ltvExecutionContract: 'topaz-image-enhance', count: 1, size: 'auto', strictGenerationOptions: ['model', 'count'] };
}

/**
 * Reports whether `style`/`scale` on a topaz-image-upscaler node are values the host contract
 * can carry. The node may still be missing its upstream original image; that is a separate
 * missing-input condition, and these two declared parameters must not be reported as unmapped
 * merely because no image is bound yet.
 */
export function ltvTopazImageDeclaredFieldsAreMapped(fields: Record<string, unknown>) {
    if (fields.model !== 'topaz-image-upscaler') return false;
    const model = fields.style === undefined ? 'Standard V2' : fields.style;
    const scale = fields.scale === undefined ? 2 : fields.scale;
    if (typeof model !== 'string' || !TOPAZ_IMAGE_MODELS.includes(model as Enhancement['model'])) return false;
    if (![2, 4, 6].includes(Number(scale))) return false;
    return typeof scale === 'number' || ['2', '4', '6'].includes(String(scale));
}

/**
 * 该节点的整份增强请求能否被宿主 topaz-image-enhance 等价承接，**不含原图是否存在**。
 * 源 schema 只声明 style/scale，适配层还会挡掉它承接不了的 ratio/resolution/quality 与联网开关；
 * 这些条件与素材输入无关，所以原图缺失时参数仍然算已映射，只把输入缺口单独上报。
 */
export function ltvTopazImageRequestIsMapped(fields: Record<string, unknown>) {
    if (!ltvTopazImageDeclaredFieldsAreMapped(fields)) return false;
    if ([fields.ratio, fields.resolution, fields.quality].some(value => value !== undefined && value !== '')) return false;
    try { if ([fields.search_enabled, fields.searchEnabled, fields.searchable].some(readLtvSwitch)) return false; } catch { return false; }
    return true;
}

export function assertTopazImageOptions(options: Enhancement | undefined): asserts options is Enhancement {
    if (!options || options.provider !== 'topaz-image-enhance' || !TOPAZ_IMAGE_MODELS.includes(options.model) || ![2, 4, 6].includes(options.scale)) {
        throw new Error('图像增强需要有效的 Topaz 模型和 2、4 或 6 倍放大参数。');
    }
}

export function assertTopazImageConfig(metadata: CanvasNodeMetadata, config: AiConfig) {
    assertTopazImageOptions(metadata.imageEnhancement);
    if (metadata.imageGrounding) throw new Error('Topaz 图像增强不支持联网生图参数，不能忽略该制作要求。');
    const channel = resolveModelChannel(config, config.model);
    const model = modelOptionName(config.model);
    const protocol = channel.modelCosts?.find(item => item.model === model)?.protocol || channel.interfaceType;
    if (protocol !== 'topaz-image-enhance' || model !== metadata.imageEnhancement.model || Number(config.count) !== 1) {
        throw new Error('此图像增强步骤需要选择对应的 Topaz 模型，每次处理一张原图，不能替换为普通生图模型。');
    }
}

export async function hydrateTopazImageReferences(metadata: CanvasNodeMetadata | undefined, images: ReferenceImage[]): Promise<ReferenceImage[]> {
    if (metadata?.ltvExecutionContract !== 'topaz-image-enhance' && !metadata?.imageEnhancement) return images;
    if (images.length !== 1) throw new Error('Topaz 图像增强需要一张原图。');
    const { imageToDataUrl } = await import('../../services/image-storage');
    const { readUploadImageSize } = await import('./canvas-file-upload');
    const dataUrl = await imageToDataUrl(images[0]);
    if (!dataUrl.startsWith('data:image/')) throw new Error('无法读取图像增强的原图内容。');
    const response = await fetch(dataUrl);
    if (!response.ok) throw new Error('无法解码图像增强的原图内容。');
    const blob = await response.blob();
    const dimensions = await readUploadImageSize(new File([blob], images[0].name || 'original', { type: blob.type }));
    return [{ ...images[0], dataUrl, bytes: blob.size, ...dimensions }];
}

export function assertTopazMediaInputs(metadata: CanvasNodeMetadata | undefined, context: { referenceVideos?: unknown[]; referenceAudios?: unknown[] } | null | undefined) {
    if ((metadata?.imageEnhancement || metadata?.ltvExecutionContract === 'topaz-image-enhance') && (context?.referenceVideos?.length || context?.referenceAudios?.length)) {
        throw new Error('图像增强不能接收音视频参考，请移除这些连接后再提交。');
    }
}

/** Dimensions come from hydrated generation inputs, never the source case thumbnail or canvas geometry. */
export function topazImageTaskMetadata(metadata: CanvasNodeMetadata | undefined, config: AiConfig, images: ReferenceImage[]) {
    if (metadata?.ltvExecutionContract !== 'topaz-image-enhance' && !metadata?.imageEnhancement) return {};
    assertTopazImageConfig(metadata, config);
    if (images.length !== 1 || !(images[0].dataUrl || images[0].url)) throw new Error('Topaz 图像增强需要一张可读取的原图。');
    const { width, height } = images[0];
    if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || Number(width) < 1 || Number(height) < 1) {
        throw new Error('原图像素尺寸尚未读取，不能根据封面或画布显示尺寸推算放大结果。');
    }
    const scale = metadata.imageEnhancement!.scale;
    const outputWidth = Number(width) * scale, outputHeight = Number(height) * scale;
    if (!Number.isSafeInteger(outputWidth) || !Number.isSafeInteger(outputHeight)) throw new Error('放大后的图像尺寸超出有效范围。');
    return { providerOptions: { 'topaz-image-enhance': { output_width: outputWidth, output_height: outputHeight } } };
}
