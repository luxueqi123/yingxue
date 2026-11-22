import { afterAll, afterEach, expect, test } from "bun:test";
import { Window } from "happy-dom";
import { createInstance } from "i18next";
import { loadInterfaceLocale } from "../src/lib/interface-locale";
import { getLoadedNativeLocale, loadNativeLocale } from "../src/i18n/locale-catalogs";
import { SUPPORTED_LOCALES } from "../src/i18n/locales";
import { CANVAS_APPEARANCE_PRESETS, canvasAppearanceBaseTheme, canvasAppearanceForPreset, normalizeCanvasAppearance, type CanvasAppearance } from "../src/lib/canvas/canvas-appearance";
import { canvasThemes } from "../src/lib/canvas-theme";

const dom = new Window({ url: "https://canvas-appearance.test/" });
const originals = new Map<string, PropertyDescriptor | undefined>();
for (const [key, value] of Object.entries({
    window: dom, document: dom.document, navigator: dom.navigator,
    HTMLElement: dom.HTMLElement, SVGElement: dom.SVGElement, Element: dom.Element,
    ShadowRoot: dom.ShadowRoot, Node: dom.Node,
    getComputedStyle: dom.getComputedStyle.bind(dom),
    requestAnimationFrame: dom.requestAnimationFrame.bind(dom), cancelAnimationFrame: dom.cancelAnimationFrame.bind(dom),
    IS_REACT_ACT_ENVIRONMENT: true,
})) {
    originals.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
}
const { act } = await import("react");
const { createRoot } = await import("react-dom/client");
const { I18nextProvider } = await import("react-i18next");
const { CanvasAppearanceControls } = await import("../src/components/canvas/canvas-appearance-controls");
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

for (const { code } of SUPPORTED_LOCALES) {
    test(`${code}: actual appearance controls translate every preset and preserve its saved colors and grid`, async () => {
        const legacy = await loadInterfaceLocale(code);
        await loadNativeLocale(code, legacy);
        const i18n = createInstance();
        await i18n.init({ lng: code, fallbackLng: false, initAsync: false, interpolation: { escapeValue: false }, resources: { [code]: { translation: getLoadedNativeLocale(code)! } } });
        const key = (id: string) => `canvasControls.preset${id[0].toUpperCase()}${id.slice(1)}`;
        const names = CANVAS_APPEARANCE_PRESETS.map(preset => i18n.t(key(preset.id)));
        expect(new Set(names).size).toBe(6);
        for (const name of names) expect(name).not.toContain("canvasControls.");
        if (!["zh-CN", "zh-HK", "zh-TW", "ja-JP"].includes(code)) for (const name of names) expect(name).not.toMatch(/[\u3400-\u9fff]/);
        host = document.createElement("div"); document.body.append(host); root = createRoot(host);
        let appearance: CanvasAppearance = canvasAppearanceForPreset("pink");
        let gridWrites = 0;
        const render = () => {
            const tone = canvasAppearanceBaseTheme(appearance, "light");
            root!.render(<I18nextProvider i18n={i18n}><CanvasAppearanceControls appearance={appearance} backgroundMode="lines" colorTheme={tone} theme={canvasThemes[tone]} onAppearanceChange={next => { appearance = next; render(); }} onSaveAppearanceDefault={() => {}} onBackgroundModeChange={() => gridWrites++} /></I18nextProvider>);
        };
        await act(async () => render());
        const button = (label: string) => [...host!.querySelectorAll<HTMLButtonElement>("button")].find(item => item.getAttribute("aria-label") === label)!;
        await act(async () => button(i18n.t("canvasA.appearance.customColors")).click());
        for (const id of ["light", "pink", "sand", "mint"]) {
            const name = i18n.t(key(id));
            const control = button(i18n.t("canvasA.appearance.usePreset", { label: name }));
            expect(control?.textContent).toContain(name);
        }
        await act(async () => button(i18n.t("canvasA.appearance.switchTo", { label: i18n.t("canvasA.appearance.dark") })).click());
        for (const id of ["dark", "slate"]) expect(button(i18n.t("canvasA.appearance.usePreset", { label: i18n.t(key(id)) }))).toBeDefined();
        await act(async () => button(i18n.t("canvasA.appearance.usePreset", { label: i18n.t(key("slate")) })).click());
        expect(appearance.preset?.id).toBe("slate");
        appearance = normalizeCanvasAppearance(JSON.parse(JSON.stringify(appearance)), "light");
        await act(async () => render());
        expect(button(i18n.t("canvasA.appearance.usePreset", { label: i18n.t(key("slate")) })).getAttribute("aria-pressed")).toBe("true");
        expect(host.textContent).toContain(i18n.t(key("slate")));
        await act(async () => button(i18n.t("canvasA.appearance.switchTo", { label: i18n.t("canvasA.appearance.light") })).click());
        expect(appearance.preset?.id).toBe("pink");
        expect(appearance.preset?.values.backgroundColor).toBe("#F3DCE5");
        expect(gridWrites).toBe(0);
    });
}
