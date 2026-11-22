import { afterAll, afterEach, expect, mock, test } from "bun:test";
import { Window } from "happy-dom";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { AuthSessionPayload } from "../src/services/api/auth";
import { ApiError } from "../src/services/api/request";

const dom = new Window({ url: "https://canvas.example/admin/settings/appearance" });
const originals = new Map<string, PropertyDescriptor | undefined>();
for (const [key, value] of Object.entries({ window: dom, document: dom.document, navigator: dom.navigator, HTMLElement: dom.HTMLElement, Element: dom.Element, IS_REACT_ACT_ENVIRONMENT: true })) {
    originals.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
}

let session = async (): Promise<AuthSessionPayload> => ({ user: null });
let apply = async (_payload: AuthSessionPayload): Promise<void> => {};
const applied: AuthSessionPayload[] = [];
const diagnostics: Array<{ code?: string }> = [];
mock.module("@/services/api/auth", () => ({ getAuthSession: () => session() }));
mock.module("@/lib/user-session", () => ({ applyUserSession: (payload: AuthSessionPayload) => { applied.push(payload); return apply(payload); } }));
mock.module("@/lib/workspace-route-modules", () => ({ preloadWorkspaceRoute: () => {} }));
mock.module("@/services/diagnostics/client-diagnostics", () => ({ recordDiagnosticEvent: (event: { code?: string }) => diagnostics.push(event) }));
mock.module("@/stores/use-interface-locale-store", () => ({ useInterfaceTranslation: () => ({ t: (key: string) => key }) }));
const { AuthSessionHydrator } = await import("../src/components/auth/auth-session-hydrator");

let root: Root | undefined;
let container: HTMLDivElement;
async function render() {
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    await act(async () => { root!.render(<AuthSessionHydrator><main>workspace-shell</main></AuthSessionHydrator>); });
    return container;
}

afterEach(async () => {
    if (root) await act(async () => { root!.unmount(); });
    root = undefined;
    container?.remove();
    applied.length = 0;
    diagnostics.length = 0;
    session = async () => ({ user: null });
    apply = async () => {};
});
afterAll(() => {
    dom.happyDOM.abort();
    for (const [key, descriptor] of originals) {
        if (descriptor) Object.defineProperty(globalThis, key, descriptor);
        else Reflect.deleteProperty(globalThis, key);
    }
});

test("a failed session read retains the recovery gate without inventing an anonymous session", async () => {
    session = async () => { throw new ApiError("unavailable", { status: 503 }); };
    const view = await render();
    expect(view.querySelector('[role="alert"]')).not.toBeNull();
    expect(applied).toHaveLength(0);
    expect(diagnostics.at(-1)?.code).toBe("startup.auth_session_failed");
});

test("an expired session restores the anonymous scope before leaving recovery", async () => {
    session = async () => { throw new ApiError("expired", { status: 401 }); };
    const view = await render();
    expect(applied).toEqual([{ user: null }]);
    expect(view.querySelector('[role="alert"]')).toBeNull();
    expect(view.textContent).toContain("workspace-shell");
});

test("a storage failure is reported separately and never retried as anonymous login", async () => {
    apply = async () => { throw new ApiError("storage rejected", { status: 401 }); };
    const view = await render();
    expect(view.querySelector('[role="alert"]')).not.toBeNull();
    expect(applied).toHaveLength(1);
    expect(diagnostics.at(-1)?.code).toBe("startup.workspace_data_failed");
});

test("manual reconnect reruns recovery and clears the failure only after success", async () => {
    session = async () => { throw new ApiError("unavailable", { status: 503 }); };
    const view = await render();
    expect(view.querySelector('[role="alert"]')).not.toBeNull();
    session = async () => ({ user: null });
    await act(async () => { view.querySelector("button")!.click(); });
    expect(applied).toEqual([{ user: null }]);
    expect(view.querySelector('[role="alert"]')).toBeNull();
    expect(diagnostics.at(-1)?.code).toBe("startup.anonymous_ready");
});
