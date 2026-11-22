import { afterEach, beforeEach, expect, test } from "bun:test";
import localforage from "localforage";

import { apiClient } from "@/services/api/request";
import { clearResourceAccessCache, getResourceAccess, getResourceBlob } from "@/services/api/resources";
import { resolveMediaUrl, resolveVideoMediaUrl } from "@/services/file-storage";

const previousWindow = globalThis.window;
const previousFetch = globalThis.fetch;
const previousAdapter = apiClient.defaults.adapter;
const previousGet = localforage.getItem;
const previousSet = localforage.setItem;
const previousRemove = localforage.removeItem;
const persisted = new Map<string, unknown>();
let requests: { resourceId: string; purpose: string; variant: string }[] = [];
let scope = "refresh-user";

beforeEach(() => {
    clearResourceAccessCache();
    persisted.clear();
    requests = [];
    scope = "refresh-user";
    Object.defineProperty(globalThis, "window", {
        configurable: true,
        value: { localStorage: { getItem: () => scope } },
    });
    localforage.getItem = (async (key: string) => persisted.get(key) ?? null) as typeof localforage.getItem;
    localforage.setItem = (async (key: string, value: unknown) => {
        persisted.set(key, value);
        return value;
    }) as typeof localforage.setItem;
    localforage.removeItem = async (key: string) => { persisted.delete(key); };
    apiClient.defaults.adapter = async (config) => {
        if (config.url !== "/resources/access" || config.method !== "post") throw new Error("Unexpected resource request");
        const items = JSON.parse(String(config.data)) as typeof requests;
        requests.push(...items);
        const now = Date.now();
        return {
            config, status: 200, statusText: "OK", headers: {},
            data: { code: 0, data: { items: items.map((item) => ({
                resourceId: item.resourceId,
                access: {
                    resourceId: item.resourceId, requestedVariant: item.variant, actualVariant: item.variant,
                    url: `https://media.example.test/${item.variant}/${requests.length}.mp4`, delivery: "cdn",
                    issuedAt: new Date(now).toISOString(), expiresAt: new Date(now + 600_000).toISOString(),
                    refreshAt: new Date(now + 300_000).toISOString(), revision: String(requests.length),
                },
            })) } },
        };
    };
});

afterEach(() => {
    globalThis.fetch = previousFetch;
    clearResourceAccessCache();
    localforage.getItem = previousGet;
    localforage.setItem = previousSet;
    localforage.removeItem = previousRemove;
    apiClient.defaults.adapter = previousAdapter;
    if (previousWindow === undefined) delete (globalThis as { window?: unknown }).window;
    else Object.defineProperty(globalThis, "window", { configurable: true, value: previousWindow });
});

test("force refresh replaces both memory and persisted playback addresses", async () => {
    const first = await getResourceAccess("resource:video", "display", "playback");
    expect((await getResourceAccess("resource:video", "display", "playback")).url).toBe(first.url);
    clearResourceAccessCache();
    expect((await getResourceAccess("resource:video", "display", "playback")).url).toBe(first.url);
    expect(requests).toHaveLength(1);
    const refreshed = await getResourceAccess("resource:video", "display", "playback", "", { forceRefresh: true });
    expect(refreshed.url).not.toBe(first.url);
    expect(requests).toHaveLength(2);
    clearResourceAccessCache();
    expect((await getResourceAccess("resource:video", "display", "playback")).url).toBe(refreshed.url);
    expect(requests).toHaveLength(2);
});

test("video resolution requests playback while ordinary media keeps its original variant", async () => {
    expect(await resolveVideoMediaUrl("resource:video")).toContain("/playback/");
    expect(await resolveMediaUrl("resource:audio")).toContain("/original/");
    expect(requests.map((item) => item.variant)).toEqual(["playback", "original"]);
    expect(await resolveVideoMediaUrl(undefined, "https://source.example.test/video.mp4")).toBe("https://source.example.test/video.mp4");
});

test("persisted addresses remain scoped to the authenticated account", async () => {
    const first = await getResourceAccess("resource:video", "display", "playback");
    scope = "another-user";
    clearResourceAccessCache();
    const second = await getResourceAccess("resource:video", "display", "playback");
    expect(second.url).not.toBe(first.url);
    expect(requests).toHaveLength(2);
    expect([...persisted.keys()]).toEqual(expect.arrayContaining([
        "resource-access-v1:video:playback:user:refresh-user",
        "resource-access-v1:video:playback:user:another-user",
    ]));
});

test("browser processing retries a failed CORS cache read once with the same authorized URL", async () => {
    const calls: Array<{ url: string; options?: RequestInit }> = [];
    globalThis.fetch = (async (url, options) => {
        calls.push({ url: String(url), options });
        if (calls.length === 1) throw new TypeError("Failed to fetch");
        return new Response("real bytes", { headers: { "Content-Type": "video/mp4" } });
    }) as typeof fetch;
    const blob = await getResourceBlob("resource:video");
    expect(await blob?.text()).toBe("real bytes");
    expect(calls).toHaveLength(2);
    expect(calls[1].url).toBe(calls[0].url);
    expect(calls[0].options?.credentials).toBe("omit");
    expect(calls[1].options).toMatchObject({ credentials: "omit", mode: "cors", cache: "reload" });
    expect(requests[0].purpose).toBe("browser-process");
});

test("HTTP permission failures are preserved without a cache retry", async () => {
    let calls = 0;
    globalThis.fetch = (async () => { calls++; return new Response("denied", { status: 403 }); }) as typeof fetch;
    await expect(getResourceBlob("resource:video")).rejects.toThrow("403");
    expect(calls).toBe(1);
});
