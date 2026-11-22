import { createReadStream } from "node:fs";
import { readFile, realpath, stat } from "node:fs/promises";
import { isAbsolute, resolve, sep } from "node:path";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { Plugin } from "vite";
import { assertProductionCaseMediaFile, type ProductionCaseMediaAsset } from "../src/lib/production-case-media-contract";

const manifestRoute = "/production-library/case-media-manifest.json";
const mediaRoute = "/production-library/case-media/";
const maxManifestBytes = 64 * 1024 * 1024;
type Entry = { id: string; filename: string; localMedia: string; localMediaInfo: { bytes: number; sha256: string } };
type Manifest = { version: number; kind: string; entries: Entry[]; assets?: (ProductionCaseMediaAsset & { caseId: string })[] };
type AllowedFile = { bytes: number; sha256: string; mimeType: string };

export function caseMediaByteRange(header: string | undefined, bytes: number): { start: number; end: number } | undefined {
    if (!header) return undefined;
    const match = /^bytes=(\d*)-(\d*)$/.exec(header);
    if (!match || (!match[1] && !match[2])) throw new Error("Invalid byte range");
    const suffix = !match[1];
    const start = suffix ? Math.max(0, bytes - Number(match[2])) : Number(match[1]);
    const end = suffix || !match[2] ? bytes - 1 : Math.min(Number(match[2]), bytes - 1);
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || start >= bytes || end < start) throw new Error("Unsatisfiable byte range");
    return { start, end };
}

