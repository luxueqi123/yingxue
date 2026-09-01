#!/usr/bin/env node

import { readFile, readdir, stat } from "node:fs/promises";
import { extname, join, resolve } from "node:path";

const releaseRoot = resolve(process.argv[2] || "web/dist");
const assetsRoot = join(releaseRoot, "assets");
const assetReferencePattern = /(?:\.\/|\/assets\/)([A-Za-z0-9_.-]+\.(?:js|css|wasm|woff2?|png|jpe?g|webp|svg))/g;

async function assertDirectory(path) {
    const info = await stat(path).catch(() => null);
    if (!info?.isDirectory()) {
        throw new Error(`静态目录不存在：${path}`);
    }
}

await assertDirectory(releaseRoot);
await assertDirectory(assetsRoot);

const assetFiles = await readdir(assetsRoot, { withFileTypes: true });
const presentAssets = new Set(assetFiles.filter((entry) => entry.isFile()).map((entry) => entry.name));
const sourceFiles = [join(releaseRoot, "index.html")];

for (const entry of assetFiles) {
    if (entry.isFile() && [".js", ".css"].includes(extname(entry.name))) {
        sourceFiles.push(join(assetsRoot, entry.name));
    }
}

const referencedAssets = new Set();
for (const sourceFile of sourceFiles) {
    const source = await readFile(sourceFile, "utf8");
    for (const match of source.matchAll(assetReferencePattern)) {
        referencedAssets.add(match[1]);
    }
}

const missingAssets = [...referencedAssets].filter((name) => !presentAssets.has(name)).sort();
console.log(`release=${releaseRoot}`);
console.log(`asset_files=${presentAssets.size}`);
console.log(`referenced_assets=${referencedAssets.size}`);
console.log(`missing_assets=${missingAssets.length}`);

if (missingAssets.length > 0) {
    for (const name of missingAssets) {
        console.error(`MISSING ${name}`);
    }
    process.exitCode = 1;
}
