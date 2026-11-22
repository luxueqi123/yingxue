/**
 * 保存的 modeType 与模型 schema 不一致时的重算（对应源包 2nkeqbyl30agw.js 的 y()/S()/b()/_()/C()/A()）。
 *
 * 源工程里的 `modeType` 是作者当年选过的值；作者后来换过模型时，旧值会作为历史残留留在工程里。
 * 实测（.local/cache/w1619/source-tools.json，47 个相关源模型）：`kling-video-o3` 的 schema 只声明
 * frames2video[2,2] / singleImage2video[1,1] / audio2video[0,0]，但归档工程里有节点写着
 * `text2video` 或 `image2video`（.local/cache/case-chain-audit 全量 1024 份快照）。源前端提交前会
 * 按 schema 实际可见且可用的模态集合重算一次（A()），所以适配层按保存值直译会把作者自己的参数
 * 判成"没有落点"。
 *
 * 判定规则（严格对应源 `z()` + `A()`，只动"换模型留下的残留模态"）：
 * 1. 保存值仍在该模型 schema 声明里 → 一律保持原值。源 `z()` 的 `o.some(t=>t.key===e.modeType)`
 *    就是这个短路；声明了却与素材数量对不上是该模型自己的取值范围问题，不是历史残留；
 * 2. 只有保存值不在 schema 声明里、且节点确实带了素材时才重算。素材为空的残留值保持原值上报：
 *    源 `A()` 在零素材分支里最终也回到 `text2video`，改写它没有依据，而全量 1024 份里这种节点
 *    有 368 份案例、绝大多数本就是纯文生；
 * 3. 重算按源 `A()` 的优先级：候选 = "除 text2video 外、可见且可用"的声明模态；
 *    图和视频同时有 → mixed2video 优先、其次 videoEdit2video；只有视频 → videoEdit2video/video2video；
 *    否则 mixed2video 优先（`A()` 末尾 `r.find(mixed2video) ? "mixed2video" : r[0]`），再退回候选首个；
 * 4. 模态区间 `[0,0]`（audio2video 这类）在源界面不可见，不参与候选（源 `y()`：`0 === n[1]` 时不显示）；
 * 5. 没有源 schema 时一律保持原值。
 */

type Counts = { image: number; video: number; audio: number };

/** 每个模态读取的素材列表（源包 l 数组的 listKey）。 */
const MODE_LIST: Record<string, string | null> = { text2video: null, singleImage2video: 'imageList', frames2video: 'imageList', image2video: 'imageList', video2video: 'videoList', videoEdit2video: 'videoList', audio2video: 'audioList', mixed2video: 'mixedList', longVideo2video: 'mixedList' };

type ModeConfig = { videoMax?: number; imageMax?: number; imageMaxWithVideo?: number; audioMax?: number };
export type LtvModeSchema = { items: Record<string, [number, number]>; mixed2videoConfig?: ModeConfig; videoEdit2videoConfig?: ModeConfig; excludeModeTypes: string[] };

const record = (value: unknown): Record<string, any> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, any> : {};
const bounds = (value: unknown): [number, number] | null => Array.isArray(value) && value.length === 2 && value.every(item => typeof item === 'number') ? [value[0], value[1]] : null;

/** 从源工具 schema（source-tool-spec.json 的一项）读模态区间表；没有声明返回 null。 */
export function readLtvModeSchema(schemaValue: unknown): LtvModeSchema | null {
    const schema = record(schemaValue), properties = record(schema.properties);
    const items: Record<string, [number, number]> = {};
    for (const [key, value] of Object.entries(record(record(properties.modeType).items))) {
        const range = bounds(value);
        if (range) items[key] = range;
    }
    if (!Object.keys(items).length) return null;
    const mixed = record(properties.mixed2videoConfig), edit = record(properties.videoEdit2videoConfig);
    return { items,
        ...(Object.keys(mixed).length ? { mixed2videoConfig: mixed as ModeConfig } : {}),
        ...(Object.keys(edit).length ? { videoEdit2videoConfig: edit as ModeConfig } : {}),
        excludeModeTypes: (Array.isArray(record(schema.config).excludeModeTypes) ? record(schema.config).excludeModeTypes : []).filter((item: unknown): item is string => typeof item === 'string') };
}

