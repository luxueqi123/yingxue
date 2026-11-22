import { afterAll, afterEach, beforeEach, expect, spyOn, test } from "bun:test";
import { Window } from "happy-dom";
import { createInstance } from "i18next";
import { loadInterfaceLocale } from "../src/lib/interface-locale";
import { getLoadedNativeLocale, loadNativeLocale } from "../src/i18n/locale-catalogs";
import { SUPPORTED_LOCALES, type AppLocale } from "../src/i18n/locales";
import type { InsertAssetPayload } from "../src/components/canvas/asset-picker-modal";
import type { LocalUser } from "../src/services/api/auth";
import type { PoseLibraryCatalog, PoseLibraryUseResult } from "../src/services/api/pose-library";

const dom = new Window({ url: "https://pose-library.test/" });
const originals = new Map<string, PropertyDescriptor | undefined>();
for (const [key, value] of Object.entries({
    window: dom, document: dom.document, navigator: dom.navigator, location: dom.location,
    HTMLElement: dom.HTMLElement, SVGElement: dom.SVGElement, Element: dom.Element,
    ShadowRoot: dom.ShadowRoot, Node: dom.Node, MutationObserver: dom.MutationObserver,
    ResizeObserver: dom.ResizeObserver, IntersectionObserver: dom.IntersectionObserver,
    getComputedStyle: dom.getComputedStyle.bind(dom),
    requestAnimationFrame: dom.requestAnimationFrame.bind(dom), cancelAnimationFrame: dom.cancelAnimationFrame.bind(dom),
    IS_REACT_ACT_ENVIRONMENT: true, __APP_VERSION__: "test", __APP_CHANGELOG__: "",
})) {
    originals.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
}
const { act } = await import("react");
const { createRoot } = await import("react-dom/client");
const { I18nextProvider } = await import("react-i18next");
const { QueryClient, QueryClientProvider } = await import("@tanstack/react-query");
const { App } = await import("antd");
const { http } = await import("../src/services/api/request");
const { useUserStore } = await import("../src/stores/use-user-store");
const { CanvasPoseLibraryModal } = await import("../src/components/canvas/canvas-pose-library-modal");
const catalog: PoseLibraryCatalog = {
    poses: [{ key: "walk", name: "Walk", code: "P001", system: "Human", category: "Movement", sourceKey: "test", items: [
        { id: "front", angle: "正面", width: 600, height: 900, version: 7 },
        { id: "side", angle: "侧面", width: 600, height: 900, version: 7 },
    ] }], total: 1, page: 1, pageSize: 24,
    facets: { systems: [{ name: "Human", count: 1 }], categories: [{ name: "Movement", count: 1 }], angles: [{ name: "正面", count: 1 }, { name: "侧面", count: 1 }] },
};
const user: LocalUser = { id: "pose-owner", username: "pose-owner", displayName: "Owner", role: "user", status: "active", createdAt: "", updatedAt: "" };
const copies: PoseLibraryUseResult[] = catalog.poses[0].items.map(item => ({
    itemId: item.id, name: "Walk", angle: item.angle, category: "Movement",
    resource: { id: `owned-${item.id}`, userId: user.id, kind: "image", status: "ready", provider: "local", endpoint: "", bucket: "", objectKey: `poses/${item.id}.png`, publicUrl: "", mimeType: "image/png", size: 1200, width: 600, height: 900, createdAt: "", updatedAt: "" },
}));
const get = spyOn(http, "get");
const post = spyOn(http, "post");
let root: ReturnType<typeof createRoot> | undefined;
let host: HTMLDivElement;
let client: InstanceType<typeof QueryClient>;
let closed = 0;
const settle = async () => { await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); }); };
const button = (label: string) => [...document.querySelectorAll<HTMLButtonElement>("button")].find(item => item.getAttribute("aria-label") === label || item.textContent?.trim() === label)!;

