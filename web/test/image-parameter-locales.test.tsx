import { afterAll, afterEach, expect, test } from "bun:test";
import { Window } from "happy-dom";

const dom = new Window({ url: "https://image-parameters.test/" });
const originals = new Map<string, PropertyDescriptor | undefined>();
for (const [key, value] of Object.entries({ window: dom, document: dom.document, navigator: dom.navigator, HTMLElement: dom.HTMLElement, HTMLInputElement: dom.HTMLInputElement, Element: dom.Element, SVGElement: dom.SVGElement, Node: dom.Node, ShadowRoot: dom.ShadowRoot, MutationObserver: dom.MutationObserver, ResizeObserver: dom.ResizeObserver, getComputedStyle: dom.getComputedStyle.bind(dom), IS_REACT_ACT_ENVIRONMENT: true })) {
    originals.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
}
const { act, useState } = await import("react");
const { createRoot } = await import("react-dom/client");
const { ImageParameterFields } = await import("../src/components/image-parameter-fields");
const { ImageSettingsPanel } = await import("../src/components/image-settings-panel");
const { imageParameterRequest, projectImageParameters } = await import("../src/lib/image-parameters");
const { defaultImageCapabilityConfig } = await import("../src/lib/model-capabilities");
const { canvasThemes } = await import("../src/lib/canvas-theme");
const { defaultConfig } = await import("../src/stores/use-config-store");
const { interfaceLocales, interfaceTranslator, loadInterfaceLocale } = await import("../src/lib/interface-locale");
const { useInterfaceLocaleStore } = await import("../src/stores/use-interface-locale-store");
const profile = projectImageParameters(defaultImageCapabilityConfig(), [
    { name: "size", label: "画幅 / 尺寸", type: "string", encoding: "ratio", values: ["auto", "1:1", "16:9"], default: "1:1", required: true },
    { name: "quality", label: "图片质量", type: "string", values: ["auto", "low", "medium", "high", "xhigh", "max"], default: "auto", required: true },
    { name: "count", label: "生成数量", type: "integer", min: 1, max: 8, default: 1 },
    { name: "transparentBackground", label: "透明背景", type: "boolean", default: false },
    { name: "seed", label: "随机种子", type: "integer", min: 0 },
    { name: "tile", label: "无缝平铺", type: "boolean", values: [true, false] },
    { name: "custom", label: "用户原始标签 {count}", type: "string", values: ["high", "auto"], description: "用户原始说明", default: "high" },
]);
let root: ReturnType<typeof createRoot> | undefined;
let host: HTMLDivElement | undefined;
function Editor() {
    const [config, setConfig] = useState({ ...defaultConfig, quality: "auto", size: "1:1", count: "1", imageParameters: '{"custom":"high"}' });
    return <>
        <ImageParameterFields profile={profile} config={config} onChange={(key, value) => setConfig(previous => ({ ...previous, [key]: value }))} />
        <output data-testid="request">{JSON.stringify(imageParameterRequest(profile, config, true))}</output>
    </>;
}
async function mount(content: React.ReactNode) {
    host = document.createElement("div"); document.body.append(host); root = createRoot(host);
    await act(async () => root!.render(content));
}
afterEach(async () => { await act(async () => root?.unmount()); root = undefined; host?.remove(); });
afterAll(async () => {
    await dom.happyDOM.abort();
    for (const [key, descriptor] of originals) {
        if (descriptor) Object.defineProperty(globalThis, key, descriptor);
        else Reflect.deleteProperty(globalThis, key);
    }
});

for (const locale of interfaceLocales) {
    test(`${locale}: real parameter fields translate controls and submit original typed values`, async () => {
        await loadInterfaceLocale(locale);
        await useInterfaceLocaleStore.getState().setLocale(locale);
        const t = interfaceTranslator(locale);
        await mount(<Editor />);
        expect(host!.textContent).toContain(t("imageParameters.size"));
        expect(host!.textContent).toContain(t("createUiImageQuality"));
        expect(host!.textContent).toContain(t("imageSettingsUiGenerationCount"));
        expect(host!.textContent).toContain("用户原始标签 {count}");
        expect(host!.textContent).toContain("用户原始说明");
        expect(host!.textContent).not.toMatch(/imageParameters\.|imageSettingsUi|workbenchUi/);
        if (["en-US", "ko-KR", "es-ES", "pt-BR", "fr-FR", "de-DE"].includes(locale)) {
            expect(host!.textContent!.replace("用户原始标签 {count}", "").replace("用户原始说明", "")).not.toMatch(/[\u4e00-\u9fff]/);
        }
        const group = (label: string) => [...host!.querySelectorAll<HTMLElement>('[role="group"]')].find(element => element.getAttribute("aria-label") === label)!;
        const option = (label: string, text: string) => [...group(label).querySelectorAll<HTMLButtonElement>("button")].find(button => button.textContent === text)!;
        await act(async () => option(t("imageParameters.size"), "16:9").click());
        await act(async () => option(t("createUiImageQuality"), t("imageSettingsUiQualityHigh")).click());
        await act(async () => [...host!.querySelectorAll<HTMLButtonElement>("button")].find(button => button.textContent === "3")!.click());
        await act(async () => host!.querySelector<HTMLButtonElement>('[role="switch"]')!.click());
        await act(async () => option(t("imageParameters.tile"), t("imageParameters.disabled")).click());
        const request = () => JSON.parse(host!.querySelector("output")!.textContent!);
        expect(request()).toMatchObject({ size: "16:9", quality: "high", count: 3, transparentBackground: true, tile: false, custom: "high" });
        const reset = group(t("imageParameters.tile")).parentElement!.querySelector<HTMLButtonElement>(".image-size-auto")!;
        await act(async () => reset.click());
        expect(request()).not.toHaveProperty("tile");
        const countField = host!.querySelector<HTMLInputElement>(`input[aria-label="${t("imageSettingsUiCustomCount")}"]`)!;
        expect(countField).not.toBeNull();
        expect(host!.querySelector<HTMLInputElement>(`input[aria-label="${t("imageParameters.seed")}"]`)!.placeholder).toBe(t("imageParameters.modelDefault"));
    });
}

test("language changes preserve the same parameter editor, selected protocol values and custom metadata", async () => {
    await useInterfaceLocaleStore.getState().setLocale("en-US");
    await mount(<Editor />);
    const input = host!.querySelector<HTMLInputElement>('input[aria-label="Custom image count"]');
    const before = host!.querySelector("output")!.textContent;
    for (const locale of interfaceLocales) {
        await act(async () => { await useInterfaceLocaleStore.getState().setLocale(locale); });
        expect(host!.querySelector("output")!.textContent).toBe(before);
        expect(host!.querySelector(`input[aria-label="${interfaceTranslator(locale)("imageSettingsUiCustomCount")}"]`)).toBe(input);
        expect(host!.textContent).toContain("用户原始标签 {count}");
    }
});

test("legacy image settings expose localized titles, count and transparent controls", async () => {
    for (const locale of ["fr-FR", "de-DE"] as const) {
        await act(async () => { await useInterfaceLocaleStore.getState().setLocale(locale); });
        await mount(<ImageSettingsPanel config={defaultConfig} theme={canvasThemes.light} showSize={false} onConfigChange={() => {}} />);
        expect(host!.textContent).toContain(interfaceTranslator(locale)("imageSettingsUiTitle"));
        expect(host!.textContent).not.toMatch(/[\u4e00-\u9fff]/);
        await act(async () => root!.unmount()); root = undefined; host!.remove();
    }
});
