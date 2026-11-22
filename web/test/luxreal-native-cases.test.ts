import { expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
    adaptLuxRealCase,
    indexLuxRealMedia,
    packageLuxRealDrafts,
    parseLuxRealSource,
    selectLuxRealEntries,
    type LuxRealCaseContext,
    type LuxRealMedia,
} from "../scripts/adapt-luxreal-cases";
import { readZip } from "../src/lib/zip";

const sourceDir = "E:/桌面文件/映雪创作平台二开资产/二开首要资产/LuxReal完整原版资产金矿/15_视频生成技术链API";
const sourcePath = join(sourceDir, "shot_structure.json");

function fixtureContext(entryIndex = 1): LuxRealCaseContext {
    const media: LuxRealMedia = {
        fileName: "01_template_OSJ32RNSGT65ALUFX73WWZI8.mp4",
        sourcePath: "E:/source/01_template_OSJ32RNSGT65ALUFX73WWZI8.mp4",
        bytes: 123,
        sha256: "b".repeat(64),
        width: 1280,
        height: 720,
        durationMs: 4000,
    };
    return {
        sourceSha256: "a".repeat(64),
        sourceEntrySha256: "c".repeat(64),
        entryIndex,
        media,
        referenceCachePath: "native-lux-example/reference.mp4",
        firstFrame: {
            fileName: "first-frame.webp",
            cachePath: "native-lux-example/first-frame.webp",
            bytes: 456,
            sha256: "d".repeat(64),
            width: 1280,
            height: 720,
        },
        createdAt: "2026-09-24T00:00:00.000Z",
    };
}

test("真实 LuxReal 定义筛选为 28 条可重建与 5 条 null demand 排除，视频逐一对应", () => {
    if (!existsSync(sourcePath)) throw new Error(`缺少已审计 LuxReal 源文件：${sourcePath}`);
    const rawBytes = readFileSync(sourcePath);
    const source = parseLuxRealSource(JSON.parse(rawBytes.toString("utf8")), "a".repeat(64));
    const media = indexLuxRealMedia(join(sourceDir, "素材"));
    const selection = selectLuxRealEntries(source, media);
    expect(source.entries).toHaveLength(33);
    expect(selection.included).toHaveLength(28);
    expect(selection.excluded).toHaveLength(5);
    expect(selection.excluded.every((item) => item.reason.includes("null"))).toBe(true);
    expect(new Set(selection.included.map((item) => item.media.fileName)).size).toBe(28);
    expect(new Set(selection.excluded.map((item) => item.demoVideo)).size).toBe(5);
});

test("null demand 不能直接变成工程", () => {
    const entry = { obsId: "3FO4K4VY8SKT", coverImageUrl: "https://example.test/demo.mp4", functionTag: "Light Sweep", demand: "null" };
    expect(() => adaptLuxRealCase(entry, fixtureContext())).toThrow();
});

