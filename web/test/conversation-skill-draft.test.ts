import { describe, expect, test } from "bun:test";
import { conversationSkillDraftIdea } from "../src/lib/canvas/conversation-skill-draft";

describe("conversation skill draft", () => {
    test("includes only completed visible user and assistant text", () => {
        const result = conversationSkillDraftIdea([
            { role: "user", text: "制作角色设定" },
            { role: "tool", text: "private tool payload" },
            { role: "assistant", text: "hidden reasoning", reasoning: true },
            { role: "assistant", text: "partial", streaming: true },
            { role: "assistant", text: "先分析轮廓，再整理服装与配色" },
        ]);
        expect(result).toContain("制作角色设定");
        expect(result).toContain("先分析轮廓");
        expect(result).not.toContain("private tool");
        expect(result).not.toContain("hidden reasoning");
        expect(result).not.toContain("partial");
    });
    test("empty conversation cannot become a draft; long context is bounded and disclosed", () => {
        expect(conversationSkillDraftIdea([{ role: "error", text: "failed" }])).toBe("");
        const result = conversationSkillDraftIdea([{ role: "user", text: "a".repeat(20000) }]);
        expect(result.length).toBeLessThanOrEqual(12000);
        expect(result).toContain("截取");
    });
});
