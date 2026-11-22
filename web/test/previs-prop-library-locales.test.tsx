import { afterAll, afterEach, expect, test } from "bun:test";
import { Window } from "happy-dom";
import { createInstance } from "i18next";
import { I18nextProvider } from "react-i18next";
import { interfaceLocales, loadInterfaceLocale } from "../src/lib/interface-locale";
import { getLoadedNativeLocale } from "../src/i18n/locale-catalogs";
import { PREVIS_PROP_LIBRARY, type PrevisPropItem } from "../src/lib/canvas/previs/previs-prop-library";

const dom = new Window({ url: "https://prop-library.test/" });
const originals = new Map<string, PropertyDescriptor | undefined>();
for (const [key, value] of Object.entries({ window: dom, document: dom.document, navigator: dom.navigator, HTMLElement: dom.HTMLElement, Element: dom.Element, Node: dom.Node, MutationObserver: dom.MutationObserver, IS_REACT_ACT_ENVIRONMENT: true })) {
    originals.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
}
const { act } = await import("react");
const { createRoot } = await import("react-dom/client");
const { PrevisPropLibraryPanel } = await import("../src/components/canvas/previs/previs-prop-library-panel");
let root: ReturnType<typeof createRoot> | undefined;
let host: HTMLDivElement | undefined;
afterEach(async () => { await act(async () => root?.unmount()); root = undefined; host?.remove(); });
afterAll(async () => {
    for (const [key, descriptor] of originals) {
        if (descriptor) Object.defineProperty(globalThis, key, descriptor);
        else Reflect.deleteProperty(globalThis, key);
    }
    await dom.happyDOM.close();
});
const firstProp = { "zh-CN": "单人沙发", "zh-HK": "單人梳化", "zh-TW": "單人沙發", "en-US": "Armchair", "ja-JP": "一人掛けソファ", "ko-KR": "1인용 소파", "es-ES": "Sillón", "pt-BR": "Poltrona", "fr-FR": "Fauteuil", "de-DE": "Sessel" };
const source = JSON.stringify(PREVIS_PROP_LIBRARY);

for (const locale of interfaceLocales) {
    test(`${locale}: real prop catalog translates every card and preserves selection, collapse and upload`, async () => {
        await loadInterfaceLocale(locale);
        const i18n = createInstance();
        await i18n.init({ lng: locale, initAsync: false, fallbackLng: false, resources: { [locale]: { translation: getLoadedNativeLocale(locale) } } });
        host = document.createElement("div"); document.body.append(host); root = createRoot(host);
        const selected: PrevisPropItem[] = []; let uploads = 0;
        await act(async () => root!.render(<I18nextProvider i18n={i18n}><PrevisPropLibraryPanel onAdd={prop => selected.push(prop)} onUpload={() => { uploads += 1; }} /></I18nextProvider>));
        expect(host.querySelectorAll(".pv-prop-cat__label")).toHaveLength(4);
        const cards = host.querySelectorAll<HTMLButtonElement>(".pv-prop-card");
        expect(cards).toHaveLength(19);
        expect(cards[0].querySelector(".pv-prop-card__name")!.textContent).toBe(firstProp[locale]);
        expect(cards[0].title).toContain(firstProp[locale]);
        expect(cards[0].title).toContain("0.9×0.85×0.85m");
        expect(host.textContent).not.toContain("previsPropLabels.");
        if (["en-US", "ko-KR", "es-ES", "pt-BR", "fr-FR", "de-DE"].includes(locale)) expect(host.textContent).not.toMatch(/[\u4e00-\u9fff]/);
        await act(async () => cards[0].click());
        expect(selected).toHaveLength(1);
        expect(selected[0]).toBe(PREVIS_PROP_LIBRARY[0].items[0]);
        const category = host.querySelector<HTMLButtonElement>(".pv-prop-cat__label")!;
        await act(async () => category.click());
        expect(category.getAttribute("aria-expanded")).toBe("false");
        expect(host.querySelectorAll(".pv-prop-card")).toHaveLength(13);
        await act(async () => category.click());
        expect(host.querySelectorAll(".pv-prop-card")).toHaveLength(19);
        await act(async () => host!.querySelector<HTMLButtonElement>(".pv-prop-upload-full")!.click());
        expect(uploads).toBe(1);
        expect(JSON.stringify(PREVIS_PROP_LIBRARY)).toBe(source);
    });
}
