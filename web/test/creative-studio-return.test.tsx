import { afterEach, expect, mock, test } from "bun:test";
import { Window } from "happy-dom";
import { newStudioDocument, type StudioDocument } from "../src/lib/creative-studio";

const dom = new Window({ url: "https://studio.example/" });
for (const [key, value] of Object.entries({ window: dom, document: dom.document, navigator: dom.navigator, HTMLElement: dom.HTMLElement, Node: dom.Node, Event: dom.Event, IS_REACT_ACT_ENVIRONMENT: true })) {
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
}
const { act } = await import("react");
const { createRoot } = await import("react-dom/client");
const { createMemoryRouter, RouterProvider } = await import("react-router");
const { QueryClient, QueryClientProvider } = await import("@tanstack/react-query");

let doc: StudioDocument;
let saved: StudioDocument[] = [];
let saveFailure = false;
let releaseSave: (() => void) | undefined;
let waitForSave: Promise<void> | undefined;
let operationError = "";
let chapterWrites = 0;
mock.module("../src/pages/create/use-creative-studio", () => ({ useCreativeStudio: () => ({
    doc, documents: [], config: {}, owner: "owner", hydrated: true, saved: false, busy: false, change: () => {},
    perform: async (operation: () => Promise<void>) => { try { await operation(); } catch (cause) { operationError = String(cause); } },
}) }));
mock.module("../src/pages/create/studio-copy", () => ({ useStudioCopy: () => (key: string) => key }));
mock.module("@/stores/use-config-store", () => ({ selectableModelsByCapability: () => [], modelDisplayName: () => "" }));
mock.module("@/services/creative-studio", () => ({ uploadStudioMedia: async () => { throw new Error("Unexpected upload"); }, saveStudioDocument: async (value: StudioDocument) => {
    await waitForSave;
    if (saveFailure) throw new Error("Cloud save failed");
    saved.push(structuredClone(value)); return value;
} }));
mock.module("@/services/api/resources", () => ({ getResourceBlob: async () => { throw new Error("Unexpected resource read"); }, getResourceAccess: async () => ({ url: "/reference.png" }), resolveResourceAccessURL: (url: string) => url, resourceFileUrl: (id: string) => `/resources/${id}`, resourceIdFromStorageKey: (key: string) => key.replace(/^resource:/, "") }));
mock.module("@/services/api/projects", () => ({ listProjects: async () => ({ projects: [{ project: { id: "project", name: "Project" } }] }), createProjectUnit: async () => { chapterWrites++; return { unit: { id: "chapter" } }; }, replaceProjectUnitShots: async () => {} }));
const Input = Object.assign((props: React.InputHTMLAttributes<HTMLInputElement>) => <input {...props} />, { TextArea: (props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) => <textarea {...props} /> });
mock.module("antd", () => ({ Input, InputNumber: () => null,
    Button: ({ children, loading, type, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { loading?: boolean }) => <button {...props}>{children}</button>,
    Select: ({ options, onChange, ...props }: { options?: { value: string; label: string }[]; onChange?: (value: string) => void }) => <select {...props} onChange={event => onChange?.(event.target.value)}><option value="" />{options?.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select>,
}));
const { default: CreativeProductionStudio } = await import("../src/pages/create/creative-production-studio");
let root: ReturnType<typeof createRoot>;
let router: ReturnType<typeof createMemoryRouter>;
let client: InstanceType<typeof QueryClient>;
let host: HTMLDivElement;
async function flush() { await act(async () => { await new Promise(resolve => setTimeout(resolve, 10)); }); }
async function render(tool: StudioDocument["tool"] = "creative-title") {
    doc = { ...newStudioDocument(tool), title: "Unsaved title", input: "Unsaved prompt", result: "Edited screenplay", media: [{ id: "media", storageKey: "resource:media", kind: "image", name: "Reference", url: "/reference.png", source: "reference" }] };
    saved = []; chapterWrites = 0; saveFailure = false; waitForSave = undefined; releaseSave = undefined; operationError = "";
    router = createMemoryRouter([{ path: "/studio", element: <CreativeProductionStudio tool={tool} /> }, { path: "/canvas", element: <div>Canvas</div> }, { path: "/projects/:id/chapters/:chapter", element: <div>Chapter</div> }], { initialEntries: ["/studio?filter=mine"] });
    client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    host = document.createElement("div"); document.body.append(host); root = createRoot(host);
    await act(async () => root.render(<QueryClientProvider client={client}><RouterProvider router={router} /></QueryClientProvider>));
    await flush();
}
const button = (label: string) => [...host.querySelectorAll("button")].find(item => item.textContent === label)!;
afterEach(async () => { if (root) await act(async () => root.unmount()); router?.dispose(); client?.clear(); host?.remove(); });

test("media handoff waits for the current document to save and returns to that exact work", async () => {
    await render();
    waitForSave = new Promise(resolve => { releaseSave = resolve; });
    await act(async () => button("canvas").click());
    expect(router.state.location.pathname).toBe("/studio");
    expect(saved).toEqual([]);
    releaseSave!(); await flush();
    expect(saved[0]).toMatchObject({ id: doc.id, title: "Unsaved title", input: "Unsaved prompt" });
    expect(router.state.location.pathname).toBe("/canvas");
    expect(new URLSearchParams(router.state.location.search).getAll("asset")).toEqual(["media"]);
    expect(router.state.location.state.returnTo).toBe(`/studio?filter=mine&work=${doc.id}`);
});

test("a failed document save leaves the editor open and never navigates with unsaved media edits", async () => {
    await render(); saveFailure = true;
    await act(async () => button("canvas").click()); await flush();
    expect(router.state.location.pathname).toBe("/studio");
    expect(saved).toEqual([]);
    expect(operationError).toContain("Cloud save failed");
});

test("project handoff does not create a chapter when the current work cannot be saved", async () => {
    await render("script-creation"); saveFailure = true;
    const select = host.querySelector<HTMLSelectElement>('select[aria-label="chooseProject"]')!;
    await act(async () => { select.value = "project"; select.dispatchEvent(new Event("change", { bubbles: true })); });
    await act(async () => button("project").click()); await flush();
    expect(chapterWrites).toBe(0);
    expect(router.state.location.pathname).toBe("/studio");
    expect(operationError).toContain("Cloud save failed");
});
