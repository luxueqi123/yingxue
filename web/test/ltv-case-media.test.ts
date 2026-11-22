import { test, expect, beforeEach, afterEach } from "bun:test";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { caseMediaByteRange, createLtvCaseMediaMiddleware } from "../vite-plugins/ltv-case-library";
import { loadProductionCatalog, mergeProductionCaseMedia, mergeProductionCaseMetadata, type ProductionCatalog } from "../src/services/production-library";
import { publishedSkills } from "../src/lib/published-production-assets";
import { supportedLtvSkillIds, verifiedLtvCaseIds, verifiedLtvSkillIds } from "../src/lib/verified-production-assets";
import { nativeProductionRecords } from "../src/lib/production-project-registry";
import { isCasePublic } from "../src/lib/case-publication-policy";

const identifier = "a".repeat(32);
const publishedCatalogUrl = new URL("../src/assets/published-catalog-featured-200.json", import.meta.url).href;
const media = {
    id: `case-${identifier}`, filename: `${identifier}.mp4`,
    localMedia: `/production-library/case-media/${identifier}.mp4`,
    localCover: `/production-library/covers/cases/${identifier}.webp`,
    localMediaInfo: { bytes: 16, sha256: "c".repeat(64), durationSeconds: 12, format: "mov,mp4", videoCodec: "h264", audioCodec: "aac", width: 1920, height: 1080 },
};
const catalog: ProductionCatalog = {
    version: 1,
    stats: { sourceSkills: 1, portableSkills: 1, agents: 0, referenceSkills: 0, cases: 1024, voices: 0, localCovers: 0 },
    items: [
        { id: "pl-aa008befea38a466fa648c706cf8f337", kind: "skill", name: "Skill", description: "body", category: "creative", source: "fixture", author: "fixture", available: true },
        ...Array.from({ length: 1023 }, (_, index) => ({ id: `case-${index.toString(16).padStart(32, "0")}`, kind: "case" as const, name: `Case ${index}`, description: "", category: "creative", source: "fixture", author: "fixture", available: false, media: `https://source.invalid/${index}.mp4`, mediaStatus: "remote" as const })),
        { id: media.id, kind: "case", name: "Local case", description: "", category: "creative", source: "fixture", author: "fixture", available: false, media: "https://source.invalid/original.mp4", cover: "https://source.invalid/original.png", mediaStatus: "remote", likeCount: 10 },
    ],
};
const manifest = { version: 1, kind: "ltv-case-media", metadataCount: 1024, entries: [media] };
catalog.publishedCaseIds = catalog.items.filter(item => item.kind === "case").map(item => item.id);

test("an explicit publication selection excludes other supported cases and native demos", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (url: string | URL | Request) => String(url) === publishedCatalogUrl
        ? Response.json({ ...catalog, publishedCaseIds: [media.id] })
        : String(url).endsWith("case-media-manifest.json") ? Response.json(manifest) : new Response("", { status: 404 })) as typeof fetch;
    try {
        const result = await loadProductionCatalog();
        expect(result.items.filter(item => item.kind === "case").map(item => item.id)).toEqual([media.id]);
        expect(result.stats.cases).toBe(1);
    } finally { globalThis.fetch = originalFetch; }
});

test("complete published film metadata avoids downloading workflow asset records", async () => {
    const originalFetch = globalThis.fetch;
    const requests: string[] = [];
    globalThis.fetch = (async (url: string | URL | Request) => {
        requests.push(String(url));
        if (String(url) !== publishedCatalogUrl) throw new Error("Unexpected full asset manifest request");
        return Response.json({ ...catalog, publishedCaseIds: [media.id],
            items: catalog.items.map(item => item.id === media.id ? { ...item, ...media,
                localCover: "/production-library/covers/published-branded-cover.jpg" } : item) });
    }) as typeof fetch;
    try {
        const result = await loadProductionCatalog();
        expect(requests).toEqual([publishedCatalogUrl]);
        expect(result.stats.localCases).toBe(1);
        expect(result.items.find(item => item.id === media.id)?.localMediaInfo).toEqual(media.localMediaInfo);
        expect(result.items.find(item => item.id === media.id)?.localCover).toBe("/production-library/covers/published-branded-cover.jpg");
    } finally { globalThis.fetch = originalFetch; }
});