export function createLtvCaseMediaMiddleware(libraryDirectory: string, additionalMediaDirectories: readonly string[] = []) {
    const library = resolve(libraryDirectory);
    const mediaDirectories = [...new Set([resolve(library, "media"), ...additionalMediaDirectories.map(directory => resolve(directory))])];
    const manifestPath = resolve(library, "manifest.json");
    let cached: { mtime: number; bytes: number; text: string; files: Map<string, AllowedFile> } | undefined;
    const loadManifest = async () => {
        const details = await stat(manifestPath);
        if (cached?.mtime === details.mtimeMs && cached.bytes === details.size) return cached;
        if (details.size > maxManifestBytes) throw new Error("Manifest is too large");
        const text = await readFile(manifestPath, "utf8");
        if (Buffer.byteLength(text) > maxManifestBytes) throw new Error("Manifest is too large");
        const parsed = JSON.parse(text) as Manifest;
        if (parsed.version !== 1 || parsed.kind !== "ltv-case-media" || !Array.isArray(parsed.entries)) throw new Error("Invalid media manifest");
        const files = new Map<string, AllowedFile>();
        for (const entry of parsed.entries) {
            const match = /^([a-f0-9]{32})(?:-([a-f0-9]{64}))?\.(mp4|mov)$/.exec(entry.filename || "");
            if (!match || entry.id !== `case-${match[1]}` || entry.localMedia !== `${mediaRoute}${entry.filename}` || files.has(entry.filename)
                || !Number.isSafeInteger(entry.localMediaInfo?.bytes) || entry.localMediaInfo.bytes <= 0 || !/^[a-f0-9]{64}$/.test(entry.localMediaInfo.sha256)
                || (match[2] !== undefined && match[2] !== entry.localMediaInfo.sha256)) throw new Error("Invalid media allowlist entry");
            files.set(entry.filename, { ...entry.localMediaInfo, mimeType: entry.filename.endsWith(".mov") ? "video/quicktime" : "video/mp4" });
        }
        if (parsed.assets !== undefined && !Array.isArray(parsed.assets)) throw new Error("Invalid project media allowlist");
        for (const asset of parsed.assets || []) {
            assertProductionCaseMediaFile(asset?.caseId, asset);
            const filename = asset.path.slice(mediaRoute.length);
            const existing = files.get(filename);
            // Different source URLs may resolve to the same content-addressed original.
            if (existing && (existing.bytes !== asset.bytes || existing.sha256 !== asset.sha256 || existing.mimeType !== asset.mimeType)) {
                throw new Error("Conflicting project media path");
            }
            files.set(filename, { bytes: asset.bytes, sha256: asset.sha256, mimeType: asset.mimeType });
        }
        cached = { mtime: details.mtimeMs, bytes: details.size, text, files };
        return cached;
    };
    return (request: IncomingMessage, response: ServerResponse, next: () => void) => {
        const pathname = new URL(request.url || "/", "http://localhost").pathname;
        if (pathname !== manifestRoute && !pathname.startsWith(mediaRoute)) { next(); return; }
        if (request.method !== "GET" && request.method !== "HEAD") { response.writeHead(405, { Allow: "GET, HEAD" }).end(); return; }
        void (async () => {
            const manifest = await loadManifest();
            if (pathname === manifestRoute) {
                response.writeHead(200, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-cache", "Content-Length": Buffer.byteLength(manifest.text) });
                response.end(request.method === "HEAD" ? undefined : manifest.text);
                return;
            }
            const filename = pathname.slice(mediaRoute.length);
            const entry = manifest.files.get(filename);
            if (!entry) { response.writeHead(404).end(); return; }
            let filenamePath: string | undefined;
            for (const directory of mediaDirectories) {
                try {
                    const mediaRoot = await realpath(directory);
                    const candidate = await realpath(resolve(mediaRoot, filename));
                    // An out-of-root alias must not hide a separately registered media root.
                    if (!candidate.startsWith(mediaRoot + sep)) continue;
                    filenamePath = candidate;
                    break;
                } catch (error) {
                    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
                }
            }
            if (!filenamePath) { response.writeHead(404).end(); return; }
            const details = await stat(filenamePath);
            if (!details.isFile() || details.size !== entry.bytes) { response.writeHead(409).end(); return; }
            const etag = `"${entry.sha256}"`;
            if (!request.headers.range && request.headers["if-none-match"] === etag) { response.writeHead(304, { ETag: etag }).end(); return; }
            let range;
            try { range = caseMediaByteRange(request.headers["if-range"] && request.headers["if-range"] !== etag ? undefined : request.headers.range, details.size); }
            catch { response.writeHead(416, { "Content-Range": `bytes */${details.size}` }).end(); return; }
            response.writeHead(range ? 206 : 200, {
                "Content-Type": entry.mimeType,
                "Content-Length": range ? range.end - range.start + 1 : details.size,
                "Accept-Ranges": "bytes", "Cache-Control": "private, max-age=3600", ETag: etag,
                ...(range ? { "Content-Range": `bytes ${range.start}-${range.end}/${details.size}` } : {}),
            });
            if (request.method === "HEAD") { response.end(); return; }
            // Bound memory per request while reducing read overhead for large lossless films.
            const stream = createReadStream(filenamePath, { ...range, highWaterMark: 1024 * 1024 });
            response.on("close", () => stream.destroy());
            stream.on("error", () => response.destroy());
            stream.pipe(response);
        })().catch(error => {
            if (response.headersSent) { response.destroy(); return; }
            const absent = (error as NodeJS.ErrnoException).code === "ENOENT";
            response.writeHead(absent ? 404 : 500, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
            response.end(JSON.stringify({ error: absent ? "本地案例媒体库未安装" : "本地案例媒体清单或文件校验失败" }));
        });
    };
}

export function ltvCaseLibraryPlugin(libraryDirectory: string): Plugin {
    const loadMiddleware = async () => {
        const storagePath = resolve(libraryDirectory, "media-storage.json");
        let additionalMediaDirectories: string[] = [];
        try {
            if ((await stat(storagePath)).size > 64 * 1024) throw new Error("Media storage configuration is too large");
            const storage = JSON.parse(await readFile(storagePath, "utf8"));
            if (storage.version !== 1 || !Array.isArray(storage.additionalMediaDirectories)
                || storage.additionalMediaDirectories.length > 4
                || storage.additionalMediaDirectories.some((directory: unknown) => typeof directory !== "string"
                    || directory.length > 1024 || !isAbsolute(directory) || /^[\\/]{2}/.test(directory))) {
                throw new Error("Invalid local media storage configuration");
            }
            additionalMediaDirectories = storage.additionalMediaDirectories;
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
        }
        return createLtvCaseMediaMiddleware(libraryDirectory, additionalMediaDirectories);
    };
    return {
        name: "yingxue-local-case-library",
        async configureServer(server) { server.middlewares.use(await loadMiddleware()); },
        async configurePreviewServer(server) { server.middlewares.use(await loadMiddleware()); },
    };
}
