import { expect, test } from "bun:test";
import { buildLibTVImagePreviewUrl, isLibTVImagePreview } from "../src/lib/canvas/libtv-import";

test("案例缩略图识别不依赖仅直接导入路径才有的来源字段", () => {
    const source = "https://libtv-res.liblib.art/upload-images/project/original.png";
    const preview = buildLibTVImagePreviewUrl(source);
    expect(isLibTVImagePreview(source, preview)).toBe(true);
    expect(isLibTVImagePreview(source, source)).toBe(false);
    expect(isLibTVImagePreview(source, "https://example.test/other.png")).toBe(false);
    expect(isLibTVImagePreview("https://example.test/original.png", "https://example.test/original.png?width=960")).toBe(false);
    expect(isLibTVImagePreview(undefined, preview)).toBe(false);
    expect(isLibTVImagePreview(source, undefined)).toBe(false);
});
