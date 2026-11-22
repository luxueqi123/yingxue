import { afterAll, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { CanvasNodeData } from "../src/types/canvas";
import { CanvasNodeType } from "../src/types/canvas";

// Keep the real hydration, deduplication and abort lifecycle; replace only
// browser capture, resource lookup and upload at their external boundaries.
const directory = mkdtempSync(join(tmpdir(), "canvas-video-preview-"));
const dependencies = join(directory, "dependencies.ts");
writeFileSync(dependencies, `
export const fixture = { scope: "poster-user", captures: [], uploads: [], capture: undefined, upload: undefined, cached: undefined, resolve: undefined };
export const browserWindow = { requestIdleCallback: callback => { queueMicrotask(callback); return 1; }, cancelIdleCallback: () => {} };
export const getActiveUserScope = () => fixture.scope;
export const peekCachedResourceObjectUrl = () => "";
export const getCachedResourceObjectUrl = async () => fixture.cached();
export const resolveVideoMediaUrl = async (_key, content) => fixture.resolve(content);
export const captureVideoPoster = async (...args) => { fixture.captures.push(args); return fixture.capture(...args); };
export const uploadImage = async (...args) => { fixture.uploads.push(args); return fixture.upload(...args); };
`);
const source = readFileSync(new URL("../src/services/canvas-video-preview.ts", import.meta.url), "utf8");
writeFileSync(join(directory, "preview.ts"), `import { browserWindow as window } from ${JSON.stringify(dependencies)};\n` + source.replace(/from "@\/(?:lib\/(?:user-scope|video-poster)|services\/(?:resource-blob-cache|file-storage|image-storage))"/g, `from ${JSON.stringify(dependencies)}`));
const { fixture } = await import(dependencies);
const { hydrateCanvasVideoPreview } = await import(join(directory, "preview.ts"));
afterAll(() => rmSync(directory, { recursive: true, force: true }));

const poster = new Blob(["captured-frame"], { type: "image/webp" });
const uploaded = { url: "/api/resources/poster/file", storageKey: "resource:poster", width: 400, height: 225, bytes: poster.size, mimeType: poster.type };
let sequence = 0;
function setup(): CanvasNodeData {
    fixture.scope = "poster-user";
    fixture.captures = [];
    fixture.uploads = [];
    fixture.capture = async () => ({ poster });
    fixture.upload = async () => uploaded;
    fixture.cached = async () => "";
    fixture.resolve = async (content: string) => content;
    const id = `preview-${++sequence}`;
    return { id, type: CanvasNodeType.Video, title: id, position: { x: 0, y: 0 }, width: 320, height: 180, metadata: { content: `https://media.example/${id}.mp4` } };
}
function deferred<T>() {
    let resolve!: (value: T) => void;
    let reject!: (reason: Error) => void;
    const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
    return { promise, resolve, reject };
}

test("captured frame is readable before upload finishes; upload failure permits a later retry", async () => {
    const node = setup();
    const upload = deferred<typeof uploaded>();
    fixture.upload = () => upload.promise;
    const preview = await hydrateCanvasVideoPreview(node);
    expect(preview).not.toBeNull();
    expect(fixture.uploads).toHaveLength(1);
    expect(await (await fetch(preview.localUrl)).text()).toBe("captured-frame");
    upload.reject(new Error("isolated upload failure"));
    expect(await preview.persisted).toBeNull();
    expect(await (await fetch(preview.localUrl)).text()).toBe("captured-frame");
    URL.revokeObjectURL(preview.localUrl);
    await Promise.resolve();
    fixture.upload = async () => uploaded;
    const retried = await hydrateCanvasVideoPreview(node);
    expect(await retried.persisted).toMatchObject({ content: uploaded.url, storageKey: uploaded.storageKey });
    expect(fixture.captures).toHaveLength(2);
    URL.revokeObjectURL(retried.localUrl);
});

test("capture failure does not leave a permanent cached failure", async () => {
    const node = setup();
    fixture.capture = async () => { throw new Error("isolated capture failure"); };
    expect(await hydrateCanvasVideoPreview(node)).toBeNull();
    fixture.capture = async () => ({ poster });
    const retried = await hydrateCanvasVideoPreview(node);
    expect(await retried.persisted).toMatchObject({ content: uploaded.url });
    expect(fixture.captures).toHaveLength(2);
    URL.revokeObjectURL(retried.localUrl);
});

test("one subscriber cancelling does not interrupt the other subscriber's shared capture", async () => {
    const node = setup();
    const captured = deferred<{ poster: Blob }>();
    fixture.capture = () => captured.promise;
    const controller = new AbortController();
    const first = hydrateCanvasVideoPreview(node, controller.signal);
    const firstResult = first.then(() => "unexpected-success", (error: Error) => error.name);
    const second = hydrateCanvasVideoPreview(node);
    await Promise.resolve();
    controller.abort();
    expect(await firstResult).toBe("AbortError");
    captured.resolve({ poster });
    const preview = await second;
    expect(fixture.captures).toHaveLength(1);
    expect(fixture.captures[0][1].signal.aborted).toBe(false);
    expect(await preview.persisted).toMatchObject({ content: uploaded.url });
    expect(fixture.uploads).toHaveLength(1);
    URL.revokeObjectURL(preview.localUrl);
});

test("account switch during capture prevents uploading the old account's frame", async () => {
    const node = setup();
    const captured = deferred<{ poster: Blob }>();
    const entered = deferred<void>();
    fixture.capture = () => { entered.resolve(); return captured.promise; };
    const pending = hydrateCanvasVideoPreview(node);
    const result = pending.then(() => "unexpected-success", (error: Error) => error.name);
    await entered.promise;
    fixture.scope = "another-user";
    captured.resolve({ poster });
    expect(await result).toBe("AbortError");
    expect(fixture.uploads).toHaveLength(0);
});

test("account switch while waiting for idle prevents capture and upload", async () => {
    const node = setup();
    const result = hydrateCanvasVideoPreview(node).then(() => "unexpected-success", (error: Error) => error.name);
    fixture.scope = "another-user";
    expect(await result).toBe("AbortError");
    expect(fixture.captures).toHaveLength(0);
    expect(fixture.uploads).toHaveLength(0);
});

for (const stage of ["cached", "resolve"] as const) {
    test(`account switch during ${stage} lookup prevents capture and upload`, async () => {
        const node = setup();
        node.metadata.storageKey = "resource:video";
        const lookup = deferred<string>();
        const entered = deferred<void>();
        fixture[stage] = () => { entered.resolve(); return lookup.promise; };
        const result = hydrateCanvasVideoPreview(node).then(() => "unexpected-success", (error: Error) => error.name);
        await entered.promise;
        fixture.scope = "another-user";
        lookup.resolve("https://media.example/old-account.mp4");
        expect(await result).toBe("AbortError");
        expect(fixture.captures).toHaveLength(0);
        expect(fixture.uploads).toHaveLength(0);
    });
}

test("upload completion after an account switch cannot return stale metadata", async () => {
    const node = setup();
    const upload = deferred<typeof uploaded>();
    fixture.upload = () => upload.promise;
    const preview = await hydrateCanvasVideoPreview(node);
    fixture.scope = "another-user";
    upload.resolve(uploaded);
    expect(await preview.persisted).toBeNull();
    URL.revokeObjectURL(preview.localUrl);
});

test("cancelling the last subscriber aborts capture and permits a fresh retry", async () => {
    const node = setup();
    const entered = deferred<AbortSignal>();
    fixture.capture = (_source: string, options: { signal: AbortSignal }) => new Promise((_resolve, reject) => {
        entered.resolve(options.signal);
        options.signal.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")), { once: true });
    });
    const controller = new AbortController();
    const result = hydrateCanvasVideoPreview(node, controller.signal).then(() => "unexpected-success", (error: Error) => error.name);
    const captureSignal = await entered.promise;
    controller.abort();
    expect(await result).toBe("AbortError");
    expect(captureSignal.aborted).toBe(true);
    expect(fixture.uploads).toHaveLength(0);
    fixture.capture = async () => ({ poster });
    const retried = await hydrateCanvasVideoPreview(node);
    expect(await retried.persisted).toMatchObject({ content: uploaded.url });
    URL.revokeObjectURL(retried.localUrl);
});
