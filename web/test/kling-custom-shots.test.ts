import { expect, test } from "bun:test";
import { mapLtvKlingOptions, assertKlingRuntimeOptions, klingTaskMetadata, readKlingCustomShots } from "../src/lib/canvas/ltv-kling-options";
import { adaptLtvNativeProject } from "../src/lib/canvas/ltv-native-project";

const shots = [{ index: 1, prompt: "推近主体", duration: "2" }, { index: 2, prompt: "拉远展现场景", duration: "3" }];
const fields = { model: "kling-v3-omni", modeType: "text2video", ratio: "16:9", quality: "high", duration: 5, multi_shot: true, multi_prompt: shots };
const context = { referenceImages: [], referenceVideos: [], referenceAudios: [] };

test("shot duration uses the same decimal contract as the server plugin", () => {
    for (const duration of ["0x5", "5e0", " 5 ", "05", "+5", "5.0"]) {
        expect(() => readKlingCustomShots([{ index: 1, prompt: "镜头", duration }], true, 5)).toThrow();
    }
    for (const duration of [5, "5"]) {
        expect(readKlingCustomShots([{ index: 1, prompt: "镜头", duration }], true, 5)).toEqual([{ index: 1, prompt: "镜头", duration: "5" }]);
    }
});

test.each(["kling-v3-omni", "kling-video-o3"])("%s preserves custom shot order, text and seconds", model => {
    const result = mapLtvKlingOptions({ ...fields, model }, { image: 0, video: 0, audio: 0 }, 1)!;
    expect(result.videoKling?.multiPrompt).toEqual(shots);
    expect(() => assertKlingRuntimeOptions(result.videoKling!, model === "kling-video-o3" ? "kling-v3" : model, "1080p", "5", "false", context)).not.toThrow();
    const protocol = model === "kling-video-o3" ? "kling-v3-video" : "kling-omni-video";
    expect(klingTaskMetadata(result).providerOptions?.[protocol].multiPrompt).toEqual(shots);
});

test("invalid custom shots are rejected rather than reduced to intelligent shots", () => {
    for (const invalid of ["not an array", [{ ...shots[0], index: 2 }], [{ ...shots[0], prompt: " " }], [{ ...shots[0], duration: "2.5" }], [{ ...shots[0], duration: "4" }], [{ ...shots[0], extra: true }]]) {
        expect(() => mapLtvKlingOptions({ ...fields, multi_prompt: invalid }, { image: 0, video: 0, audio: 0 }, 1)).toThrow();
    }
    expect(() => mapLtvKlingOptions({ ...fields, multi_shot: false }, { image: 0, video: 0, audio: 0 }, 1)).toThrow();
});

test("source custom shots resolve original media references before publishing metadata", () => {
    const params = { ...fields, modeType: "mixed2video", prompt: "保持角色一致", settings: { multi_shot: true }, imageList: [{ nodeId: "image", url: "https://example.test/image.png" }], multi_prompt: shots.map(s => ({ ...s, prompt: "{{Mixed 1}} " + s.prompt })) };
    const converted = adaptLtvNativeProject({ nodes: [
        { id: "image", type: "image", position: { x: 0, y: 0 }, data: { action: "image_resource", content: ["https://example.test/image.png"] } },
        { id: "video", type: "video", position: { x: 300, y: 0 }, data: { action: "video_generate", params } },
    ], edges: [{ id: "edge", source: "image", target: "video" }] }, { channels: [] }, "fixture", "分镜合同");
    expect(converted.adoptable).toBe(true);
    const metadata = converted.project.nodes.find(n => n.id === "video")!.metadata!;
    expect(metadata.videoKling?.multiPrompt).toEqual(shots.map(s => ({ ...s, prompt: "@图片1 " + s.prompt })));
    expect(converted.issues.some(i => i.code === "channel-configuration-required")).toBe(true);
    expect(converted.issues.some(i => i.code === "unmapped-production-parameters")).toBe(false);
});
