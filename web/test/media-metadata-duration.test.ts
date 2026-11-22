import { expect, test } from "bun:test";
import { probeMediaDurationMs, probeMediaDurationUrlMs } from "../src/lib/media-metadata";

async function withMedia(duration: number, run: (element: any) => Promise<void>) {
    const oldDocument = globalThis.document;
    const oldWindow = globalThis.window;
    const element = {
        duration, preload: "", muted: false, onloadedmetadata: null as (() => void) | null,
        onerror: null as (() => void) | null, currentSrc: "", cleaned: false,
        set src(value: string) { this.currentSrc = value; },
        removeAttribute() { this.currentSrc = ""; },
        load() { this.cleaned = true; },
    };
    globalThis.document = { createElement: () => element } as any;
    globalThis.window = { setTimeout, clearTimeout } as any;
    try { await run(element); }
    finally { globalThis.document = oldDocument; globalThis.window = oldWindow; }
}

test("probes retained URL metadata and clears media element without rewriting URLs", async () => {
    await withMedia(12.3456, async element => {
        const result = probeMediaDurationUrlMs("/api/resources/retained/file", "video");
        expect(element.currentSrc).toBe("/api/resources/retained/file");
        element.onloadedmetadata();
        expect(await result).toBe(12346);
        expect(element.cleaned).toBe(true);
        expect(element.currentSrc).toBe("");
        expect(element.onloadedmetadata).toBeNull();
    });
});

test("metadata error remains unknown rather than a four-second duration", async () => {
    await withMedia(0, async element => {
        const result = probeMediaDurationUrlMs("/api/resources/broken/file", "audio");
        element.onerror();
        expect(await result).toBeUndefined();
        expect(element.cleaned).toBe(true);
    });
});

test("closing during a probe cancels it and releases the media element", async () => {
    await withMedia(0, async element => {
        const controller = new AbortController();
        const result = probeMediaDurationUrlMs("/api/resources/slow/file", "video", controller.signal);
        controller.abort();
        await expect(result).rejects.toThrow();
        expect(element.cleaned).toBe(true);
        expect(element.onerror).toBeNull();
    });
});

test("upload File wrapper keeps duration behavior and skips non-media", async () => {
    await withMedia(4.046, async element => {
        const result = probeMediaDurationMs(new File(["media"], "voice.mp3", { type: "audio/mpeg" }));
        element.onloadedmetadata();
        expect(await result).toBe(4046);
        expect(await probeMediaDurationMs(new File(["text"], "notes.txt", { type: "text/plain" }))).toBeUndefined();
    });
});
