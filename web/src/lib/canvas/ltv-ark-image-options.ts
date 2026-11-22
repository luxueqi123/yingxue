import type { CanvasNodeMetadata } from '../../types/canvas';
import { readLtvSwitch } from './ltv-parameter-layers';

// 源工具 schema 实测（.local/cache/case-chain-audit/source-tool-spec.json，共 106 个源工具，959 份
// 快照里 440 个节点命中）：`sequential`（组图模式，switch，default 1，originalField "sequential"）
// 只出现在 seedream-4、seedream-4.5、seedream-5、jimeng-4.6 四个 image 工具中，实测值全部为 1。
// jimeng-4.6 不接：宿主 volcengine-jimeng-image 插件的 create.body 把 force_single 写成常量 true，
// 没有任何组图透传键，承接不了组图要求（继续按待适配处理，不当作舍弃）。
export const LTV_ARK_SEQUENTIAL_MODELS = ['seedream-4', 'seedream-4.5', 'seedream-5'] as const;

// 火山方舟官方文档（.local/cache/ark-image-doc.html：Doubao Seedream 5.0 / 4.5 / 4.0
// images/generations）：`sequential_image_generation`（string，默认 disabled，auto 开启组图）、
// `sequential_image_generation_options.max_images`（integer，默认 15，取值 [1,15]，仅 auto 生效）；
// 参考图数量 + 最终生成图片数量 <= 15 张；支持组图的模型是 Seedream 5.0 lite / 4.5 / 4.0。
export const LTV_ARK_SEQUENTIAL_MAX_IMAGES = 15;
export const LTV_ARK_SEQUENTIAL_REFERENCE_LIMIT = 14;

// 宿主 volcengine-ark-seedream 插件（plugin-packages/volcengine-ark-seedream/manifest.json）：
// create.body 没有 quality / resolution 字段；比例值由 arkSeedreamRatioSizes 换成 2K 像素，
// 但 WIDTHxHEIGHT 和 2k/3k/4k 均原样透传，插件不是仅支持 2K。
// Seedream 4.5 的 4K 表已与官方文档及冻结案例 171 的原输出核对；其它高档位保持门禁。
const LTV_ARK_LOSSLESS_TIERS = new Set(['', '2k']);
// Official image API 82379/1541523, Seedream 4.5 size table. Only ratios declared by
// the source tool are mapped. Do not use video UHD pixels or alter the source prompt.
const SEEDREAM_45_4K_SIZES: Readonly<Record<string, string>> = {
    '1:1': '4096x4096', '4:3': '4704x3520', '3:4': '3520x4704',
    '16:9': '5504x3040', '9:16': '3040x5504', '3:2': '4992x3328', '2:3': '3328x4992',
};

function verifiedHighResolutionSize(fields: Record<string, unknown>): string | undefined {
    const ratio = String(fields.ratio);
    return fields.model === 'seedream-4.5' && String(fields.quality ?? '').trim().toLowerCase() === '4k'
        && Object.hasOwn(SEEDREAM_45_4K_SIZES, ratio) ? SEEDREAM_45_4K_SIZES[ratio] : undefined;
}

export function ltvArkSequentialSourceModel(model: unknown): model is typeof LTV_ARK_SEQUENTIAL_MODELS[number] {
    return typeof model === 'string' && (LTV_ARK_SEQUENTIAL_MODELS as readonly string[]).includes(model);
}

/** 源节点保存了组图开关且开关为开；开关值既非真也非假（格式异常）时不放行。 */
export function ltvArkImageSequentialRequested(fields: Record<string, unknown>) {
    if (!ltvArkSequentialSourceModel(fields.model)) return false;
    const value = fields.sequential;
    if (value === undefined || value === null || value === '') return false;
    try { return readLtvSwitch(value); } catch { return false; }
}

/**
 * 组图开关能否落到宿主合同上（不含参考数量与生成数量，供 advanced-operation / 未映射字段白名单
 * 复用）。只有该节点的操作和清晰度档位都能被 volcengine-ark-seedream 等价承接时才返回 true；
 * 否则 `sequential` 继续作为未映射制作参数上报，绝不静默降档。
 */
export function ltvArkImageSequentialDeclared(fields: Record<string, unknown>) {
    if (!ltvArkImageSequentialRequested(fields)) return false;
    if (!['text2image', 'image2image'].includes(String(fields.modeType || ''))) return false;
    if (!LTV_ARK_LOSSLESS_TIERS.has(String(fields.quality ?? '').trim().toLowerCase()) && !verifiedHighResolutionSize(fields)) return false;
    // 宿主 volcengine-ark-seedream 插件的 create.body 没有 n / sample_count（imageCount 只是声明，
    // 模板里没有引用），组图模式下图片张数由模型在 max_images 内自行决定。源节点同时保存了
    // count>1（实测 71 个节点为 2 或 4）时，这个数量没有落点，不能当作已承接。
    return fields.count === undefined || fields.count === 1;
}

/** 该节点的组图要求能否被宿主完整承接；不能承接时返回 undefined，参数继续按未映射上报。 */
export function mapLtvArkImageSequential(fields: Record<string, unknown>, counts: { image: number; video: number; audio: number }, count: number): Partial<CanvasNodeMetadata> | undefined {
    if (!ltvArkImageSequentialDeclared(fields)) return undefined;
    if (counts.video || counts.audio) return undefined;
    // 官方约束：参考图数量 + 生成图片数量 <= 15。max_images 取 15 是本次请求的上界，
    // 不是源 `count`（源 count 是"单张输出数量"，语义不同，实测 369 个节点为 1）。
    if (counts.image > LTV_ARK_SEQUENTIAL_REFERENCE_LIMIT) return undefined;
    if (!Number.isInteger(count) || count < 1 || count > LTV_ARK_SEQUENTIAL_MAX_IMAGES) return undefined;
    const size = verifiedHighResolutionSize(fields);
    return { ...(size ? { size } : {}), arkImageSequential: { provider: 'volcengine-ark-image', maxImages: LTV_ARK_SEQUENTIAL_MAX_IMAGES } };
}

export function assertArkImageSequentialConfig(metadata: CanvasNodeMetadata) {
    const sequential = metadata.arkImageSequential;
    if (!sequential || sequential.provider !== 'volcengine-ark-image' || sequential.maxImages !== LTV_ARK_SEQUENTIAL_MAX_IMAGES) {
        throw new Error('组图参数无效，请检查节点的组图设置。');
    }
    // 官方约束"参考图数量 + 最终生成图片数量 <= 15"里，最终张数由模型在 max_images 内自行决定，
    // 提交前唯一能核对的是参考图数量不得超过 14（多图生组图上限）。
    const references = metadata.ltvReferencePlan?.references.filter(ref => ref.kind === 'image').length ?? 0;
    if (references > LTV_ARK_SEQUENTIAL_REFERENCE_LIMIT) throw new Error('组图请求的参考图数量超出火山方舟上限，已停止生成。');
}

/** 形状对齐 videoSearchTaskMetadata / klingTaskMetadata / topazImageTaskMetadata，供执行器与重试共用。 */
export function arkImageTaskMetadata(metadata: CanvasNodeMetadata | undefined) {
    if (metadata?.arkImageSequential === undefined) return {};
    assertArkImageSequentialConfig(metadata);
    return {
        providerOptions: {
            'volcengine-ark-image': {
                sequential_image_generation: 'auto',
                sequential_image_generation_options: { max_images: metadata.arkImageSequential.maxImages },
            },
        },
    };
}
