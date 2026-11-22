import type { Skill } from "@/services/api/skills";
import { CanvasNodeType, type CanvasNodeData } from "@/types/canvas";

export type CanvasSkillResource = Pick<Skill, "skillId" | "skillName" | "description" | "instruction" | "version" | "files" | "tag">;

export function canvasSkillResources(skills: Skill[], nodes: CanvasNodeData[]): CanvasSkillResource[] {
    const resources = new Map<string, CanvasSkillResource>();
    for (const node of nodes) {
        const snapshot = node.type === CanvasNodeType.Skill ? node.metadata?.skillSnapshot : undefined;
        if (!snapshot?.id || !snapshot.template?.trim() || resources.has(snapshot.id)) continue;
        resources.set(snapshot.id, { skillId: snapshot.id, skillName: snapshot.name, description: snapshot.description, instruction: snapshot.template, version: String(snapshot.version), files: snapshot.files, tag: snapshot.tags?.join("、") || "" });
    }
    for (const skill of skills) {
        if (skill.isAdded && !resources.has(skill.skillId)) resources.set(skill.skillId, skill);
    }
    return [...resources.values()];
}

/** Resource reads are confined to this chosen skill; a file name is never a filesystem path. */
export function readSkillResource(skill: CanvasSkillResource, filePath?: string, offset = 0) {
    if (!filePath) return {
        skillId: skill.skillId, name: skill.skillName, description: skill.description,
        instruction: skill.instruction || skill.description, version: skill.version,
        files: (skill.files || []).map(file => ({ path: file.path, characters: file.content.length })),
    };
    const file = skill.files?.find(item => item.path === filePath);
    if (!file) throw new Error("技能中没有这个配套文件，请使用返回的文件索引。");
    const start = Number.isFinite(offset) ? Math.max(0, Math.floor(offset)) : 0;
    if (start > file.content.length) throw new Error("读取位置超出文件范围。");
    const content = file.content.slice(start, start + 12_000);
    return { skillId: skill.skillId, path: file.path, content, offset: start, total: file.content.length, nextOffset: start + content.length < file.content.length ? start + content.length : null };
}
