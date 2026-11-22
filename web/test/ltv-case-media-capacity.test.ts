import { expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { join, resolve, sep } from "node:path";
import { createLtvCaseMediaMiddleware } from "../vite-plugins/ltv-case-library";

for (const oversized of [false, true]) {
    test(oversized ? "local media rejects manifests beyond 64 MiB" : "local media serves a complete 200-case manifest beyond 4 MiB", async () => {
        const cache = join(import.meta.dir, "../../.local/cache");
        await mkdir(cache, { recursive: true });
        const root = await mkdtemp(join(cache, "case-media-capacity-"));
        const content = Buffer.from("retained-original-media-bytes");
        const sha256 = createHash("sha256").update(content).digest("hex");
        const assets = Array.from({ length: 200 * 64 }, (_, index) => {
            const caseId = `case-${Math.floor(index / 64).toString(16).padStart(32, "0")}`;
            return {
                caseId, source: `https://source.invalid/case-${Math.floor(index / 64)}/original-${index}.png`,
                kind: "image", mimeType: "image/png", bytes: content.length, sha256,
                path: `/production-library/case-media/${caseId}/${sha256}.png`,
            };
        });
        const manifest = JSON.stringify({ version: 1, kind: "ltv-case-media", entries: [], assets,
            ...(oversized ? { padding: " ".repeat(64 * 1024 * 1024) } : {}) });
        expect(Buffer.byteLength(manifest)).toBeGreaterThan(4 * 1024 * 1024);
        if (oversized) expect(Buffer.byteLength(manifest)).toBeGreaterThan(64 * 1024 * 1024);
        for (const asset of [assets[0], assets.at(-1)!]) {
            await mkdir(join(root, "media", asset.caseId), { recursive: true });
            await writeFile(join(root, "media", asset.caseId, `${sha256}.png`), content);
        }
        await writeFile(join(root, "manifest.json"), manifest);
        const middleware = createLtvCaseMediaMiddleware(root);
        const server = createServer((request, response) => middleware(request, response, () => response.writeHead(404).end()));
        try {
            await new Promise<void>(done => server.listen(0, "127.0.0.1", done));
            const address = server.address();
            if (!address || typeof address === "string") throw new Error("No local test address");
            const base = `http://127.0.0.1:${address.port}`;
            const response = await fetch(base + "/production-library/case-media-manifest.json");
            if (oversized) {
                expect(response.status).toBe(500);
                expect((await response.json()).error).toBe("本地案例媒体清单或文件校验失败");
                expect((await fetch(base + assets[0].path)).status).toBe(500);
                return;
            }
            expect(response.status).toBe(200);
            const loaded = await response.json();
            expect(loaded.assets).toEqual(assets);
            expect(new Set(loaded.assets.map((asset: { caseId: string }) => asset.caseId)).size).toBe(200);
            for (const asset of [assets[0], assets.at(-1)!]) {
                const original = await fetch(base + asset.path);
                expect(original.status).toBe(200);
                expect(Buffer.from(await original.arrayBuffer())).toEqual(content);
                expect(original.headers.get("ETag")).toBe(`"${sha256}"`);
            }
            expect((await fetch(base + assets[0].path.replace(sha256, "b".repeat(64)))).status).toBe(404);
        } finally {
            server.closeAllConnections();
            await new Promise<void>(done => server.close(() => done()));
            if (!resolve(root).startsWith(resolve(cache) + sep + "case-media-capacity-")) throw new Error("Unsafe fixture cleanup path");
            await rm(root, { recursive: true, force: true });
        }
    }, 30_000);
}
