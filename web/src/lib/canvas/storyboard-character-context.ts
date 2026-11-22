import type { StoryboardRow } from "@/types/canvas";

export function storyboardCharacterContext(row: Pick<StoryboardRow, "characters">) {
    const people = (row.characters || []).filter(character => !character.characterAssetId || character.characterDescription);
    const descriptions = people.filter(character => character.characterName.trim()).map(character => `${character.characterName.trim()}：${character.characterDescription?.trim() || "沿用已确认人物外观"}`);
    return descriptions.length ? `当前人物要求（人物细节以此为准）：\n${descriptions.join("\n")}` : "";
}

export function storyboardRowPrompt(row: StoryboardRow, kind: "image" | "video") {
    const prompt = (kind === "image" ? row.imageGenerationPrompt : row.videoMotionPrompt) || row.plotDescription;
    if (!prompt.trim()) return "";
    return [prompt.trim(), storyboardCharacterContext(row)].filter(Boolean).join("\n\n");
}
