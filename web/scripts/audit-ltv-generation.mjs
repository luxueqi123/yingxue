import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve, basename, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

// Only reads previously acquired snapshots and a credential-free model catalog.
const [snapshotDirectory, catalogFile, outputDirectory] = process.argv.slice(2);
if (!snapshotDirectory || !catalogFile || !outputDirectory) {
    throw new Error("Usage: node web/scripts/audit-ltv-generation.mjs <snapshot-directory> <model-catalog.json> <output-directory>");
}
const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const require = createRequire(import.meta.url);
let esbuild;
try { esbuild = require("esbuild"); }
catch { esbuild = require(resolve(root, "canvas-agent/node_modules/esbuild")); }
const compiled = await esbuild.build({
    entryPoints: [resolve(root, "web/src/lib/canvas/ltv-generation-compatibility.ts")],
    bundle: true, platform: "node", format: "esm", write: false,
});
const { assessLtvGenerationCase } = await import(`data:text/javascript;base64,${Buffer.from(compiled.outputFiles[0].text).toString("base64")}`);
const readJson = async path => JSON.parse((await readFile(path, "utf8")).replace(/^\uFEFF/, ""));
const catalog = await readJson(catalogFile);
const index = await readJson(resolve(snapshotDirectory, "snapshot-results.json"));
const reports = [];
const blockers = {};
let skipped = 0;
for (const row of index) {
    if (!["snapshot-ready", "graph-review"].includes(row.status)) { skipped++; continue; }
    let result;
    try {
        if (typeof row.file !== "string" || basename(row.file) !== row.file) throw new Error("Invalid snapshot filename");
        const response = await readJson(resolve(snapshotDirectory, row.file));
        result = assessLtvGenerationCase(JSON.parse(response.data.detail.snapshotData), catalog);
    } catch {
        result = { executable: false, routes: [], issues: [{ code: "snapshot-read-failed", detail: "快照读取或解析失败，需复核原文件" }] };
    }
    for (const code of new Set(result.issues.map(issue => issue.code))) blockers[code] = (blockers[code] || 0) + 1;
    const { executable, ...details } = result;
    reports.push({ id: row.id, name: row.name, staticContractPassed: executable, ...details });
}
const summary = {
    scanned: reports.length, skipped,
    generationContractsPassed: reports.filter(row => row.staticContractPassed && row.routes.length).length,
    caseBlockers: blockers,
    scope: "静态依赖与共用协议限制检查；候选渠道不代表原模型等价或生成质量验收；不修改公开名单，不调用模型。",
};
await mkdir(outputDirectory, { recursive: true });
await writeFile(resolve(outputDirectory, "generation-compatibility.json"), JSON.stringify(reports, null, 2));
await writeFile(resolve(outputDirectory, "generation-compatibility-summary.json"), JSON.stringify(summary, null, 2));
console.log(JSON.stringify(summary, null, 2));
