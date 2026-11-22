import { afterAll, afterEach, expect, spyOn, test } from "bun:test";
import { Window } from "happy-dom";

const dom = new Window({ url: "https://canvas.test/" });
const originals = new Map<string, PropertyDescriptor | undefined>();
const imageRequests: string[] = [];
for (const [key, value] of Object.entries({
    window: dom, document: dom.document, navigator: dom.navigator, location: dom.location,
    HTMLElement: dom.HTMLElement, SVGElement: dom.SVGElement, Element: dom.Element, Node: dom.Node,
    ShadowRoot: dom.ShadowRoot, MutationObserver: dom.MutationObserver, ResizeObserver: dom.ResizeObserver,
    getComputedStyle: dom.getComputedStyle.bind(dom), requestAnimationFrame: dom.requestAnimationFrame.bind(dom),
    cancelAnimationFrame: dom.cancelAnimationFrame.bind(dom), IS_REACT_ACT_ENVIRONMENT: true,
    Image: class {
        naturalWidth = 900;
        naturalHeight = 1200;
        onload?: () => void;
        onerror?: () => void;
        set src(value: string) { imageRequests.push(value); if (value) queueMicrotask(() => this.onload?.()); }
    },
})) {
    originals.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
}
const { act } = await import("react");
const { createRoot } = await import("react-dom/client");
const { App } = await import("antd");
const imageStorage = await import("../src/services/image-storage");
const { useImageToolSource } = await import("../src/hooks/use-image-tool-source");
const { ImageCropDialog } = await import("../src/components/image-crop-dialog");
const { CanvasNodeUpscaleDialog } = await import("../src/components/canvas/canvas-node-upscale-dialog");
const { interfaceLocales, interfaceTranslator, loadInterfaceLocale } = await import("../src/lib/interface-locale");
const { useInterfaceLocaleStore } = await import("../src/stores/use-interface-locale-store");
const read = spyOn(imageStorage, "getImageBlob");
const revoke = spyOn(URL, "revokeObjectURL");
let root: ReturnType<typeof createRoot> | undefined;
let host: HTMLDivElement;
let observed: ReturnType<typeof useImageToolSource> | undefined;
function Probe({ source, storageKey }: { source: string; storageKey: string }) {
    observed = useImageToolSource(source, storageKey);
    return <output>{observed.error || `${observed.size?.width ?? 0}`}</output>;
}
async function mount(element: import("react").ReactNode) {
    if (!root) { host = document.createElement("div"); document.body.append(host); root = createRoot(host); }
    await act(async () => { root!.render(<App>{element}</App>); });
}
afterEach(async () => {
    await act(async () => root?.unmount()); root = undefined;
    document.body.innerHTML = ""; imageRequests.length = 0; observed = undefined; read.mockReset(); revoke.mockClear();
});
afterAll(() => {
    read.mockRestore(); revoke.mockRestore(); dom.happyDOM.abort();
    for (const [key, descriptor] of originals) {
        if (descriptor) Object.defineProperty(globalThis, key, descriptor); else Reflect.deleteProperty(globalThis, key);
    }
});
test("resource-backed editors decode authorized original bytes and release the shared preview on close", async () => {
    read.mockResolvedValueOnce(new Blob(["original pixels"], { type: "image/png" }));
    await mount(<Probe source="/api/resources/image/file" storageKey="resource:image" />);
    expect(read).toHaveBeenCalledWith("resource:image");
    expect(observed?.size).toEqual({ width: 900, height: 1200 });
    expect(observed?.previewUrl).toMatch(/^blob:/);
    expect(imageRequests).toEqual([observed!.previewUrl]);
    const preview = observed!.previewUrl;
    await act(async () => root!.unmount()); root = undefined;
    expect(revoke).toHaveBeenCalledWith(preview);
});
test("a late original from a previous source cannot replace the current image and is released", async () => {
    let finish!: (blob: Blob) => void;
    read.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    read.mockResolvedValueOnce(new Blob(["new pixels"], { type: "image/png" }));
    await mount(<Probe source="/old" storageKey="resource:old" />);
    await mount(<Probe source="/new" storageKey="resource:new" />);
    const current = observed!.previewUrl;
    await act(async () => finish(new Blob(["old pixels"], { type: "image/png" })));
    expect(observed?.source).toBe("/new"); expect(observed?.previewUrl).toBe(current);
    expect(imageRequests).toEqual([current]); expect(revoke).toHaveBeenCalledTimes(1);
});
test("authorization failures remain visible and cannot confirm or retry via the display URL", async () => {
    read.mockRejectedValueOnce(new Error("Resource access denied"));
    await useInterfaceLocaleStore.getState().setLocale("en-US");
    let confirmations = 0;
    await mount(<ImageCropDialog open dataUrl="/api/resources/image/file" storageKey="resource:image" onClose={() => {}} onConfirm={() => { confirmations++; }} />);
    expect(document.querySelector('[role="alert"]')?.textContent).toBe("Resource access denied");
    const button = [...document.querySelectorAll("button")].find(button => button.textContent === "Apply crop")!;
    expect(button.disabled).toBe(true); await act(async () => button.click());
    expect(confirmations).toBe(0); expect(imageRequests).toEqual([]);
});
for (const locale of interfaceLocales) {
    test(`${locale}: actual crop and resize controls translate while crop geometry and interpolation remain intact`, async () => {
        await loadInterfaceLocale(locale);
        await act(async () => { await useInterfaceLocaleStore.getState().setLocale(locale); });
        const t = interfaceTranslator(locale);
        read.mockResolvedValue(new Blob(["original pixels"], { type: "image/png" }));
        let crop: import("../src/components/image-crop-dialog").ImageCropRect | undefined;
        await mount(<ImageCropDialog open dataUrl="/image" storageKey="resource:image" onClose={() => {}} onConfirm={value => { crop = value; }} />);
        const button = (label: string) => [...document.querySelectorAll("button")].find(button => button.textContent === label)!;
        expect(button(t("imageTools.applyCrop")).disabled).toBe(false);
        expect(document.querySelector('[aria-label="' + t("imageTools.cropArea") + '"]')).not.toBeNull();
        await act(async () => button("1:1").click());
        expect(button(t("imageTools.unlockRatio"))).toBeDefined();
        await act(async () => button(t("imageTools.applyCrop")).click());
        expect(crop!.width * 900).toBeCloseTo(crop!.height * 1200);
        expect(crop!.x + crop!.width).toBeLessThanOrEqual(1);
        let resized: { targetLongEdge: number; algorithm: string } | undefined;
        await mount(<CanvasNodeUpscaleDialog open dataUrl="/image" storageKey="resource:image" onClose={() => {}} onConfirm={value => { resized = value; }} />);
        expect(button(t("imageTools.applyResize")).disabled).toBe(false);
        expect(document.body.textContent).not.toContain("imageTools.");
        if (!["zh-CN", "zh-HK", "zh-TW", "ja-JP"].includes(locale)) expect(document.body.textContent).not.toMatch(/[\u3400-\u9fff]/);
        await act(async () => button(t("imageTools.applyResize")).click());
        expect(resized).toEqual({ targetLongEdge: 2048, algorithm: "high" });
    });
}
