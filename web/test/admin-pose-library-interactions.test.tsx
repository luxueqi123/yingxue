import { afterAll, afterEach, expect, spyOn, test } from "bun:test";
import { Window } from "happy-dom";
import type { AdminPoseLibraryItem } from "../src/services/api/pose-library";

const dom = new Window({ url: "https://admin-pose.test/" });
const originals = new Map<string, PropertyDescriptor | undefined>();
for (const [key, value] of Object.entries({
    window: dom, document: dom.document, navigator: dom.navigator, location: dom.location,
    HTMLElement: dom.HTMLElement, HTMLInputElement: dom.HTMLInputElement, SVGElement: dom.SVGElement,
    HTMLAnchorElement: dom.HTMLAnchorElement, HTMLBodyElement: dom.HTMLBodyElement,
    HTMLHtmlElement: dom.HTMLHtmlElement, HTMLButtonElement: dom.HTMLButtonElement,
    XMLHttpRequest: dom.XMLHttpRequest, File: dom.File, Blob: dom.Blob, FormData: dom.FormData,
    MouseEvent: dom.MouseEvent, Event: dom.Event,
    Element: dom.Element, Node: dom.Node, ShadowRoot: dom.ShadowRoot,
    MutationObserver: dom.MutationObserver, ResizeObserver: dom.ResizeObserver,
    getComputedStyle: dom.getComputedStyle.bind(dom),
    requestAnimationFrame: dom.requestAnimationFrame.bind(dom), cancelAnimationFrame: dom.cancelAnimationFrame.bind(dom),
    IS_REACT_ACT_ENVIRONMENT: true, __APP_VERSION__: "test", __APP_CHANGELOG__: "",
})) {
    originals.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
}
const { act } = await import("react");
const { createRoot } = await import("react-dom/client");
const { App, ConfigProvider } = await import("antd");
const { http } = await import("../src/services/api/request");
const { PoseLibraryImportModal, PoseLibraryItemModal } = await import("../src/pages/admin/pose-library/pose-library-page");
const post = spyOn(http, "post");
const patch = spyOn(http, "patch");
let root: ReturnType<typeof createRoot> | undefined;
let host: HTMLDivElement;
const button = (label: string) => [...document.querySelectorAll<HTMLButtonElement>("button")].find(item => item.textContent?.replace(/\s/g, "") === label.replace(/\s/g, ""))!;
const settle = async () => { await act(async () => { await new Promise(resolve => setTimeout(resolve, 5)); }); };
const pack = (name: string) => JSON.stringify({ format: "yingce-pose-library", version: 1, source: { key: "test-pose", name, baseUrl: "https://pose.test/" }, items: [{ key: "front", name, system: name, image: "front.png" }] });
async function renderImport(open: boolean, onClose = () => {}) {
    if (!root) { host = document.createElement("div"); document.body.append(host); root = createRoot(host); }
    await act(async () => root!.render(<ConfigProvider theme={{ token: { motion: false } }}><App><PoseLibraryImportModal open={open} onClose={onClose} onImported={() => {}} /></App></ConfigProvider>));
}
async function choose(file: File) {
    const input = document.querySelector<HTMLInputElement>('input[type="file"]')!;
    Object.defineProperty(input, "files", { configurable: true, value: [file] });
    await act(async () => input.dispatchEvent(new dom.Event("change", { bubbles: true })));
}
function deferredFile(name: string) {
    let finish!: (value: string) => void;
    const file = new File([""], `${name}.json`, { type: "application/json" });
    const promise = new Promise<string>(resolve => { finish = resolve; });
    Object.defineProperty(file, "text", { value: () => promise });
    return { file, finish };
}
afterEach(async () => {
    if (root) await act(async () => root!.unmount());
    root = undefined; host?.remove(); post.mockReset(); patch.mockReset();
});
afterAll(() => {
    post.mockRestore(); patch.mockRestore(); dom.happyDOM.abort();
    for (const [key, descriptor] of originals) {
        if (descriptor) Object.defineProperty(globalThis, key, descriptor);
        else Reflect.deleteProperty(globalThis, key);
    }
});

