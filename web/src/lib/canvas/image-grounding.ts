import type { CanvasNodeMetadata } from '../../types/canvas';
import { modelOptionName, resolveModelChannel, type AiConfig } from '../../stores/use-config-store';

/** Forward the explicit setting, never arbitrary node metadata. */
export function imageGroundingTaskMetadata(metadata: CanvasNodeMetadata | undefined, config: AiConfig) {
    if (!metadata?.imageGrounding) return {};
    const channel = resolveModelChannel(config, config.model);
    const model = modelOptionName(config.model);
    const protocol = channel.modelCosts?.find(item => item.model === model)?.protocol || channel.interfaceType;
    if (metadata.imageGrounding.provider !== 'google-search' || protocol !== 'gemini-image' || !/^gemini-(3-pro|3\.1-flash)-image(?:-preview)?$/.test(model)) throw new Error('此案例需要支持 Google 联网辅助的 Gemini 图片模型，已停止生成。');
    return { providerOptions: { 'gemini-image': { googleSearch: true } } };
}
