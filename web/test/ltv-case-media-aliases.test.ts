import { expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { join, resolve, sep } from "node:path";
import { createLtvCaseMediaMiddleware } from "../vite-plugins/ltv-case-library";

for (const conflict of [false, true]) {
    test(`source aliases sharing content-addressed media ${conflict ? "reject conflicting file metadata" : "serve one file without losing either source"}`, async () => {
        const cache = join(import.meta.dir, "../../.local/cache");
        await mkdir(cache, { recursive: true });
        const root = await mkdtemp(join(cache, "case-media-alias-"));
        const content = Buffer.from("same-original-media-bytes");
        const sha256 = createHash("sha256").update(content).digest("hex");
        const caseId = `case-${"a".repeat(32)}`;
        const asset = {
            caseId, source: "https://source.invalid/first.png", kind: "image", mimeType: "image/png",
            bytes: content.length, sha256, path: `/production-library/case-media/${caseId}/${sha256}.png`,
        };
        const assets = [asset, { ...asset, source: "https://source.invalid/second.png", bytes: content.length + Number(conflict) }];
        await mkdir(join(root, "media", caseId), { recursive: true });
        await writeFile(join(root, "media", caseId, `${sha256}.png`), content);
        await writeFile(join(root, "manifest.json"), JSON.stringify({ version: 1, kind: "ltv-case-media", entries: [], assets }));
        const middleware = createLtvCaseMediaMiddleware(root);
        const server = createServer((request, response) => middleware(request, response, () => response.writeHead(404).end()));
        try {
            await new Promise<void>(done => server.listen(0, "127.0.0.1", done));
            const address = server.address();
            if (!address || typeof address === "string") throw new Error("No test address");
            const base = `http://127.0.0.1:${address.port}`;
            const response = await fetch(base + asset.path);
            if (conflict) {
                expect(response.status).toBe(500);
                expect((await response.json()).error).toBe("本地案例媒体清单或文件校验失败");
                return;
            }
            expect(response.status).toBe(200);
            expect(Buffer.from(await response.arrayBuffer())).toEqual(content);
            expect(response.headers.get("ETag")).toBe(`"${sha256}"`);
            const head = await fetch(base + asset.path, { method: "HEAD" });
            expect(head.status).toBe(200);
            expect(head.headers.get("Content-Length")).toBe(String(content.length));
            expect((await head.arrayBuffer()).byteLength).toBe(0);
            const range = await fetch(base + asset.path, { headers: { Range: "bytes=0-3" } });
            expect(range.status).toBe(206);
            expect(Buffer.from(await range.arrayBuffer())).toEqual(content.subarray(0, 4));
            const registry = await fetch(base + "/production-library/case-media-manifest.json");
            expect((await registry.json()).assets).toEqual(assets);
            expect((await fetch(base + asset.path.replace(sha256, "b".repeat(64)))).status).toBe(404);
        } finally {
            await new Promise<void>(done => { server.close(() => done()); server.closeAllConnections(); });
            if (!resolve(root).startsWith(resolve(cache) + sep + "case-media-alias-")) throw new Error("Unsafe fixture cleanup path");
            await rm(root, { recursive: true, force: true });
        }
    });
}
