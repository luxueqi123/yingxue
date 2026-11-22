export type TitleDesign = { text: string; position: "top" | "center" | "bottom"; style: "serif" | "sans"; size: number };

export function validateTitleDesign(input: TitleDesign): TitleDesign {
    const text = input.text.trim();
    if (!text || text.length > 120 || text.split("\n").length > 3) throw new Error("片名需为 1–120 字，最多三行。");
    if (!["top", "center", "bottom"].includes(input.position) || !["serif", "sans"].includes(input.style)) throw new Error("片名样式无效。");
    if (!Number.isFinite(input.size) || input.size < 3 || input.size > 15) throw new Error("字号需为画面高度的 3%–15%。");
    return { ...input, text };
}

export async function renderTitleFrame(frame: Blob, input: TitleDesign, transparent = false): Promise<Blob> {
    const design = validateTitleDesign(input);
    const image = await createImageBitmap(frame);
    try {
        const canvas = document.createElement("canvas");
        canvas.width = image.width; canvas.height = image.height;
        const context = canvas.getContext("2d");
        if (!context) throw new Error("浏览器未能创建片名画布。");
        if (!transparent) context.drawImage(image, 0, 0);
        const lines = design.text.split("\n");
        const family = design.style === "serif" ? '"Noto Serif SC", "Songti SC", SimSun, serif' : '"Microsoft YaHei", sans-serif';
        let fontSize = canvas.height * design.size / 100;
        context.font = `600 ${fontSize}px ${family}`;
        const longest = Math.max(...lines.map(line => context.measureText(line).width));
        if (longest > canvas.width * 0.84) fontSize *= canvas.width * 0.84 / longest;
        context.font = `600 ${fontSize}px ${family}`;
        context.textAlign = "center"; context.textBaseline = "middle";
        const halfHeight = fontSize * (0.6 + (lines.length - 1) * 1.35 / 2);
        const desiredCenter = canvas.height * (design.position === "top" ? 0.22 : design.position === "bottom" ? 0.78 : 0.5);
        const center = Math.max(halfHeight + canvas.height * 0.05, Math.min(canvas.height * 0.95 - halfHeight, desiredCenter));
        context.fillStyle = "#fff"; context.shadowColor = "rgba(0,0,0,0.85)";
        context.shadowBlur = fontSize * 0.16; context.shadowOffsetY = fontSize * 0.04;
        lines.forEach((line, index) => context.fillText(line, canvas.width / 2, center + (index - (lines.length - 1) / 2) * fontSize * 1.35));
        return await new Promise<Blob>((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error("片名图片导出失败。")), "image/png"));
    } finally { image.close(); }
}
