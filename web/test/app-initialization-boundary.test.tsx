import { afterAll, expect, mock, test } from "bun:test";
import { renderToReadableStream } from "react-dom/server";
import * as userModule from "../src/stores/use-user-store";
import * as localeModule from "../src/stores/use-interface-locale-store";

const userState = { ...userModule.useUserStore.getState(), hydrated: true, user: {
    id: "isolated-entry-fixture", username: "entry-fixture", displayName: "Entry fixture",
    role: "user" as const, status: "active" as const, createdAt: "", updatedAt: "",
} };
const localeState = { ...localeModule.useInterfaceLocaleStore.getState(), ready: true };
mock.module("../src/stores/use-user-store", () => ({
    ...userModule,
    useUserStore: Object.assign((select: (state: typeof userState) => unknown) => select(userState), userModule.useUserStore),
}));
mock.module("../src/stores/use-interface-locale-store", () => ({
    ...localeModule,
    useInterfaceLocaleStore: Object.assign((select: (state: typeof localeState) => unknown) => select(localeState), localeModule.useInterfaceLocaleStore),
}));
const stalled = new Promise<never>(() => {});
mock.module("../src/components/layout/client-root-init", () => ({ ClientRootInit: () => { throw stalled; } }));
const { AppProviders } = await import("../src/components/layout/app-providers");
afterAll(() => mock.restore());

test("pending authenticated initialization never replaces the lobby with a fullscreen loader", async () => {
    const controller = new AbortController();
    const stream = await renderToReadableStream(<AppProviders><main>entry-content</main></AppProviders>, {
        signal: controller.signal, onError: () => {},
    });
    const reader = stream.getReader();
    try {
        const first = await reader.read();
        const shell = new TextDecoder().decode(first.value);
        expect(shell).toContain("entry-content");
        // Streaming React may include hidden page markup alongside its fallback.
        // Checking content alone would pass even when a fullscreen fallback hides it.
        expect(shell).not.toContain("data-full-screen-loader");
    } finally {
        await reader.cancel();
        controller.abort();
    }
});
