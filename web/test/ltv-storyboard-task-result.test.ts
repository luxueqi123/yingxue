import { expect, test } from "bun:test";
import { storyboardRowsFromTask } from "../src/lib/canvas/canvas-project-domain";
import type { GenerationTask } from "../src/services/api/task-center";

test("导入分镜任务恢复保留长表、小数时长与后续制作字段", () => {
    const rows = Array.from({ length: 17 }, (_, index) => ({
        shotNumber: index + 1,
        durationSeconds: 0.5,
        plotDescription: "雨夜推门",
        performanceBlocking: "左手推门",
        sceneTags: "雨夜室内",
        propTags: "红伞",
        imageGenerationPrompt: "雨夜室内，左手推门，红伞",
        videoMotionPrompt: "固定机位，推门",
        imagePromptTemplateVariables: { 首帧构图: "雨夜室内，红伞" },
        videoPromptTemplateVariables: { 动作: "推门" },
        characters: [],
        assetBindings: [],
    }));
    const restored = storyboardRowsFromTask({ resultJson: JSON.stringify({ title: "雨夜", rows }) } as GenerationTask);
    expect(restored.rows).toHaveLength(17);
    expect(new Set(restored.rows.map(row => row.id)).size).toBe(17);
    for (const row of restored.rows) {
        expect(row.durationSeconds).toBe(0.5);
        expect(row.sceneTags).toBe("雨夜室内");
        expect(row.propTags).toBe("红伞");
        expect(row.performanceBlocking).toBe("左手推门");
        expect(row.imageGenerationPrompt).toContain("红伞");
        expect(row.imagePromptTemplateVariables?.首帧构图).toContain("红伞");
        expect(row.videoPromptTemplateVariables?.动作).toBe("推门");
    }
});
