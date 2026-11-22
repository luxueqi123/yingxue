import { afterAll, expect, mock, test } from "bun:test";
import { Window } from "happy-dom";
import type { NodeGenerationInput } from "../../src/components/canvas/canvas-node-generation";

const dom = new Window({ url: "http://localhost/" });
for (const key of ["window", "document", "navigator", "Element", "Node", "HTMLElement", "SVGElement", "ShadowRoot", "HTMLTextAreaElement", "FileReader", "MutationObserver", "ResizeObserver"] as const) {
    Object.defineProperty(globalThis, key, { configurable: true, value: key === "window" ? dom : dom[key] });
}
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true, getComputedStyle: dom.getComputedStyle.bind(dom), requestAnimationFrame: dom.requestAnimationFrame.bind(dom), cancelAnimationFrame: dom.cancelAnimationFrame.bind(dom) });
const storage = await import("../../src/services/image-storage");
const drawings = await import("../../src/lib/canvas/canvas-drawing-storage");
const resourceKeys: string[] = [];
const drawingReads: string[] = [];
const drawingPending = new Map<string, (value: Blob | null) => void>();
mock.module("@/services/image-storage", () => ({ ...storage, resolveImageUrl: async (key: string) => {
    resourceKeys.push(key);
    return `https://media.example.test/${encodeURIComponent(key)}.png`;
} }));
mock.module("@/lib/canvas/canvas-drawing-storage", () => ({ ...drawings, loadCanvasDrawingPreview: async (projectId: string, drawingId: string) => {
    drawingReads.push(`${projectId}:${drawingId}`);
    return new Promise<Blob | null>((resolve) => drawingPending.set(projectId, resolve));
} }));
const { act } = await import("react");
const { createRoot } = await import("react-dom/client");
const { CanvasConfigComposer } = await import("../../src/components/canvas/canvas-config-composer");
const { serializeEditableValue } = await import("../../src/components/canvas/canvas-mention-editable");
afterAll(() => dom.happyDOM.abort());

test("stored image and video poster resolve independently while the original prompt stays intact", async () => {
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    const inputs: NodeGenerationInput[] = [
        { nodeId: "image", title: "image", type: "image", image: { id: "image", name: "image.png", type: "image/png", dataUrl: "", storageKey: "resource:composer-image" } },
        { nodeId: "video", title: "video", type: "video", previewStorageKey: "resource:composer-poster", video: { id: "video", name: "video.mp4", type: "video/mp4", url: "https://media.example.test/full-film.mp4", storageKey: "resource:composer-film" } },
    ];
    const prompt = "Keep @图片1 then @视频1 unchanged";
    const writes: string[] = [];
    try {
        await act(async () => root.render(<CanvasConfigComposer canvasId="stored-media" nodeId="config" inputs={inputs} value={prompt} onChange={(next) => { writes.push(next); }} onClose={() => {}} workspaceMode="simple" />));
        const editor = host.querySelector<HTMLElement>('[contenteditable="true"]')!;
        expect(editor).not.toBeNull();
        expect([...editor.querySelectorAll("img")].map((image) => image.src)).toEqual([
            "https://media.example.test/resource%3Acomposer-image.png",
            "https://media.example.test/resource%3Acomposer-poster.png",
        ]);
        expect(resourceKeys).toContain("resource:composer-image");
        expect(resourceKeys).toContain("resource:composer-poster");
        expect(resourceKeys).not.toContain("resource:composer-film");
        expect(editor.querySelector("video")).toBeNull();
        expect(serializeEditableValue(editor)).toBe(prompt);
        expect(writes).toEqual([]);
    } finally {
        await act(async () => root.unmount());
        host.remove();
    }
});

