export type StudioTool = "script-creation" | "director-guide" | "creative-title";

export function studioWorkPath(pathname: string, search: string, workId: string) {
    const params = new URLSearchParams(search);
    params.set("work", workId);
    return `${pathname}?${params.toString()}`;
}

export type StudioMedia = { id: string; url: string; storageKey: string; kind: "image" | "video" | "audio"; name: string; mimeType?: string; source?: "reference" | "generated" };
export type StudioShot = { id: string; scene: string; action: string; dialogue: string; camera: string; duration: number; prompt: string; image?: StudioMedia; video?: StudioMedia };
export type StudioDocument = {
    version: 1; id: string; tool: StudioTool; title: string; input: string; result: string;
    fields: Record<string, string>; shots: StudioShot[]; media: StudioMedia[];
    presets: Array<{ id: string; name: string; prompt: string; kind: "style" | "motion" | "director" }>;
    runs: Array<{ taskId: string; stage: string; targetId?: string }>;
    createdAt: string; updatedAt: string;
};

export function newStudioDocument(tool: StudioTool): StudioDocument {
    const now = new Date().toISOString();
    const fields: Record<string, string> = tool === "script-creation" ? { mode: "原创", episodes: "1", duration: "60" } : tool === "director-guide" ? { mode: "电影", duration: "5" } : { duration: "5" };
    return { version: 1, id: crypto.randomUUID(), tool, title: "", input: "", result: "", fields, shots: [], media: [], presets: [], runs: [], createdAt: now, updatedAt: now };
}

export function parseStudioShots(text: string): StudioShot[] {
    const raw = text.trim().replace(/^```(?:json)?\s*/, "").replace(/\s*```$/, "");
    const parsed: unknown = JSON.parse(raw);
    const rows = Array.isArray(parsed) ? parsed : parsed && typeof parsed === "object" && "shots" in parsed ? parsed.shots : null;
    if (!Array.isArray(rows) || rows.length < 1 || rows.length > 100) throw new Error("模型未返回有效的分镜表，请检查任务结果后重试。");
    return rows.map((row: unknown) => {
        if (!row || typeof row !== "object") throw new Error("分镜数据无效。");
        const item = row as Record<string, unknown>;
        if (!["scene", "action", "dialogue", "camera", "prompt"].every(key => typeof item[key] === "string") || !String(item.action).trim() || !String(item.prompt).trim() || typeof item.duration !== "number" || !Number.isFinite(item.duration) || item.duration <= 0 || item.duration > 120) throw new Error("分镜缺少画面、生成提示词或有效时长，未覆盖原有内容。");
        return { id: crypto.randomUUID(), scene: item.scene as string, action: item.action as string, dialogue: item.dialogue as string, camera: item.camera as string, prompt: item.prompt as string, duration: item.duration };
    });
}

export function studioPrompt(doc: StudioDocument, stage: string, instruction = "", targetId?: string) {
    const settings = Object.entries(doc.fields).filter(([, value]) => value.trim()).map(([key, value]) => `${key}: ${value}`).join("\n");
    if (doc.tool === "script-creation") return [
        "你是专业影视编剧。根据用户的题材、剧本结构、人物、时长与集数创作或改编可直接继续制作的剧本。保留用户明确指定的剧情、人物关系和台词意图。",
        "按集/场次输出，包含内外景、地点、时间、人物、动作、台词和情绪转折。只输出剧本正文，不生成图片或视频。",
        `设定：\n${settings}`, `主题或原故事：\n${doc.input}`,
        stage === "refine" ? `待精修剧本：\n${doc.result}\n修改要求：${instruction}` : "",
    ].filter(Boolean).join("\n\n");
    if (doc.tool === "director-guide") {
        const target = targetId ? doc.shots.filter(shot => shot.id === targetId) : doc.shots;
        if (stage === "image" || stage === "video") {
            if (target.length !== 1) throw new Error("请先选择一个镜头。");
            return [`拍摄设定：\n${settings}`, target[0].prompt, `画面动作：${target[0].action}`, `镜头：${target[0].camera}`, stage === "video" ? `时长 ${target[0].duration} 秒，台词：${target[0].dialogue}` : "生成单幅电影画面。"].join("\n\n");
        }
        return ["你是影视导演。按照用户选择的电影/MV模式、导演角色、叙事节奏和拍摄设定，产出可执行的分镜。MV需依据用户提供的歌词/节拍安排镜头，不能编造未提供的音频检测结果。",
            `设定：\n${settings}`, `剧本或歌词：\n${doc.input}`, stage === "optimize" ? `优化要求：${instruction}\n待优化分镜：${JSON.stringify(target)}` : "",
            '只输出JSON对象 {"shots":[{"scene":"场景","action":"画面动作","dialogue":"台词或空字符串","camera":"景别、机位和运镜","duration":5,"prompt":"可用于画面/视频生成的完整描述"}]}。不输出Markdown。时长必须为1到120之间的数字。',
        ].filter(Boolean).join("\n\n");
    }
    return [stage === "image" ? "基于参考画面设计电影片头。保持画面主要人物、场景和构图，将用户片名准确完整融入设计。" : "基于参考的片名设计图生成片头文字动效，片名字形与拼写保持一致，保持画面主体连续。",
        `片名：${doc.title}`, `风格与参数：\n${settings}`, `用户要求：${doc.input}`, instruction,
    ].filter(Boolean).join("\n\n");
}

export function applyStudioResult(doc: StudioDocument, stage: string, text: string, targetId?: string): StudioDocument {
    if (!text.trim()) throw new Error("模型没有返回可用正文。");
    if (doc.tool !== "director-guide") return { ...doc, result: text };
    const rows = parseStudioShots(text);
    if (targetId) {
        if (rows.length !== 1 || !doc.shots.some(shot => shot.id === targetId)) throw new Error("单镜头优化结果与选中镜头不匹配，未覆盖原内容。");
        return { ...doc, shots: doc.shots.map(shot => shot.id === targetId ? { ...rows[0], id: targetId } : shot) };
    }
    if (stage === "optimize" && rows.length !== doc.shots.length) throw new Error("批量优化改变了镜头数量，未覆盖原内容。");
    return { ...doc, shots: rows };
}
