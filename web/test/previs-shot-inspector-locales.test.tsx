import { afterAll, afterEach, expect, test } from "bun:test";
import { Window } from "happy-dom";
import { createInstance } from "i18next";
import { I18nextProvider } from "react-i18next";
import type { ComponentProps } from "react";
import { interfaceLocales, loadInterfaceLocale } from "../src/lib/interface-locale";
import { getLoadedNativeLocale } from "../src/i18n/locale-catalogs";
import { createPrevisScene } from "../src/lib/canvas/previs/previs-scene";
import { previsModeCapabilities } from "../src/lib/canvas/previs/previs-modes";
import { previsHorizontalFov } from "../src/lib/canvas/previs/previs-optics";

const dom = new Window({ url: "https://shot-inspector.test/" });
const originals = new Map<string, PropertyDescriptor | undefined>();
for (const [key, value] of Object.entries({ window: dom, document: dom.document, navigator: dom.navigator, HTMLElement: dom.HTMLElement, Element: dom.Element, SVGElement: dom.SVGElement, Node: dom.Node, ShadowRoot: dom.ShadowRoot, MutationObserver: dom.MutationObserver, ResizeObserver: dom.ResizeObserver, getComputedStyle: dom.getComputedStyle.bind(dom), IS_REACT_ACT_ENVIRONMENT: true })) {
    originals.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
}
const { act } = await import("react");
const { createRoot } = await import("react-dom/client");
const { ShotInspector } = await import("../src/components/canvas/previs/previs-inspectors");
type Props = ComponentProps<typeof ShotInspector>;
let root: ReturnType<typeof createRoot> | undefined;
let host: HTMLDivElement | undefined;
afterEach(async () => { await act(async () => root?.unmount()); root = undefined; host?.remove(); });
afterAll(async () => {
    await dom.happyDOM.abort();
    for (const [key, descriptor] of originals) {
        if (descriptor) Object.defineProperty(globalThis, key, descriptor);
        else Reflect.deleteProperty(globalThis, key);
    }
});
const frameNames = { "zh-CN": "画面", "zh-HK": "畫面", "zh-TW": "畫面", "en-US": "Frame", "ja-JP": "画面", "ko-KR": "화면", "es-ES": "Encuadre", "pt-BR": "Enquadramento", "fr-FR": "Cadrage", "de-DE": "Bildausschnitt" };

for (const locale of interfaceLocales) {
    test(`${locale}: real shot inspector localizes controls and keeps camera actions and source values`, async () => {
        await loadInterfaceLocale(locale);
        const i18n = createInstance();
        await i18n.init({ lng: locale, initAsync: false, fallbackLng: false, resources: { [locale]: { translation: getLoadedNativeLocale(locale) } } });
        const scene = createPrevisScene("Source scene");
        const cameras = scene.cameras.map(camera => ({ ...camera, name: "Source camera" }));
        const cameraUpdates: Parameters<Props["onUpdateCamera"]>[0][] = [];
        let aligned = 0; let paths = 0; let movements = 0; let keyframes = 0;
        const props: Props = {
            shot: { ...scene.shots[0], name: "用户原始镜头", prompt: "原始提示词，不随界面语言修改", cameraMove: "static" },
            camera: cameras[0], cameras, capabilities: previsModeCapabilities("animate"), pathDrawing: false,
            onUpdateShot: () => {}, onUpdateCamera: patch => cameraUpdates.push(patch),
            onAddCameraKeyframe: () => { keyframes += 1; }, onApplyCameraMove: () => { movements += 1; },
            onAlignCameraToView: () => { aligned += 1; }, onToggleDrawPath: () => { paths += 1; },
        };
        host = document.createElement("div"); document.body.append(host); root = createRoot(host);
        const render = () => act(async () => root!.render(<I18nextProvider i18n={i18n}><ShotInspector {...props} /></I18nextProvider>));
        const button = (name: string) => [...host!.querySelectorAll<HTMLButtonElement>("button")].find(entry => entry.textContent?.trim() === name)!;
        await render();
        expect(host.querySelector("section")!.getAttribute("aria-label")).toBe(frameNames[locale]);
        expect(host.querySelector<HTMLInputElement>("input")!.value).toBe("用户原始镜头");
        expect(host.querySelector<HTMLTextAreaElement>("textarea")!.value).toBe("原始提示词，不随界面语言修改");
        expect(host.textContent).not.toContain("previsShot.");
        if (["en-US", "ko-KR", "es-ES", "pt-BR", "fr-FR", "de-DE"].includes(locale)) {
            const controls = host.cloneNode(true) as HTMLDivElement;
            controls.querySelectorAll("input, textarea").forEach(field => field.remove());
            expect(controls.textContent).not.toMatch(/[\u4e00-\u9fff]/);
        }
        const generate = () => button(i18n.t("previsShot.generateMovement"));
        expect(generate().disabled).toBe(true);
        props.shot = { ...props.shot, cameraMove: "push_in" }; await render();
        expect(generate().disabled).toBe(false);
        await act(async () => { button("85").click(); button(i18n.t("previsShot.alignCamera")).click(); generate().click(); button(i18n.t("previsShot.drawCameraPath")).click(); });
        expect(cameraUpdates).toEqual([{ focalLength: 85, fov: previsHorizontalFov(85) }]);
        expect(aligned).toBe(1); expect(paths).toBe(1); expect(movements).toBe(1);
        const advanced = [...host.querySelectorAll("details")].find(entry => entry.querySelector("summary")?.textContent === i18n.t("previsShot.manualKeyframes"))!;
        await act(async () => advanced.querySelector("summary")!.click());
        await act(async () => button(i18n.t("previsShot.recordKeyframe")).click());
        expect(keyframes).toBe(1);
        expect(props.shot.prompt).toBe("原始提示词，不随界面语言修改");
    });
}
