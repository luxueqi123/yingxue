import { afterAll, afterEach, beforeEach, expect, mock, test } from "bun:test";
import { Window } from "happy-dom";

const dom = new Window({ url: "https://canvas-library.test/" });
const originals = new Map<string, PropertyDescriptor | undefined>();
for (const [key, value] of Object.entries({
    window: dom, document: dom.document, navigator: dom.navigator,
    HTMLElement: dom.HTMLElement, HTMLInputElement: dom.HTMLInputElement,
    SVGElement: dom.SVGElement, Element: dom.Element, ShadowRoot: dom.ShadowRoot, Node: dom.Node,
    getComputedStyle: dom.getComputedStyle.bind(dom),
    requestAnimationFrame: dom.requestAnimationFrame.bind(dom), cancelAnimationFrame: dom.cancelAnimationFrame.bind(dom),
    IS_REACT_ACT_ENVIRONMENT: true,
})) {
    originals.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
}

const load = mock(async (_id: string): Promise<unknown> => ({}));
const save = mock(async (_id?: string) => {});
const rename = mock((_id: string, _title: string) => {});
const open = mock(() => {});
mock.module("../src/services/user-data-sync", () => ({ loadCanvasProjectForEditing: load, saveRemoteUserDataNow: save }));
mock.module("../src/stores/canvas/use-canvas-store", () => ({ useCanvasStore: (selector: (state: { renameProject: typeof rename }) => unknown) => selector({ renameProject: rename }) }));
mock.module("../src/components/canvas/canvas-project-card", () => ({ ProjectPreview: () => <div /> }));
mock.module("../src/lib/canvas/canvas-export", () => ({ exportCanvasProjects: mock(async () => {}) }));

const { act } = await import("react");
const { createRoot } = await import("react-dom/client");
const { App } = await import("antd");
const { CanvasFolderCard } = await import("../src/components/canvas/canvas-folder-card");
const { useCanvasUiStore } = await import("../src/stores/canvas/use-canvas-ui-store");
const project = {
    id: "rename-target", title: "原始画布", nodeCount: 0, previewNodes: [],
    createdAt: "2026-11-09T00:00:00Z", updatedAt: "2026-11-09T00:00:00Z",
};
let root: ReturnType<typeof createRoot>;
let host: HTMLDivElement;

beforeEach(async () => {
    load.mockClear(); save.mockClear(); rename.mockClear(); open.mockClear();
    load.mockImplementation(async () => ({}));
    useCanvasUiStore.setState({ editingProjectId: null, editingProjectTitle: "", selectedProjectIds: [] });
    host = document.createElement("div"); document.body.append(host); root = createRoot(host);
    await act(async () => root.render(<App><CanvasFolderCard project={project} onClick={open} /></App>));
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); });
afterAll(() => {
    mock.restore(); dom.happyDOM.abort();
    for (const [key, descriptor] of originals) {
        if (descriptor) Object.defineProperty(globalThis, key, descriptor);
        else Reflect.deleteProperty(globalThis, key);
    }
});

async function edit() {
    const button = host.querySelector<HTMLButtonElement>(".canvas-collection-rename")!;
    // Position is relative to the card, not the separately positioned overflow menu.
    expect(button.parentElement?.classList.contains("canvas-collection-card")).toBe(true);
    await act(async () => button.click());
    return host.querySelector<HTMLInputElement>(".canvas-collection-title-input")!;
}

test("pointer rename opens the real editor without navigating", async () => {
    const input = await edit();
    expect(input.value).toBe(project.title);
    expect(open).not.toHaveBeenCalled();
    expect(load).not.toHaveBeenCalled();
    expect(save).not.toHaveBeenCalled();
});

test("rename loads the full project and waits for cloud save", async () => {
    const input = await edit();
    await act(async () => useCanvasUiStore.getState().setEditingProjectTitle("新名称"));
    await act(async () => input.dispatchEvent(new dom.KeyboardEvent("keydown", { key: "Enter", bubbles: true })));
    expect(load).toHaveBeenCalledWith(project.id);
    expect(rename).toHaveBeenCalledWith(project.id, "新名称");
    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith(project.id);
    expect(open).not.toHaveBeenCalled();
});

test("escape cancels the edit without renaming or saving", async () => {
    const input = await edit();
    await act(async () => input.dispatchEvent(new dom.KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
    expect(host.querySelector(".canvas-collection-title-input")).toBeNull();
    expect(rename).not.toHaveBeenCalled();
    expect(save).not.toHaveBeenCalled();
    expect(open).not.toHaveBeenCalled();
});

test("failed project load does not rename partial content or report a successful save", async () => {
    load.mockImplementation(async () => { throw new Error("Cloud unavailable"); });
    const input = await edit();
    await act(async () => input.dispatchEvent(new dom.KeyboardEvent("keydown", { key: "Enter", bubbles: true })));
    expect(rename).not.toHaveBeenCalled();
    expect(save).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain("Cloud unavailable");
});

test("a missing full project cannot be renamed from its list summary", async () => {
    load.mockImplementation(async () => undefined);
    const input = await edit();
    await act(async () => input.dispatchEvent(new dom.KeyboardEvent("keydown", { key: "Enter", bubbles: true })));
    expect(rename).not.toHaveBeenCalled();
    expect(save).not.toHaveBeenCalled();
});
