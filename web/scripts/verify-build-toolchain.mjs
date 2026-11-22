import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const lock = readFileSync(new URL("../bun.lock", import.meta.url), "utf8");
const checks = [
    ["vite", require],
    ["rolldown", createRequire(require.resolve("vite/package.json"))],
    ["motion", require],
    ["framer-motion", createRequire(require.resolve("motion/package.json"))],
];
const mismatches = [];
for (const [name, resolver] of checks) {
    const entry = lock.match(new RegExp(`^    "${name}": \\["${name}@([^"\\s]+)"`, "m"));
    if (!entry) throw new Error(`锁文件缺少 ${name}，无法确认构建依赖。`);
    const installed = JSON.parse(readFileSync(resolver.resolve(`${name}/package.json`), "utf8")).version;
    if (installed !== entry[1]) mismatches.push(`${name}: 已安装 ${installed}，锁定 ${entry[1]}`);
}
if (mismatches.length) {
    console.error(`构建依赖与 bun.lock 不一致：\n${mismatches.join("\n")}\n请先运行 bun install --frozen-lockfile。`);
    process.exit(1);
}
console.log("构建工具与动画库版本符合 bun.lock。");
