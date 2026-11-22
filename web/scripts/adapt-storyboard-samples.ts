import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, readdirSync, realpathSync, writeFileSync } from "node:fs";
import { basename, dirname, isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { getNodeSpec } from "../src/constant/canvas";
import { createStoryboardRow } from "../src/lib/canvas/canvas-project-domain";
import { CanvasNodeType, type CanvasNodeData, type CanvasConnection } from "../src/types/canvas";
import { createZip } from "../src/lib/zip";
import type { CanvasExportFile } from "../src/types/canvas-export";
import { assertLibTVImportFitsCanvas } from "../src/lib/canvas/libtv-import";

type Shot = { index: number; scene: string; shotType: string; content: string; duration: string; prompt: string };
type Sample = Record<string, unknown> & { storyboard: Shot[]; prompts: string[] };
const fields = new Set(["reply", "needsClarification", "directorVision", "cast", "locations", "screenplay", "storyboard", "prompts", "episodes", "currentEpisode", "models", "continuityChecklist"]);

function validate(value: unknown): asserts value is Sample {
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("样本必须是 JSON 对象");
    const data = value as Record<string, unknown>;
    if (Object.keys(data).some(key => !fields.has(key))) throw new Error("样本含未审查字段，拒绝导出");
    if (data.needsClarification !== false) throw new Error("样本仍需澄清");
    if (!Array.isArray(data.storyboard) || !data.storyboard.length || data.storyboard.length > 200) throw new Error("分镜数量无效");
    if (!Array.isArray(data.prompts) || data.prompts.length !== data.storyboard.length || data.prompts.some(p => typeof p !== "string" || !p.trim())) throw new Error("提示词与分镜不完整");
    const numbers = new Set<number>();
    for (const shot of data.storyboard) {
        if (!shot || !Number.isSafeInteger(shot.index) || shot.index <= 0 || numbers.has(shot.index)) throw new Error("分镜序号无效或重复");
        numbers.add(shot.index);
        if (["scene", "shotType", "content", "prompt"].some(key => typeof shot[key] !== "string" || !shot[key].trim())) throw new Error("分镜正文或提示词缺失");
        if (typeof shot.duration !== "string" || !/^\d+(?:\.\d+)?秒$/.test(shot.duration) || Number.parseFloat(shot.duration) <= 0 || Number.parseFloat(shot.duration) > 120) throw new Error("分镜时长不能推断或使用默认值");
    }
    const scan = (item: unknown): void => {
        if (!item || typeof item !== "object") return;
        for (const [key, child] of Object.entries(item)) {
            if (/api.?key|authorization|cookie|password|secret|access.?token/i.test(key)) throw new Error("样本含敏感字段，拒绝导出");
            scan(child);
        }
    };
    scan(data);
}

/** Reconstructed draft, not an original execution history. Never publishes or generates media. */
export function adaptStoryboardSample(value: unknown, title: string, sourceSha256: string) {
    validate(value);
    if (!title.trim() || !/^[a-f0-9]{64}$/.test(sourceSha256)) throw new Error("来源标题或 SHA256 无效");
    const id = `sample-${sourceSha256.slice(0, 24)}`;
    const nodes: CanvasNodeData[] = [];
    const connections: CanvasConnection[] = [];
    const add = (suffix: string, type: CanvasNodeType, name: string, x: number, y: number, metadata: CanvasNodeData["metadata"]) => {
        const spec = getNodeSpec(type);
        const node: CanvasNodeData = { ...spec, id: `${id}:${suffix}`, type, title: name, position: { x, y }, metadata: { ...spec.metadata, ...metadata } };
        nodes.push(node);
        return node.id;
    };
    const connect = (fromNodeId: string, toNodeId: string) => connections.push({ id: `${fromNodeId}->${toNodeId}`, fromNodeId, toNodeId });
    const context: string[] = [];
    const sections = [["reply", "创作简报"], ["directorVision", "导演构想"], ["cast", "角色设定"], ["locations", "场景设定"], ["screenplay", "剧本"], ["continuityChecklist", "连续性检查"]] as const;
    sections.forEach(([key, label], index) => {
        if (value[key] === undefined) return;
        context.push(add(key, CanvasNodeType.Text, label, 80, 80 + index * 340, { content: typeof value[key] === "string" ? value[key] as string : JSON.stringify(value[key], null, 2), status: "success" }));
    });
    add("source", CanvasNodeType.Text, "原始样本记录", 80, 2200, { content: JSON.stringify(value, null, 2), status: "success" });
    add("notice", CanvasNodeType.Text, "改编说明与来源", 80, 2540, { content: `依据分镜样本重建的制作草稿，不是原站执行记录。\n来源 SHA256：${sourceSha256}\n原始样本未提供对应图片或成片。全部视频节点尚未生成；推荐模型文案不作为渠道配置。\n原始样本记录保留所有字段，包括备用提示词、分集信息及模型推荐。`, status: "success" });
    const scriptId = `${id}:storyboard`;
    const rows = value.storyboard.map((shot, index) => {
        const videoNodeId = add(`video-${shot.index}`, CanvasNodeType.Video, `镜头 ${shot.index} · ${shot.scene}`, 1680 + (index % 4) * 860, 80 + Math.floor(index / 4) * 560, {
            generationMode: "video", prompt: shot.prompt, composerContent: shot.prompt,
            includeConnectedText: true, status: "idle", workflowKind: "shot", workflowTitle: title,
            seconds: String(Number.parseFloat(shot.duration)), strictGenerationOptions: ["seconds"], videoEditOperation: "text_to_video",
        });
        // Source duration is an exact requirement, not a provider default or an inferred model binding.
        context.forEach(from => connect(from, videoNodeId));
        connections.push({ id: `${scriptId}->${videoNodeId}`, fromNodeId: scriptId, toNodeId: videoNodeId,
            fromHandleId: `row:${id}:row-${shot.index}`, relation: "storyboard-output", storyboardRowId: `${id}:row-${shot.index}` });
        return createStoryboardRow(shot.index, {
            id: `${id}:row-${shot.index}`, durationSeconds: Number.parseFloat(shot.duration),
            plotDescription: shot.content, sceneTags: shot.scene, shotSize: shot.shotType,
            videoMotionPrompt: shot.prompt, videoNodeId, status: "idle",
        });
    });
    add("storyboard", CanvasNodeType.Script, "可编辑分镜表", 580, 80, { status: "success", storyboard: {
        rows, referenceNodeIds: [], visibleColumns: ["shotNumber", "durationSeconds", "plotDescription", "sceneTags", "shotSize", "videoMotionPrompt", "assets"],
    } });
    context.forEach(from => connect(from, scriptId));
    assertLibTVImportFitsCanvas({ nodes: [], connections: [] }, nodes, connections);
    return {
        source: { sha256: sourceSha256, title, kind: "storyboard-sample" as const },
        publication: { status: "draft" as const, blockers: ["missing-corresponding-media", "browser-copy-save-unverified", "generation-unverified"] },
        project: { version: 1, id, title, nodes, connections },
    };
}

export async function packageStoryboardDrafts(results: ReturnType<typeof adaptStoryboardSample>[], exportedAt: string) {
    const data: CanvasExportFile = { app: "infinite-canvas", version: 4, exportedAt, projects: results.map(({ project }) => ({
        project: { ...project, createdAt: exportedAt, updatedAt: exportedAt, chatSessions: [], activeChatId: null,
            backgroundMode: "dots", showImageInfo: true, viewport: { x: 0, y: 0, k: 0.15 }, directorScenes: [] }, files: [],
    })) };
    return createZip([{ name: "projects.json", data: JSON.stringify(data) }, { name: "说明.txt", data: "分镜制作草稿：使用画布列表的导入功能打开。没有生成图片或成片，不是已上架灵感案例。原模型仅为来源推荐文案，生成前需自行选择符合原镜头时长的模型。" }]);
}

if (import.meta.main) {
    const [sourceArg, outputArg] = process.argv.slice(2);
    if (!sourceArg || !outputArg) throw new Error("用法：bun scripts/adapt-storyboard-samples.ts <样本目录> <草稿输出目录>");
    const source = realpathSync(sourceArg);
    const output = resolve(outputArg);
    const webRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
    const cacheRoot = realpathSync(resolve(webRoot, "../.local/cache"));
    const relativeOutput = relative(cacheRoot, output);
    if (!relativeOutput || relativeOutput.startsWith("..") || isAbsolute(relativeOutput)) throw new Error("草稿仅允许输出到本工作树 .local/cache 子目录，不能发布到 public");
    mkdirSync(output, { recursive: true });
    const resolvedOutput = relative(cacheRoot, realpathSync(output));
    if (resolvedOutput.startsWith("..") || isAbsolute(resolvedOutput)) throw new Error("输出目录不能通过链接离开缓存范围");
    const entries = readdirSync(source).filter(name => name.endsWith(".json")).sort().map(name => {
        const bytes = readFileSync(resolve(source, name));
        const digest = createHash("sha256").update(bytes).digest("hex");
        const result = adaptStoryboardSample(JSON.parse(bytes.toString("utf8").replace(/^\uFEFF/, "")), basename(name, ".json").replace(/^\d+_/, ""), digest);
        return { name, result };
    });
    // Validate the complete batch before writing any project so a bad source cannot create a partial release.
    for (const { result } of entries) writeFileSync(resolve(output, `${result.project.id}.json`), JSON.stringify(result, null, 2) + "\n");
    const receipt = { version: 1, published: 0, count: entries.length, shots: entries.reduce((n, { result }) => n + result.project.nodes.filter(node => node.type === CanvasNodeType.Video).length, 0), entries: entries.map(({ name, result }) => ({ file: name, id: result.project.id, sourceSha256: result.source.sha256, nodeCount: result.project.nodes.length, connectionCount: result.project.connections.length, ...result.publication })) };
    writeFileSync(resolve(output, "receipt.json"), JSON.stringify(receipt, null, 2) + "\n");
    const archive = await packageStoryboardDrafts(entries.map(entry => entry.result), new Date().toISOString());
    writeFileSync(resolve(output, "storyboard-drafts.zip"), new Uint8Array(await archive.arrayBuffer()));
    console.log(JSON.stringify({ drafts: receipt.count, shots: receipt.shots, published: 0, output }));
}
