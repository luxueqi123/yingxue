import { describe, expect, test } from "bun:test";

import { isolateCopiedNodeMetadata, nextCopiedNodeTitle } from "@/lib/canvas/canvas-node-copy";
import { buildNodeGenerationContext } from "@/components/canvas/canvas-node-generation";
import { CanvasNodeType, type CanvasNodeData } from "@/types/canvas";
import { mapLtvStoryboardRows } from "@/lib/canvas/ltv-storyboard";

describe("canvas node copy title", () => {
    test("首次复制使用 copy1，后续按已有最大序号递增", () => {
        expect(nextCopiedNodeTitle("女明星角色三视图", ["女明星角色三视图"])).toBe("女明星角色三视图_copy1");
        expect(nextCopiedNodeTitle("女明星角色三视图", ["女明星角色三视图", "女明星角色三视图_copy1"])).toBe("女明星角色三视图_copy2");
        expect(nextCopiedNodeTitle("女明星角色三视图", ["女明星角色三视图_copy1", "女明星角色三视图_copy3"])).toBe("女明星角色三视图_copy4");
    });

    test("复制已有副本时仍使用原始名称计算下一序号", () => {
        expect(nextCopiedNodeTitle("女明星角色三视图_copy1", ["女明星角色三视图", "女明星角色三视图_copy1"])).toBe("女明星角色三视图_copy2");
    });

    test("兼容旧版空格 Copy 后缀", () => {
        expect(nextCopiedNodeTitle("女明星角色三视图 Copy", ["女明星角色三视图", "女明星角色三视图 Copy"])).toBe("女明星角色三视图_copy1");
    });

    test("同一批粘贴可以通过预留标题连续分配序号", () => {
        const titles = new Set(["节点", "节点_copy1"]);
        const first = nextCopiedNodeTitle("节点", titles);
        titles.add(first);
        const second = nextCopiedNodeTitle("节点", titles);
        expect([first, second]).toEqual(["节点_copy2", "节点_copy3"]);
    });
});

