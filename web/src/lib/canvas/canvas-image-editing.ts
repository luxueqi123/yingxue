// Adapted geometry: LTV chunk 0zme995kos_wy.js, module 772000, compositeOutpaintImage.
// Source hash and the alpha-preserving adaptation are recorded in docs/design/ltv-native-module-audit.mdx.
export type CanvasOutpaintPadding = { left: number; top: number; right: number; bottom: number };
export type ImagePixels = { width: number; height: number; data: Uint8ClampedArray };
export const IMAGE_EDIT_MAX_EDGE = 16_384;
export const IMAGE_EDIT_MAX_PIXELS = 32 * 1024 * 1024;

function validateDimensions(width: number, height: number) {
    if (![width, height].every(value => Number.isSafeInteger(value) && value > 0 && value <= IMAGE_EDIT_MAX_EDGE)) throw new Error(`图片尺寸必须为 1 至 ${IMAGE_EDIT_MAX_EDGE} 的整数像素。`);
    if (width * height > IMAGE_EDIT_MAX_PIXELS) throw new Error(`图片总像素不能超过 ${IMAGE_EDIT_MAX_PIXELS}，请减少扩展范围。`);
}

function validatePixels(image: ImagePixels) {
    validateDimensions(image.width, image.height);
    if (image.data.length !== image.width * image.height * 4) throw new Error("图片像素数据与尺寸不一致。");
}

export function resolveOutpaintGeometry(width: number, height: number, padding: CanvasOutpaintPadding) {
    validateDimensions(width, height);
    if (![padding.left, padding.top, padding.right, padding.bottom].every(value => Number.isSafeInteger(value) && value >= 0)) throw new Error("扩展范围必须为不小于 0 的整数像素。");
    const outputWidth = width + padding.left + padding.right;
    const outputHeight = height + padding.top + padding.bottom;
    validateDimensions(outputWidth, outputHeight);
    return { width: outputWidth, height: outputHeight, sourceRect: { x: padding.left, y: padding.top, width, height } };
}

export function buildOutpaintPixels(source: ImagePixels, padding: CanvasOutpaintPadding) {
    validatePixels(source);
    const geometry = resolveOutpaintGeometry(source.width, source.height, padding);
    const data = new Uint8ClampedArray(geometry.width * geometry.height * 4);
    const mask = new Uint8ClampedArray(data.length);
    for (let row = 0; row < source.height; row += 1) {
        const targetOffset = ((row + padding.top) * geometry.width + padding.left) * 4;
        data.set(source.data.subarray(row * source.width * 4, (row + 1) * source.width * 4), targetOffset);
        mask.fill(255, targetOffset, targetOffset + source.width * 4);
    }
    return { ...geometry, data, mask };
}

export function mergeProtectedImagePixels(source: ImagePixels, generated: ImagePixels, mask: ImagePixels): ImagePixels {
    [source, generated, mask].forEach(validatePixels);
    if (source.width !== generated.width || source.height !== generated.height || source.width !== mask.width || source.height !== mask.height) throw new Error("原图、生成图与蒙版的像素尺寸必须一致。");
    const data = new Uint8ClampedArray(generated.data);
    for (let offset = 0; offset < data.length; offset += 4) {
        if (mask.data[offset + 3] >= 128) data.set(source.data.subarray(offset, offset + 4), offset);
    }
    return { width: source.width, height: source.height, data };
}

export type MaskEditStroke = { mode: "paint" | "erase"; size: number; points: { x: number; y: number }[] };
export type MaskEditHistory = { past: MaskEditStroke[][]; present: MaskEditStroke[]; future: MaskEditStroke[][] };
export type MaskEditHistoryAction = { type: "stroke"; stroke: MaskEditStroke } | { type: "undo" | "redo" | "clear" };

export function createMaskHistory(): MaskEditHistory { return { past: [], present: [], future: [] }; }

// LTV records brush/erase edits in undo and redo stacks; retain vector strokes to avoid full-resolution bitmap history.
export function reduceMaskHistory(state: MaskEditHistory, action: MaskEditHistoryAction): MaskEditHistory {
    if (action.type === "undo") {
        if (!state.past.length) return state;
        return { past: state.past.slice(0, -1), present: state.past[state.past.length - 1], future: [state.present, ...state.future] };
    }
    if (action.type === "redo") {
        if (!state.future.length) return state;
        return { past: [...state.past, state.present].slice(-40), present: state.future[0], future: state.future.slice(1) };
    }
    if (action.type === "clear" && !state.present.length) return state;
    if (action.type === "stroke" && !action.stroke.points.length) return state;
    const present = action.type === "stroke"
        ? [...state.present, { ...action.stroke, points: action.stroke.points.map(point => ({ ...point })) }]
        : [];
    return { past: [...state.past, state.present].slice(-40), present, future: [] };
}

