import type { CanvasNodeData, StoryboardColumn, StoryboardRow } from "@/types/canvas";
import { ltvStoryboardSourceColumns } from "./ltv-storyboard";
import { storyboardDialogueCsvValue, storyboardDialogueText } from "./canvas-storyboard-dialogue";

const sourceFields: Record<string, StoryboardColumn> = {
    shot_number: "shotNumber", duration_seconds: "durationSeconds", plot_description: "plotDescription",
    shot_size: "shotSize", character_action: "performanceBlocking", emotion: "emotion", scene_tags: "sceneTags",
    prop_tags: "propTags", lighting_and_atmosphere: "lightingAndAtmosphere", audio_effects: "audioEffects",
    dialogue: "dialogue", image_generation_prompt: "imageGenerationPrompt", video_motion_prompt: "videoMotionPrompt",
    characters: "characters", video_reference: "videoReference",
};

type ExportColumn = { label: string; read: (row: StoryboardRow) => string | number };

/** Source labels/order are preserved, with native fields appended rather than discarded. */
export function storyboardCsv(node: CanvasNodeData, nodes: CanvasNodeData[], options: Array<{ label: string; value: StoryboardColumn }>) {
    const rows = node.metadata?.storyboard?.rows || [];
    const nodeById = new Map(nodes.map(item => [item.id, item]));
    const videoStory = node.metadata?.ltvStoryboardSource?.videoStory;
    const source = videoStory ? [] : ltvStoryboardSourceColumns(node.metadata?.ltvStoryboardSource?.columns);
    const ordered = source.map(column => ({ label: column.label, value: sourceFields[column.field] }));
    const sourceKeys = new Set(ordered.map(column => column.value));
    ordered.push(...options.filter(column => !sourceKeys.has(column.value)));
    const characterCount = rows.reduce((count, row) => Math.max(count, row.characters?.length || 0), 0);
    const originalColumns = videoStory && Array.isArray(videoStory.columns) ? videoStory.columns as Array<{ field: string; label: string }> : [];
    const originalRows = videoStory && Array.isArray(videoStory.rows) ? videoStory.rows as Array<Record<string, unknown>> : [];
    // Original analysis columns are an immutable source receipt. Edited native fields follow them.
    const columns: ExportColumn[] = originalColumns.map(column => ({ label: column.label, read: row => {
        const index = Number(row.id.slice(`${node.id}:row:`.length));
        const original = row.id.startsWith(`${node.id}:row:`) && Number.isSafeInteger(index) ? originalRows[index] : undefined;
        const value = original?.[column.field];
        return typeof value === "string" || typeof value === "number" ? value : value == null ? "" : JSON.stringify(value);
    } }));
    const hasStructuredDialogue = rows.some(row => row.dialogueLines?.length || row.voiceover !== undefined);
    let dialogueStructureExported = false;
    for (const column of ordered) {
        if (column.value === "characters") {
            for (let index = 0; index < characterCount; index++) {
                columns.push(
                    { label: `${column.label}${index + 1}名称`, read: row => row.characters[index]?.characterName || "" },
                    { label: `${column.label}${index + 1}描述`, read: row => row.characters[index]?.characterDescription || "" },
                    { label: `${column.label}${index + 1}图片`, read: row => nodeById.get(row.characters[index]?.characterImageNodeId || "")?.metadata?.content || "" },
                );
            }
        } else if (column.value === "videoReference") {
            columns.push(
                { label: `${column.label}开始时间`, read: row => row.videoReference?.startTime ?? "" },
                { label: `${column.label}结束时间`, read: row => row.videoReference?.endTime ?? "" },
                { label: `${column.label}图片`, read: row => row.videoReference?.referenceFrameImage || "" },
            );
        } else if (column.value === "assets") {
            columns.push({ label: column.label, read: row => JSON.stringify((row.assetBindings || []).map(binding => ({ ...binding, title: nodeById.get(binding.nodeId)?.title || binding.nodeId }))) });
            if(rows.some(row=>row.generationReferenceNodeIds))for(const [mode,label] of [['image','生图参考'],['video','视频参考']] as const){
                columns.push({label,read:row=>JSON.stringify((row.generationReferenceNodeIds?.[mode]||[]).map(nodeId=>({nodeId,title:nodeById.get(nodeId)?.title||nodeId})))});
            }
        } else if (column.value === "dialogue") {
            columns.push({ label: column.label, read: row => storyboardDialogueText(row) });
            if (hasStructuredDialogue && !dialogueStructureExported) {
                columns.push({ label: "对白结构 JSON（可还原）", read: row => storyboardDialogueCsvValue(row) });
                dialogueStructureExported = true;
            }
        } else {
            const field = column.value;
            columns.push({ label: column.label, read: row => {
                const value = row[field];
                return typeof value === "string" || typeof value === "number" ? value : value == null ? "" : JSON.stringify(value);
            } });
        }
    }
    if (hasStructuredDialogue && !dialogueStructureExported) columns.push({ label: "对白结构 JSON（可还原）", read: row => storyboardDialogueCsvValue(row) });
    return "\ufeff" + [columns.map(column => column.label), ...rows.map(row => columns.map(column => column.read(row)))].map(values => values.map(csvCell).join(",")).join("\r\n");
}

function csvCell(value: string | number) {
    const text = String(value);
    const literal = typeof value === "string" && /^[\s]*[=+@-]/.test(text) ? "'" + text : text;
    return `"${literal.replaceAll('"', '""')}"`;
}