test("原生 LuxReal 工程保留视频到首帧到模板到编排到生成的真实连线", () => {
    const entry = {
        obsId: "3FO4K4VY4LGK",
        coverImageUrl: "https://example.test/OSJ32RNSGT65ALUFX73WWZI8.mp4",
        functionTag: "Body Contouring",
        demand: "原始模板：跟拍主体，保留材质运动。",
    };
    const result = adaptLuxRealCase(entry, fixtureContext());
    const { project } = result;
    expect(project.version).toBe(1);
    expect(project.id).toBe("native-lux-3fo4k4vy4lgk");
    expect(project.title).toContain("LuxReal 原生重建");
    expect(project.nodes).toHaveLength(5);
    const reference = project.nodes.find((node) => node.id.endsWith(":reference-video"))!;
    const frame = project.nodes.find((node) => node.id.endsWith(":first-frame"))!;
    const template = project.nodes.find((node) => node.id.endsWith(":template"))!;
    const composer = project.nodes.find((node) => node.id.endsWith(":prompt-composer"))!;
    const generated = project.nodes.find((node) => node.id.endsWith(":image-to-video"))!;
    expect(reference.metadata?.generationMode).toBeUndefined();
    expect(reference.metadata?.content).toBe("/production-library/native-media/native-lux-3fo4k4vy4lgk/reference.mp4");
    expect(frame.metadata?.content).toBe("/production-library/native-media/native-lux-3fo4k4vy4lgk/first-frame.webp");
    expect(frame.metadata?.naturalWidth).toBe(1280);
    expect(frame.width / frame.height).toBeCloseTo(1280 / 720, 4);
    expect(template.metadata?.content).toBe(entry.demand);
    expect(composer.metadata?.content).toBe("");
    expect(composer.metadata?.status).toBe("idle");
    expect(composer.metadata?.generationMode).toBe("text");
    expect(composer.metadata?.composerContent).toContain(entry.demand);
    expect(composer.metadata?.composerContent).toContain("已通过画布上游连线接入");
    expect(composer.metadata?.composerContent).not.toContain(frame.id);
    expect(generated.metadata?.content).toBe("");
    expect(typeof generated.metadata?.prompt).toBe("string");
    expect(String(generated.metadata?.prompt).trim()).not.toBe("");
    expect(typeof generated.metadata?.composerContent).toBe("string");
    expect(String(generated.metadata?.composerContent).trim()).not.toBe("");
    expect(generated.metadata?.status).toBe("idle");
    expect(generated.metadata?.generationMode).toBe("video");
    expect(generated.metadata?.videoEditOperation).toBe("image_to_video");
    expect(generated.metadata?.includeConnectedText).toBe(true);
    expect(generated.metadata?.videoStartFrameNodeId).toBe(frame.id);
    expect(generated.metadata?.strictGenerationOptions).toEqual(["seconds"]);
    expect(generated.metadata?.seconds).toBe("5");
    expect(generated.metadata?.model).toBeUndefined();
    expect((generated.metadata as Record<string, unknown>).generationInputRequirements).toEqual({ image: 1, text: 1 });
    expect((composer.metadata as Record<string, unknown>).generationInputRequirements).toEqual({ image: 1 });
    const pairs = project.connections.map((connection) => `${connection.fromNodeId}->${connection.toNodeId}`);
    expect(pairs).toContain(`${reference.id}->${frame.id}`);
    expect(pairs).toContain(`${frame.id}->${template.id}`);
    expect(pairs).toContain(`${template.id}->${composer.id}`);
    expect(pairs).toContain(`${composer.id}->${generated.id}`);
    expect(pairs).toContain(`${frame.id}->${generated.id}`);
    expect(pairs).not.toContain(`${template.id}->${generated.id}`);
    expect(result.source.demoVideo).toBe("01_template_OSJ32RNSGT65ALUFX73WWZI8.mp4");
    expect(result.entry.summary).toContain("演示视频");
    expect(result.entry.summary).toContain("首帧封面");
    expect(result.publication.status).toBe("draft");
});

test("ZIP 使用无限画布原生 projects.json，工程媒体路径不泄露本机路径", async () => {
    const entry = {
        obsId: "3FO4K4VY4LGK",
        coverImageUrl: "https://example.test/OSJ32RNSGT65ALUFX73WWZI8.mp4",
        functionTag: "Body Contouring",
        demand: "原始模板：跟拍主体。",
    };
    const result = adaptLuxRealCase(entry, fixtureContext());
    const zip = await readZip(await packageLuxRealDrafts([result], "2026-09-24T00:00:00.000Z"));
    expect([...zip.keys()].sort()).toEqual(["projects.json", "说明.txt"]);
    const exportFile = JSON.parse(await zip.get("projects.json")!.text());
    expect(exportFile).toMatchObject({ app: "infinite-canvas", version: 4 });
    expect(exportFile.projects).toHaveLength(1);
    expect(exportFile.projects[0].files).toEqual([]);
    const serialized = JSON.stringify(exportFile.projects[0].project);
    expect(serialized).not.toContain("E:/source/");
    expect(serialized).toContain("/production-library/native-media/native-lux-3fo4k4vy4lgk/");
});
