import { expect, test } from "bun:test";
import { applyStudioResult, newStudioDocument, parseStudioShots, studioPrompt } from "../src/lib/creative-studio";
import { buildGeneratedTitleBlendArgs } from "../src/lib/canvas/creative-title-video-plan";
import { canvasAssetHandoffPayloads } from "../src/lib/canvas/canvas-asset-handoff";
import type { Asset } from "../src/stores/use-asset-store";

const row = { scene: "码头", action: "她回头望向轮船", dialogue: "等我回来", camera: "中景缓慢推近", duration: 5, prompt: "电影画面，码头上的女子回头看向轮船" };

test("visible default episode and duration settings are included in the first generation request", () => {
    const doc = newStudioDocument("script-creation");
    expect(studioPrompt(doc, "generate")).toContain("episodes: 1");
    expect(studioPrompt(doc, "generate")).toContain("duration: 60");
    expect(newStudioDocument("creative-title").fields.duration).toBe("5");
});

test("malformed storyboard output never replaces the editable storyboard", () => {
    const doc = { ...newStudioDocument("director-guide"), shots: [{ ...row, id: "existing" }] };
    for (const output of ["模型发生错误", "{}", '{"shots":[]}', JSON.stringify({ shots: [{ ...row, duration: -1 }] }), JSON.stringify({ shots: [{ scene: "missing" }] })]) {
        expect(() => applyStudioResult(doc, "generate", output)).toThrow();
        expect(doc.shots[0].id).toBe("existing");
    }
});

test("single-shot optimization preserves neighboring shots and invalidates old rendered media", () => {
    const doc = { ...newStudioDocument("director-guide"), shots: [{ ...row, id: "a", image: { id: "image", kind: "image" as const, name: "old", url: "/old", storageKey: "resource:old" } }, { ...row, id: "b" }] };
    const result = applyStudioResult(doc, "optimize", JSON.stringify({ shots: [{ ...row, action: "修改后的动作" }] }), "a");
    expect(result.shots[0].id).toBe("a"); expect(result.shots[0].action).toBe("修改后的动作"); expect(result.shots[0].image).toBeUndefined();
    expect(result.shots[1]).toEqual(doc.shots[1]);
    expect(() => applyStudioResult(doc, "optimize", JSON.stringify({ shots: [row] }))).toThrow();
});

test("screenplay, MV settings and shot-specific video instructions reach their generation prompts", () => {
    const script = { ...newStudioDocument("script-creation"), input: "原始故事", result: "原剧本", fields: { mode: "改编", episodes: "3", genre: "悬疑" } };
    expect(studioPrompt(script, "refine", "保留结尾")).toContain("保留结尾");
    expect(studioPrompt(script, "refine", "保留结尾")).toContain("原剧本");
    const director = { ...newStudioDocument("director-guide"), input: "歌词", fields: { mode: "MV", director: "自定义导演" }, shots: [{ ...row, id: "one" }] };
    expect(studioPrompt(director, "generate")).toContain("自定义导演");
    expect(studioPrompt(director, "video", "", "one")).toContain("时长 5 秒");
    expect(() => studioPrompt(director, "video", "", "missing")).toThrow();
    expect(parseStudioShots('```json\n' + JSON.stringify({ shots: [row] }) + '\n```')).toHaveLength(1);
});

test("title blend keeps the original audio and timeline and rejects out-of-range insertion", () => {
    const args = buildGeneratedTitleBlendArgs({ start: 2, length: 5, duration: 12, width: 641, height: 359 });
    expect(args).toContain("0:a?"); expect(args).toContain("12.000"); expect(args.join(" ")).toContain("between(t,2.000,7.000)"); expect(args.join(" ")).toContain("scale=642:360");
    expect(() => buildGeneratedTitleBlendArgs({ start: 8, length: 5, duration: 12, width: 640, height: 360 })).toThrow();
});

test("saved text and versioned character cards are usable canvas handoffs", () => {
    const base = { title: "作品", category: "material", coverUrl: "", tags: [], createdAt: "now", updatedAt: "now" };
    const assets: Asset[] = [{ ...base, id: "text", kind: "text", data: { content: "剧本正文" } }, { ...base, id: "character", kind: "entity", primaryVersionId: "version-1", data: { definition: { appearance: "蓝色外套" }, visualStatus: "ready", voiceStatus: "missing" } }];
    const result = canvasAssetHandoffPayloads(assets, ["text", "character"]);
    expect(result.missingAssetIds).toEqual([]);
    expect(result.payloads[0]).toMatchObject({ kind: "text", content: "剧本正文" });
    expect(result.payloads[1]).toMatchObject({ kind: "character", versionId: "version-1", definition: { appearance: "蓝色外套" } });
    const unversioned = { ...assets[1], primaryVersionId: undefined };
    expect(canvasAssetHandoffPayloads([unversioned], ["character"]).missingAssetIds).toEqual(["character"]);
});