/** 源 C() 的 visible && enabled：该模态声明的素材区间与该节点实际素材是否一致。 */
function modeAcceptsMedia(schema: LtvModeSchema, key: string, counts: Counts): boolean {
    const range = schema.items[key];
    if (!range || range[1] <= 0 || schema.excludeModeTypes.includes(key)) return false;
    const listKey = MODE_LIST[key];
    const [min, max] = range;
    const effectiveMax = key === 'videoEdit2video' && schema.videoEdit2videoConfig?.videoMax !== undefined ? Math.min(max, schema.videoEdit2videoConfig.videoMax) : max;
    const used = listKey === 'imageList' ? counts.image : listKey === 'videoList' ? counts.video : listKey === 'audioList' ? counts.audio
        : listKey === 'mixedList' ? counts.image + counts.video + counts.audio : 0;
    if (used < min || used > effectiveMax) return false;
    const config = key === 'mixed2video' ? schema.mixed2videoConfig : key === 'videoEdit2video' ? schema.videoEdit2videoConfig : undefined;
    if (config) {
        if (config.videoMax !== undefined && counts.video > config.videoMax) return false;
        if (config.imageMax !== undefined && counts.image > config.imageMax) return false;
        if (counts.video > 0 && config.imageMaxWithVideo !== undefined && counts.image > config.imageMaxWithVideo) return false;
    }
    return true;
}

/** 保存的模态在不在该模型 schema 声明里（换模型后它可能只属于上一个模型）。 */
export function ltvModeTypeIsDeclared(saved: string, schema: LtvModeSchema | null): boolean {
    if (!schema) return true;
    return Object.hasOwn(schema.items, saved) && schema.items[saved][1] > 0;
}

/**
 * 保存值是该模型 schema 未声明的残留模态、且节点带着素材时，按源 `A()` 重算落点。
 * 返回 undefined 表示"保持原值上报"（作者选择可用、没有素材、或重算结果与原值相同）。
 */
export function resolveLtvStaleModeType(saved: string, counts: Counts, schema: LtvModeSchema | null): string | undefined {
    if (!schema || !saved) return undefined;
    if (ltvModeTypeIsDeclared(saved, schema)) return undefined;
    if (!counts.image && !counts.video && !counts.audio) return undefined;
    const candidates = Object.keys(schema.items).filter(key => key !== 'text2video' && modeAcceptsMedia(schema, key, counts));
    if (!candidates.length) return undefined;
    // 源 `C()` 与 `_()` 还有一道"素材组合必须被某个模态承接"的闸门：节点上每个非空素材列表，
    // 都要有某个模态把那个列表算进自己的区间，否则该组合一律判为不可用（源里这条让候选整体作废，
    // 于是 `A()` 退回 `text2video`——那等于删掉作者素材，适配层改为保持原值上报）。
    // 实测 2026-09-18：少了这道闸门，`case-95684171` 的 star-video2 `video2video` 节点
    // （videoList 1 条）会被候选里的 `audio2video[0,3]`（audio 为 0 也算区间内）抢走，
    // 把一个视频编辑节点改判成音频生成，并让它从已定论舍弃族掉回待适配。
    const lists: Array<[string, number]> = [['imageList', counts.image], ['videoList', counts.video], ['audioList', counts.audio]];
    const covered = new Set(candidates.map(key => MODE_LIST[key]));
    if (lists.some(([listKey, used]) => used > 0 && !covered.has(listKey))) return undefined;
    let best: string | undefined;
    if (counts.image && counts.video && candidates.includes('mixed2video')) best = 'mixed2video';
    else if (counts.image && counts.video) best = candidates.find(key => key === 'videoEdit2video' || key === 'video2video');
    else if (counts.video && !counts.image) best = candidates.find(key => key === 'videoEdit2video' || key === 'video2video');
    best ??= candidates.includes('mixed2video') ? 'mixed2video' : candidates[0];
    return best === saved ? undefined : best;
}

/**
 * 该模型的源 schema 是否声明了 `quality`。源前端只按 schema 过滤"其它模态声明的字段"，
 * 未声明的字段会作为历史残留留在工程里，不参与该模型的提交，也不应据此判成"档位没有落点"。
 * schema 缺失（未归档该工具定义）时返回 true，保持原有判定，不放宽。
 */
export function ltvSchemaDeclaresQuality(schemaValue: unknown): boolean {
    if (!schemaValue || typeof schemaValue !== 'object') return true;
    return Object.hasOwn(record(record(schemaValue).properties), 'quality');
}
