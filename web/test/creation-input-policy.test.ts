import { describe, expect, test } from "bun:test";
import { creationCollectionCapabilities, creationInputIssues, creationInputLimits } from "../src/pages/create/creation-input-policy";
import { defaultModelCapabilityConfig } from "../src/lib/model-capabilities";

const defaults = defaultModelCapabilityConfig();
const image = defaults.image!;
const video = { ...defaults.video!, references: { ...defaults.video!.references, maxImages: 2, maxVideos: 1, maxAudios: 1, maxVideoDurationSeconds: 15 } };
const caps = { version: 1, image, video };
const asset = (type: string, name: string, extra = {}) => ({ type, name, bytes: 1024, ...extra });

describe("creation input compatibility", () => {
    test("同名视频模型按整个路由组收集参考，保留大小限制和原模型配置", () => {
        const textOnly = { ...caps, video: { ...video, references: { ...video.references, maxImages: 0, maxVideos: 0, maxAudios: 0, maxVideoBytes: 2048 } } };
        const collection = creationCollectionCapabilities(textOnly, { maxImages: 2, maxVideos: 1, maxAudios: 1 });
        expect(creationInputIssues("video", [asset("video/mp4", "运镜"), asset("audio/wav", "声音")], collection)).toEqual([]);
        expect(creationInputIssues("video", [asset("video/mp4", "大文件", { bytes: 4096 })], collection).join(" ")).toContain("大文件");
        expect(textOnly.video.references.maxVideos).toBe(0);
        expect(creationCollectionCapabilities(textOnly)).toBe(textOnly);
    });
    test("视频的图片、视频、音频分别计数，不能都按参考图上限裁切", () => {
        const inputs = [asset("image/png", "首帧"), asset("image/png", "尾帧"), asset("video/mp4", "运镜"), asset("audio/mp3", "声音")];
        expect(creationInputIssues("video", inputs, caps)).toEqual([]);
        expect(inputs).toHaveLength(4);
    });
    test("更换到不兼容的模式只报告问题，不移除附件", () => {
        const inputs = [asset("video/mp4", "运镜")];
        expect(creationInputIssues("image", inputs, caps).join(" ")).toContain("视频");
        expect(inputs).toHaveLength(1);
    });
    test("视频时长和体积按真实模型限制检查", () => {
        expect(creationInputIssues("video", [asset("video/mp4", "长镜头", { durationMs: 16_000 })], caps).join(" ")).toContain("15 秒");
        const limited = { ...caps, video: { ...video, references: { ...video.references, maxVideoBytes: 2048 } } };
        expect(creationInputIssues("video", [asset("video/mp4", "大文件", { bytes: 2049 })], limited).join(" ")).toContain("大文件");
    });
    test("LTV Agent 素材各类上限独立，保持 20 项，不冒充生成模型上限", () => {
        const inputs = Array.from({ length: 20 }, (_, i) => asset("image/png", `参考${i}`));
        expect(creationInputLimits("agent", caps).image.count).toBe(20);
        expect(creationInputIssues("agent", [...inputs, asset("video/mp4", "片段")], caps)).toEqual([]);
        expect(creationInputIssues("agent", [...inputs, asset("image/png", "额外参考")], caps).join(" ")).toContain("20");
    });
    test("没有图片参考能力的视频模型仍能使用其支持的视频与音频", () => {
        const noImages = { ...caps, video: { ...video, references: { ...video.references, maxImages: 0 } } };
        expect(creationInputIssues("video", [asset("audio/wav", "旁白"), asset("video/mp4", "片段")], noImages)).toEqual([]);
    });
    test("常用文档在文本和 Agent 可保留，在直接视频生成不可提交", () => {
        const inputs = [asset("application/pdf", "分镜脚本.pdf")];
        expect(creationInputIssues("text", inputs, caps)).toEqual([]);
        expect(creationInputIssues("agent", inputs, caps)).toEqual([]);
        expect(creationInputIssues("video", inputs, caps).join(" ")).toContain("文档");
    });
});
