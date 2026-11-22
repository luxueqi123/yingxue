import { afterAll, afterEach, beforeEach, expect, mock, test } from "bun:test";
import { Window } from "happy-dom";
import type { ReactNode } from "react";

const dom = new Window({ url: "https://canvas.example/toolbox/video" });
const globals = new Map<string, PropertyDescriptor | undefined>();
for (const [key, value] of Object.entries({ window: dom, document: dom.document,
    navigator: dom.navigator, HTMLElement: dom.HTMLElement, Element: dom.Element,
    Node: dom.Node, IS_REACT_ACT_ENVIRONMENT: true })) {
    globals.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
}
let pending = Promise.withResolvers<unknown>();
const diagnostics = mock(() => {});
mock.module("@/lib/user-session", () => ({ refreshFeatureAvailability: () => pending.promise }));
mock.module("@/services/diagnostics/client-diagnostics", () => ({ recordDiagnosticEvent: diagnostics }));
mock.module("@/stores/use-interface-locale-store", () => ({ useInterfaceTranslation: () => ({ t: (key: string) => key }) }));
mock.module("react-router", () => ({ useNavigate: () => () => {} }));
mock.module("antd", () => ({ Button: ({ children }: { children: ReactNode }) => <button>{children}</button> }));
mock.module("@/components/layout/workspace-page", () => ({ WorkspacePage: ({ children }: { children: ReactNode }) => <main>{children}</main> }));
mock.module("@/components/layout/workspace-state", () => ({
    WorkspaceLoadingState: () => <div role="status">checking</div>,
    WorkspaceErrorState: ({ description }: { description: string }) => <div role="alert">{description}</div>,
    WorkspaceState: () => <div role="status">disabled</div>,
}));
const { act } = await import("react");
const { createRoot } = await import("react-dom/client");
const { useUserStore, defaultFeatureAvailability } = await import("@/stores/use-user-store");
const { RequireFeature } = await import("@/components/auth/require-feature");
let root: ReturnType<typeof createRoot>;
let host: HTMLDivElement;
beforeEach(() => {
    pending = Promise.withResolvers();
    diagnostics.mockClear();
    useUserStore.setState({ user: { id: "verified-user" } as never, hydrated: true,
        features: { ...defaultFeatureAvailability, videoWorkbenchEnabled: true } });
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
});
afterEach(async () => {
    await act(async () => root.unmount());
    host.remove();
});
afterAll(() => {
    dom.happyDOM.abort();
    for (const [key, descriptor] of globals) {
        if (descriptor) Object.defineProperty(globalThis, key, descriptor);
        else Reflect.deleteProperty(globalThis, key);
    }
});
const mount = () => act(async () => root.render(<RequireFeature feature="videoWorkbenchEnabled"><input aria-label="draft" defaultValue="unfinished" /></RequireFeature>));

test("a failed refresh retains the confirmed editor and its unsaved input", async () => {
    await mount();
    const input = host.querySelector("input")!;
    input.value = "unsaved work";
    await act(async () => { pending.reject(new Error("network timeout")); });
    expect(host.querySelector("input")).toBe(input);
    expect(input.value).toBe("unsaved work");
    expect(host.querySelector('[role="alert"]')).toBeNull();
    expect(diagnostics).toHaveBeenCalledTimes(1);
});

test("an unconfirmed feature stays blocked when the server cannot be reached", async () => {
    useUserStore.setState({ features: { ...defaultFeatureAvailability, videoWorkbenchEnabled: false } });
    await mount();
    expect(host.querySelector("input")).toBeNull();
    await act(async () => { pending.reject(new Error("network timeout")); });
    expect(host.querySelector('[role="alert"]')?.textContent).toBe("network timeout");
    expect(host.querySelector("input")).toBeNull();
});

test("a successful server revocation still removes access to the feature", async () => {
    await mount();
    await act(async () => {
        useUserStore.getState().setFeatures({ ...defaultFeatureAvailability, videoWorkbenchEnabled: false });
        pending.resolve(undefined);
    });
    expect(host.querySelector("input")).toBeNull();
    expect(host.textContent).toBe("disabled");
});

test("a refresh from an unmounted route cannot replace its next feature", async () => {
    await mount();
    await act(async () => root.render(<div>next route</div>));
    await act(async () => { pending.reject(new Error("late timeout")); });
    expect(host.textContent).toBe("next route");
    expect(diagnostics).not.toHaveBeenCalled();
});
