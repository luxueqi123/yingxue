import { afterAll, afterEach, expect, spyOn, test } from "bun:test";
import { Window } from "happy-dom";
import { act, useEffect, useState } from "react";

const dom = new Window({ url: "https://canvas.test/" });
const originals = new Map<string, PropertyDescriptor | undefined>();
for (const [key, value] of Object.entries({
    window: dom, document: dom.document, navigator: dom.navigator,
    HTMLElement: dom.HTMLElement, HTMLTextAreaElement: dom.HTMLTextAreaElement,
    Element: dom.Element, Node: dom.Node, Event: dom.Event, MouseEvent: dom.MouseEvent,
    getComputedStyle: dom.getComputedStyle.bind(dom), IS_REACT_ACT_ENVIRONMENT: true,
})) {
    originals.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
}
const { createRoot } = await import("react-dom/client");
const { I18nextProvider, useTranslation } = await import("react-i18next");
const { i18n, switchLocale } = await import("../src/i18n");
const { LanguageOptionGrid } = await import("../src/components/layout/language-menu");
const { useInterfaceLocaleStore, useInterfaceTranslation } = await import("../src/stores/use-interface-locale-store");
const { interfaceLocales, interfaceTranslator, loadInterfaceLocale } = await import("../src/lib/interface-locale");
await Promise.resolve();
await useInterfaceLocaleStore.getState().setLocale("en-US");
let mounts = 0;
function DraftEditor() {
    const { t } = useInterfaceTranslation();
    const native = useTranslation();
    const [prompt, setPrompt] = useState("");
    const [attachment] = useState(() => new File(["original"], "原始参考.png", { type: "image/png" }));
    useEffect(() => { mounts++; }, []);
    return <>
        <output data-testid="legacy-label">{t("composerSend")}</output>
        <output data-testid="native-label">{native.t("language.selectLabel")}</output>
        <textarea aria-label="draft" value={prompt} onChange={event => setPrompt(event.target.value)} />
        <output data-testid="attachment">{attachment.name}</output>
        <LanguageOptionGrid />
    </>;
}
let root: ReturnType<typeof createRoot> | undefined;
let host: HTMLDivElement;
const reload = spyOn(dom.location, "reload").mockImplementation(() => {});
const originalSetter = useInterfaceLocaleStore.getState().setLocale;
async function renderEditor() {
    mounts = 0;
    host = document.createElement("div"); document.body.append(host);
    root = createRoot(host);
    await act(async () => root!.render(<I18nextProvider i18n={i18n}><DraftEditor /></I18nextProvider>));
    const field = host.querySelector("textarea")!;
    await act(async () => {
        Object.getOwnPropertyDescriptor(dom.HTMLTextAreaElement.prototype, "value")!.set!.call(field, "用户原始提示词 {count}");
        field.dispatchEvent(new dom.Event("input", { bubbles: true }));
    });
    return field;
}
afterEach(async () => {
    if (root) await act(async () => root!.unmount());
    root = undefined; host?.remove(); reload.mockClear();
    useInterfaceLocaleStore.setState({ setLocale: originalSetter });
    await useInterfaceLocaleStore.getState().setLocale("en-US");
});
afterAll(() => {
    reload.mockRestore(); dom.happyDOM.abort();
    for (const [key, descriptor] of originals) {
        if (descriptor) Object.defineProperty(globalThis, key, descriptor);
        else Reflect.deleteProperty(globalThis, key);
    }
});

test("the real language picker updates both translators in ten languages without reloading or losing a draft", async () => {
    const field = await renderEditor();
    expect(field.value).toBe("用户原始提示词 {count}");
    for (const locale of interfaceLocales) {
        await loadInterfaceLocale(locale);
        const button = host.querySelector<HTMLButtonElement>(`button[lang="${locale}"]`)!;
        await act(async () => { button.click(); await Promise.resolve(); });
        expect(useInterfaceLocaleStore.getState().locale).toBe(locale);
        expect(host.querySelector('[data-testid="legacy-label"]')!.textContent).toBe(interfaceTranslator(locale)("composerSend"));
        expect(host.querySelector('[data-testid="native-label"]')!.textContent).toBe(i18n.t("language.selectLabel"));
        expect(i18n.language).toBe(locale);
        expect(host.querySelector("textarea")).toBe(field);
        expect(field.value).toBe("用户原始提示词 {count}");
        expect(host.querySelector('[data-testid="attachment"]')!.textContent).toBe("原始参考.png");
        expect(mounts).toBe(1);
    }
    expect(reload).not.toHaveBeenCalled();
});

test("a failed language selection preserves the current editor and language", async () => {
    const field = await renderEditor();
    useInterfaceLocaleStore.setState({ setLocale: async () => false });
    await act(async () => { await switchLocale("fr-FR"); });
    expect(useInterfaceLocaleStore.getState().locale).toBe("en-US");
    expect(i18n.language).toBe("en-US");
    expect(field.value).toBe("用户原始提示词 {count}");
    expect(host.querySelector("textarea")).toBe(field);
    expect(mounts).toBe(1);
    expect(reload).not.toHaveBeenCalled();
});
