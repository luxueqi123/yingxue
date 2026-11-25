import { spawn, spawnSync } from "node:child_process";
import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = process.env.CANVAS_WEB_TEST_ROOT || fileURLToPath(new URL("../", import.meta.url));
const failureReport = process.env.CANVAS_WEB_TEST_FAILURE_REPORT;
const failedTests = {};
const args = process.argv.slice(2);
const processIsolation = args.includes("--process-isolation");
if (processIsolation) args.splice(args.indexOf("--process-isolation"), 1);
if (args.includes("--no-isolate")) throw new Error("Full-suite module isolation must remain enabled");
const help = spawnSync(process.execPath, ["test", "--help"], { encoding: "utf8", cwd: root });
if (help.status !== 0) throw new Error("Bun test runner discovery failed");
const run = (parameters, binary = process.execPath, file) => new Promise((resolve, reject) => {
    const record = failureReport && file;
    const child = spawn(binary, parameters, { cwd: root, stdio: record ? ["inherit", "pipe", "pipe"] : "inherit" });
    const chunks = [];
    if (record) {
        for (const [stream, output] of [[child.stdout, process.stdout], [child.stderr, process.stderr]]) {
            stream.on("data", (chunk) => {
                chunks.push(chunk);
                output.write(chunk);
            });
        }
    }
    child.once("error", reject);
    child.once("close", (code) => {
        if (record && code !== 0) {
            const output = Buffer.concat(chunks).toString("utf8").replace(/\u001b\[[0-?]*[ -/]*[@-~]/g, "").replaceAll(path.resolve(root), "<web>");
            const reasons = output.split(/\r?\n/).map((line) => line.trim()).filter((line) => /^(?:\(fail\)|not ok |error:|\w*Error:)/.test(line))
                .map((line) => line.replace(/\s+\[[\d.]+m?s\]$/, "")).sort();
            failedTests[path.relative(root, file).split(path.sep).join("/")] = { code, reasons };
        }
        resolve(code ?? 1);
    });
});

// Keep Node's real HTTP integration tests on its own test runner: Bun imposes
// a different per-test deadline and cannot honor all node:test lifecycle options.
const nodeTest = file => file.endsWith(".mjs") && /from\s+["']node:test["']/.test(readFileSync(file, "utf8"));
const hasNodeTests = args.length
    ? args.filter(arg => !arg.startsWith("-")).some(arg => nodeTest(path.resolve(root, arg)))
    : true;
if (!processIsolation && !failureReport && !hasNodeTests && /--isolate\b/.test(help.stdout + help.stderr)) {
    process.exitCode = await run(["test", "--isolate", ...args]);
} else {
    if (args.some(arg => arg.startsWith("-"))) throw new Error("Process isolation accepts explicit test file paths, not runner flags.");
    const files = [];
    const visit = (directory) => {
        for (const entry of readdirSync(directory, { withFileTypes: true })) {
            if (entry.name.startsWith(".") || ["node_modules", "dist"].includes(entry.name)) continue;
            const file = path.join(directory, entry.name);
            if (entry.isDirectory()) visit(file);
            else if (entry.isFile() && /[._](test|spec)\.[cm]?[jt]sx?$/.test(entry.name)) files.push(file);
        }
    };
    if (args.length) {
        for (const arg of args) {
            const file = path.resolve(root, arg);
            if (!statSync(file).isFile() || !/[._](test|spec)\.[cm]?[jt]sx?$/.test(file)) throw new Error(`Not a test file: ${arg}`);
            files.push(file);
        }
    } else visit(root);
    if (!files.length) throw new Error("No test files found");
    files.sort();
    let cursor = 0, failures = 0;
    await Promise.all(Array.from({ length: 2 }, async () => {
        while (cursor < files.length) {
            const file = files[cursor++];
            if (await (nodeTest(file) ? run(["--test", file], "node", file) : run(["test", file], process.execPath, file)) !== 0) failures++;
        }
    }));
    console.log(`Isolated test files: ${files.length}; failed files: ${failures}`);
    if (failureReport) writeFileSync(failureReport, JSON.stringify(failedTests, null, 2));
    process.exitCode = failures ? 1 : 0;
}
