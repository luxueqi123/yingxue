import { afterEach, expect, mock, test } from "bun:test";
import { Window } from "happy-dom";
import type { CanvasProject } from "@/stores/canvas/use-canvas-store";
import { interfaceTranslator } from "@/lib/interface-locale";

const dom = new Window({ url: "https://canvas.example/" });
for (const [key, value] of Object.entries({ window: dom, document: dom.document, navigator: dom.navigator, HTMLElement: dom.HTMLElement, Node: dom.Node, Event: dom.Event, IS_REACT_ACT_ENVIRONMENT: true })) {
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
}
const { act } = await import("react");
const { createRoot } = await import("react-dom/client");
const successes: string[] = [];
const errors: string[] = [];
const t = interfaceTranslator("zh-CN");
let project: CanvasProject | undefined;
let exported: CanvasProject[][] = [];
let exportFailure = false;
mock.module("@/lib/canvas/canvas-export", () => ({ exportCanvasProjects: async (projects: CanvasProject[]) => {
    if (exportFailure) throw new Error("Export failed");
    exported.push(structuredClone(projects));
} }));
mock.module("@/stores/canvas/use-canvas-store", () => ({ useCanvasStore: { getState: () => ({ openProject: () => project }) } }));
mock.module("@/services/canvas-sync-drafts", () => ({ readAllCanvasSyncDrafts: async () => [], readCanvasSyncDrafts: async () => [] }));
mock.module("@/services/user-data-sync", () => ({ retryRemoteUserDataSync: async () => {} }));
mock.module("antd", () => ({
    App: { useApp: () => ({ message: { success: (text: string) => successes.push(text), error: (text: string) => errors.push(text) }, modal: { confirm: () => {} } }) },
    Button: ({ children, icon, loading, block, size, type, ...props }: any) => <button {...props}>{children}</button>,
    Popover: ({ children, open, onOpenChange, content }: any) => <div><div onClick={() => onOpenChange(!open)}>{children}</div>{open ? content : null}</div>,
    Dropdown: ({ children }: any) => children,
}));
const { CanvasSyncStatus } = await import("../src/pages/canvas/canvas-sync-status");
const { useSyncProgressStore } = await import("../src/stores/use-sync-progress-store");
let root: ReturnType<typeof createRoot> | undefined;
let host: HTMLDivElement;
afterEach(async () => {
    if (root) await act(async () => root!.unmount());
    root = undefined;
    host?.remove();
    useSyncProgressStore.getState().clearAll();
    successes.length = errors.length = 0;
    exported = [];
    exportFailure = false;
    project = undefined;
});
async function render() {
    host = document.createElement("div"); document.body.append(host); root = createRoot(host);
    await act(async () => root!.render(<CanvasSyncStatus projectId="canvas" onLoadLatest={async () => {}} />));
}
async function click(text: string) {
    const target = [...host.querySelectorAll("button")].find(button => button.textContent === text);
    expect(target).toBeDefined();
    await act(async () => target!.click());
}
async function open() {
    await act(async () => host.querySelector("button")!.click());
}

test("saving status follows live progress and exposes details only when opened", async () => {
    useSyncProgressStore.getState().setProjectProgress("canvas", { phase: "pending" });
    await render();
    expect(host.querySelector("button")?.getAttribute("aria-label")).toContain(t("canvasSyncSaving"));
    expect(host.querySelector('[role="status"]')).toBeNull();
    await open();
    expect(host.querySelector('[role="status"]')?.textContent).toBeTruthy();
    await act(async () => useSyncProgressStore.getState().setProjectProgress("canvas", { phase: "done" }));
    expect(host.querySelector("button")?.getAttribute("aria-label")).toContain("已保存到云端");
});

test("missing local canvas reports failure without claiming a download", async () => {
    await render(); await open(); await click("下载本地副本");
    expect(exported).toEqual([]);
    expect(successes).toEqual([]);
    expect(errors).toEqual(["画布不存在"]);
});

test("local download includes the actual current edits and reports success after export", async () => {
    project = { id: "canvas", title: "Current edit", nodes: [{ id: "node", metadata: { content: "Unsynced text" } }] } as CanvasProject;
    await render(); await open(); await click("下载本地副本");
    expect(exported).toEqual([[project]]);
    expect(successes).toEqual([t("canvasSyncDownloaded")]);
    expect(errors).toEqual([]);
});

test("export failures keep the editor open and never report successful download", async () => {
    project = { id: "canvas", title: "Current edit", nodes: [] } as unknown as CanvasProject;
    exportFailure = true;
    await render(); await open(); await click("下载本地副本");
    expect(successes).toEqual([]);
    expect(errors).toEqual(["Export failed"]);
    expect(host.querySelector('[role="status"]')).not.toBeNull();
});
