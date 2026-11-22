import { expect, test } from "bun:test";
import { createCanvasNode } from "../src/lib/canvas/canvas-project-domain";
import { storyboardDialogueContext, confirmStoryboardDialogueReferenceReview, storyboardDialogueCsvValue, updateStoryboardDialogueLine } from "../src/lib/canvas/canvas-storyboard-dialogue";
import { storyboardCsv } from "../src/lib/canvas/canvas-storyboard-export";
import { copyStoryboardRow } from "../src/lib/canvas/canvas-node-copy";
import { mapLtvStoryboardRows } from "../src/lib/canvas/ltv-storyboard";
import { prepareLtvStoryboardGraph } from "../src/lib/canvas/ltv-storyboard-graph";
import { CanvasNodeType, type StoryboardRow } from "../src/types/canvas";

test("LTV screenplay maps ordered dialogue and voiceover lines without flattening identity", () => {
    const source = [{
        id: "row-1",
        shotNumber: 1,
        durationSeconds: 5,
        dialogue: "快走！\n现在。",
        voiceover: "雨声渐远。",
        dialogueLines: [
            { kind: "speech", text: "快走！", characterRef: "char-a", entityRefs: [{ text: "快走", assetId: "prop-a" }] },
            { kind: "voiceover", text: "雨声渐远。" },
            { kind: "speech", text: "现在。", characterRef: "char-b" },
        ],
    }];
    const before = JSON.stringify(source);
    const mapped = mapLtvStoryboardRows("script", source, { assets: {
        characters: [{ id: "char-a", name: "小雪" }, { id: "char-b", name: "阿青" }],
        props: [{ id: "prop-a", name: "急行" }],
        scenes: [],
    }, resolveReferences: true });

    expect(mapped.rows[0]).toMatchObject({ dialogue: "", dialogueLines: source[0].dialogueLines });
    expect(mapped.issues).toEqual([]);
    expect(JSON.stringify(source)).toBe(before);
});

test("legacy flat dialogue remains unchanged when no structured lines exist", () => {
    const mapped = mapLtvStoryboardRows("script", [{ id: "old", shotNumber: 1, durationSeconds: 4, dialogue: "原对白" }]);

    expect(mapped.rows[0].dialogue).toBe("原对白");
    expect(Object.hasOwn(mapped.rows[0], "dialogueLines")).toBe(false);
    expect(mapped.issues).toEqual([]);
});

test("unknown dialogue-line kinds, fields, malformed references and flat conflicts remain blockers", () => {
    const mapped = mapLtvStoryboardRows("script", [
        { id: "kind", shotNumber: 1, durationSeconds: 4, dialogueLines: [{ kind: "singing", text: "未知类型" }] },
        { id: "extra", shotNumber: 2, durationSeconds: 4, dialogueLines: [{ kind: "speech", text: "台词", sourceId: "opaque" }] },
        { id: "ref", shotNumber: 3, durationSeconds: 4, dialogueLines: [{ kind: "speech", text: "台词", entityRefs: [{ text: 42, assetId: "p" }] }] },
        { id: "conflict", shotNumber: 4, durationSeconds: 4, dialogue: "旧对白", dialogueLines: [{ kind: "speech", text: "新对白" }] },
    ]);

    expect(mapped.issues.some(issue => issue.path.includes("dialogueLines[0].kind"))).toBe(true);
    expect(mapped.issues.some(issue => issue.path.includes("dialogueLines[0].sourceId"))).toBe(true);
    expect(mapped.issues.some(issue => issue.path.includes("dialogueLines[0].entityRefs[0]"))).toBe(true);
    expect(mapped.issues.some(issue => issue.path.endsWith(".dialogue"))).toBe(true);
    expect(mapped.rows[3].dialogue).toBe("");
    expect(mapped.rows[3].dialogueLines?.[0]?.text).toBe("新对白");
});