describe("canvas generation copy metadata", () => {
    test("分镜副本重映射角色、素材和图片视频输出，原片参考帧不变", () => {
        const mapped = mapLtvStoryboardRows("script", [{ id: "row", shotNumber: 1, durationSeconds: 5,
            videoReference: { startTime: 0, endTime: 5, referenceFrameImage: "https://example.test/frame.jpg" },
            characters: [{ characterName: "主角", characterImageUrl: "https://example.test/actor.jpg" }],
        }]);
        const row = { ...mapped.rows[0], assetBindings: [{ nodeId: mapped.media[0].id, role: "character" as const, priority: 100 }], imageNodeId: "image", videoNodeId: "video", status: "success" as const };
        const source: CanvasNodeData = { id: "script", type: CanvasNodeType.Script, title: "分镜",
            position: { x: 0, y: 0 }, width: 800, height: 400,
            metadata: { storyboard: { rows: [row], referenceNodeIds: [mapped.media[0].id], visibleColumns: ["videoReference"] } },
        };
        const before = JSON.stringify(source);
        const ids = new Map([["script", "new-script"], ["image", "new-image"], ["video", "new-video"], [mapped.media[0].id, "new-actor"]]);
        const result = isolateCopiedNodeMetadata(source, ids).storyboard!;
        expect(result.rows[0].id).toBe("row");
        expect(result.rows[0].imageNodeId).toBe("new-image");
        expect(result.rows[0].videoNodeId).toBe("new-video");
        expect(result.rows[0].characters[0].characterImageNodeId).toBe("new-actor");
        expect(result.rows[0].assetBindings[0].nodeId).toBe("new-actor");
        expect(result.referenceNodeIds).toEqual(["new-actor"]);
        expect(result.rows[0].videoReference).toEqual(row.videoReference);
        expect(result.rows[0].videoReference).not.toBe(row.videoReference);
        expect(JSON.stringify(source)).toBe(before);
    });
    test("媒体副本保留提示词与参考字段，并明确原地回填生成结果", () => {
        const source: CanvasNodeData = {
            id: "source",
            type: CanvasNodeType.Video,
            title: "镜头",
            position: { x: 0, y: 0 },
            width: 340,
            height: 240,
            metadata: {
                content: "video-url",
                prompt: "相同提示词",
                videoStartFrameNodeId: "reference-start",
                videoEndFrameNodeId: "reference-end",
                generationResultPlacement: "new-version",
                generationEffectKeys: ["attach-node:source-task:source:0"],
            },
        };

        const metadata = isolateCopiedNodeMetadata(source, new Map([[source.id, "copy"]]));

        expect(metadata.prompt).toBe("相同提示词");
        expect(metadata.videoStartFrameNodeId).toBe("reference-start");
        expect(metadata.videoEndFrameNodeId).toBe("reference-end");
        expect(metadata.copiedFromNodeId).toBe("source");
        expect(metadata.generationResultPlacement).toBe("replace-node");
        expect(metadata.generationEffectKeys).toBeUndefined();
        expect(source.metadata?.generationEffectKeys).toEqual(["attach-node:source-task:source:0"]);
    });

    test("视频参数变体清除旧视频和结果附属字段，但保留生成参数与引用", () => {
        const source: CanvasNodeData = {
            id: "source",
            type: CanvasNodeType.Video,
            title: "镜头",
            position: { x: 0, y: 0 },
            width: 340,
            height: 240,
            metadata: {
                content: "video-url",
                previewContent: "preview-url",
                videoPreview: { content: "video-preview", storageKey: "resource:preview" },
                storageKey: "resource:video",
                mimeType: "video/mp4",
                bytes: 1024,
                durationMs: 5000,
                waveform: [0.1, 0.8],
                waveformVersion: 1,
                hasAudio: true,
                naturalWidth: 1280,
                naturalHeight: 720,
                assetId: "asset-video",
                producedModel: "model-used",
                producedModelCandidate: "model-pending",
                subtitleEntries: [{ index: 0, startMs: 0, endMs: 1000, text: "旧字幕" }],
                subtitleHighlights: [{ entryIndex: 0, start: 0, end: 1, highlightText: "旧", sourceText: "旧字幕" }],
                subtitleUpdatedAt: "2026-11-01T00:00:00Z",
                prompt: "保留这个提示词",
                composerContent: "保留编辑器内容",
                model: "model-next",
                size: "1280x720",
                seconds: "5",
                vquality: "720p",
                generateAudio: "true",
                watermark: "false",
                references: ["resource:reference"],
                referenceAssetNodeIds: ["reference-node"],
                videoStartFrameNodeId: "start-frame",
                videoEndFrameNodeId: "end-frame",
                dramaRef: { projectId: "drama", kind: "segment", id: "segment-1" },
                versionOfNodeId: "source-root",
                versionLabel: "B",
                versionPrimary: false,
                generationResultPlacement: "new-version",
                generationEffectKeys: ["old-effect"],
                status: "success",
            },
        };

        const metadata = isolateCopiedNodeMetadata(source, new Map([[source.id, "copy"]]), { clearMediaResult: true, preserveExternalReferences: true, clearDramaBinding: true });

        expect(metadata).toMatchObject({
            prompt: "保留这个提示词",
            composerContent: "保留编辑器内容",
            model: "model-next",
            size: "1280x720",
            seconds: "5",
            vquality: "720p",
            generateAudio: "true",
            watermark: "false",
            references: ["resource:reference"],
            referenceAssetNodeIds: ["reference-node"],
            videoStartFrameNodeId: "start-frame",
            videoEndFrameNodeId: "end-frame",
            copiedFromNodeId: "source",
            generationResultPlacement: "replace-node",
            status: "idle",
        });
        for (const field of [
            "content",
            "previewContent",
            "videoPreview",
            "storageKey",
            "mimeType",
            "bytes",
            "durationMs",
            "waveform",
            "waveformVersion",
            "hasAudio",
            "naturalWidth",
            "naturalHeight",
            "assetId",
            "producedModel",
            "producedModelCandidate",
            "subtitleEntries",
            "subtitleHighlights",
            "subtitleUpdatedAt",
        ] as const) {
            expect(metadata[field]).toBeUndefined();
        }
        expect(metadata.generationEffectKeys).toBeUndefined();
        expect(metadata.dramaRef).toBeUndefined();
        expect(metadata.versionOfNodeId).toBeUndefined();
        expect(metadata.versionLabel).toBeUndefined();
        expect(metadata.versionPrimary).toBeUndefined();
        expect(source.metadata?.content).toBe("video-url");
        expect(source.metadata?.dramaRef?.id).toBe("segment-1");
        expect(source.metadata?.subtitleEntries).toHaveLength(1);
    });

    test("复制到副本的入边继续解析为同一张参考图", () => {
        const reference: CanvasNodeData = {
            id: "reference",
            type: CanvasNodeType.Image,
            title: "角色参考",
            position: { x: 0, y: 0 },
            width: 340,
            height: 240,
            metadata: { content: "reference-url", mimeType: "image/png" },
        };
        const copy: CanvasNodeData = {
            id: "copy",
            type: CanvasNodeType.Image,
            title: "结果_copy1",
            position: { x: 400, y: 0 },
            width: 340,
            height: 240,
            metadata: { content: "old-result", prompt: "保持角色一致", copiedFromNodeId: "source", generationResultPlacement: "replace-node" },
        };

        const context = buildNodeGenerationContext(copy.id, [reference, copy], [{ id: "copy-reference", fromNodeId: reference.id, toNodeId: copy.id }], copy.metadata!.prompt!, []);

        expect(context.prompt).toBe("保持角色一致");
        expect(context.referenceImages.map((image) => image.id)).toEqual([reference.id]);
    });
});
