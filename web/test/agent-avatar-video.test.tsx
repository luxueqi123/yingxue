import { afterAll, afterEach, expect, mock, test } from "bun:test";
import { Window } from "happy-dom";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { AgentAvatarVideo } from "../src/components/canvas/agent-avatar-video";

const dom = new Window({ url: "https://canvas.example/" });
const originals = new Map<string, PropertyDescriptor | undefined>();
let resized: (() => void) | undefined;
let disconnected = false;
class AvatarResizeObserver {
    constructor(callback: () => void) { resized = callback; }
    observe() {}
    disconnect() { disconnected = true; }
}
for (const [key, value] of Object.entries({ window: dom, document: dom.document, HTMLElement: dom.HTMLElement, HTMLMediaElement: dom.HTMLMediaElement, ResizeObserver: AvatarResizeObserver, IS_REACT_ACT_ENVIRONMENT: true })) {
    originals.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
}

let box = { width: 208, height: 260 };
let source = { width: 512, height: 640 };
let visibility = "visible";
const frameRequests = new Map<number, () => void>();
let frameID = 0;
const drawImage = mock(() => undefined);
const putImageData = mock((_image: { data: Uint8ClampedArray }, _x: number, _y: number) => undefined);
const context = { drawImage, putImageData, getImageData: () => ({ data: new Uint8ClampedArray([0, 255, 0, 255, 240, 240, 250, 255]) }) };
Object.defineProperty(dom.document, "visibilityState", { configurable: true, get: () => visibility });
Object.defineProperties(dom.HTMLMediaElement.prototype, {
    readyState: { configurable: true, get: () => 4 },
    videoWidth: { configurable: true, get: () => source.width },
    videoHeight: { configurable: true, get: () => source.height },
    play: { configurable: true, value: () => Promise.resolve() },
    pause: { configurable: true, value: () => undefined },
    requestVideoFrameCallback: { configurable: true, value: (callback: () => void) => { frameRequests.set(++frameID, callback); return frameID; } },
    cancelVideoFrameCallback: { configurable: true, value: (id: number) => frameRequests.delete(id) },
});
Object.defineProperties(dom.HTMLCanvasElement.prototype, {
    getContext: { configurable: true, value: () => context },
    getBoundingClientRect: { configurable: true, value: () => ({ ...box, x: 0, y: 0, top: 0, left: 0, right: box.width, bottom: box.height }) },
});

let root: Root | undefined;
let host: HTMLDivElement | undefined;
const onReady = mock(() => undefined);
async function render(paused = false) {
    if (!root) {
        host = document.createElement("div");
        document.body.append(host);
        root = createRoot(host);
    }
    await act(async () => { root!.render(<AgentAvatarVideo src="/avatar.mp4" onReady={onReady} paused={paused} />); });
    return host!.querySelector("canvas")!;
}

afterEach(async () => {
    if (root) await act(async () => root!.unmount());
    root = undefined;
    host?.remove();
    expect(frameRequests.size).toBe(0);
    frameRequests.clear();
    box = { width: 208, height: 260 };
    source = { width: 512, height: 640 };
    visibility = "visible";
    resized = undefined;
    disconnected = false;
    drawImage.mockClear();
    putImageData.mockClear();
    onReady.mockClear();
});
afterAll(() => {
    dom.happyDOM.abort();
    for (const [key, value] of originals) {
        if (value) Object.defineProperty(globalThis, key, value);
        else Reflect.deleteProperty(globalThis, key);
    }
});

test("260px avatars preserve two-density detail and key green without removing white clothing", async () => {
    Object.defineProperty(dom, "devicePixelRatio", { configurable: true, value: 2 });
    const canvas = await render();
    expect([canvas.width, canvas.height]).toEqual([416, 520]);
    const image = putImageData.mock.calls[0]?.[0] as unknown as { data: Uint8ClampedArray };
    expect(image.data[3]).toBe(0);
    expect(image.data[7]).toBe(255);
    expect(onReady).toHaveBeenCalledTimes(1);
});

test("small sources are not upscaled and large sources keep bounded main-thread work", async () => {
    Object.defineProperty(dom, "devicePixelRatio", { configurable: true, value: 3 });
    source = { width: 160, height: 200 };
    const canvas = await render();
    expect([canvas.width, canvas.height]).toEqual([160, 200]);
    source = { width: 3840, height: 2160 };
    box = { width: 960, height: 540 };
    resized!();
    expect([canvas.width, canvas.height]).toEqual([640, 360]);
});

test("resizing an ended frame redraws it once, preserves readiness, and disconnects on pause", async () => {
    Object.defineProperty(dom, "devicePixelRatio", { configurable: true, value: 2 });
    const canvas = await render();
    box = { width: 96, height: 120 };
    resized!();
    expect([canvas.width, canvas.height]).toEqual([192, 240]);
    expect(onReady).toHaveBeenCalledTimes(1);
    const draws = drawImage.mock.calls.length;
    visibility = "hidden";
    box = { width: 208, height: 260 };
    resized!();
    expect(drawImage.mock.calls.length).toBe(draws);
    visibility = "visible";
    dom.document.dispatchEvent(new dom.Event("visibilitychange"));
    expect([canvas.width, canvas.height]).toEqual([416, 520]);
    await render(true);
    expect(disconnected).toBe(true);
    expect(frameRequests.size).toBe(0);
});
