import { afterAll, afterEach, expect, test } from "bun:test";
import { Window } from "happy-dom";
import { createInstance } from "i18next";
import { loadInterfaceLocale } from "../src/lib/interface-locale";
import { getLoadedNativeLocale, loadNativeLocale } from "../src/i18n/locale-catalogs";
import { SUPPORTED_LOCALES } from "../src/i18n/locales";
import { CanvasNodeType, type CanvasNodeData, type StoryboardAssetBinding } from "../src/types/canvas";

const dom = new Window({ url: "https://storyboard-assets.test/" });
const originals = new Map<string, PropertyDescriptor | undefined>();
for (const [key, value] of Object.entries({
    window: dom, document: dom.document, navigator: dom.navigator, location: dom.location,
    HTMLElement: dom.HTMLElement, SVGElement: dom.SVGElement, Element: dom.Element,
    ShadowRoot: dom.ShadowRoot, Node: dom.Node, MutationObserver: dom.MutationObserver,
    ResizeObserver: dom.ResizeObserver, getComputedStyle: dom.getComputedStyle.bind(dom),
    requestAnimationFrame: dom.requestAnimationFrame.bind(dom), cancelAnimationFrame: dom.cancelAnimationFrame.bind(dom),
    IS_REACT_ACT_ENVIRONMENT: true, __APP_VERSION__: "test", __APP_CHANGELOG__: "",
})) {
    originals.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
}
const { act } = await import("react");
const { createRoot } = await import("react-dom/client");
const { I18nextProvider } = await import("react-i18next");
const { StoryboardAssetPickerModal } = await import("../src/components/canvas/storyboard-asset-picker-modal");
const { StoryboardAssetsCell } = await import("../src/components/canvas/storyboard-assets-cell");
let root: ReturnType<typeof createRoot> | undefined;
let host: HTMLDivElement | undefined;
afterEach(async () => { if (root) await act(async () => root!.unmount()); host?.remove(); root = undefined; });
afterAll(() => {
    dom.happyDOM.abort();
    for (const [key, descriptor] of originals) {
        if (descriptor) Object.defineProperty(globalThis, key, descriptor);
        else Reflect.deleteProperty(globalThis, key);
    }
});
const nodes: CanvasNodeData[] = [
    { id: "actor", type: CanvasNodeType.Image, title: "Actor", position: { x: 0, y: 0 }, width: 320, height: 180, metadata: { assetCategory: "character", content: "data:image/png;base64," } },
    { id: "rain", type: CanvasNodeType.Audio, title: "Rain", position: { x: 0, y: 0 }, width: 320, height: 180, metadata: { content: "data:audio/wav;base64," } },
];

for (const { code } of SUPPORTED_LOCALES) {
    test(`${code}: the real asset picker preserves bindings through selection, removal, cancel and save`, async () => {
        const legacy = await loadInterfaceLocale(code);
        await loadNativeLocale(code, legacy);
        const i18n = createInstance();
        await i18n.init({ lng: code, fallbackLng: false, initAsync: false, interpolation: { escapeValue: false }, resources: { [code]: { translation: getLoadedNativeLocale(code)! } } });
        const t = (key: string, values = {}) => i18n.t(`storyboardAssets.${key}`, values);
        host = document.createElement("div"); document.body.append(host); root = createRoot(host);
        let saved: StoryboardAssetBinding[] | undefined;
        let closed = 0;
        const bindings: StoryboardAssetBinding[] = [{ nodeId: "actor", role: "prop", priority: 97 }];
        await act(async () => root!.render(<I18nextProvider i18n={i18n}><StoryboardAssetPickerModal nodes={nodes} bindings={bindings} shotNumber={7} onClose={() => closed++} onSave={next => { saved = next; }} onImport={async () => []} /></I18nextProvider>));
        const button = (label: string) => [...document.querySelectorAll<HTMLButtonElement>("button")].find(item => item.getAttribute("aria-label") === label || item.textContent?.replace(/\s+/g, "") === label.replace(/\s+/g, ""))!;
        expect(document.body.textContent).toContain(t("title", { number: 7 }));
        expect(document.body.textContent).not.toContain("storyboardAssets.");
        if (!["zh-CN", "zh-HK", "zh-TW", "ja-JP"].includes(code)) expect(document.body.textContent).not.toMatch(/[\u3400-\u9fff]/);
        expect(button(t("selectItem", { name: "Actor" })).getAttribute("aria-pressed")).toBe("true");
        await act(async () => button(t("selectItem", { name: "Rain" })).click());
        expect(button(t("selectItem", { name: "Rain" })).getAttribute("aria-pressed")).toBe("true");
        await act(async () => button(t("remove", { name: "Rain" })).click());
        expect(button(t("selectItem", { name: "Rain" })).getAttribute("aria-pressed")).toBe("false");
        await act(async () => button(t("cancel")).click());
        expect(closed).toBe(1); expect(saved).toBeUndefined();
        await act(async () => button(t("save")).click());
        expect(saved).toEqual(bindings);
        expect(bindings).toEqual([{ nodeId: "actor", role: "prop", priority: 97 }]);
        await act(async () => button(t("clear")).click());
        await act(async () => button(t("save")).click());
        expect(saved).toEqual([]);
        let edited = 0;
        await act(async () => root!.render(<I18nextProvider i18n={i18n}><StoryboardAssetsCell nodes={nodes} bindings={[]} onEdit={() => edited++} /></I18nextProvider>));
        await act(async () => button(t("choose")).click());
        expect(edited).toBe(1);
    });
}
