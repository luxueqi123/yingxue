import { createHash } from "node:crypto";
import { copyFileSync, mkdirSync, readFileSync, readdirSync, realpathSync, renameSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { basename, dirname, isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { getNodeSpec } from "../src/constant/canvas";
import { createZip } from "../src/lib/zip";
import { assertLibTVImportFitsCanvas } from "../src/lib/canvas/libtv-import";
import { CanvasNodeType, type CanvasConnection, type CanvasNodeData } from "../src/types/canvas";
import type { CanvasExportFile } from "../src/types/canvas-export";

const SOURCE_PACK = "LuxReal完整原版资产金矿";
const SOURCE_FILE = "15_视频生成技术链API/shot_structure.json";
const PUBLIC_MEDIA_ROOT = "/production-library/native-media";
const DEFAULT_SECONDS = "5";
const PYTHON = String.raw`
import json
import sys

import av

from PIL import Image

source, destination = sys.argv[1], sys.argv[2]
with av.open(source) as container:
    stream = next((item for item in container.streams if item.type == "video"), None)
    if stream is None:
        raise RuntimeError("video stream missing")
    frame = next(container.decode(stream))
    image = frame.to_image()
    image.save(destination, format="WEBP", lossless=True, method=6)
    duration_ms = None
    if container.duration is not None:
        duration_ms = round(container.duration / 1000)
    print(json.dumps({"width": frame.width, "height": frame.height, "durationMs": duration_ms}, separators=(",", ":")))
`;

type AnyRecord = Record<string, unknown>;
type GenerationInputRequirements = { image?: number; text?: number; video?: number; audio?: number };

export type LuxRealShot = AnyRecord & {
    obsId: string;
    typeId?: number;
    coverImageUrl: string;
    functionTag: string;
    demand: unknown;
};

export type LuxRealSource = {
    entries: LuxRealShot[];
    sourceSha256: string;
};

export type LuxRealMedia = {
    fileName: string;
    sourcePath: string;
    bytes: number;
    sha256: string;
    width: number;
    height: number;
    durationMs?: number;
};

export type LuxRealFrame = {
    fileName: "first-frame.webp";
    cachePath: string;
    bytes: number;
    sha256: string;
    width: number;
    height: number;
};

export type LuxRealCaseContext = {
    sourceSha256: string;
    sourceEntrySha256: string;
    sourceFile?: string;
    entryIndex: number;
    media: LuxRealMedia;
    referenceCachePath: string;
    firstFrame: LuxRealFrame;
    createdAt?: string;
};

export type LuxRealNativeCase = {
    source: {
        sourcePack: string;
        sourceFile: string;
        sha256: string;
        entrySha256: string;
        obsId: string;
        functionTag: string;
        demoVideo: string;
        coverImage: string;
    };
    entry: {
        kind: "luxreal-shot-reconstruction";
        summary: string;
        source: string;
        demoVideo: string;
        firstFrame: string;
    };
    media: {
        referenceVideo: { fileName: string; cachePath: string; publicPath: string; sha256: string; bytes: number };
        firstFrame: { fileName: string; cachePath: string; publicPath: string; sha256: string; bytes: number; width: number; height: number };
    };
    publication: {
        status: "draft";
        blockers: string[];
    };
    project: {
        version: 1;
        id: string;
        title: string;
        createdAt: string;
        updatedAt: string;
        nodes: CanvasNodeData[];
        connections: CanvasConnection[];
        chatSessions: [];
        activeChatId: null;
        backgroundMode: "dots";
        showImageInfo: true;
        viewport: { x: number; y: number; k: number };
        previsScenes: [];
    };
};

export type LuxRealExcluded = { index: number; obsId: string; functionTag: string; reason: string; demoVideo?: string };

export type LuxRealReceipt = {
    version: 1;
    source: { sourcePack: string; sourceFile: string; sha256: string; total: number; mediaTotal: number };
    includedCount: number;
    excludedCount: number;
    included: Array<{
        id: string;
        obsId: string;
        functionTag: string;
        projectFile: string;
        projectSha256: string;
        referenceVideo: { fileName: string; sha256: string; bytes: number };
        firstFrame: { fileName: string; sha256: string; bytes: number; width: number; height: number };
        generationNodeCount: number;
        excluded: false;
    }>;
    excluded: Array<LuxRealExcluded & { excluded: true }>;
};

function isRecord(value: unknown): value is AnyRecord {
    return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function sha256(value: Uint8Array | string) {
    return createHash("sha256").update(value).digest("hex");
}

function readUtf8Json(path: string): unknown {
    return JSON.parse(readFileSync(path, "utf8").replace(/^\uFEFF/, ""));
}

function sourceCoverFileName(value: string) {
    try {
        return basename(new URL(value).pathname);
    } catch {
        return basename(value.split("?")[0].split("#")[0]);
    }
}

function isUsableDemand(value: unknown): value is string {
    if (typeof value !== "string") return false;
    const normalized = value.trim().toLowerCase();
    return Boolean(normalized) && !["null", "'null'", '"null"'].includes(normalized);
}

function scanForSensitiveKeys(value: unknown, seen = new Set<object>()) {
    if (!isRecord(value) && !Array.isArray(value)) return;
    if (typeof value === "object" && value !== null) {
        if (seen.has(value)) return;
        seen.add(value);
    }
    for (const [key, child] of Object.entries(value as AnyRecord)) {
        if (/api.?key|authorization|cookie|password|secret|access.?token/i.test(key)) throw new Error("LuxReal 源数据含敏感字段，拒绝导出");
        scanForSensitiveKeys(child, seen);
    }
}

export function parseLuxRealSource(value: unknown, sourceSha256: string): LuxRealSource {
    if (!isRecord(value) || !Array.isArray(value.d) || value.d.length !== 33) throw new Error("LuxReal shot_structure 必须包含 33 条定义");
    if (!/^[a-f0-9]{64}$/.test(sourceSha256)) throw new Error("LuxReal 源文件 SHA-256 无效");
    scanForSensitiveKeys(value);
    const seenIds = new Set<string>();
    const seenCovers = new Set<string>();
    const entries = value.d.map((item, index): LuxRealShot => {
        if (!isRecord(item) || typeof item.obsId !== "string" || !item.obsId.trim() || seenIds.has(item.obsId)
            || typeof item.coverImageUrl !== "string" || !item.coverImageUrl.trim() || typeof item.functionTag !== "string" || !item.functionTag.trim()) {
            throw new Error(`LuxReal 第 ${index + 1} 条定义缺少稳定标识、封面或功能名`);
        }
        const cover = sourceCoverFileName(item.coverImageUrl);
        if (!cover || seenCovers.has(cover)) throw new Error(`LuxReal 第 ${index + 1} 条封面不是一一对应资源`);
        seenIds.add(item.obsId);
        seenCovers.add(cover);
        return item as LuxRealShot;
    });
    return { entries, sourceSha256 };
}

function mediaNumber(name: string) {
    const match = /^(\d+)_template_/i.exec(name);
    return match ? Number(match[1]) : Number.POSITIVE_INFINITY;
}

export function indexLuxRealMedia(mediaDir: string, expectedCount = 33) {
    const files = readdirSync(mediaDir).filter((name) => /^\d+_template_.+\.mp4$/i.test(name)).sort((a, b) => mediaNumber(a) - mediaNumber(b) || a.localeCompare(b));
    if (files.length !== expectedCount) throw new Error(`LuxReal 素材应为 ${expectedCount} 个 MP4，实际 ${files.length}`);
    const names = new Set<string>();
    return files.map((fileName, index) => {
        const number = mediaNumber(fileName);
        if (number !== index + 1 || names.has(fileName)) throw new Error("LuxReal 素材序号或文件名重复");
        names.add(fileName);
        return { fileName, path: resolve(mediaDir, fileName), index: index + 1 };
    });
}

export function selectLuxRealEntries(source: LuxRealSource, media: Array<{ fileName: string; path: string; index: number }>) {
    if (source.entries.length !== media.length) throw new Error("LuxReal 定义与演示素材数量不一致");
    const byName = new Map(media.map((item) => [item.fileName, item]));
    const included: Array<{ entry: LuxRealShot; index: number; media: { fileName: string; path: string; index: number } }> = [];
    const excluded: LuxRealExcluded[] = [];
    source.entries.forEach((entry, index) => {
        const demoVideo = sourceCoverFileName(entry.coverImageUrl);
        const file = byName.get(`${String(index + 1).padStart(2, "0")}_template_${demoVideo}`);
        if (!file) throw new Error(`LuxReal 第 ${index + 1} 条没有唯一对应演示视频：${demoVideo}`);
        if (!isUsableDemand(entry.demand)) {
            excluded.push({ index: index + 1, obsId: entry.obsId, functionTag: entry.functionTag, demoVideo, reason: "demand 是空值或字面量 null，无法形成原生提示词" });
            return;
        }
        included.push({ entry, index: index + 1, media: file });
    });
    if (included.length !== 28 || excluded.length !== 5) throw new Error(`LuxReal demand 筛选结果异常：应为 28 条可重建、5 条排除，实际 ${included.length}/${excluded.length}`);
    return { included, excluded };
}

function generationRequirements(value: GenerationInputRequirements) {
    return { generationInputRequirements: value } as unknown as Record<string, unknown>;
}

function node(
    id: string,
    type: CanvasNodeType,
    title: string,
    x: number,
    y: number,
    metadata: Record<string, unknown>,
    size?: { width?: number; height?: number },
): CanvasNodeData {
    const spec = getNodeSpec(type);
    return {
        ...spec,
        id,
        type,
        title,
        position: { x, y },
        ...(size?.width ? { width: size.width } : {}),
        ...(size?.height ? { height: size.height } : {}),
        metadata: { ...spec.metadata, ...metadata } as CanvasNodeData["metadata"],
    };
}

function edge(fromNodeId: string, toNodeId: string, suffix: string, relation?: CanvasConnection["relation"]): CanvasConnection {
    return { id: `${fromNodeId}->${toNodeId}:${suffix}`, fromNodeId, toNodeId, ...(relation ? { relation } : {}) };
}

function nativeId(obsId: string) {
    const stable = obsId.trim().toLowerCase().replace(/[^a-z0-9-]/g, "-");
    if (!stable) throw new Error("LuxReal obsId 无法生成稳定 ID");
    return `native-lux-${stable}`;
}

function ratioSize(width: number, height: number) {
    if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) throw new Error("抽帧媒体尺寸无效");
    return { width: 720, height: Math.max(1, Math.round(720 * height / width)) };
}

function nodeRequirements(metadata: Record<string, unknown>, requirements: GenerationInputRequirements) {
    return { ...metadata, ...generationRequirements(requirements) };
}

export function adaptLuxRealCase(entry: LuxRealShot, context: LuxRealCaseContext): LuxRealNativeCase {
    if (!entry || typeof entry.obsId !== "string" || !entry.obsId.trim() || !isUsableDemand(entry.demand)) throw new Error("LuxReal 条目 demand 缺失或为 null，拒绝生成工程");
    if (!/^[a-f0-9]{64}$/.test(context.sourceSha256) || !/^[a-f0-9]{64}$/.test(context.sourceEntrySha256)) throw new Error("LuxReal 条目来源 SHA-256 无效");
    if (!context.media.fileName || !/\.mp4$/i.test(context.media.fileName) || !context.firstFrame.fileName.endsWith(".webp")) throw new Error("LuxReal 媒体文件合同无效");
    const id = nativeId(entry.obsId);
    const title = `LuxReal 原生重建镜头 ${context.entryIndex} · ${entry.functionTag.trim()}`;
    const createdAt = context.createdAt || new Date().toISOString();
    const updatedAt = createdAt;
    const referenceVideoPath = `${PUBLIC_MEDIA_ROOT}/${id}/reference.mp4`;
    const firstFramePath = `${PUBLIC_MEDIA_ROOT}/${id}/first-frame.webp`;
    const referenceVideoNodeId = `${id}:reference-video`;
    const firstFrameNodeId = `${id}:first-frame`;
    const templateNodeId = `${id}:template`;
    const composerNodeId = `${id}:prompt-composer`;
    const generationNodeId = `${id}:image-to-video`;
    const mediaSize = ratioSize(context.media.width, context.media.height);
    const demand = entry.demand.trim();
    const generationPrompt = "按照已连接的首帧和编排好的镜头提示词生成连续镜头，保持主体与材质一致。";
    const composerContent = [
        "请基于下方 LuxReal 原始镜头模板与首帧参考图，编排可供映雪 image_to_video 使用的镜头运动提示词。",
        `原始模板内容：\n${demand}`,
        "原始模板文本和首帧参考图已通过画布上游连线接入，不要把原演示视频当作生成输入。",
        "保持主体、构图、材质和动作连续；不要把原演示视频当作生成结果。",
    ].join("\n");
    const nodes: CanvasNodeData[] = [
        node(referenceVideoNodeId, CanvasNodeType.Video, "原演示视频 · 只读参考", 0, 0, {
            content: referenceVideoPath,
            status: "success",
            mimeType: "video/mp4",
            bytes: context.media.bytes,
            durationMs: context.media.durationMs,
            naturalWidth: context.media.width,
            naturalHeight: context.media.height,
            hasAudio: false,
            workflowKind: "reference_video",
            workflowTitle: title,
            workflowDescription: "LuxReal 原演示视频，只读参考，不是本工程的生成结果。",
        }, mediaSize),
        node(firstFrameNodeId, CanvasNodeType.Image, "首帧封面 · 生成输入", 840, 0, {
            content: firstFramePath,
            status: "success",
            mimeType: "image/webp",
            bytes: context.firstFrame.bytes,
            naturalWidth: context.firstFrame.width,
            naturalHeight: context.firstFrame.height,
            workflowKind: "reference_video",
            workflowTitle: title,
            workflowDescription: "从对应演示视频准确抽取的第 1 帧；仅作为新流程首帧输入。",
            videoFrameSourceNodeId: referenceVideoNodeId,
            videoFrameTimeMs: 0,
        }, ratioSize(context.firstFrame.width, context.firstFrame.height)),
        node(templateNodeId, CanvasNodeType.Text, "LuxReal 原始模板文本", 1680, 0, {
            content: demand,
            status: "success",
            workflowKind: "shot",
            workflowTitle: title,
            workflowDescription: "原始 shot_structure demand 文本，未经改写；不是原站执行日志。",
        }, { width: 560, height: 420 }),
        node(composerNodeId, CanvasNodeType.Text, "首帧 + 模板提示词编排", 2340, 0, nodeRequirements({
            content: "",
            prompt: composerContent,
            composerContent,
            status: "idle",
            generationMode: "text",
            workflowKind: "shot",
            workflowTitle: title,
            workflowDescription: "基于原始模板与对应首帧的提示词编排节点；尚未调用文本模型，正文保持为空。",
        }, { image: 1 }), { width: 560, height: 420 }),
        node(generationNodeId, CanvasNodeType.Video, "新镜头 · 待生成", 3000, 0, nodeRequirements({
            content: "",
            prompt: generationPrompt,
            composerContent: generationPrompt,
            status: "idle",
            generationMode: "video",
            videoEditOperation: "image_to_video",
            includeConnectedText: true,
            videoStartFrameNodeId: firstFrameNodeId,
            strictGenerationOptions: ["seconds"],
            seconds: DEFAULT_SECONDS,
            workflowKind: "shot",
            workflowTitle: title,
            workflowDescription: "新建 image_to_video 节点；5 秒是映雪重建默认参数，不是原演示视频时长或原模型绑定。",
        }, { image: 1, text: 1 }), mediaSize),
    ];
    const connections: CanvasConnection[] = [
        edge(referenceVideoNodeId, firstFrameNodeId, "reference-frame", "storyboard-asset-reference"),
        edge(firstFrameNodeId, templateNodeId, "template-reference"),
        edge(templateNodeId, composerNodeId, "template-input"),
        edge(firstFrameNodeId, composerNodeId, "composer-image", "storyboard-asset-reference"),
        edge(composerNodeId, generationNodeId, "generation-text"),
        edge(firstFrameNodeId, generationNodeId, "generation-image", "storyboard-asset-reference"),
    ];
    assertLibTVImportFitsCanvas({ nodes: [], connections: [] }, nodes, connections);
    const cacheRelativeReference = context.referenceCachePath.replace(/\\/g, "/");
    return {
        source: {
            sourcePack: SOURCE_PACK,
            sourceFile: context.sourceFile || SOURCE_FILE,
            sha256: context.sourceSha256,
            entrySha256: context.sourceEntrySha256,
            obsId: entry.obsId,
            functionTag: entry.functionTag.trim(),
            demoVideo: context.media.fileName,
            coverImage: context.media.fileName,
        },
        entry: {
            kind: "luxreal-shot-reconstruction",
            summary: `来源 ${SOURCE_PACK}/${context.sourceFile || SOURCE_FILE} · 演示视频 ${context.media.fileName} · 首帧封面 ${firstFramePath}`,
            source: context.sourceFile || SOURCE_FILE,
            demoVideo: context.media.fileName,
            firstFrame: firstFramePath,
        },
        media: {
            referenceVideo: { fileName: "reference.mp4", cachePath: `${cacheRelativeReference.replace(/\/reference\.mp4$/, "")}/reference.mp4`, publicPath: referenceVideoPath, sha256: context.media.sha256, bytes: context.media.bytes },
            firstFrame: { fileName: context.firstFrame.fileName, cachePath: context.firstFrame.cachePath.replace(/\\/g, "/"), publicPath: firstFramePath, sha256: context.firstFrame.sha256, bytes: context.firstFrame.bytes, width: context.firstFrame.width, height: context.firstFrame.height },
        },
        publication: {
            status: "draft",
            blockers: ["missing-original-execution-log", "missing-model-binding", "generation-unverified", "browser-copy-save-unverified"],
        },
        project: {
            version: 1,
            id,
            title,
            createdAt,
            updatedAt,
            nodes,
            connections,
            chatSessions: [],
            activeChatId: null,
            backgroundMode: "dots",
            showImageInfo: true,
            viewport: { x: 0, y: 0, k: 0.7 },
            previsScenes: [],
        },
    };
}

export async function packageLuxRealDrafts(results: LuxRealNativeCase[], exportedAt: string) {
    const data: CanvasExportFile = {
        app: "infinite-canvas",
        version: 4,
        exportedAt,
        projects: results.map(({ project }) => ({ project, files: [] })),
    };
    return createZip([
        { name: "projects.json", data: JSON.stringify(data) },
        { name: "说明.txt", data: "LuxReal 原生重建草稿：原演示视频仅作只读参考，首帧和模板已接入新 image_to_video 流程。未调用真实生成，也没有虚构原模型或原执行日志。" },
    ]);
}

export function extractLuxRealFirstFrame(sourcePath: string, destination: string): Omit<LuxRealFrame, "cachePath" | "fileName"> {
    mkdirSync(dirname(destination), { recursive: true });
    const temporary = `${destination}.tmp-${process.pid}`;
    try { unlinkSync(temporary); } catch { /* stale temp is optional */ }
    const run = (command: string) => spawnSync(command, ["-c", PYTHON, sourcePath, temporary], { encoding: "utf8", windowsHide: true });
    let result = run(process.env.PYTHON || "python");
    if (result.error || result.status !== 0) result = run("py");
    if (result.error || result.status !== 0) {
        const detail = String(result.stderr || result.error?.message || "unknown error").trim();
        try { unlinkSync(temporary); } catch { /* cleanup is best effort */ }
        throw new Error(`无法抽取 LuxReal 首帧：${detail}`);
    }
    let details: { width?: number; height?: number };
    try { details = JSON.parse(String(result.stdout || "")); } catch { throw new Error("首帧抽取器未返回有效尺寸"); }
    const width = Number(details.width), height = Number(details.height);
    const bytes = statSync(temporary).size;
    if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width <= 0 || height <= 0 || bytes <= 0) throw new Error("抽取的 LuxReal 首帧尺寸或文件大小无效");
    renameSync(temporary, destination);
    return { bytes, sha256: sha256(readFileSync(destination)), width, height };
}

function mediaDigest(path: string): LuxRealMedia {
    const bytes = statSync(path).size;
    return { fileName: basename(path), sourcePath: path, bytes, sha256: sha256(readFileSync(path)), width: 0, height: 0 };
}

function assertCacheOutput(output: string, webRoot: string) {
    const cacheRoot = realpathSync(resolve(webRoot, "../.local/cache"));
    const absolute = resolve(output);
    const candidate = relative(cacheRoot, absolute);
    if (!candidate || candidate.startsWith("..") || isAbsolute(candidate)) throw new Error("LuxReal 草稿和媒体只允许输出到工作树 .local/cache，不能写入 public");
    mkdirSync(absolute, { recursive: true });
    const resolved = relative(cacheRoot, realpathSync(absolute));
    if (!resolved || resolved.startsWith("..") || isAbsolute(resolved)) throw new Error("输出目录不能通过链接离开缓存范围");
    return { absolute, cacheRoot };
}

export async function generateLuxRealCache(sourceDir: string, outputDir: string, createdAt = new Date().toISOString()) {
    const sourceRoot = realpathSync(sourceDir);
    const sourcePath = resolve(sourceRoot, "shot_structure.json");
    const mediaDir = resolve(sourceRoot, "素材");
    const sourceBytes = readFileSync(sourcePath);
    const source = parseLuxRealSource(JSON.parse(sourceBytes.toString("utf8").replace(/^\uFEFF/, "")), sha256(sourceBytes));
    const media = indexLuxRealMedia(mediaDir);
    const selection = selectLuxRealEntries(source, media);
    const { absolute: output } = assertCacheOutput(outputDir, resolve(dirname(fileURLToPath(import.meta.url)), ".."));
    const results: LuxRealNativeCase[] = [];
    const includedReceipt: LuxRealReceipt["included"] = [];
    for (const selected of selection.included) {
        const id = nativeId(selected.entry.obsId);
        const itemDir = resolve(output, id);
        mkdirSync(itemDir, { recursive: true });
        const referencePath = resolve(itemDir, "reference.mp4");
        const framePath = resolve(itemDir, "first-frame.webp");
        copyFileSync(selected.media.path, referencePath);
        const mediaInfo = mediaDigest(referencePath);
        const extracted = extractLuxRealFirstFrame(referencePath, framePath);
        const frame: LuxRealFrame = { fileName: "first-frame.webp", cachePath: `${id}/first-frame.webp`, ...extracted };
        const sourceEntrySha256 = sha256(JSON.stringify(selected.entry));
        const mediaWithDimensions: LuxRealMedia = { ...mediaInfo, width: extracted.width, height: extracted.height, durationMs: undefined };
        const result = adaptLuxRealCase(selected.entry, {
            sourceSha256: source.sourceSha256,
            sourceEntrySha256,
            sourceFile: SOURCE_FILE,
            entryIndex: selected.index,
            media: mediaWithDimensions,
            referenceCachePath: `${id}/reference.mp4`,
            firstFrame: frame,
            createdAt,
        });
        results.push(result);
        const bytes = Buffer.from(JSON.stringify(result, null, 2) + "\n", "utf8");
        const projectFile = `${id}.json`;
        writeFileSync(resolve(output, projectFile), bytes);
        includedReceipt.push({
            id,
            obsId: selected.entry.obsId,
            functionTag: selected.entry.functionTag,
            projectFile,
            projectSha256: sha256(bytes),
            referenceVideo: { fileName: "reference.mp4", sha256: mediaInfo.sha256, bytes: mediaInfo.bytes },
            firstFrame: { fileName: "first-frame.webp", sha256: extracted.sha256, bytes: extracted.bytes, width: extracted.width, height: extracted.height },
            generationNodeCount: result.project.nodes.filter((item) => item.metadata?.generationMode === "video" || item.metadata?.generationMode === "text").length,
            excluded: false,
        });
    }
    const receipt: LuxRealReceipt = {
        version: 1,
        source: { sourcePack: SOURCE_PACK, sourceFile: SOURCE_FILE, sha256: source.sourceSha256, total: source.entries.length, mediaTotal: media.length },
        includedCount: includedReceipt.length,
        excludedCount: selection.excluded.length,
        included: includedReceipt,
        excluded: selection.excluded.map((item) => ({ ...item, excluded: true })),
    };
    writeFileSync(resolve(output, "receipt.json"), JSON.stringify(receipt, null, 2) + "\n", "utf8");
    writeFileSync(resolve(output, "manifest.json"), JSON.stringify({ version: 1, source: receipt.source, entries: includedReceipt.map((item) => ({ id: item.id, projectFile: item.projectFile, mediaDirectory: item.id, sourceSha256: source.sourceSha256, entrySha256: results.find((result) => result.project.id === item.id)?.source.entrySha256 })) }, null, 2) + "\n", "utf8");
    const archive = await packageLuxRealDrafts(results, createdAt);
    writeFileSync(resolve(output, "luxreal-native-drafts.zip"), new Uint8Array(await archive.arrayBuffer()));
    return { output, receipt, results };
}

if (import.meta.main) {
    const [sourceArg, outputArg] = process.argv.slice(2);
    if (!sourceArg || !outputArg) throw new Error("用法：bun scripts/adapt-luxreal-cases.ts <15_视频生成技术链API目录> <.local/cache输出目录>");
    const result = await generateLuxRealCache(sourceArg, outputArg);
    console.log(JSON.stringify({ included: result.receipt.includedCount, excluded: result.receipt.excludedCount, output: result.output, published: 0 }));
}