test("resolved imported references persist no review state, while missing source asset IDs persist a generation blocker", () => {
    const resolved = mapLtvStoryboardRows("script", [{
        id: "resolved", shotNumber: 1, durationSeconds: 4,
        dialogueLines: [{ kind: "speech", text: "把信交给她", characterRef: "char-a", entityRefs: [{ text: "信", assetId: "prop-a" }] }],
    }], { assets: { characters: [{ id: "char-a", name: "阿岚" }], props: [{ id: "prop-a", name: "信" }], scenes: [] }, resolveReferences: true });
    expect(resolved.issues).toEqual([]);
    expect(resolved.rows[0].dialogueLineIssues).toBeUndefined();
    expect(storyboardDialogueContext(resolved.rows[0])).toContain("把信交给她");

    const unresolved = mapLtvStoryboardRows("script", [{
        id: "missing", shotNumber: 1, durationSeconds: 4,
        dialogueLines: [{ kind: "speech", text: "把信交给她", characterRef: "char-missing", entityRefs: [{ text: "信", assetId: "prop-missing" }] }],
    }], { assets: { characters: [], props: [{ id: "prop-a", name: "信" }], scenes: [] }, resolveReferences: true });
    expect(unresolved.rows[0].dialogueLineIssues).toMatchObject([
        { lineIndex: 0, field: "characterRef", status: "unresolved" },
        { lineIndex: 0, field: "entityRefs", status: "unresolved" },
    ]);
    expect(unresolved.issues.some(issue => issue.path === "rows[0].dialogueLines[0].entityRefs")).toBe(true);
    expect(() => storyboardDialogueContext(unresolved.rows[0])).toThrow("说话人引用尚未解析");
});

test("script-v2 graph import keeps unresolved dialogue references as explicit row and import blockers", () => {
    const prepared = prepareLtvStoryboardGraph({ nodes: [{
        id: "script-v2", type: "script-v2", position: { x: 10, y: 20 },
        data: {
            rows: [{ id: "row", shotNumber: 1, durationSeconds: 4, dialogueLines: [{ kind: "speech", text: "开门", entityRefs: [{ text: "门", assetId: "missing-door" }] }] }],
            assets: { characters: [], scenes: [], props: [{ id: "door", name: "门" }] },
        },
    }] });
    const row = prepared.scripts.get("script-v2")?.storyboard.rows[0];
    expect(row?.dialogueLineIssues).toMatchObject([{ lineIndex: 0, field: "entityRefs", status: "unresolved" }]);
    expect(prepared.issues.some((issue) => issue.code === "storyboard-field-unmapped" && issue.detail.includes("entityRefs"))).toBe(true);
    expect(() => storyboardDialogueContext(row!)).toThrow("实体引用尚未解析");
});

test("editing reference identity or spoken text retains a review gate until explicit confirmation", () => {
    const imported = mapLtvStoryboardRows("script", [{
        id: "edit", shotNumber: 1, durationSeconds: 4,
        dialogueLines: [{ kind: "speech", text: "把信交给她", characterRef: "char-a", entityRefs: [{ text: "信", assetId: "prop-a" }] }],
    }], { assets: { characters: [{ id: "char-a", name: "阿岚" }], props: [{ id: "prop-a", name: "信" }], scenes: [] }, resolveReferences: true });

    const changedText = updateStoryboardDialogueLine(imported.rows[0], 0, { text: "把信交给她，快点" });
    expect(changedText.dialogueLineIssues).toMatchObject([{ field: "entityRefs", status: "needs-review" }]);
    expect(() => storyboardDialogueContext(changedText)).toThrow("实体引用需要复核");
    expect(confirmStoryboardDialogueReferenceReview(changedText, 0, "entityRefs").dialogueLineIssues).toBeUndefined();

    const changedSpeaker = updateStoryboardDialogueLine(imported.rows[0], 0, { characterRef: "char-edited" });
    expect(changedSpeaker.dialogueLineIssues).toMatchObject([{ field: "characterRef", status: "needs-review" }]);
    expect(() => storyboardDialogueContext(changedSpeaker)).toThrow("说话人引用需要复核");
    const checkedSpeaker = confirmStoryboardDialogueReferenceReview(changedSpeaker, 0, "characterRef");
    expect(checkedSpeaker.dialogueLineIssues).toBeUndefined();
    expect(storyboardDialogueContext(checkedSpeaker)).toContain("角色引用 char-edited");
});