test("invalid embedded media paths refresh from the validated live manifest", async () => {
    const originalFetch = globalThis.fetch;
    const requests: string[] = [];
    globalThis.fetch = (async (url: string | URL | Request) => {
        requests.push(String(url));
        return String(url) === publishedCatalogUrl
            ? Response.json({ ...catalog, publishedCaseIds: [media.id],
                items: catalog.items.map(item => item.id === media.id ? { ...item, ...media, localMedia: "/untrusted.mp4" } : item) })
            : Response.json(manifest);
    }) as typeof fetch;
    try {
        const result = await loadProductionCatalog();
        expect(requests).toEqual([publishedCatalogUrl, "/production-library/case-media-manifest.json"]);
        expect(result.items.find(item => item.id === media.id)?.localMedia).toBe(media.localMedia);
        expect(result.stats.localCases).toBe(1);
    } finally { globalThis.fetch = originalFetch; }
});
const mutableVerifiedLtvCaseIds = verifiedLtvCaseIds as Set<string>;
const mutableVerifiedLtvSkillIds = verifiedLtvSkillIds as Set<string>;
const mutableSupportedLtvSkillIds = supportedLtvSkillIds as Set<string>;
const nativeProductionItems = nativeProductionRecords.map(record => record.item).filter(isCasePublic).filter(item => item.kind !== "case");
const nativeProductionItemIds = new Set(nativeProductionItems.map(item => item.id));
const fixtureItemIds = new Set(catalog.items.map(item => item.id));
const fixtureCaseIds = new Set(catalog.items.filter(item => item.kind === "case").map(item => item.id));
const nativeProductionCaseCount = nativeProductionItems.filter(item => item.kind === "case").length;
let originalVerifiedLtvCaseIds = new Set<string>();
let originalVerifiedLtvSkillIds = new Set<string>();
let originalSupportedLtvSkillIds = new Set<string>();

beforeEach(() => {
    originalVerifiedLtvCaseIds = new Set(mutableVerifiedLtvCaseIds);
    originalVerifiedLtvSkillIds = new Set(mutableVerifiedLtvSkillIds);
    originalSupportedLtvSkillIds = new Set(mutableSupportedLtvSkillIds);
    for (const item of catalog.items) {
        (item.kind === "case" ? mutableVerifiedLtvCaseIds : mutableVerifiedLtvSkillIds).add(item.id);
    }
});
afterEach(() => {
    mutableVerifiedLtvCaseIds.clear();
    for (const id of originalVerifiedLtvCaseIds) mutableVerifiedLtvCaseIds.add(id);
    mutableVerifiedLtvSkillIds.clear();
    for (const id of originalVerifiedLtvSkillIds) mutableVerifiedLtvSkillIds.add(id);
    mutableSupportedLtvSkillIds.clear();
    for (const id of originalSupportedLtvSkillIds) mutableSupportedLtvSkillIds.add(id);
});

function expectCatalogComposition(result: ProductionCatalog, includeFixtureCatalog: boolean): void {
    const fixtureItems = result.items.filter(item => fixtureItemIds.has(item.id));
    const expectedFixtureCount = includeFixtureCatalog ? catalog.items.length : 0;
    expect(fixtureItems).toHaveLength(expectedFixtureCount);
    if (includeFixtureCatalog) {
        expect(new Set(fixtureItems.map(item => item.id))).toEqual(fixtureItemIds);
    }

    const actualNativeItems = result.items.filter(item => nativeProductionItemIds.has(item.id));
    expect(nativeProductionRecords).toHaveLength(58);
    expect(nativeProductionItems).toHaveLength(30);
    expect(nativeProductionItems.filter(item => item.kind === "case")).toHaveLength(0);
    expect(nativeProductionItems.filter(item => item.kind === "template")).toHaveLength(30);
    expect(actualNativeItems).toEqual(nativeProductionItems);
    expect(new Set(actualNativeItems.map(item => item.id))).toEqual(nativeProductionItemIds);
    expect(result.items).toHaveLength(expectedFixtureCount + nativeProductionItems.length);
    expect(new Set(result.items.map(item => item.id)).size).toBe(result.items.length);
    expect(result.stats.cases).toBe((includeFixtureCatalog ? fixtureCaseIds.size : 0) + nativeProductionCaseCount);
    expect(result.stats.templates).toBe(30);
}

