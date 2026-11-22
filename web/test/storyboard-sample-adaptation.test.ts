import { expect, test } from "bun:test";
import { adaptStoryboardSample, packageStoryboardDrafts } from "../scripts/adapt-storyboard-samples";
import { copyStoryboardRow } from "../src/lib/canvas/canvas-node-copy";
import { readZip } from "../src/lib/zip";
import { assessCaseModels } from "../src/lib/canvas/production-case-model-readiness";
import { defaultConfig } from "../src/stores/use-config-store";

const source = {
    reply: "雨夜归人", needsClarification: false,
    directorVision: { visualStyle: "水墨冷青" },
    cast: [{ name: "归人", appearance: "白衣" }], locations: [{ name: "山道" }],
    screenplay: { scenes: [{ location: "山道", action: "独行" }] },
    storyboard: [
        { index: 1, scene: "山道", shotType: "远景", content: "独行", duration: "4秒", prompt: "雨夜山道远景" },
        { index: 2, scene: "山道", shotType: "特写", content: "回眸", duration: "2.5秒", prompt: "人物回眸特写" },
    ],
    prompts: ["另一份原始远景提示词", "人物回眸特写"],
    episodes: [{ title: "归来" }], currentEpisode: 1,
    models: ["某视频模型——这是推荐文案，不是模型ID"], continuityChecklist: ["服装一致"],
};
const digest = "a".repeat(64);

test("保留来源、分镜与两份不同提示词，生成原生可编辑草稿且不伪造模型或成片", () => {
    const result = adaptStoryboardSample(source, "雨夜归人", digest);
    expect(result).toEqual(adaptStoryboardSample(source, "雨夜归人", digest));
    expect(result.publication.status).toBe("draft");
    expect(result.publication.blockers).toContain("missing-corresponding-media");
    expect(result.source.sha256).toBe(digest);
    const script = result.project.nodes.find((node: any) => node.type === "script")!;
    expect(script.metadata.storyboard.rows.map((row: any) => row.durationSeconds)).toEqual([4, 2.5]);
    expect(script.metadata.storyboard.rows.map((row: any) => row.videoMotionPrompt)).toEqual(source.storyboard.map(row => row.prompt));
    const videos = result.project.nodes.filter((node: any) => node.type === "video");
    expect(videos).toHaveLength(2);
    expect(videos.map((node: any) => node.metadata.seconds)).toEqual(["4", "2.5"]);
    expect(assessCaseModels(result.project.nodes, { ...defaultConfig, channels: [] })).toHaveLength(2);
    for (const video of videos) {
        expect(video.metadata.status).toBe("idle");
        expect(video.metadata.model).toBeUndefined();
        expect(video.metadata.content || "").toBe("");
        expect(result.project.connections.some((edge: any) => edge.toNodeId === video.id)).toBe(true);
    }
    const original = result.project.nodes.find((node: any) => node.title === "原始样本记录")!;
    expect(JSON.parse(original.metadata.content)).toEqual(source);
    const ids = new Map<string, string>(result.project.nodes.map((node: any) => [node.id, `copy-${node.id}`]));
    for (const row of script.metadata.storyboard.rows) {
        expect(ids.has(row.videoNodeId)).toBe(true);
        expect(copyStoryboardRow(row, ids).videoNodeId).toBe(ids.get(row.videoNodeId));
    }
});

test("原生 ZIP 可重新读取全部工程，保持镜头引用且没有虚构媒体文件", async () => {
    const result = adaptStoryboardSample(source, "雨夜归人", digest);
    const zip = await readZip(await packageStoryboardDrafts([result], "2026-09-24T00:00:00.000Z"));
    const file = JSON.parse(await zip.get("projects.json")!.text());
    expect(file.app).toBe("infinite-canvas");
    expect(file.projects).toHaveLength(1);
    expect(file.projects[0].project.nodes).toEqual(JSON.parse(JSON.stringify(result.project.nodes)));
    expect(file.projects[0].project.connections).toEqual(result.project.connections);
    expect(file.projects[0].files).toEqual([]);
});

test("缺失提示词、重复镜号、未知时长及需澄清样本不能静默变成工程", () => {
    expect(() => adaptStoryboardSample({ ...source, needsClarification: true }, "测试", digest)).toThrow();
    expect(() => adaptStoryboardSample({ ...source, storyboard: [] }, "测试", digest)).toThrow();
    expect(() => adaptStoryboardSample({ ...source, prompts: [] }, "测试", digest)).toThrow();
    for (const patch of [{ index: 1 }, { duration: "未知" }, { prompt: "" }]) {
        expect(() => adaptStoryboardSample({ ...source, storyboard: [source.storyboard[0], { ...source.storyboard[1], ...patch }] }, "测试", digest)).toThrow();
    }
    expect(() => adaptStoryboardSample({ ...source, apiKey: "not-a-real-key" }, "测试", digest)).toThrow();
});
