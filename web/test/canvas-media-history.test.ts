import { describe, expect, test } from "bun:test";
import { adoptMediaVersion, currentMediaVersion, ensureCurrentMediaVersion, mediaVersionAdoptBlock, recordReplacedMediaVersion, removeMediaVersion, createNodeFromMediaVersion } from "../src/lib/canvas/canvas-media-versions";
import { CanvasNodeType, type CanvasNodeData } from "../src/types/canvas";

const original: CanvasNodeData = { id: "image-1", type: CanvasNodeType.Image, title: "镜头", position: { x: 10, y: 20 }, width: 400, height: 200, metadata: { content: "/old.png", storageKey: "old", naturalWidth: 400, naturalHeight: 200, prompt: "下一次提示词", status: "success" } };

describe("node media history", () => {
    test("replacement retains old media, survives serialization and switches without losing identity or prompt", () => {
        const next = recordReplacedMediaVersion(original, { ...original, metadata: { ...original.metadata, content: "/new.png", storageKey: "new", taskId: "finished-task", naturalWidth: 200, naturalHeight: 400 } }, "upload");
        const saved = JSON.parse(JSON.stringify(next)) as CanvasNodeData;
        expect(saved.metadata?.mediaVersions).toHaveLength(2);
        const oldId = saved.metadata!.mediaVersions![0].id;
        const adopted = adoptMediaVersion(saved, oldId)!;
        expect(adopted.id).toBe(original.id);
        expect(adopted.position).toEqual(original.position);
        expect(adopted.metadata?.storageKey).toBe("old");
        expect(adopted.metadata?.prompt).toBe("下一次提示词");
        expect(adopted.metadata?.taskId).toBeUndefined();
        expect(removeMediaVersion(adopted, oldId)).toBeNull();
        expect(removeMediaVersion(adopted, currentMediaVersion(saved)!.id)?.metadata?.mediaVersions).toHaveLength(1);
        const extracted = createNodeFromMediaVersion(saved, oldId, "image-2")!;
        expect(extracted.metadata?.mediaVersions).toBeUndefined();
        expect(extracted.metadata?.assetId).toBeUndefined();
        expect(extracted.metadata?.storageKey).toBe("old");
    });

    test("same storage resource is recorded once without duplicating large data URLs", () => {
        const node = ensureCurrentMediaVersion({ ...original, metadata: { ...original.metadata, content: `data:image/png;base64,${"a".repeat(3000)}` } });
        const repeated = ensureCurrentMediaVersion(node);
        expect(repeated.metadata?.mediaVersions).toHaveLength(1);
        expect(repeated.metadata?.mediaVersions?.[0].media.content).toBeUndefined();
    });

    test("locked and running nodes are blocked, changing media type starts separate history", () => {
        expect(mediaVersionAdoptBlock({ ...original, metadata: { ...original.metadata, locked: true } })).toBe("locked");
        expect(mediaVersionAdoptBlock({ ...original, metadata: { ...original.metadata, status: "loading" } })).toBe("loading");
        expect(mediaVersionAdoptBlock({ ...original, metadata: { ...original.metadata, fileUpload: "uploading" } })).toBe("loading");
        const video = recordReplacedMediaVersion(original, { ...original, type: CanvasNodeType.Video, metadata: { content: "/video.mp4", storageKey: "video" } }, "upload");
        expect(video.metadata?.mediaVersions).toHaveLength(1);
        expect(currentMediaVersion(video)?.media.storageKey).toBe("video");
    });
});