test("unverified imports cannot enter the public catalog just because media exists", async () => {
    mutableVerifiedLtvCaseIds.clear();
    mutableVerifiedLtvSkillIds.clear();
    mutableSupportedLtvSkillIds.clear();
    const originalFetch = globalThis.fetch;
    try {
        globalThis.fetch = (async (url: string | URL | Request) => {
            expect(String(url)).toBe(publishedCatalogUrl);
            return Response.json(catalog);
        }) as typeof fetch;
        const result = await loadProductionCatalog();
        expectCatalogComposition(result, false);
        expect(result.items.some(item => fixtureItemIds.has(item.id))).toBe(false);
    } finally { globalThis.fetch = originalFetch; }
});

test("local media enriches 1024 original cases without replacing their catalog order", () => {
    const merged = mergeProductionCaseMedia(catalog, manifest);
    const cases = merged.items.filter(item => item.kind === "case");
    expect(cases).toHaveLength(1024);
    expect(new Set(cases.map(item => item.id)).size).toBe(1024);
    expect(merged.items[0]).toEqual(catalog.items[0]);
    expect(cases.map(item => item.id)).toEqual(catalog.items.filter(item => item.kind === "case").map(item => item.id));
    const local = cases.find(item => item.id === media.id)!;
    expect(local.media).toBe("https://source.invalid/original.mp4");
    expect(local.cover).toBe("https://source.invalid/original.png");
    expect(local.localCover).toBe(media.localCover);
    expect(local.mediaStatus).toBe("local");
    expect(cases.filter(item => item.mediaStatus === "remote")).toHaveLength(1023);
    expect(cases.every(item => !item.available)).toBe(true);
});

test("foreign URLs, unknown stable IDs and ambiguous duplicate mappings are rejected", () => {
    expect(() => mergeProductionCaseMedia(catalog, { ...manifest, entries: [{ ...media, localMedia: "https://outside.invalid/media.mp4" }] })).toThrow();
    expect(() => mergeProductionCaseMedia(catalog, { ...manifest, entries: [{ ...media, id: `case-${"b".repeat(32)}` }] })).toThrow();
    expect(() => mergeProductionCaseMedia(catalog, { ...manifest, entries: [media, media] })).toThrow();
});

test("case sidecars enrich only additional fields and never replace authoritative records", () => {
    const entries = catalog.items.filter(item => item.kind === "case").map(item => ({ ...item, sourceTemplateId: item.id.slice(5), sourceProjectId: item.id.slice(5), likeCount: 2, publishedAt: "fixture", name: "must not overwrite", localCover: `/production-library/covers/cases/${item.id.slice(5)}.webp` }));
    const sidecar = { version: 1, kind: "ltv-case-metadata", entries };
    const merged = mergeProductionCaseMetadata(catalog, sidecar);
    expect(merged.items.map(item => [item.id, item.name, item.media, item.cover])).toEqual(catalog.items.map(item => [item.id, item.name, item.media, item.cover]));
    expect(merged.items.at(-1)?.likeCount).toBe(10);
    expect(merged.items[1].publishedAt).toBe("fixture");
    expect(() => mergeProductionCaseMetadata(catalog, { ...sidecar, entries: entries.slice(1) })).toThrow();
    expect(() => mergeProductionCaseMetadata(catalog, { ...sidecar, entries: [{ ...entries[0], media: "https://changed.invalid/new.mp4" }, ...entries.slice(1)] })).toThrow();
});

