import type { CanvasNodeMetadata } from '../../types/canvas';
import type { LtvReferencePlan } from './ltv-reference-plan';
import type { ReferenceImage } from '../../types/image';
import type { CanvasNodeData } from '../../types/canvas';

export type LtvMaskEdit = {
    scene: 'erase' | 'redraw';
    sourceUrl: string;
    maskUrl: string;
    sourceQuality: '2K' | '4K';
    outputSize: string;
};

const httpsImage = (value: unknown): value is string => {
    if (typeof value !== 'string') return false;
    try { return new URL(value).protocol === 'https:'; } catch { return false; }
};
const imageMedia = (value: unknown): value is string => httpsImage(value) || typeof value === 'string' && (/^\/production-library\/(?!\/)[^?#]+$/.test(value) || /^\/api\/resources\/[A-Za-z0-9_-]+\/file$/.test(value));
const maskRatios = new Set(['1:1', '9:16', '16:9', '3:4', '4:3', '3:2', '2:3', '4:5', '5:4', '21:9']);
const maskQuality = (value: unknown): value is LtvMaskEdit['sourceQuality'] => value === '2K' || value === '4K';

/** Source edit handlers submit originImage directly, without requiring a saved imageList. */
export function restoreLtvStandaloneMaskInput(fields: Record<string, unknown>): Record<string, unknown> {
    if (!['erase', 'redraw'].includes(String(fields.scene)) || fields.modeType !== 'image2image'
        || !maskQuality(fields.quality) || !maskRatios.has(String(fields.ratio)) || !httpsImage(fields.originImage)) return fields;
    if (fields.scene === 'erase' && (fields.mark !== undefined || fields.prompt)) return fields;
    if (fields.scene === 'redraw' && (!httpsImage(fields.mark) || typeof fields.prompt !== 'string' || !fields.prompt.trim())) return fields;
    const url = new URL(fields.originImage);
    if (url.username || url.password) return fields;
    if (fields.scene === 'redraw') {
        const mark = new URL(fields.mark as string);
        if (mark.username || mark.password) return fields;
    }
    // Never replace a saved input or turn a malformed selection into an empty one.
    for (const key of ['imageList', 'videoList', 'audioList', 'textList', 'mixedList']) {
        const value = fields[key];
        if (value !== undefined && !(Array.isArray(value) && value.length === 0)) return fields;
    }
    return { ...fields, imageList: [{ url: fields.originImage }] };
}

/** The source editor saves transparent edit pixels in mark (redraw) or originImage (erase). */
export function mapLtvMaskEdit(fields: Record<string, unknown>, plan: LtvReferencePlan, sourceUrl: string, outputSize: string): LtvMaskEdit | undefined {
    if (fields.scene !== 'erase' && fields.scene !== 'redraw') return;
    if (!httpsImage(fields.originImage) || !httpsImage(sourceUrl) || !maskQuality(fields.quality) || !/^\d+x\d+$/.test(outputSize)) return;
    if (plan.references.length !== 1 || plan.references[0].kind !== 'image' || plan.texts?.length) return;
    if (fields.scene === 'redraw') {
        if (!httpsImage(fields.mark) || fields.originImage !== sourceUrl) return;
        return { scene: 'redraw', sourceUrl, maskUrl: fields.mark, sourceQuality: fields.quality, outputSize };
    }
    if (fields.mark !== undefined || fields.prompt) return;
    return { scene: 'erase', sourceUrl, maskUrl: fields.originImage, sourceQuality: fields.quality, outputSize };
}

export function ltvMaskEditOptions(fields: Record<string, unknown>, edit: LtvMaskEdit, count: number): Partial<CanvasNodeMetadata> | undefined {
    const [width, height] = edit.outputSize.split('x').map(Number);
    const ratio = String(fields.ratio), [a, b] = ratio.split(':').map(Number);
    const matching = maskRatios.has(ratio) && width > 0 && height > 0 && Math.abs(width / height / (a / b) - 1) <= 0.01;
    if (!matching || !maskQuality(fields.quality) || !Number.isInteger(count) || count < 1 || count > 15) return;
    return { ltvMaskEdit: edit, ltvExecutionContract: 'ltv-mask-edit', size: edit.outputSize, count,
        strictGenerationOptions: ['model', 'size', 'count'] };
}

export function ltvMaskEditPrompt(edit: LtvMaskEdit, prompt: string) {
    return edit.scene === 'erase'
        ? 'Fill only the transparent masked area from the surrounding image. Preserve every unmasked pixel and the original style.'
        : prompt;
}

export function ltvMaskEditMask(metadata: CanvasNodeMetadata | undefined, references: ReferenceImage[], nodes?: CanvasNodeData[]): ReferenceImage | undefined {
    const edit = metadata?.ltvMaskEdit;
    if (!edit) return;
    if (references.length !== 1 || !imageMedia(edit.sourceUrl) || !imageMedia(edit.maskUrl)) throw new Error('局部编辑必须保留一张原图和一张透明蒙版，已停止生成。');
    // Runtime hydration replaces a URL in dataUrl with bytes. Verify that case against the
    // current source node, never against the saved plan alone or a transformed reference.
    const hydrated = !references[0].url && references[0].dataUrl.startsWith('data:image/') && !references[0].source;
    const owner = hydrated ? nodes?.find(node => node.id === references[0].id && node.type === 'image') : undefined;
    const current = references[0].url || (hydrated ? owner?.metadata?.content : references[0].dataUrl);
    if (current !== edit.sourceUrl) throw new Error('局部编辑原图已变化，保存的蒙版不再对应这张图片，已停止生成。');
    return { id: `${references[0].id}-ltv-mask`, name: 'ltv-edit-mask.png', type: 'image/png', dataUrl: '', url: edit.maskUrl };
}

/** Source handleGenerateErase sends only the uploaded transparent composite, not the linked original. */
export function prepareLtvMaskEditInputs(metadata: CanvasNodeMetadata | undefined, references: ReferenceImage[], nodes?: CanvasNodeData[]) {
    const mask = ltvMaskEditMask(metadata, references, nodes);
    if (!mask || metadata?.ltvMaskEdit?.scene !== 'erase') return { references, mask };
    // Keep the dependency id, but never carry original storage keys, cached bytes or source transforms.
    // Using the same composite as image and mask preserves its exact pixel grid without resizing.
    return { references: [{ id: references[0].id, name: 'ltv-erase-composite.png', type: 'image/png',
        dataUrl: '', url: mask.url } satisfies ReferenceImage], mask };
}

/** Apply a reviewed source+mask replacement atomically; partial cleanup leaves the old contract untouched. */
export function remapLtvMaskEditMedia(nodes: CanvasNodeData[], replacements: Readonly<Record<string, string>>): CanvasNodeData[] {
    const original = new Map(nodes.map(node => [node.id, node]));
    const changed = new Map<string, CanvasNodeData>();
    for (const node of nodes) {
        const edit = node.metadata?.ltvMaskEdit;
        if (!edit) continue;
        const ref = node.metadata?.ltvReferencePlan?.references[0];
        const owner = ref && original.get(ref.nodeId);
        if (node.metadata?.ltvReferencePlan?.references.length !== 1 || ref?.kind !== 'image' || !owner || owner.metadata?.content !== edit.sourceUrl) throw new Error('局部编辑源图与原引用节点不一致，停止媒体重映射。');
        const sourceUrl = replacements[edit.sourceUrl];
        const maskUrl = replacements[edit.maskUrl];
        if (!imageMedia(sourceUrl) || !imageMedia(maskUrl)) throw new Error('局部编辑必须同时映射清洗原图与透明蒙版，停止媒体重映射。');
        const updatedOwner = changed.get(owner.id) || owner;
        changed.set(owner.id, { ...updatedOwner, metadata: { ...updatedOwner.metadata, content: sourceUrl } });
        const updatedNode = changed.get(node.id) || node;
        changed.set(node.id, { ...updatedNode, metadata: { ...updatedNode.metadata,
            ltvMaskEdit: { ...edit, sourceUrl, maskUrl },
            ltvReferencePlan: { ...node.metadata.ltvReferencePlan, references: [{ ...ref, url: ref.url ? sourceUrl : '' }] },
        } });
    }
    return nodes.map(node => changed.get(node.id) || node);
}
