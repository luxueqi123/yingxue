import type { CanvasNodeMetadata } from '../../types/canvas';

export function resolveImageBackgroundTransparency(metadata: CanvasNodeMetadata | undefined, fallback: string): string {
    if (metadata?.imageBackground !== undefined) return metadata.imageBackground === 'transparent' ? 'true' : 'false';
    return metadata?.transparentBackground ?? fallback;
}

export function imageBackgroundSelectionPatch(background: NonNullable<CanvasNodeMetadata['imageBackground']>): Partial<CanvasNodeMetadata> {
    return { imageBackground: background, transparentBackground: background === 'transparent' ? 'true' : 'false' };
}

export function imageTransparencyTogglePatch(metadata: CanvasNodeMetadata | undefined, value: string): Partial<CanvasNodeMetadata> {
    return metadata?.imageBackground === undefined
        ? { transparentBackground: value }
        : imageBackgroundSelectionPatch(value === 'true' ? 'transparent' : 'opaque');
}

export function mapLtvImageBackground(fields: Record<string, unknown>): CanvasNodeMetadata['imageBackground'] {
    if (fields.model !== 'lib-image-2.5-s' && fields.model !== 'lib-image-2.5-f') return undefined;
    const value = fields.background;
    return value === 'auto' || value === 'transparent' || value === 'opaque' ? value : undefined;
}

export function imageBackgroundTaskMetadata(metadata: CanvasNodeMetadata | undefined) {
    const background = metadata?.imageBackground;
    if (background === undefined) return {};
    if (!['auto', 'transparent', 'opaque'].includes(background)) throw new Error('图片背景参数无效，已停止生成。');
    return { providerOptions: { 'openai-image': { background } } };
}