test("choosing another pose pack discards the older file's delayed preview", async () => {
    await renderImport(true);
    const older = deferredFile("Older"), newer = deferredFile("Newer");
    await choose(older.file); await choose(newer.file);
    await act(async () => newer.finish(pack("Newer")));
    expect(document.body.textContent).toContain("Newer（1）");
    await act(async () => older.finish(pack("Older")));
    expect(document.body.textContent).toContain("Newer（1）");
    expect(document.body.textContent).not.toContain("Older（1）");
    post.mockResolvedValue({ created: 1, updated: 0, skipped: 0 });
    await act(async () => button("导入 1 条").click());
    const body = post.mock.calls[0]?.[1] as FormData;
    expect(body.get("systems")).toBe('["Newer"]');
    expect((body.get("file") as File).name).toBe("Newer.json");
});

test("cancelling a pose-pack read cannot restore a stale enabled import action", async () => {
    let closed = 0;
    await renderImport(true, () => { closed++; });
    const pending = deferredFile("Cancelled");
    await choose(pending.file);
    await act(async () => button("取消").click());
    expect(closed).toBe(1);
    await renderImport(false);
    await act(async () => pending.finish(pack("Cancelled")));
    await renderImport(true);
    expect(document.body.textContent).not.toContain("Cancelled（1）");
    expect(button("导入").disabled).toBe(true);
});

test("pose import submits once, preserves a rejected selection and retries the same file", async () => {
    let finish!: (value: unknown) => void;
    post.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    await renderImport(true);
    const source = new File([pack("Retry")], "retry.json", { type: "application/json" });
    await choose(source);
    for (let index = 0; index < 30 && !button("导入 1 条"); index++) await settle();
    await act(async () => { button("导入 1 条").click(); button("导入 1 条").click(); });
    expect(post).toHaveBeenCalledTimes(1);
    expect(button("重新选择文件").disabled).toBe(true);
    await act(async () => finish({ created: 1, updated: 0, skipped: 0 }));
    expect(button("导入").disabled).toBe(true);
    post.mockRejectedValueOnce(new Error("Import unavailable"));
    await choose(source);
    await act(async () => button("导入 1 条").click());
    expect(document.body.textContent).toContain("Import unavailable");
    expect(button("导入 1 条").disabled).toBe(false);
    post.mockResolvedValueOnce({ created: 1, updated: 0, skipped: 0 });
    await act(async () => button("导入 1 条").click());
    expect(post).toHaveBeenCalledTimes(3);
    expect((post.mock.calls[2]?.[1] as FormData).get("systems")).toBe('["Retry"]');
});

test("pose edits fence double clicks before asynchronous form validation", async () => {
    let saved = 0, finish!: (value: unknown) => void;
    patch.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    const item: AdminPoseLibraryItem = { id: "pose-id", sourceKey: "custom", externalKey: "pose-id", groupKey: "custom:pose-id", code: "P001", system: "Human", category: "Standing", name: "Stand", angle: "正面", sortOrder: 1, enabled: true, status: "ready", imageBytes: 100, width: 600, height: 900, createdAt: "", updatedAt: "", version: 1 };
    host = document.createElement("div"); document.body.append(host); root = createRoot(host);
    await act(async () => root!.render(<ConfigProvider theme={{ token: { motion: false } }}><App><PoseLibraryItemModal open={false} item={item} systems={[]} onClose={() => {}} onSaved={() => { saved++; }} /></App></ConfigProvider>));
    await act(async () => root!.render(<ConfigProvider theme={{ token: { motion: false } }}><App><PoseLibraryItemModal open item={item} systems={[]} onClose={() => {}} onSaved={() => { saved++; }} /></App></ConfigProvider>));
    for (let index = 0; index < 100 && document.querySelector<HTMLInputElement>('input[placeholder="例如：自然站立"]')?.value !== "Stand"; index++) await settle();
    expect(document.querySelector<HTMLInputElement>('input[placeholder="例如：自然站立"]')?.value).toBe("Stand");
    await act(async () => { button("保存").click(); button("保存").click(); });
    for (let index = 0; index < 30 && !patch.mock.calls.length; index++) await settle();
    expect(patch).toHaveBeenCalledTimes(1);
    await act(async () => finish({ item }));
    expect(saved).toBe(1);
});
