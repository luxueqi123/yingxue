import type { CanvasNodeMetadata } from '../../types/canvas';
import { readLtvSwitch } from './ltv-parameter-layers';

export const LTV_WANX_PROMPT_EXTEND_PROVIDER = 'dashscope-wan-video';
export const LTV_WANX_PROMPT_EXTEND_CONTRACT = 'wanx-prompt-extend';
export const LTV_WANX_PROMPT_EXTEND_MODELS = ['wanx3.0', 'wanx3.0-prime'] as const;

const LTV_WANX_PROMPT_EXTEND_DEFAULT = 1;
const SOURCE_SWITCH_VALUES = new Set(['boolean', 'number', 'string']);

type LtvWanxPromptExtendMapping = {
    wanxPromptExtend: NonNullable<CanvasNodeMetadata['wanxPromptExtend']>;
    consumed: Set<string>;
};

function record(value: unknown): Record<string, unknown> {
    return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

export function isLtvWanxPromptExtendModel(model: unknown): model is typeof LTV_WANX_PROMPT_EXTEND_MODELS[number] {
    return typeof model === 'string' && (LTV_WANX_PROMPT_EXTEND_MODELS as readonly string[]).includes(model);
}

/** Source Wanx 3.0 tools default `extendPrompt` to 1; preserve explicit values and default provenance. */
export function mapLtvWanxPromptExtend(fields: Record<string, unknown>, advancedValue: unknown = fields): LtvWanxPromptExtendMapping | undefined {
    if (!isLtvWanxPromptExtendModel(fields.model)) return undefined;
    const advanced = record(advancedValue);
    const hasAdvancedValue = Object.hasOwn(advanced, 'extendPrompt');
    const hasFlatValue = Object.hasOwn(fields, 'extendPrompt');
    const hasSavedValue = hasAdvancedValue || hasFlatValue;
    const sourceValue = hasAdvancedValue ? advanced.extendPrompt : hasFlatValue ? fields.extendPrompt : LTV_WANX_PROMPT_EXTEND_DEFAULT;
    if (!SOURCE_SWITCH_VALUES.has(typeof sourceValue)) return undefined;
    let enabled: boolean;
    try {
        enabled = readLtvSwitch(sourceValue);
    } catch {
        return undefined;
    }
    return {
        wanxPromptExtend: {
            provider: LTV_WANX_PROMPT_EXTEND_PROVIDER,
            enabled,
            sourceValue: sourceValue as boolean | number | string,
            sourceDefaulted: !hasSavedValue,
        },
        consumed: new Set(hasSavedValue ? ['extendPrompt'] : []),
    };
}

export function assertWanxPromptExtendConfig(metadata: CanvasNodeMetadata) {
    const options = metadata.wanxPromptExtend;
    if (metadata.ltvExecutionContract !== LTV_WANX_PROMPT_EXTEND_CONTRACT
        || !options
        || options.provider !== LTV_WANX_PROMPT_EXTEND_PROVIDER
        || typeof options.enabled !== 'boolean'
        || typeof options.sourceDefaulted !== 'boolean'
        || !SOURCE_SWITCH_VALUES.has(typeof options.sourceValue)) {
        throw new Error('Wanx 智能扩写参数无效，请重新导入制作节点。');
    }
    if (options.sourceDefaulted) {
        if (options.sourceValue !== LTV_WANX_PROMPT_EXTEND_DEFAULT || options.enabled !== true) {
            throw new Error('Wanx 智能扩写默认值与源 schema 不一致，已停止生成。');
        }
    } else {
        let expected: boolean;
        try {
            expected = readLtvSwitch(options.sourceValue);
        } catch {
            throw new Error('Wanx 智能扩写源开关无效，已停止生成。');
        }
        if (expected !== options.enabled) throw new Error('Wanx 智能扩写映射与源开关不一致，已停止生成。');
    }
}

/** Map the persisted source option onto the DashScope Wan provider namespace at task creation. */
export function wanxVideoTaskMetadata(metadata: CanvasNodeMetadata | undefined) {
    if (metadata?.wanxPromptExtend === undefined) return {};
    assertWanxPromptExtendConfig(metadata);
    return {
        providerOptions: {
            [LTV_WANX_PROMPT_EXTEND_PROVIDER]: {
                prompt_extend: metadata.wanxPromptExtend.enabled,
            },
        },
    };
}
