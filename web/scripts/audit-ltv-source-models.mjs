import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve, basename } from "node:path";
import { createHash } from "node:crypto";

const [cacheDirectory, outputDirectory] = process.argv.slice(2);
if (!cacheDirectory || !outputDirectory) throw new Error("Usage: node web/scripts/audit-ltv-source-models.mjs <snapshot-cache> <output-directory>");
const readJson = async path => JSON.parse((await readFile(path, "utf8")).replace(/^\uFEFF/, ""));
const bytes = await readFile(resolve(cacheDirectory, "source-tool-spec.json"));
const response = JSON.parse(bytes.toString("utf8"));
if (response.code !== 0 || !Array.isArray(response.data?.tools)) throw new Error("源模型规格无效");
const schemas = response.data.tools.map(tool => {
    let schema, schemaError;
    try { schema = JSON.parse(tool.metadata); } catch { schemaError = "模型metadata为空或无法解析"; }
    return { type: tool.type, key: tool.toolKey, displayName: tool.displayName, schema, schemaError };
});
const seedance = schemas.find(tool => tool.key === "star-video2.5" && tool.type === "video");
if (!seedance?.schema) throw new Error("源规格缺少有效Seedance 2.5");
const source = seedance.schema.properties;
const counts = { nodes: 0, searchEnabled: 0, searchDisabled: 0, searchUnspecified: 0, autoComplianceEnabled: 0, autoComplianceDisabled: 0, autoComplianceUnspecified: 0 };
const cases = [];
for (const row of await readJson(resolve(cacheDirectory, "snapshot-results.json"))) {
    if (!["snapshot-ready", "graph-review"].includes(row.status)) continue;
    if (typeof row.file !== "string" || basename(row.file) !== row.file) throw new Error("快照文件名无效");
    const snapshot = JSON.parse((await readJson(resolve(cacheDirectory, row.file))).data.detail.snapshotData);
    const requirements = [];
    for (const node of snapshot.nodes || []) {
        const params = node.data?.params;
        if (params?.model !== "star-video2.5") continue;
        const advanced = params.advancedSettings || {};
        const search = advanced.search_enabled;
        const compliance = advanced.autoCompliance;
        const classify = value => value === 1 || value === true ? "Enabled" : value === 0 || value === false ? "Disabled" : "Unspecified";
        counts.nodes++;
        counts[`search${classify(search)}`]++;
        counts[`autoCompliance${classify(compliance)}`]++;
        requirements.push({ nodeId: node.id, search: classify(search), autoCompliance: classify(compliance), imageReferences: params.imageList?.length || 0, videoReferences: params.videoList?.length || 0, textInputs: params.textList?.length || 0 });
    }
    if (requirements.length) cases.push({ id: row.id, name: row.name, requirements });
}
const report = {
    sourceEndpoint: "https://www.liblib.tv/api/tool_spec/list",
    sourceSha256: createHash("sha256").update(bytes).digest("hex"),
    sourceToolCount: schemas.length,
    schemaErrors: schemas.filter(tool => tool.schemaError).map(({ key, type, schemaError }) => ({ key, type, schemaError })),
    seedance: { name: seedance.schema.modelName, search: source.searchEnabled, portrait: source.portrait, autoCompliance: source.autoCompliance, modeType: source.modeType, config: seedance.schema.config },
    caseCount: cases.length, counts,
    boundary: "源官方规格及保存参数统计，不是目标渠道支持证明。未填写不等于关闭；开关关闭也不能代替模型语义等价确认。没有生成请求，不修改准入名单。",
};
await mkdir(outputDirectory, { recursive: true });
await writeFile(resolve(outputDirectory, "source-model-contracts.json"), JSON.stringify(report, null, 2));
await writeFile(resolve(outputDirectory, "source-model-requirements.json"), JSON.stringify(cases, null, 2));
console.log(JSON.stringify({ sourceToolCount: schemas.length, caseCount: cases.length, counts, sourceSha256: report.sourceSha256 }));
