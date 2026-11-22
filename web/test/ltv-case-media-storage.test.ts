import { expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { join, resolve, sep } from "node:path";
import { createLtvCaseMediaMiddleware, ltvCaseLibraryPlugin } from "../vite-plugins/ltv-case-library";

for (const scenario of ["external", "missing-primary", "escape", "stale-primary", "primary-alias-external", "primary-alias-unregistered"] as const) {
    test(`registered case media storage: ${scenario}`, async () => {
        const cache = resolve(import.meta.dir, "../../.local/cache");
        await mkdir(cache, { recursive: true });
        const fixture = await mkdtemp(join(cache, "case-media-storage-"));
        const library = join(fixture, "library");
        const external = join(fixture, "external");
        const content = Buffer.from("existing-exact-case-media");
        const sha256 = createHash("sha256").update(content).digest("hex");
        const id = `case-${"a".repeat(32)}`;
        const filename = `${id.slice(5)}.mp4`;
        const path = `/production-library/case-media/${filename}`;
        await mkdir(library, { recursive: true });
        await mkdir(external, { recursive: true });
        if (scenario !== "missing-primary") await mkdir(join(library, "media"));
        if (scenario === "escape" || scenario === "primary-alias-unregistered") {
            const outside = join(fixture, "outside.mp4");
            await writeFile(outside, content);
            await symlink(outside, scenario === "escape" ? join(external, filename) : join(library, "media", filename));
        } else {
            await writeFile(join(external, filename), content);
        }
        if (scenario === "primary-alias-external") {
            await symlink(join(external, filename), join(library, "media", filename));
        }
        if (scenario === "stale-primary") await writeFile(join(library, "media", filename), "wrong-length");
        const manifest = { version: 1, kind: "ltv-case-media", entries: [
            { id, filename, localMedia: path, localMediaInfo: { bytes: content.length, sha256 } },
        ] };
        await writeFile(join(library, "manifest.json"), JSON.stringify(manifest));
        const middleware = createLtvCaseMediaMiddleware(library, [external]);
        const server = createServer((request, response) => middleware(request, response, () => response.writeHead(404).end()));
        try {
            await new Promise<void>(done => server.listen(0, "127.0.0.1", done));
            const address = server.address();
            if (!address || typeof address === "string") throw new Error("No test address");
            const base = `http://127.0.0.1:${address.port}`;
            const response = await fetch(base + path);
            if (scenario === "escape" || scenario === "stale-primary" || scenario === "primary-alias-unregistered") {
                expect(response.status).toBe(scenario === "stale-primary" ? 409 : 404);
            } else {
                expect(response.status).toBe(200);
                expect(Buffer.from(await response.arrayBuffer())).toEqual(content);
                expect(response.headers.get("ETag")).toBe(`"${sha256}"`);
                const range = await fetch(base + path, { headers: { Range: "bytes=1-4" } });
                expect(range.status).toBe(206);
                expect(Buffer.from(await range.arrayBuffer())).toEqual(content.subarray(1, 5));
                const head = await fetch(base + path, { method: "HEAD" });
                expect(head.status).toBe(200);
                expect(head.headers.get("Content-Length")).toBe(String(content.length));
                expect((await head.arrayBuffer()).byteLength).toBe(0);
            }
            expect((await fetch(base + path.replace(id.slice(5), "b".repeat(32)))).status).toBe(404);
            expect((await fetch(base + "/production-library/case-media/media-storage.json")).status).toBe(404);
            const published = await (await fetch(base + "/production-library/case-media-manifest.json")).json();
            expect(published).toEqual(manifest);
            expect(JSON.stringify(published)).not.toContain(external);
        } finally {
            await new Promise<void>(done => { server.close(() => done()); server.closeAllConnections(); });
            if (!resolve(fixture).startsWith(cache + sep + "case-media-storage-")) throw new Error("Unsafe fixture path");
            await rm(fixture, { recursive: true, force: true });
        }
    });
}

for (const directories of [["relative/media"], ["\\\\server\\share\\media"], Array(5).fill(resolve(import.meta.dir))]) {
    test(`private storage configuration rejects ${JSON.stringify(directories)}`, async () => {
        const cache = resolve(import.meta.dir, "../../.local/cache");
        await mkdir(cache, { recursive: true });
        const fixture = await mkdtemp(join(cache, "case-media-config-"));
        await writeFile(join(fixture, "media-storage.json"), JSON.stringify({ version: 1, additionalMediaDirectories: directories }));
        try {
            const hook = ltvCaseLibraryPlugin(fixture).configureServer;
            if (typeof hook !== "function") throw new Error("Unexpected configuration hook");
            const server = { middlewares: { use() { throw new Error("Invalid configuration reached middleware"); } } };
            await expect(hook.call(undefined as never, server as never)).rejects.toThrow("Invalid local media storage configuration");
        } finally {
            if (!resolve(fixture).startsWith(cache + sep + "case-media-config-")) throw new Error("Unsafe configuration fixture path");
            await rm(fixture, { recursive: true, force: true });
        }
    });
}