function imageEditingCanvas(width: number, height: number) {
    validateDimensions(width, height);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) throw new Error("浏览器无法创建图片编辑画布。");
    return { canvas, context };
}

function pixelsCanvas(pixels: ImagePixels) {
    validatePixels(pixels);
    const { canvas, context } = imageEditingCanvas(pixels.width, pixels.height);
    const imageData = context.createImageData(pixels.width, pixels.height);
    imageData.data.set(pixels.data);
    context.putImageData(imageData, 0, 0);
    return canvas;
}

export function encodeImageEditingPixels(pixels: ImagePixels) {
    const png = pixelsCanvas(pixels).toDataURL("image/png");
    if (!png.startsWith("data:image/png;")) throw new Error("浏览器未能输出 PNG，请减少扩展范围。");
    return png;
}

export function readImageEditingPixels(url: string, signal?: AbortSignal): Promise<ImagePixels> {
    return new Promise((resolve, reject) => {
        if (signal?.aborted) { reject(new DOMException("The operation was aborted", "AbortError")); return; }
        if (!url) { reject(new Error("缺少可读取的原图地址。")); return; }
        const image = new Image();
        image.crossOrigin = "anonymous";
        let settled = false;
        const cleanup = () => {
            clearTimeout(timer);
            image.onload = null;
            image.onerror = null;
            signal?.removeEventListener("abort", abort);
        };
        const fail = (error: unknown) => {
            if (settled) return;
            settled = true;
            cleanup();
            image.src = "";
            reject(error);
        };
        const abort = () => fail(new DOMException("The operation was aborted", "AbortError"));
        const timer = setTimeout(() => fail(new Error("原图读取超时，请检查资源后重试。")), 15_000);
        image.onerror = () => fail(new Error("原图读取失败，请检查资源地址与跨域读取权限。"));
        image.onload = () => {
            if (settled) return;
            try {
                const width = image.naturalWidth;
                const height = image.naturalHeight;
                const { context } = imageEditingCanvas(width, height);
                context.drawImage(image, 0, 0);
                const data = context.getImageData(0, 0, width, height).data;
                settled = true;
                cleanup();
                resolve({ width, height, data });
            } catch (error) {
                fail(error instanceof DOMException && error.name === "SecurityError" ? new Error("原图不允许跨域像素读取，请先上传到素材库后编辑。") : error);
            }
        };
        signal?.addEventListener("abort", abort, { once: true });
        image.src = url;
    });
}

export function prepareOutpaintImage(source: ImagePixels, padding: CanvasOutpaintPadding) {
    const prepared = buildOutpaintPixels(source, padding);
    return {
        width: prepared.width, height: prepared.height, padding: { ...padding },
        sourceDataUrl: encodeImageEditingPixels(prepared),
        maskDataUrl: encodeImageEditingPixels({ width: prepared.width, height: prepared.height, data: prepared.mask }),
    };
}

export async function compositeMaskedImageResult(sourceUrl: string, generatedUrl: string, maskUrl: string, signal?: AbortSignal, expectedSize?: { width: number; height: number }) {
    const [source, generated, mask] = await Promise.all([readImageEditingPixels(sourceUrl, signal), readImageEditingPixels(generatedUrl, signal), readImageEditingPixels(maskUrl, signal)]);
    if (signal?.aborted) throw new DOMException("The operation was aborted", "AbortError");
    if (expectedSize) {
        validateDimensions(expectedSize.width, expectedSize.height);
        if (source.width !== expectedSize.width || source.height !== expectedSize.height) throw new Error("扩图原图快照与请求像素尺寸不符，无法合成。");
    }
    if (source.width !== mask.width || source.height !== mask.height) throw new Error("原图与蒙版尺寸不一致，无法合成局部编辑结果。");
    if (generated.width !== source.width || generated.height !== source.height) {
        throw new Error(`扩图模型返回 ${generated.width}x${generated.height}，与请求的 ${source.width}x${source.height} 像素尺寸不符，无法合成。`);
    }
    return encodeImageEditingPixels(mergeProtectedImagePixels(source, generated, mask));
}