test("drawing previews use the active canvas and discard a late result from the previous canvas", async () => {
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    const inputs: NodeGenerationInput[] = [{ nodeId: "drawing", title: "drawing", type: "image", sourceKind: "drawing", image: { id: "drawing", name: "drawing.png", type: "image/png", dataUrl: "", source: { kind: "drawing", drawingId: "shared-drawing-id", revision: 3, shapeCount: 1 } } }];
    const writes: string[] = [];
    const render = (canvasId: string) => root.render(<CanvasConfigComposer canvasId={canvasId} nodeId="config" inputs={inputs} value="Keep @绘图1" onChange={(next) => { writes.push(next); }} onClose={() => {}} workspaceMode="simple" />);
    try {
        await act(async () => render("drawing-project-a"));
        await act(async () => render("drawing-project-b"));
        expect(drawingReads).toEqual(["drawing-project-a:shared-drawing-id", "drawing-project-b:shared-drawing-id"]);
        await act(async () => {
            drawingPending.get("drawing-project-a")!(new dom.Blob(["old"], { type: "image/png" }) as unknown as Blob);
            await dom.happyDOM.waitUntilComplete();
        });
        expect(host.querySelector("img")).toBeNull();
        await act(async () => {
            drawingPending.get("drawing-project-b")!(new dom.Blob(["current"], { type: "image/png" }) as unknown as Blob);
            await dom.happyDOM.waitUntilComplete();
        });
        expect(host.querySelector("img")?.src).toBe("data:image/png;base64,Y3VycmVudA==");
        expect(serializeEditableValue(host.querySelector<HTMLElement>('[contenteditable="true"]')!)).toBe("Keep @绘图1");
        expect(writes).toEqual([]);
    } finally {
        await act(async () => root.unmount());
        host.remove();
    }
});

test("one pending drawing does not hold back ready previews or video frame selection", async () => {
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    const inputs: NodeGenerationInput[] = [
        { nodeId: "independent-image", title: "image", type: "image", image: { id: "independent-image", name: "image.png", type: "image/png", dataUrl: "", storageKey: "resource:independent-image" } },
        { nodeId: "pending-drawing", title: "drawing", type: "image", sourceKind: "drawing", image: { id: "pending-drawing", name: "drawing.png", type: "image/png", dataUrl: "", source: { kind: "drawing", drawingId: "pending-drawing", revision: 1, shapeCount: 1 } } },
        { nodeId: "independent-video", title: "video", type: "video", previewStorageKey: "resource:independent-poster", video: { id: "independent-video", name: "video.mp4", type: "video/mp4", url: "https://media.example.test/full-film.mp4", storageKey: "resource:independent-film" } },
    ];
    const prompt = "Keep @图片1 @视频1 @绘图2";
    const writes: string[] = [];
    const frameChanges: unknown[] = [];
    try {
        await act(async () => root.render(<CanvasConfigComposer canvasId="independent-previews" nodeId="config" inputs={inputs} generationMode="video" value={prompt} onChange={(next) => { writes.push(next); }} onMetadataChange={(patch) => { frameChanges.push(patch); }} onClose={() => {}} />));
        const editor = host.querySelector<HTMLElement>('[contenteditable="true"]')!;
        expect([...editor.querySelectorAll("img")].map((image) => image.src)).toEqual([
            "https://media.example.test/resource%3Aindependent-image.png",
            "https://media.example.test/resource%3Aindependent-poster.png",
        ]);
        expect(drawingPending.has("independent-previews")).toBe(true);
        const frameButton = host.querySelector<HTMLButtonElement>('button[title="首帧"]');
        expect(frameButton).not.toBeNull();
        await act(async () => frameButton!.click());
        const imageChoice = [...document.body.querySelectorAll<HTMLButtonElement>("button")].find((button) => button.textContent?.trim() === "图片1 · image");
        expect(imageChoice).toBeDefined();
        await act(async () => imageChoice!.click());
        expect(frameChanges).toEqual([{ videoStartFrameNodeId: "independent-image" }]);
        await act(async () => {
            drawingPending.get("independent-previews")!(new dom.Blob(["drawing"], { type: "image/png" }) as unknown as Blob);
            await dom.happyDOM.waitUntilComplete();
        });
        expect([...editor.querySelectorAll("img")].map((image) => image.src)).toContain("data:image/png;base64,ZHJhd2luZw==");
        expect(serializeEditableValue(editor)).toBe(prompt);
        expect(writes).toEqual([]);
    } finally {
        drawingPending.get("independent-previews")?.(null);
        await act(async () => root.unmount());
        host.remove();
    }
});
