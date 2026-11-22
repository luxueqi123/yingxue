import { expect, test } from "bun:test";
import { existsSync } from "node:fs";

const moduleUrl = new URL("../src/lib/canvas/canvas-image-editing.ts", import.meta.url);
const editing = existsSync(moduleUrl) ? await import(moduleUrl.href) : null;

test("原图加载失败与取消明确失败，不伪造尺寸或继续生成", async () => {
    expect(typeof editing?.readImageEditingPixels).toBe("function");
    const previous = globalThis.Image;
    let crossOrigin = "";
    class BrokenImage {
        crossOrigin = "";
        onload: null | (() => void) = null;
        onerror: null | (() => void) = null;
        set src(value: string) {
            crossOrigin = this.crossOrigin;
            if (value) queueMicrotask(() => this.onerror?.());
        }
    }
    try {
        globalThis.Image = BrokenImage as unknown as typeof Image;
        await expect(editing!.readImageEditingPixels("https://external.invalid/image.png")).rejects.toThrow("跨域");
        expect(crossOrigin).toBe("anonymous");
        const controller = new AbortController();
        controller.abort();
        await expect(editing!.readImageEditingPixels("unused", controller.signal)).rejects.toMatchObject({ name: "AbortError" });
    } finally {
        globalThis.Image = previous;
    }
});

test("蒙版只合入透明选区，未选区域逐通道保留原图与 alpha", () => {
    expect(typeof editing?.mergeProtectedImagePixels).toBe("function");
    const source = { width: 3, height: 1, data: new Uint8ClampedArray([10, 20, 30, 0, 40, 50, 60, 1, 70, 80, 90, 128]) };
    const generated = { width: 3, height: 1, data: new Uint8ClampedArray([1, 2, 3, 255, 4, 5, 6, 255, 7, 8, 9, 255]) };
    const mask = { width: 3, height: 1, data: new Uint8ClampedArray([255, 255, 255, 255, 255, 255, 255, 128, 0, 0, 0, 127]) };
    const result = editing!.mergeProtectedImagePixels(source, generated, mask);
    expect([...result.data]).toEqual([10, 20, 30, 0, 40, 50, 60, 1, 7, 8, 9, 255]);
    expect([...source.data.slice(-4)]).toEqual([70, 80, 90, 128]);
    expect(() => editing!.mergeProtectedImagePixels(source, { width: 1, height: 1, data: new Uint8ClampedArray(4) }, mask)).toThrow("尺寸");
});

test("蒙版画笔、擦除和重置可撤销重做，新笔划清除旧重做分支", () => {
    expect(typeof editing?.reduceMaskHistory).toBe("function");
    const first = { mode: "paint", size: 20, points: [{ x: 1, y: 1 }, { x: 3, y: 4 }] };
    const initial = editing!.createMaskHistory();
    const painted = editing!.reduceMaskHistory(initial, { type: "stroke", stroke: first });
    first.points[0].x = 99;
    expect(painted.present[0].points[0].x).toBe(1);
    const undone = editing!.reduceMaskHistory(painted, { type: "undo" });
    expect(undone.present).toHaveLength(0);
    const redone = editing!.reduceMaskHistory(undone, { type: "redo" });
    expect(redone.present).toHaveLength(1);
    const cleared = editing!.reduceMaskHistory(redone, { type: "clear" });
    expect(cleared.present).toHaveLength(0);
    expect(editing!.reduceMaskHistory(cleared, { type: "undo" }).present).toEqual(redone.present);
    const replaced = editing!.reduceMaskHistory(undone, { type: "stroke", stroke: { mode: "erase", size: 8, points: [{ x: 2, y: 2 }] } });
    expect(replaced.future).toHaveLength(0);
    expect(editing!.reduceMaskHistory(replaced, { type: "redo" })).toBe(replaced);
    expect(initial.present).toHaveLength(0);
});

test("原生四边扩图保持全部源 RGBA，只有新增区域在等尺寸蒙版中透明", () => {
    expect(editing).not.toBeNull();
    const data = new Uint8ClampedArray([20, 40, 60, 255, 10, 20, 30, 128, 90, 70, 50, 1, 23, 45, 67, 0]);
    const result = editing!.buildOutpaintPixels({ width: 2, height: 2, data }, { left: 1, top: 2, right: 3, bottom: 0 });
    expect([result.width, result.height]).toEqual([6, 4]);
    expect(result.sourceRect).toEqual({ x: 1, y: 2, width: 2, height: 2 });
    expect(result.data.length).toBe(result.mask.length);
    for (let y = 0; y < result.height; y += 1) for (let x = 0; x < result.width; x += 1) {
        const offset = (y * result.width + x) * 4;
        const original = x >= 1 && x < 3 && y >= 2;
        expect([...result.mask.slice(offset, offset + 4)]).toEqual(original ? [255, 255, 255, 255] : [0, 0, 0, 0]);
        expect([...result.data.slice(offset, offset + 4)]).toEqual(original ? [...data.slice(((y - 2) * 2 + x - 1) * 4, ((y - 2) * 2 + x - 1) * 4 + 4)] : [0, 0, 0, 0]);
    }
    expect([...data.slice(-4)]).toEqual([23, 45, 67, 0]);
});

test("扩图在分配像素前拒绝负值、非整数、非有限数、超出尺寸及像素上限", () => {
    expect(editing).not.toBeNull();
    const zero = { left: 0, top: 0, right: 0, bottom: 0 };
    for (const invalid of [-1, 0.5, NaN, Infinity]) expect(() => editing!.resolveOutpaintGeometry(2, 2, { ...zero, left: invalid })).toThrow();
    expect(() => editing!.resolveOutpaintGeometry(0, 2, zero)).toThrow();
    expect(() => editing!.resolveOutpaintGeometry(16_385, 1, zero)).toThrow();
    expect(() => editing!.resolveOutpaintGeometry(8192, 8192, zero)).toThrow();
    expect(() => editing!.buildOutpaintPixels({ width: 2, height: 2, data: new Uint8ClampedArray(4) }, zero)).toThrow();
});
