import { access, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const usage = "Usage: bun web/scripts/reassess-native-cases.mjs --input-dir <legacy-dir> --output-dir <audit-dir> [--current-dir <recomputed-dir>] [--expected-total <count>]";
const outputNames = ["summary.json", "records.json", "records.md"];

function parseArguments(args) {
    const values = new Map();
    for (let index = 0; index < args.length; index += 1) {
        const name = args[index];
        if (name === "--help" || name === "-h") return { help: true };
        if (!["--input-dir", "--current-dir", "--output-dir", "--expected-total"].includes(name)) {
            throw new Error(`${usage}\nUnknown argument: ${name}`);
        }
        if (values.has(name)) throw new Error(`${usage}\nRepeated argument: ${name}`);
        const value = args[index + 1];
        if (!value || value.startsWith("--")) throw new Error(`${usage}\nMissing value for ${name}`);
        values.set(name, value);
        index += 1;
    }
    const inputDir = values.get("--input-dir");
    const outputDir = values.get("--output-dir");
    if (!inputDir || !outputDir) throw new Error(usage);
    const expectedText = values.get("--expected-total");
    const expectedTotal = expectedText === undefined ? 1024 : Number(expectedText);
    if (!Number.isInteger(expectedTotal) || expectedTotal < 1) {
        throw new Error(`--expected-total must be a positive integer\n${usage}`);
    }
    return {
        inputDir: resolve(inputDir),
        currentDir: values.has("--current-dir") ? resolve(values.get("--current-dir")) : undefined,
        outputDir: resolve(outputDir),
        expectedTotal,
    };
}

function isWithin(parent, child) {
    const path = relative(resolve(parent), resolve(child));
    return path === "" || (path !== ".." && !path.startsWith(`..${sep}`) && !isAbsolute(path));
}

function ensureDisjointOutput(outputDir, sourceDirs) {
    for (const sourceDir of sourceDirs) {
        if (isWithin(sourceDir, outputDir) || isWithin(outputDir, sourceDir)) {
            throw new Error(`Output directory must be separate from input directories: ${outputDir}`);
        }
    }
}

async function readJson(path) {
    const text = (await readFile(path, "utf8")).replace(/^\uFEFF/, "");
    return JSON.parse(text);
}

async function assertFreshOutput(outputDir) {
    try {
        const existing = await readdir(outputDir);
        const collisions = outputNames.filter((name) => existing.includes(name));
        if (collisions.length) throw new Error(`Audit output already exists; choose a new --output-dir: ${collisions.join(", ")}`);
    } catch (error) {
        if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") return;
        throw error;
    }
}

async function loadAssessmentModule(workspaceRoot) {
    const entry = resolve(workspaceRoot, "web/src/lib/canvas/ltv-integration-assessment.ts");
    return import(pathToFileURL(entry).href);
}

function markdownText(value) {
    if (typeof value === "string") return value.replaceAll("|", "\\|").replaceAll("\r", "").replaceAll("\n", " ");
    if (value === undefined || value === null) return "";
    return JSON.stringify(value).replaceAll("|", "\\|").replaceAll("\r", "").replaceAll("\n", " ");
}

function renderMarkdown(assessment) {
    const { summary, records } = assessment;
    const lines = [
        "# LTV 案例原生接入重审",
        "",
        `- 总数：${summary.total}`,
        `- 历史准入：${summary.coverage.support}；当前重算准入：${summary.coverage.currentSupport}`,
        `- 当前与历史准入重合：${summary.supportComparison.retained}；新增：${summary.supportComparison.added}；不再出现在当前准入：${summary.supportComparison.removed}`,
        `- 与 reports.readiness.status 对照：${summary.readinessComparison.compared} 条有旧分类字段，${summary.readinessComparison.mismatches} 条分类不同。`,
        `- 运行证据：已验证 ${summary.runtimeEvidence.verified}，未验证 ${summary.runtimeEvidence.unverified}`,
        "- 历史 decisions 仅作为来源记录；support、supported、adoptable 与转换候选均不等于运行验收。",
        "- 未据此判定永久不兼容；源模型与目标模型不一致且无本轮映射证据时列入能力复核。",
        "",
        "## 分类计数",
        "",
        ...Object.entries(summary.statuses).map(([status, count]) => `- ${status}: ${count}`),
        "",
        "## 案例明细",
        "",
    ];

    for (const record of records) {
        lines.push(
            `### ${markdownText(record.id)} · ${markdownText(record.name)}`,
            "",
            `- 当前分类：${record.status}`,
            ...(record.reportedStatus ? [`- 输入报告原分类：${record.reportedStatus}`] : []),
            `- 问题维度：${record.categories.length ? record.categories.join("、") : "无"}`,
            `- 运行证据：${record.runtimeEvidence}`,
            `- 历史判定：${markdownText(record.history.decision?.decision ?? "无")}${record.history.decisionGroup ? ` (${record.history.decisionGroup})` : ""}`,
        );
        if (record.sourceModel !== undefined || record.targetModel !== undefined) {
            lines.push(`- 源模型 → 目标模型：${markdownText(record.sourceModel)} → ${markdownText(record.targetModel)}`);
        }
        if (record.requirements.length) {
            lines.push("- 本轮问题：");
            for (const requirement of record.requirements) {
                const node = requirement.issue.nodeId === undefined ? "" : ` · node ${markdownText(requirement.issue.nodeId)}`;
                lines.push(`  - ${requirement.category} · ${requirement.code}${node} · ${markdownText(requirement.issue.detail)} · ${requirement.origin.dataset}:${requirement.origin.field}[${requirement.origin.index}]`);
            }
        } else {
            lines.push("- 本轮问题：无");
        }
        if (record.history.issues?.length) {
            lines.push("- 仅旧报告存在的问题（保留原始内容）：");
            for (const item of record.history.issues) {
                lines.push(`  - ${item.category} · ${markdownText(item.issue.code)} · ${markdownText(item.issue.detail)} · ${item.origin.dataset}:${item.origin.field}[${item.origin.index}]`);
            }
        }
        lines.push("");
    }
    return `${lines.join("\n")}\n`;
}

async function main() {
    const options = parseArguments(process.argv.slice(2));
    if (options.help) {
        process.stdout.write(`${usage}\n`);
        return;
    }

    const sourceDirs = [options.inputDir, ...(options.currentDir ? [options.currentDir] : [])];
    ensureDisjointOutput(options.outputDir, sourceDirs);
    await assertFreshOutput(options.outputDir);

    const history = {
        reports: await readJson(resolve(options.inputDir, "reports.json")),
        support: await readJson(resolve(options.inputDir, "support.json")),
        decisions: await readJson(resolve(options.inputDir, "decisions.json")),
    };
    const current = options.currentDir
        ? {
              reports: await readJson(resolve(options.currentDir, "reports.json")),
              support: await readJson(resolve(options.currentDir, "support.json")),
          }
        : undefined;

    const workspaceRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
    const { assessLtvIntegrationData } = await loadAssessmentModule(workspaceRoot);
    const assessment = assessLtvIntegrationData({ history, current, expectedTotal: options.expectedTotal });

    await mkdir(options.outputDir, { recursive: true });
    await writeFile(resolve(options.outputDir, "summary.json"), `${JSON.stringify(assessment.summary, null, 2)}\n`, { flag: "wx" });
    await writeFile(resolve(options.outputDir, "records.json"), `${JSON.stringify(assessment)}\n`, { flag: "wx" });
    await writeFile(resolve(options.outputDir, "records.md"), renderMarkdown(assessment), { flag: "wx" });
    process.stdout.write(`${JSON.stringify(assessment.summary, null, 2)}\n`);
}

main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
});
