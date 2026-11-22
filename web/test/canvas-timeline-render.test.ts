import { expect, test } from "bun:test";
import { prepareCanvasTimelineRender } from "../src/lib/timeline/canvas-timeline-render";
import { CanvasNodeType, type CanvasNodeData } from "../src/types/canvas";
import type { TimelineProject } from "../src/types/timeline";

const node: CanvasNodeData = { id: "v", type: CanvasNodeType.Video, title: "视频", width: 720, height: 405,
    position: { x: 0, y: 0 }, metadata: { storageKey: "resource:owned-video", content: "/api/resources/owned-video/file" } };
const timeline: TimelineProject = { version: 2, durationMs: 2000,
    tracks: [{ id: "video", kind: "video", label: "视频", order: 0 }],
    clips: [{ id: "clip", nodeId: "v", trackId: "video", kind: "video", startMs: 0, durationMs: 2000, sourceStartMs: 1000, volume: 0.5 }] };

test("画布节点绑定转换为既有服务端资源合同，不修改画布和时间线", () => {
    const before = structuredClone(timeline);
    const result = prepareCanvasTimelineRender(timeline, [node]);
    expect(result.clips[0].directMedia?.storageKey).toBe("resource:owned-video");
    expect(result.clips[0]).toMatchObject(timeline.clips[0]);
    expect(timeline).toEqual(before);
});

test("拒绝缺失、错类型和未上传素材，不向服务端提交会被替换成黑场的片段", () => {
    for (const nodes of [[], [{ ...node, type: CanvasNodeType.Image }], [{ ...node, metadata: { storageKey: "video:local-only" } }]]) {
        expect(() => prepareCanvasTimelineRender(timeline, nodes)).toThrow();
    }
});

test("直连媒体优先，不错误使用同名画布节点；隐藏轨道不要求素材", () => {
    const direct: TimelineProject = { ...timeline, clips: [{ ...timeline.clips[0], directMedia: { id: "asset", kind: "video", title: "上传", storageKey: "resource:uploaded" } }] };
    expect(prepareCanvasTimelineRender(direct, [node]).clips[0].directMedia?.storageKey).toBe("resource:uploaded");
    direct.clips[0].directMedia!.storageKey = "video:local";
    expect(() => prepareCanvasTimelineRender(direct, [node])).toThrow();
    expect(prepareCanvasTimelineRender({ ...timeline, tracks: [{ ...timeline.tracks[0], visible: false }] }, []).clips).toEqual(timeline.clips);
});
