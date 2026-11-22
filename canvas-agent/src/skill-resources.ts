export type AgentSkillFile = { path: string; content: string };

export function parseSkillResourceFiles(value: unknown): AgentSkillFile[] {
    if (value === undefined) return [];
    if (!Array.isArray(value) || value.length > 128) throw new Error("技能配套文件数量无效");
    const seen = new Set<string>();
    let characters = 0;
    return value.map(item => {
        if (!item || typeof item !== "object" || typeof item.path !== "string" || typeof item.content !== "string") throw new Error("技能配套文件格式无效");
        const name: string = item.path.replaceAll("\\", "/");
        if (!name || name.length > 240 || /[:\x00-\x1f]/.test(name) || name.split("/").some(part => !part || part === "." || part === ".." || /[. ]$/.test(part) || /^(con|prn|aux|nul|com\d|lpt\d)(\.|$)/i.test(part))) throw new Error("技能配套文件必须使用安全的相对路径");
        if (name.toLowerCase() === "skill.md" || seen.has(name.toLowerCase())) throw new Error("技能配套文件路径重复或覆盖入口");
        seen.add(name.toLowerCase());
        characters += item.content.length;
        if (characters > 1_000_000) throw new Error("技能配套文件过大，无法完整加载");
        return { path: name, content: item.content };
    });
}
