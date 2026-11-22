import { afterAll, afterEach, expect, test } from "bun:test";
import { Window } from "happy-dom";
import { createInstance } from "i18next";
import { I18nextProvider } from "react-i18next";
import { interfaceLocales, loadInterfaceLocale } from "../src/lib/interface-locale";
import { getLoadedNativeLocale } from "../src/i18n/locale-catalogs";
import { PREVIS_ONBOARDING_STEPS, PREVIS_ONBOARDING_VERSION } from "../src/lib/canvas/previs/previs-onboarding";

const dom = new Window({ url: "https://onboarding.test/" });
const originals = new Map<string, PropertyDescriptor | undefined>();
for (const [key, value] of Object.entries({
    window: dom, document: dom.document, navigator: dom.navigator,
    HTMLElement: dom.HTMLElement, Element: dom.Element, Node: dom.Node,
    MutationObserver: dom.MutationObserver, IS_REACT_ACT_ENVIRONMENT: true,
})) {
    originals.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
}
const { act } = await import("react");
const { createRoot } = await import("react-dom/client");
const { CanvasPrevisOnboarding } = await import("../src/components/canvas/previs/canvas-previs-onboarding");
let root: ReturnType<typeof createRoot> | undefined;
let host: HTMLDivElement | undefined;

afterEach(async () => {
    await act(async () => root?.unmount());
    root = undefined;
    host?.remove();
});
afterAll(async () => {
    for (const [key, descriptor] of originals) {
        if (descriptor) Object.defineProperty(globalThis, key, descriptor);
        else Reflect.deleteProperty(globalThis, key);
    }
    await dom.happyDOM.close();
});

const firstTitle = {
    "zh-CN": "添加演员", "zh-HK": "新增演員", "zh-TW": "新增演員",
    "en-US": "Add an actor", "ja-JP": "俳優を追加", "ko-KR": "배우 추가",
    "es-ES": "Añadir un actor", "pt-BR": "Adicionar um ator",
    "fr-FR": "Ajouter un acteur", "de-DE": "Darsteller hinzufügen",
};

for (const locale of interfaceLocales) {
    test(`${locale}: actual guide translates all six steps and preserves skip/restart/completion`, async () => {
        await loadInterfaceLocale(locale);
        const i18n = createInstance();
        await i18n.init({ lng: locale, initAsync: false, fallbackLng: false, resources: { [locale]: { translation: getLoadedNativeLocale(locale) } } });
        const data = new Map<string, string>();
        const storage = { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => { data.set(key, value); } };
        host = document.createElement("div"); document.body.append(host);
        const sentinel = document.createElement("input"); host.append(sentinel); sentinel.focus();
        const mount = document.createElement("div"); host.append(mount); root = createRoot(mount);
        const render = async (restartSignal: number) => act(async () => root!.render(
            <I18nextProvider i18n={i18n}><CanvasPrevisOnboarding scope={`guide-${locale}`} storage={storage} restartSignal={restartSignal} /></I18nextProvider>,
        ));
        const progress = () => JSON.parse([...data.values()][0]);
        await render(0);
        expect(mount.querySelector("header p")!.textContent).toBe(firstTitle[locale]);
        expect(document.activeElement).toBe(sentinel);
        expect(mount.querySelector('[role="dialog"]')).toBeNull();
        await act(async () => mount.querySelectorAll<HTMLButtonElement>("button")[0].click());
        expect(mount.querySelector("section")).toBeNull();
        expect(progress().status).toBe("dismissed");
        await render(1);
        expect(mount.querySelector("header p")!.textContent).toBe(firstTitle[locale]);
        expect(progress().status).toBe("active");

        const titles = new Set<string>();
        for (let index = 0; index < 6; index++) {
            const title = mount.querySelector("header p")!.textContent!;
            titles.add(title);
            const detail = mount.querySelector('[aria-live="polite"]')!.textContent!;
            expect(title.trim()).not.toBe(""); expect(detail.trim()).not.toBe("");
            if (["en-US", "ko-KR", "es-ES", "pt-BR", "fr-FR", "de-DE"].includes(locale)) {
                expect(mount.textContent).not.toMatch(/[\u4e00-\u9fff]/);
            }
            if (locale === "zh-CN") {
                expect(title).toBe(PREVIS_ONBOARDING_STEPS[index].title);
                expect(detail).toBe(PREVIS_ONBOARDING_STEPS[index].detail);
            }
            if (index === 1) {
                await act(async () => mount.querySelectorAll<HTMLButtonElement>("button")[1].click());
                expect(progress().stepId).toBe("actor");
                await act(async () => mount.querySelectorAll<HTMLButtonElement>("button")[2].click());
                expect(progress().stepId).toBe("move");
            }
            await act(async () => mount.querySelectorAll<HTMLButtonElement>("button")[2].click());
            expect(progress().version).toBe(PREVIS_ONBOARDING_VERSION);
        }
        expect(titles.size).toBe(6);
        expect(progress()).toMatchObject({ status: "completed", stepId: "apply" });
        expect(mount.querySelector("section")).toBeNull();
        await act(async () => root!.render(null));
        await render(1);
        expect(mount.querySelector("section")).toBeNull();
        await render(2);
        expect(mount.querySelector("header p")!.textContent).toBe(firstTitle[locale]);
    });
}
