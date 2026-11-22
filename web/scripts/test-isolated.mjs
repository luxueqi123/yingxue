import { spawn, spawnSync } from "node:child_process";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = fileURLToPath(new URL("../", import.meta.url));
const args = process.argv.slice(2);
const processIsolation = args.includes("--process-isolation");
if (processIsolation) args.splice(args.indexOf("--process-isolation"), 1);
if (args.includes("--no-isolate")) throw new Error("Full-suite module isolation must remain enabled");
const help = spawnSync(process.execPath, ["test", "--help"], { encoding: "utf8", cwd: root });
if (help.status !== 0) throw new Error("Bun test runner discovery failed");
const run = (parameters, binary = process.execPath) => new Promise((resolve, reject) => {
    const child = spawn(binary, parameters, { cwd: root, stdio: "inherit" });
    child.once("error", reject);
    child.once("exit", (code) => resolve(code ?? 1));
});

// Keep Node's real HTTP integration tests on its own test runner: Bun imposes
// a different per-test deadline and cannot honor all node:test lifecycle options.
const nodeTest = file => file.endsWith(".mjs") && /from\s+["']node:test["']/.test(readFileSync(file, "utf8"));
const hasNodeTests = args.length
    ? args.filter(arg => !arg.startsWith("-")).some(arg => nodeTest(path.resolve(root, arg)))
    : true;
if (!processIsolation && !hasNodeTests && /--isolate\b/.test(help.stdout + help.stderr)) {
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
            if (await (nodeTest(file) ? run(["--test", file], "node") : run(["test", file])) !== 0) failures++;
        }
    }));
    console.log(`Isolated test files: ${files.length}; failed files: ${failures}`);
    process.exitCode = failures ? 1 : 0;
}
