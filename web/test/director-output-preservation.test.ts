import { expect, test } from "bun:test";
import { reusablePrevisOutputNodeId } from "../src/lib/canvas/previs/previs-session";
import { CanvasNodeType, type CanvasNodeData } from "../src/types/canvas";

const source = { sceneId: "scene", shotId: "shot", kind: "preview" as const };
const node = (metadata: CanvasNodeData["metadata"] = {}): CanvasNodeData => ({
    id: "preview", type: CanvasNodeType.Image, title: "original", position: { x: 0, y: 0 }, width: 320, height: 180, metadata,
});

test("source preview and capture are never reused as generated output", () => {
    for (const metadata of [{}, { previsCaptureSource: { cameraId: "camera" } }, { previsOutputSource: source, previsCaptureSource: { cameraId: "camera" } }]) {
        expect(reusablePrevisOutputNodeId([node(metadata)], ["preview"], source)).toBeUndefined();
    }
});

test("only matching generated output is reusable, not another shot, scene or media kind", () => {
    expect(reusablePrevisOutputNodeId([node({ previsOutputSource: source })], [undefined, "missing", "preview"], source)).toBe("preview");
    for (const origin of [{ ...source, shotId: "other" }, { ...source, sceneId: "other" }, { ...source, kind: "clay-video" as const }]) {
        expect(reusablePrevisOutputNodeId([node({ previsOutputSource: origin })], ["preview"], source)).toBeUndefined();
    }
    expect(reusablePrevisOutputNodeId([{ ...node({ previsOutputSource: source }), type: CanvasNodeType.Video }], ["preview"], source)).toBeUndefined();
});

test("shot preview takes priority over owner preview without mutating source nodes", () => {
    const nodes = [node({ previsOutputSource: source }), { ...node({ previsOutputSource: source }), id: "owner-preview" }];
    const before = JSON.stringify(nodes);
    expect(reusablePrevisOutputNodeId(nodes, ["preview", "owner-preview"], source)).toBe("preview");
    expect(JSON.stringify(nodes)).toBe(before);
});

test("generated clay video requires matching provenance and video type", () => {
    const videoSource = { ...source, kind: "clay-video" as const };
    const video = { ...node({ previsOutputSource: videoSource }), type: CanvasNodeType.Video };
    expect(reusablePrevisOutputNodeId([video], [video.id], videoSource)).toBe(video.id);
    expect(reusablePrevisOutputNodeId([node()], ["preview"], videoSource)).toBeUndefined();
});