test("stale references stay blocked after edits, and CSV carries exact structured data for reconstruction", () => {
    const row = {
        id: "csv", shotNumber: 1, durationSeconds: 3, plotDescription: "", dialogue: "",
        dialogueLines: [
            { kind: "speech", text: "小雨，拿着这封信", characterRef: "char-a", entityRefs: [{ text: "这封信", assetId: "prop-a" }] },
            { kind: "voiceover", text: "门外传来脚步声。" },
        ],
        characters: [], narrativeIntent: "", viewerPOV: "", performanceBlocking: "", shotSize: "", emotion: "",
        lightingAndAtmosphere: "", audioEffects: "", camera: "", motion: "", timeBeats: "", imageGenerationPrompt: "", videoMotionPrompt: "",
        mustHave: [], optionalDetails: [], continuityOut: "", negativePrompt: "", assetBindings: [], status: "idle",
    } satisfies StoryboardRow;
    const changed = updateStoryboardDialogueLine(row, 0, { text: "小雨，拿着另一件东西" });
    expect(changed.dialogueLineIssues).toMatchObject([{ field: "entityRefs", status: "needs-review" }]);
    expect(() => confirmStoryboardDialogueReferenceReview(changed, 0, "entityRefs")).not.toThrow();
    expect(confirmStoryboardDialogueReferenceReview(changed, 0, "entityRefs").dialogueLineIssues).toEqual(changed.dialogueLineIssues);
    expect(() => storyboardDialogueContext(changed)).toThrow("实体引用需要复核");

    const rowForExport = { ...row, dialogueLineIssues: [{ lineIndex: 0, field: "entityRefs", status: "unresolved", detail: "原资产 ID 未匹配" }] } satisfies StoryboardRow;
    const encoded = storyboardDialogueCsvValue(rowForExport);
    expect(JSON.parse(encoded)).toEqual({ lines: rowForExport.dialogueLines, issues: rowForExport.dialogueLineIssues, dialogue: "", voiceover: null });
    const node = createCanvasNode(CanvasNodeType.Script, { x: 0, y: 0 }, { storyboard: { rows: [rowForExport], visibleColumns: ["dialogue"], referenceNodeIds: [] } });
    const csv = storyboardCsv(node, [node], [{ label: "对白", value: "dialogue" }]);
    expect(csv).toContain('"对白结构 JSON（可还原）"');
    expect(csv).toContain(encoded.replaceAll('"', '""'));
});

test("copying a row deep-copies structured lines and review state without rewriting source asset IDs", () => {
    const source = {
        id: "copy-source", shotNumber: 1, durationSeconds: 3, plotDescription: "", dialogue: "",
        dialogueLines: [{ kind: "speech", text: "把信交给她", characterRef: "char-a", entityRefs: [{ text: "信", assetId: "prop-a" }] }],
        dialogueLineIssues: [{ lineIndex: 0, field: "entityRefs", status: "unresolved", detail: "需对照原表" }],
        characters: [], narrativeIntent: "", viewerPOV: "", performanceBlocking: "", shotSize: "", emotion: "",
        lightingAndAtmosphere: "", audioEffects: "", camera: "", motion: "", timeBeats: "", imageGenerationPrompt: "", videoMotionPrompt: "",
        mustHave: [], optionalDetails: [], continuityOut: "", negativePrompt: "", assetBindings: [], status: "idle",
    } satisfies StoryboardRow;
    const copied = copyStoryboardRow(source, new Map());
    expect(copied.dialogueLines).toEqual(source.dialogueLines);
    expect(copied.dialogueLines).not.toBe(source.dialogueLines);
    expect(copied.dialogueLines![0]).not.toBe(source.dialogueLines![0]);
    expect(copied.dialogueLines![0].entityRefs).not.toBe(source.dialogueLines![0].entityRefs);
    expect(copied.dialogueLines![0].entityRefs![0]).not.toBe(source.dialogueLines![0].entityRefs![0]);
    expect(copied.dialogueLineIssues).not.toBe(source.dialogueLineIssues);
    expect(copied.dialogueLineIssues![0]).not.toBe(source.dialogueLineIssues![0]);

    copied.dialogueLines![0].entityRefs![0].assetId = "prop-copy-edit";
    copied.dialogueLineIssues![0].detail = "副本已核对";
    expect(source.dialogueLines![0].entityRefs![0].assetId).toBe("prop-a");
    expect(source.dialogueLineIssues![0].detail).toBe("需对照原表");
    expect(copied.dialogueLines![0].entityRefs![0].assetId).toBe("prop-copy-edit");
});