test("missing, failed and invalid optional manifests retain all cases and Skill data", async () => {
    const originalFetch = globalThis.fetch;
    const outcomes = ["missing", "spa", "server", "network", "invalid"];
    try {
        for (const outcome of outcomes) {
            globalThis.fetch = (async (url: string | URL | Request) => {
                if (String(url) === publishedCatalogUrl) return Response.json(catalog);
                if (String(url) === "/production-library/case-metadata.json") return new Response("", { status: 404 });
                expect(String(url)).toBe("/production-library/case-media-manifest.json");
                if (outcome === "network") throw new TypeError("isolated network failure");
                if (outcome === "missing") return new Response("", { status: 404 });
                if (outcome === "spa") return new Response("<html></html>", { headers: { "content-type": "text/html" } });
                if (outcome === "server") return new Response("fixture failure", { status: 500 });
                return Response.json({ ...manifest, entries: [{ ...media, localMedia: "/private/source.mp4" }] });
            }) as typeof fetch;
            const result = await loadProductionCatalog();
            expectCatalogComposition(result, true);
            expect(result.items.filter(item => fixtureItemIds.has(item.id)).map(item => item.id)).toEqual(catalog.items.map(item => item.id));
            expect(result.items.filter(item => fixtureCaseIds.has(item.id) && item.kind === "case" && item.mediaStatus === "remote")).toHaveLength(1024);
            expect(result.items.some(item => fixtureItemIds.has(item.id) && item.localMedia)).toBe(false);
            expect(result.mediaWarning).toBeUndefined();
        }
    } finally { globalThis.fetch = originalFetch; }
});

test("cancellation remains cancellation instead of becoming a remote fallback", async () => {
    const originalFetch = globalThis.fetch;
    const controller = new AbortController();
    const cancellation = new DOMException("fixture cancelled", "AbortError");
    try {
        globalThis.fetch = (async (url: string | URL | Request) => {
            if (String(url) === publishedCatalogUrl) return Response.json(catalog);
            if (String(url) === "/production-library/case-metadata.json") return new Response("", { status: 404 });
            controller.abort(cancellation);
            throw cancellation;
        }) as typeof fetch;
        await expect(loadProductionCatalog(false, controller.signal)).rejects.toBe(cancellation);
    } finally { globalThis.fetch = originalFetch; }
});

test("published works remain browsable without reusable engineering snapshots", async () => {
    const originalFetch = globalThis.fetch;
    try {
            globalThis.fetch = (async (url: string | URL | Request) => {
                if (String(url) === publishedCatalogUrl) return Response.json(catalog);
                expect(String(url)).toBe("/production-library/case-media-manifest.json");
                return Response.json(manifest);
            }) as typeof fetch;
            const result = await loadProductionCatalog();
            expectCatalogComposition(result, true);
            const fixtureCaseOrder = catalog.items.filter(item => item.kind === "case")
                .map(item => item.id);
            expect(result.items.filter(item => fixtureCaseIds.has(item.id) && item.kind === "case").map(item => item.id)).toEqual(fixtureCaseOrder);
            expect(result.items.filter(item => fixtureCaseIds.has(item.id) && item.kind === "case" && !item.available)).toHaveLength(1024);
            expect(result.items.filter(item => fixtureCaseIds.has(item.id) && item.kind === "case" && item.mediaStatus === "remote")).toHaveLength(1023);
            expect(result.items.filter(item => fixtureCaseIds.has(item.id) && item.kind === "case" && item.mediaStatus === "local")).toHaveLength(1);
            expect(result.stats.localCases).toBe(nativeProductionCaseCount + 1);
            expect(result.mediaWarning).toBeUndefined();
    } finally { globalThis.fetch = originalFetch; }
});

test("single byte ranges reject invalid and multiple intervals", () => {
    expect(caseMediaByteRange("bytes=4-7", 16)).toEqual({ start: 4, end: 7 });
    expect(caseMediaByteRange("bytes=-3", 16)).toEqual({ start: 13, end: 15 });
    expect(caseMediaByteRange("bytes=13-", 16)).toEqual({ start: 13, end: 15 });
    expect(caseMediaByteRange("bytes=0-9007199254740993", 16)).toEqual({ start: 0, end: 15 });
    for (const value of ["bytes=99-", "bytes=7-4", "bytes=-0", "bytes=0-1,3-4", "bytes=-"]) {
        expect(() => caseMediaByteRange(value, 16)).toThrow();
    }
});

