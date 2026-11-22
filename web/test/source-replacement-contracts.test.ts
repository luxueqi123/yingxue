import { describe, expect, test } from "bun:test";
import { composerReferences, insertComposerPreset } from "../src/components/canvas/canvas-composer-references";
import { splitMentionText } from "../src/components/canvas/canvas-mention-editable";
import { dataUrlToFile, getDataUrlByteSize, readFileAsDataUrl } from "../src/lib/image-utils";
import { packageSegment, referencedStorageKeys, MediaPackage } from "../src/lib/media-package";
import { readZip } from "../src/lib/zip";
import { buildNodeGenerationInputs, type NodeGenerationInput } from "../src/components/canvas/canvas-node-generation";
import { CanvasNodeType, type CanvasNodeData } from "../src/types/canvas";

// Behavior checks for replacement boundaries; no provider calls or account storage writes.
describe("替换模块的互操作合同", () => {
    test("提示词素材引用保持生成标签、预览与未知文本", () => {
        const inputs = [{ nodeId: "a", title: "参考图", type: "image" as const, image: { id: "image-a", name: "a.png", type: "image/png", dataUrl: "data:image/png;base64,AQID", bytes: 3 } }];
        const refs = composerReferences(inputs, []);
        expect(refs[0].mentionToken).toBe("@图片1");
        expect(refs[0].previewUrl).toBe(inputs[0].image.dataUrl);
        const parts = splitMentionText("参考 @图片1 ，保留 @图片10", refs);
        expect(parts.filter((part) => part.type === "mention")).toHaveLength(1);
        expect(parts.at(-1)).toEqual({ type: "text", text: " ，保留 @图片10" });
    });
    test("预设替换活动斜线和当前选区，保留两侧正文", () => {
        expect(insertComposerPreset("前文 /镜头 后文", 6, 6, "推进")).toEqual({ text: "前文 推进  后文", caret: 6 });
        expect(insertComposerPreset("abcXYZdef", 3, 6, "镜头")).toEqual({ text: "abc镜头 def", caret: 6 });
    });
    test("组装引用保留图片资源标识、独立视频封面和绘图修订，不把视频当静态缩略图", () => {
        const inputs: NodeGenerationInput[] = [
            { nodeId: "image", title: "image", type: "image", image: { id: "image", name: "image.png", type: "image/png", dataUrl: "", url: "https://media.example/image.png", storageKey: "resource:image" } },
            { nodeId: "drawing", title: "drawing", type: "image", sourceKind: "drawing", image: { id: "drawing", name: "drawing.png", type: "image/png", dataUrl: "", source: { kind: "drawing", drawingId: "drawing-document", revision: 9, shapeCount: 2 } } },
            { nodeId: "video", title: "video", type: "video", previewUrl: "https://media.example/stale-poster.png", previewStorageKey: "resource:poster", video: { id: "video", name: "video.mp4", type: "video/mp4", url: "https://media.example/film.mp4", storageKey: "resource:film" } },
        ];
        const refs = composerReferences(inputs, []);
        expect(refs[0]).toMatchObject({ storageKey: "resource:image", previewUrl: inputs[0].image!.url, mentionToken: "@图片1" });
        expect(refs[1]).toMatchObject({ drawingId: "drawing-document", drawingRevision: 9, mentionToken: "@绘图2" });
        expect(refs[2]).toMatchObject({ previewStorageKey: "resource:poster", previewUrl: inputs[2].previewUrl });
        expect(refs[2].storageKey).toBeUndefined();
        expect(refs[2].mediaUrl).toBeUndefined();
        expect(refs[1].previewUrl).toBeUndefined();
    });
    test("生成输入保留只有资源标识的视频首帧，不用成片资源替代封面", () => {
        const video: CanvasNodeData = { id: "video", type: CanvasNodeType.Video, title: "video", position: { x: 0, y: 0 }, width: 320, height: 180, metadata: { storageKey: "resource:film", videoPreview: { storageKey: "resource:poster", content: "" } } };
        const target: CanvasNodeData = { id: "config", type: CanvasNodeType.Config, title: "config", position: { x: 400, y: 0 }, width: 320, height: 180 };
        const inputs = buildNodeGenerationInputs(target.id, [video, target], [{ id: "edge", fromNodeId: video.id, toNodeId: target.id }]);
        expect(inputs).toHaveLength(1);
        expect(inputs[0].previewStorageKey).toBe("resource:poster");
        expect(inputs[0].video?.storageKey).toBe("resource:film");
        expect(inputs[0].previewUrl).toBe("");
    });
    test("文件数据地址往返保留所有字节和 MIME", async () => {
        const file = new File([new Uint8Array([0, 255, 128, 31, 42])], "test.png", { type: "image/png" });
        const url = await readFileAsDataUrl(file);
        expect(getDataUrlByteSize(url)).toBe(5);
        const decoded = dataUrlToFile({ id: "a", name: file.name, type: file.type, bytes: 5, dataUrl: url });
        expect([...new Uint8Array(await decoded.arrayBuffer())]).toEqual([0, 255, 128, 31, 42]);
        expect(decoded.type).toBe("image/png");
        const encoded = dataUrlToFile({ id: "b", name: "b.svg", type: "", dataUrl: "data:image/svg+xml,%3Csvg%3E%E5%9B%BE%3C%2Fsvg%3E", bytes: 0 });
        expect(await encoded.text()).toBe("<svg>图</svg>");
        expect(() => dataUrlToFile({ id: "c", name: "c", type: "", bytes: 0, dataUrl: "bad" })).toThrow();
    });
    test("归档资源名无碰撞，循环引用不会导致遍历溢出", () => {
        expect(new Set(["a:b", "a/b", "a_b", "a%2Fb", "../a"].map(packageSegment)).size).toBe(5);
        expect(packageSegment("../a")).not.toContain("../");
        const root: Record<string, unknown> = { image: { storageKey: "image:user:a" }, media: [{ storageKey: "video:user:b" }] };
        root.self = root;
        expect([...referencedStorageKeys(root)].sort()).toEqual(["image:user:a", "video:user:b"]);
    });
    test("归档保留文件与清单，重复路径显式失败", async () => {
        const archive = new MediaPackage();
        archive.put("files/a", new Uint8Array([5, 7]));
        expect(() => archive.put("files/a", "duplicate")).toThrow();
        const zip = await readZip(await archive.finish("assets.json", { app: "yingce", files: [{ path: "files/a" }] }));
        expect([...new Uint8Array(await zip.get("files/a")!.arrayBuffer())]).toEqual([5, 7]);
        expect(JSON.parse(await zip.get("assets.json")!.text()).app).toBe("yingce");
    });
});
