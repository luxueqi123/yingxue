import { afterEach, expect, mock, test } from "bun:test";
import { Window } from "happy-dom";

const dom = new Window({ url: "https://studio.example/" });
for (const [key, value] of Object.entries({ window: dom, document: dom.document, navigator: dom.navigator, HTMLElement: dom.HTMLElement, Node: dom.Node, Event: dom.Event, IS_REACT_ACT_ENVIRONMENT: true })) {
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
}
const { act } = await import("react");
const { createRoot } = await import("react-dom/client");
const { createMemoryRouter, RouterProvider, Link, useLocation } = await import("react-router");
const { QueryClient, QueryClientProvider } = await import("@tanstack/react-query");

let owner = "owner";
let reads: string[] = [];
let writes = 0;
const character = (id: string) => ({ asset: { id, title: `Character ${id}` }, character: { definition: { studioStates: [{ id: "state", name: "Main", attributes: { role: "Original role" } }], studioActiveStateId: "state" }, representations: [], versionId: "v1" } });
let readCharacter = async (id: string) => character(id);
mock.module("@/services/api/projects", () => ({
    listCharacters: async () => ({ characters: [character("a"), character("b")], hasMore: false }),
    getCharacter: async (id: string) => { reads.push(id); return readCharacter(id); },
    updateCharacter: async (id: string, value: { name: string; definition: Record<string, unknown> }) => { writes++; return { ...character(id), asset: { id, title: value.name }, character: { ...character(id).character, definition: value.definition } }; },
    createCharacter: async () => character("new"), replaceCharacterRepresentations: async () => character("a"), bindCharacterVoice: async () => character("a"),
}));
mock.module("@/services/api/task-center", () => ({ listGenerationTasks: async () => [], queryGenerationTask: async () => ({}), waitForGenerationTask: async () => ({}) }));
mock.module("@/services/api/generation-task", () => ({ submitBackendGenerationTask: async () => ({}) }));
mock.module("@/services/creative-studio", () => ({ assertStudioSession: (expected: string) => { if (expected !== owner) throw new Error("Account changed"); }, materializeStudioResult: async () => ({}), uploadStudioMedia: async () => ({}) }));
mock.module("@/services/api/resources", () => ({ resourceFileUrl: (id: string) => `/resources/${id}`, resourceIdFromStorageKey: () => "resource" }));
mock.module("@/services/api/user-data", () => ({ getRemoteAsset: async (id: string) => ({ asset: { id, kind: "character" } }) }));
mock.module("@/stores/use-asset-store", () => ({ useAssetStore: { getState: () => ({ assets: [], replaceAssets: () => {} }) } }));
mock.module("@/stores/use-user-store", () => ({ useUserStore: Object.assign((select: (state: { user: { id: string } }) => unknown) => select({ user: { id: owner } }), { getState: () => ({ user: { id: owner } }) }) }));
mock.module("@/stores/use-config-store", () => ({ useEffectiveConfig: () => ({ imageModel: "" }) }));
mock.module("@/stores/use-interface-locale-store", () => ({ useInterfaceTranslation: () => ({ t: (key: string) => key }) }));
mock.module("../src/pages/create/studio-copy", () => ({ useStudioCopy: () => (key: string) => key }));
mock.module("../src/pages/create/creative-production-studio", () => ({ StudioField: ({ label, children }: { label: string; children: React.ReactNode }) => <label>{label}{children}</label>, StudioModel: () => null }));
const TextInput = ({ onChange, ...props }: React.InputHTMLAttributes<HTMLInputElement>) => <input {...props} onChange={onChange} />;
const Input = Object.assign(TextInput, { TextArea: (props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) => <textarea {...props} />, Search: () => <input type="search" /> });
mock.module("antd", () => ({
    App: { useApp: () => ({ message: { success: () => {} } }) }, Input,
    Button: ({ children, loading, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { loading?: boolean }) => <button {...props}>{children}</button>,
    Select: ({ options, onChange, ...props }: { options?: { value: string; label: string }[]; onChange?: (value: string) => void }) => <select {...props} onChange={event => onChange?.(event.target.value)}>{options?.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select>,
    Tabs: ({ items }: { items: { key: string; children: React.ReactNode }[] }) => <div>{items.map(item => <div key={item.key}>{item.children}</div>)}</div>,
}));
const { default: CreativeCharacterStudio } = await import("../src/pages/create/creative-character-studio");
const { studioWorkPath } = await import("../src/lib/creative-studio");
let root: ReturnType<typeof createRoot>;
let client: InstanceType<typeof QueryClient>;
let router: ReturnType<typeof createMemoryRouter>;
let host: HTMLDivElement;
function CanvasReturn() { const location = useLocation(); return <Link to={location.state.returnTo}>Return to character</Link>; }
async function flush() { await act(async () => { await new Promise(resolve => setTimeout(resolve, 15)); }); }
async function render(path = "/portrait?work=a") {
    owner = "owner"; writes = 0; reads = []; readCharacter = async id => character(id);
    client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    router = createMemoryRouter([{ path: "/portrait", element: <CreativeCharacterStudio /> }, { path: "/canvas", element: <CanvasReturn /> }], { initialEntries: [path] });
    host = document.createElement("div"); document.body.append(host); root = createRoot(host);
    await act(async () => root.render(<QueryClientProvider client={client}><RouterProvider router={router} /></QueryClientProvider>));
    await flush();
}
const button = (text: string) => Array.from(host.querySelectorAll("button")).find(item => item.textContent === text)!;
const title = () => host.querySelector<HTMLInputElement>('input[aria-label="title"]')!.value;
afterEach(async () => { if (root) await act(async () => root.unmount()); router?.dispose(); client?.clear(); host?.remove(); });

test("opening a saved character restores its fields after full editor remount", async () => {
    await render();
    expect(title()).toBe("Character a");
    expect(host.querySelector("textarea")?.value).toBe("Original role");
    expect(reads).toEqual(["a"]);
});

test("canvas handoff saves the character and returns to the same editable work", async () => {
    await render();
    await act(async () => button("canvas").click()); await flush();
    expect(writes).toBe(1);
    expect(router.state.location.pathname).toBe("/canvas");
    expect(router.state.location.state.returnTo).toBe("/portrait?work=a");
    await act(async () => host.querySelector<HTMLAnchorElement>("a")!.click()); await flush();
    expect(title()).toBe("Character a");
    expect(host.querySelector("textarea")?.value).toBe("Original role");
    expect(button("save").disabled).toBe(false);
});

test("a late previous selection cannot replace the requested character", async () => {
    await render();
    let resolveB!: (value: ReturnType<typeof character>) => void;
    readCharacter = id => id === "b" ? new Promise(resolve => { resolveB = resolve; }) : Promise.resolve(character(id));
    await act(async () => router.navigate("/portrait?work=b")); await flush();
    await act(async () => router.navigate("/portrait?work=a")); await flush();
    await act(async () => resolveB(character("b"))); await flush();
    expect(title()).toBe("Character a");
});

test("work return paths replace stale identity and preserve other query parameters", () => {
    expect(studioWorkPath("/director", "?work=old&mode=MV", "new/id")).toBe("/director?work=new%2Fid&mode=MV");
});