test("local middleware serves exact allowlisted bytes and refuses unlisted files and traversal", async () => {
    const root = await mkdtemp(join(tmpdir(), "ltv-case-media-test-"));
    const content = Buffer.from(Array.from({ length: 16 }, (_, index) => index));
    await mkdir(join(root, "media"));
    await writeFile(join(root, "media", media.filename), content);
    await writeFile(join(root, "media", "unlisted.mp4"), "not in manifest");
    const sha256 = createHash("sha256").update(content).digest("hex");
    const immutableFilename = `${identifier}-${sha256}.mp4`;
    const immutableMedia = `/production-library/case-media/${immutableFilename}`;
    const projectAsset = {caseId:media.id,source:"https://source.invalid/image.png",kind:"image",mimeType:"image/png",bytes:content.length,sha256,path:`/production-library/case-media/${media.id}/${sha256}.png`};
    await mkdir(join(root,"media",media.id));
    await writeFile(join(root,"media",media.id,`${sha256}.png`),content);
    await writeFile(join(root, "media", immutableFilename), content);
    const entries = [
        { ...media, localMediaInfo: { ...media.localMediaInfo, sha256 } },
        { ...media, filename: immutableFilename, localMedia: immutableMedia, localMediaInfo: { ...media.localMediaInfo, sha256 } },
    ];
    await writeFile(join(root, "manifest.json"), JSON.stringify({ ...manifest, entries, assets:[projectAsset] }));
    const middleware = createLtvCaseMediaMiddleware(root);
    const server = createServer((request, response) => middleware(request, response, () => response.writeHead(404).end()));
    try {
        await new Promise<void>(done => server.listen(0, "127.0.0.1", done));
        const address = server.address();
        if (!address || typeof address === "string") throw new Error("No local test listener");
        const base = `http://127.0.0.1:${address.port}`;
        const image = await fetch(base+projectAsset.path);
        expect(image.status).toBe(200);
        expect(image.headers.get("content-type")).toBe("image/png");
        expect(Buffer.from(await image.arrayBuffer())).toEqual(content);
        const imageRange = await fetch(base+projectAsset.path,{headers:{range:"bytes=4-7"}});
        expect(imageRange.status).toBe(206);
        expect(Buffer.from(await imageRange.arrayBuffer())).toEqual(content.subarray(4,8));
        expect((await fetch(base+projectAsset.path.replace(sha256,"f".repeat(64)))).status).toBe(404);
        expect((await fetch(base+projectAsset.path,{method:"POST"})).status).toBe(405);
        const range = await fetch(base + media.localMedia, { headers: { range: "bytes=4-7" } });
        expect(range.status).toBe(206);
        expect(range.headers.get("content-range")).toBe("bytes 4-7/16");
        expect(Buffer.from(await range.arrayBuffer())).toEqual(content.subarray(4, 8));
        const head = await fetch(base + media.localMedia, { method: "HEAD" });
        expect(head.headers.get("content-length")).toBe("16");
        expect(await head.text()).toBe("");
        const immutable = await fetch(base + immutableMedia, { headers: { range: "bytes=4-7" } });
        expect(immutable.status).toBe(206);
        expect(Buffer.from(await immutable.arrayBuffer())).toEqual(content.subarray(4, 8));
        for (const path of ["unlisted.mp4", "..%2Fmanifest.json", `${"b".repeat(32)}.mp4`]) {
            expect((await fetch(`${base}/production-library/case-media/${path}`)).status).toBe(404);
        }
        expect((await fetch(base + media.localMedia, { headers: { range: "bytes=99-" } })).status).toBe(416);
        expect((await fetch(base + media.localMedia, { method: "POST" })).status).toBe(405);
        await writeFile(join(root, "manifest.json"), JSON.stringify({ ...manifest, entries: [{ ...entries[1], localMediaInfo: { ...media.localMediaInfo, sha256: "b".repeat(64) } }] }));
        expect((await fetch(base + immutableMedia)).status).toBe(500);
    } finally {
        server.closeAllConnections();
        await new Promise<void>(done => server.close(() => done()));
        if (!resolve(root).startsWith(resolve(tmpdir()) + sep + "ltv-case-media-test-")) throw new Error("Unsafe fixture cleanup path");
        await rm(root, { recursive: true, force: true });
    }
});
