import { describe, expect, test } from "bun:test";
import { buildRegionEditPrompt, clampRegionPoint, describeRegionPosition, minRegionSide, missingRegionReferences, moveRegion, nextRegionIndex, referencedRegionIndexes, regionFromPoints, syncRegionPrompt, type ImageEditRegion } from "../src/lib/canvas/image-region-edit";

const size = { width: 1000, height: 500 };
const first: ImageEditRegion = { index: 1, x: 100, y: 50, width: 200, height: 100 };
const second: ImageEditRegion = { index: 2, x: 600, y: 300, width: 150, height: 100 };
const tenth: ImageEditRegion = { ...first, index: 10 };

describe("图片区域编号与提示词", () => {
    test("多个区域各有独立编号，删除中间区域不重排其余编号", () => {
        expect(nextRegionIndex([])).toBe(1);
        expect(nextRegionIndex([first, second, tenth])).toBe(11);
        const prompt = syncRegionPrompt("整体保持一致", [], [second, first, tenth]);
        expect(prompt).toBe("整体保持一致\n@区域1 \n@区域2 \n@区域10 ");
        const removed = syncRegionPrompt("@区域1 换树\n@区域2 换船\n@区域10 换云\n参考 @区域1 保持光线", [first, second, tenth], [second, tenth]);
        expect(removed).toBe("@区域2 换船\n@区域10 换云\n参考 保持光线");
        expect(referencedRegionIndexes(removed)).toEqual([2, 10]);
    });

    test("增删和撤销重新加入区域时，同步提示词且不误删相近编号", () => {
        expect(syncRegionPrompt("@区域10 换云", [first, tenth], [tenth])).toBe("@区域10 换云");
        expect(syncRegionPrompt("@区域2 换船", [second], [first, second])).toBe("@区域2 换船\n@区域1 ");
        expect(syncRegionPrompt("@区域1 换树", [], [first])).toBe("@区域1 换树");
        expect(missingRegionReferences("@区域10 @区域3 @区域3 @区域1", [first, tenth])).toEqual([3]);
    });

    test("被引用编号去重排序，无引用时为空", () => {
        expect(referencedRegionIndexes("@区域10 @区域2 @区域10 @区域1")).toEqual([1, 2, 10]);
        expect(referencedRegionIndexes("保持原图")).toEqual([]);
    });

    test("编译原图相对坐标和逐框修改要求，多图与蒙版提示按能力出现", () => {
        const prompt = buildRegionEditPrompt({ prompt: " @区域2 换船\n@区域1 换树 ", regions: [second, first], size, annotatedReference: true, mask: true });
        expect(prompt).toContain("第一张参考图是原图；第二张参考图");
        expect(prompt).toContain("蒙版透明部分与全部框选区域一致");
        expect(prompt).toContain("区域1：左 10%，上 10%，宽 20%，高 20%");
        expect(prompt).toContain("【区域2】 换船\n【区域1】 换树");
        expect(prompt.indexOf("区域1：")).toBeLessThan(prompt.indexOf("区域2："));
        expect(prompt).toContain("最终图片中不要出现任何框线、编号或标注痕迹");
        const single = buildRegionEditPrompt({ prompt: "@区域1 换树", regions: [first], size, annotatedReference: false, mask: false });
        expect(single).not.toContain("第二张");
        expect(single).not.toContain("蒙版");
        expect(single).toContain("【区域1】 换树");
    });
});

describe("原图像素坐标边界", () => {
    test("正向和反向拖拽均限制在原图内并输出整数矩形", () => {
        expect(clampRegionPoint({ x: -20, y: 600 }, size)).toEqual({ x: 0, y: 500 });
        expect(regionFromPoints({ x: 1050, y: 510 }, { x: -10, y: -50 }, size)).toEqual({ x: 0, y: 0, width: 1000, height: 500 });
        expect(regionFromPoints({ x: 300.4, y: 200.6 }, { x: 100.2, y: 50.1 }, size)).toEqual({ x: 100, y: 50, width: 200, height: 151 });
    });

    test("平移保留尺寸和编号，四边越界停在图内", () => {
        expect(moveRegion(first, -1000, -1000, size)).toEqual({ ...first, x: 0, y: 0 });
        expect(moveRegion(first, 1000, 1000, size)).toEqual({ ...first, x: 800, y: 400 });
        expect(first).toEqual({ index: 1, x: 100, y: 50, width: 200, height: 100 });
        expect(describeRegionPosition(first, size)).toBe("左 10%，上 10%，宽 20%，高 20%");
        expect(minRegionSide(size)).toBe(8);
        expect(minRegionSide({ width: 4000, height: 3000 })).toBe(30);
    });
});