beforeEach(() => {
    useUserStore.setState({ user }); closed = 0;
    get.mockReset().mockResolvedValue(catalog);
    post.mockReset().mockResolvedValue({ items: copies });
});
afterEach(async () => {
    if (root) await act(async () => root!.unmount());
    root = undefined; host?.remove(); client?.clear();
    useUserStore.setState({ user: null });
});
afterAll(() => {
    get.mockRestore(); post.mockRestore(); dom.happyDOM.abort();
    for (const [key, descriptor] of originals) {
        if (descriptor) Object.defineProperty(globalThis, key, descriptor);
        else Reflect.deleteProperty(globalThis, key);
    }
});
async function render(locale: AppLocale, onInsert: (payloads: InsertAssetPayload[]) => Promise<unknown>) {
    await loadNativeLocale(locale, await loadInterfaceLocale(locale));
    const i18n = createInstance();
    await i18n.init({ lng: locale, fallbackLng: false, initAsync: false, interpolation: { escapeValue: false }, resources: { [locale]: { translation: getLoadedNativeLocale(locale)! } } });
    host = document.createElement("div"); document.body.append(host); root = createRoot(host);
    client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
    await act(async () => root!.render(<I18nextProvider i18n={i18n}><QueryClientProvider client={client}><App><CanvasPoseLibraryModal open onClose={() => closed++} onInsert={onInsert} /></App></QueryClientProvider></I18nextProvider>));
    for (let index = 0; index < 20 && !document.querySelector(".pose-card-hit"); index++) await settle();
    return (key: string, values = {}) => i18n.t(`poseLibrary.${key}`, values);
}

for (const { code } of SUPPORTED_LOCALES) {
    test(`${code}: real pose controls filter by original angle, preview, select and insert owned resources`, async () => {
        let inserted: InsertAssetPayload[] | undefined;
        const t = await render(code, async payloads => { inserted = payloads; });
        expect(document.body.textContent).toContain(t("title"));
        expect(document.body.textContent).not.toContain("poseLibrary.");
        if (!["zh-CN", "zh-HK", "zh-TW", "ja-JP"].includes(code)) expect(document.body.textContent).not.toMatch(/[\u3400-\u9fff]/);
        expect(button(t("insert")).disabled).toBe(true);
        await act(async () => button(t("choosePose", { name: "Walk", angle: t("front") })).click());
        expect(document.querySelector(".pose-card-hit")?.getAttribute("aria-pressed")).toBe("true");
        await act(async () => button(t("zoomPose", { name: "Walk" })).click());
        expect(document.querySelector(".pose-preview-stage img")?.getAttribute("src")).toContain("/pose-library/items/front/");
        await act(async () => button(t("back")).click());
        const filter = document.querySelector(`[aria-label="${t("angle")}"]`)!;
        const side = [...filter.querySelectorAll<HTMLButtonElement>("button")].find(item => item.textContent === t("side"))!;
        await act(async () => side.click()); await settle();
        expect(get.mock.calls.at(-1)?.[1]?.params).toMatchObject({ angle: "侧面" });
        await act(async () => button(t("choosePose", { name: "Walk", angle: t("side") })).click());
        await act(async () => button(t("insert")).click());
        expect(post).toHaveBeenCalledWith("/pose-library/use", { ids: ["front", "side"] });
        expect(inserted?.map(item => item.storageKey)).toEqual(["resource:owned-front", "resource:owned-side"]);
        expect(inserted?.map(item => [item.width, item.height, item.bytes, item.mimeType])).toEqual([[600, 900, 1200, "image/png"], [600, 900, 1200, "image/png"]]);
        expect(inserted?.[0].title).toBe(t("referenceName", { name: "Walk", angle: t("front") }));
        expect(closed).toBe(1);
    });
}

test("copy in flight is submitted once and cannot insert the previous account's resource after switching", async () => {
    let finish!: (value: { items: PoseLibraryUseResult[] }) => void;
    post.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    let inserts = 0;
    const t = await render("en-US", async () => { inserts++; });
    await act(async () => button(t("choosePose", { name: "Walk", angle: t("front") })).click());
    const insert = button(t("insert"));
    await act(async () => { insert.click(); insert.click(); });
    expect(post).toHaveBeenCalledTimes(1);
    await act(async () => useUserStore.setState({ user: { ...user, id: "another-owner" } }));
    await act(async () => finish({ items: copies }));
    expect(inserts).toBe(0); expect(closed).toBe(0);
    expect(button(t("insert")).disabled).toBe(true);
    expect(document.body.textContent).toContain(t("accountChanged"));
});

test("copy failure preserves the selection for retry without pretending insertion succeeded", async () => {
    post.mockRejectedValueOnce(new Error("Copy failed"));
    let inserts = 0;
    const t = await render("en-US", async () => { inserts++; });
    await act(async () => button(t("choosePose", { name: "Walk", angle: t("front") })).click());
    await act(async () => button(t("insert")).click());
    expect(inserts).toBe(0); expect(closed).toBe(0);
    expect(document.body.textContent).toContain("Copy failed");
    expect(button(t("insert")).disabled).toBe(false);
    await act(async () => button(t("insert")).click());
    expect(inserts).toBe(1); expect(closed).toBe(1);
});
