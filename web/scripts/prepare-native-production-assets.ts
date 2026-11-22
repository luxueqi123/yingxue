import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { validateNativeProductionRegistry, type NativeProductionMediaAsset, type NativeProductionRecord } from "../src/lib/production-project-registry-contract";
import { assertLibTVImportFitsCanvas } from "../src/lib/canvas/libtv-import";
import { assessCaseModels } from "../src/lib/canvas/production-case-model-readiness";
import { defaultConfig } from "../src/stores/use-config-store";
import type { CanvasNodeData, CanvasConnection } from "../src/types/canvas";

type Project = { version: number; id: string; title: string; nodes: CanvasNodeData[]; connections: CanvasConnection[] };
type Draft = { project: Project; source: { sha256: string }; entry?: { description?: string } };
const hash = (bytes: string | Uint8Array) => createHash("sha256").update(bytes).digest("hex");
function files(root: string): string[] {
    return readdirSync(root, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? files(join(root, entry.name)) : entry.isFile() && entry.name.endsWith(".json") ? [join(root, entry.name)] : []);
}
function drafts(root: string): Draft[] {
    return files(root).sort().flatMap(path => {
        const value = JSON.parse(readFileSync(path, "utf8"));
        return value.project?.nodes && value.project?.connections ? [value] : [];
    });
}

const [storyboardsArg, luxArg, matrixArg] = process.argv.slice(2);
if (!storyboardsArg || !luxArg || !matrixArg) throw new Error("用法：bun scripts/prepare-native-production-assets.ts <分镜缓存目录> <Lux缓存目录> <画板缓存目录>");
const web = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const publicRoot = join(web, "public");
const entries: NativeProductionRecord[] = [];
const outputs: { target: string; bytes: string }[] = [];
const mediaCopies: { source: string; target: string }[] = [];
const groups = [
    { root: resolve(storyboardsArg), sourcePack: "storyboard-samples", presentation: "storyboard-template", expected: 18 },
    { root: resolve(luxArg), sourcePack: "luxreal", presentation: "reconstruction", expected: 28 },
    { root: resolve(matrixArg), sourcePack: "matrix-prompts", presentation: "image-template", expected: 12 },
] as const;
for (const group of groups) {
    const sourceDrafts = drafts(group.root);
    if (sourceDrafts.length !== group.expected) throw new Error(`${group.sourcePack} 草稿数错误：${sourceDrafts.length}`);
    for (const draft of sourceDrafts) {
        const source = draft.project;
        const id = group.presentation === "storyboard-template" ? `native-storyboard-${draft.source.sha256.slice(0, 24)}` : source.id;
        if (!/^native-[a-z0-9-]+$/.test(id)) throw new Error("原生项目标识不安全");
        const project = { ...source, id };
        const ids = new Set(project.nodes.map(node => node.id));
        if (project.version !== 1 || ids.size !== project.nodes.length || project.connections.some(edge => !ids.has(edge.fromNodeId) || !ids.has(edge.toNodeId))) throw new Error(`${id} 节点引用无效`);
        assertLibTVImportFitsCanvas({ nodes: [], connections: [] }, project.nodes, project.connections);
        const bytes = JSON.stringify(project) + "\n";
        if (/\b[A-Za-z]:[\\/]/.test(bytes) || /(?:\/Users\/|\/home\/|\/opt\/open-ai-canvas\/)/.test(bytes)) throw new Error(`${id} 公开工程包含机器绝对路径`);
        const isCase = group.presentation === "reconstruction";
        const sourceSha256 = draft.source?.sha256;
        if (!/^[a-f0-9]{64}$/.test(sourceSha256 || "")) throw new Error(`${id} 缺少可验证的源工程SHA-256`);
        const mediaRoot = `/production-library/native-media/${id}`;
        const editorialCover = `/production-library/editorial-covers/${id}.webp`;
        if (!isCase && !existsSync(join(publicRoot, editorialCover.slice(1)))) throw new Error(`${id} 缺少专属主题封面`);
        const mediaAssets: NativeProductionMediaAsset[] = [];
        if (isCase) {
            for (const name of ["reference.mp4", "first-frame.webp"]) {
                const file = join(group.root, id, name);
                const mediaBytes = readFileSync(file);
                if (!mediaBytes.byteLength) throw new Error(`${id} 缺少对应 ${name}`);
                mediaAssets.push({ role: name === "reference.mp4" ? "reference-video" : "first-frame",
                    path: `${mediaRoot}/${name}`, sourcePack: group.sourcePack, sourcePath: `${id}/${name}`,
                    mimeType: name === "reference.mp4" ? "video/mp4" : "image/webp", bytes: mediaBytes.byteLength, sha256: hash(mediaBytes) });
                mediaCopies.push({ source: file, target: join(publicRoot, mediaRoot, name) });
            }
        }
        const generationNodeCount = assessCaseModels(project.nodes, { ...defaultConfig, channels: [] }, project.connections).length;
        const entry: NativeProductionRecord = {
            item: { id, kind: isCase ? "case" : "template", name: project.title,
                description: isCase ? "以对应演示和首帧为参考，在映雪原生画布中编排提示词、生成新镜头；这是重建流程，不是原站执行记录。" : group.presentation === "storyboard-template" ? "保留剧本、角色、场景与逐镜头提示词的原生分镜模板。复制后可编辑分镜并制作新镜头，不包含已生成成片。" : "上传自己的原图，使用原生图片节点制作；保留模板的一致性与画幅要求，不借用其它作品素材。",
                category: isCase || project.title.includes("汽车") ? "ecommerce" : group.presentation === "image-template" ? "creative" : "drama",
                author: "映雪制作", source: group.sourcePack, available: true, presentation: group.presentation,
                tags: isCase ? ["原生重建", "运镜", "参考演示"] : ["原生模板", group.presentation === "storyboard-template" ? "分镜" : "图像编辑"],
                ...(isCase ? { localMedia: `${mediaRoot}/reference.mp4`, localCover: `${mediaRoot}/first-frame.webp`, mediaStatus: "local" as const } : { cover: editorialCover }),
            },
            project: { id, snapshotPath: `/production-library/native-projects/${id}.json`, sha256: hash(bytes), nodeCount: project.nodes.length,
                connectionCount: project.connections.length, generationNodeCount,
                requiredInputs: group.presentation === "image-template" ? [{ kind: "image", count: 1 }] : [] },
            provenance: { sourcePack: group.sourcePack, sourceSha256, reconstruction: true }, mediaAssets,
        };
        entries.push(entry);
        outputs.push({ target: join(publicRoot, entry.project.snapshotPath), bytes });
    }
}
validateNativeProductionRegistry({ version: 1, entries });
// Full preflight and source-media hashing precede publication writes; source files and the legacy catalog are untouched.
for (const file of mediaCopies) { mkdirSync(dirname(file.target), { recursive: true }); copyFileSync(file.source, file.target); }
for (const file of outputs) { mkdirSync(dirname(file.target), { recursive: true }); writeFileSync(file.target, file.bytes); }
writeFileSync(join(web, "src/lib/native-production-assets.json"), JSON.stringify({ version: 1, entries }, null, 2) + "\n");
console.log(JSON.stringify({ cases: entries.filter(e => e.item.kind === "case").length, templates: entries.filter(e => e.item.kind === "template").length, snapshots: outputs.length, mediaFiles: mediaCopies.length, deployed: false }));
