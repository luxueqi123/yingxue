import type { StoryboardDialogueLine, StoryboardDialogueLineIssue, StoryboardRow } from "@/types/canvas";

function lineLabel(line: StoryboardDialogueLine) {
    if (line.kind === "voiceover") return "旁白";
    return line.characterRef ? `对白 · 角色引用 ${line.characterRef}` : "对白 · 说话人未指定";
}

/** Human-readable projection shared by the canvas, previews, and exports. */
export function storyboardDialogueText(row: StoryboardRow): string {
    if (row.dialogueLines?.length) {
        return row.dialogueLines.map((line) => {
            const references = (line.entityRefs || []).map((reference) => `${reference.text} → ${reference.assetId}`);
            return `${lineLabel(line)}：${line.text}${references.length ? `（实体引用：${references.join("；")}）` : ""}`;
        }).join("\n");
    }
    if (row.voiceover && row.dialogue) return `台词/对白：${row.dialogue}\n旁白：${row.voiceover}`;
    return row.dialogue || (row.voiceover ? `旁白：${row.voiceover}` : "");
}

/** Full text context for first-run generation; line kind, speaker ref and entity refs stay explicit. */
export function storyboardDialogueContext(row: StoryboardRow): string {
    if (row.dialogueLines?.length) {
        const issues = row.dialogueLineIssues || [];
        if (issues.length) {
            const issue = issues[0];
            const field = issue.field === "characterRef" ? "说话人引用" : "实体引用";
            throw new Error(`第 ${issue.lineIndex + 1} 条台词的${field}${issue.status === "needs-review" ? "需要复核" : "尚未解析"}：${issue.detail}`);
        }
        for (const [lineIndex, line] of row.dialogueLines.entries()) {
            if ((line.entityRefs || []).some((reference) => !reference.text.trim() || !reference.assetId.trim() || !line.text.includes(reference.text))) {
                throw new Error(`第 ${lineIndex + 1} 条台词的实体引用文本已变化，需要复核后再生成`);
            }
        }
        return storyboardDialogueText(row);
    }
    return storyboardDialogueText(row);
}

/** Update one structured line without creating a second editable flat-dialogue value. */
export function updateStoryboardDialogueLine(
    row: StoryboardRow,
    lineIndex: number,
    patch: Partial<StoryboardDialogueLine>,
): StoryboardRow {
    const lines = row.dialogueLines;
    const line = lines?.[lineIndex];
    if (!lines || !line) throw new Error("结构化台词行不存在");
    const nextLine = { ...line, ...patch };
    const nextLines = [...lines];
    nextLines[lineIndex] = nextLine;
    const previousIssues = (row.dialogueLineIssues || []).filter((issue) => issue.lineIndex === lineIndex);
    const retainedIssues = (row.dialogueLineIssues || []).filter((issue) => issue.lineIndex !== lineIndex);
    const explicitlyEditedSpeaker = Object.prototype.hasOwnProperty.call(patch, "characterRef");
    const explicitlyEditedEntityReferences = Object.prototype.hasOwnProperty.call(patch, "entityRefs");
    const editedTextWithReferences = Object.prototype.hasOwnProperty.call(patch, "text") && (nextLine.entityRefs || []).length > 0;

    const previousSpeakerIssue = previousIssues.find((issue) => issue.field === "characterRef");
    if (nextLine.characterRef?.trim()) {
        if (previousSpeakerIssue || explicitlyEditedSpeaker) {
            retainedIssues.push({
                ...(previousSpeakerIssue || { lineIndex, field: "characterRef" as const, status: "needs-review" as const, detail: "说话人引用已编辑，请对照原角色表核对后再生成" }),
                status: explicitlyEditedSpeaker ? "needs-review" : previousSpeakerIssue!.status,
                detail: explicitlyEditedSpeaker ? "说话人引用已编辑，请对照原角色表核对后再生成" : previousSpeakerIssue!.detail,
            });
        }
    }

    const entityReferences = nextLine.entityRefs || [];
    const previousEntityIssue = previousIssues.find((issue) => issue.field === "entityRefs");
    if (entityReferences.length) {
        const needsReview = explicitlyEditedEntityReferences || editedTextWithReferences;
        if (previousEntityIssue || needsReview) {
            retainedIssues.push({
                lineIndex,
                field: "entityRefs",
                status: "needs-review",
                detail: needsReview
                    ? "台词或实体引用已编辑，请对照原始资产表核对后再生成"
                    : previousEntityIssue!.detail,
            });
        }
        if (entityReferences.some((reference) => !reference.text.trim() || !reference.assetId.trim() || !nextLine.text.includes(reference.text))) {
            const existingIssue = retainedIssues.find((issue) => issue.lineIndex === lineIndex && issue.field === "entityRefs");
            if (existingIssue) existingIssue.detail = "实体引用需同时含正文中的引用文字与原资产 ID，修正并人工核对后再生成";
            else retainedIssues.push({
                lineIndex,
                field: "entityRefs",
                status: "needs-review",
                detail: "实体引用需同时含正文中的引用文字与原资产 ID，修正并人工核对后再生成",
            });
        }
    }
    return { ...row, dialogueLines: nextLines, dialogueLineIssues: retainedIssues.length ? retainedIssues : undefined };
}

/** A user can clear an unresolved imported binding only after explicitly checking the source table. */
export function confirmStoryboardDialogueReferenceReview(
    row: StoryboardRow,
    lineIndex: number,
    field: StoryboardDialogueLineIssue["field"],
): StoryboardRow {
    const line = row.dialogueLines?.[lineIndex];
    if (!line) throw new Error("结构化台词行不存在");
    const hasUsableReference = field === "characterRef"
        ? Boolean(line.characterRef?.trim())
        : (line.entityRefs || []).length > 0 && (line.entityRefs || []).every((reference) =>
            Boolean(reference.text.trim() && reference.assetId.trim() && line.text.includes(reference.text)),
        );
    if (!hasUsableReference) return row;
    const remainingIssues = (row.dialogueLineIssues || []).filter((issue) => issue.lineIndex !== lineIndex || issue.field !== field);
    return { ...row, dialogueLineIssues: remainingIssues.length ? remainingIssues : undefined };
}

export function dialogueLineReviewIssue(row: StoryboardRow, lineIndex: number, field: StoryboardDialogueLineIssue["field"]) {
    return row.dialogueLineIssues?.find((issue) => issue.lineIndex === lineIndex && issue.field === field);
}

/** JSON cell includes both the exact source line data and the explicit edit/readiness state. */
export function storyboardDialogueCsvValue(row: StoryboardRow) {
    return JSON.stringify({ lines: row.dialogueLines || [], issues: row.dialogueLineIssues || [], dialogue: row.dialogue, voiceover: row.voiceover ?? null });
}
