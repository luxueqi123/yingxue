import { afterEach, expect, test } from "bun:test";
import { installChunkRecovery } from "../src/lib/chunk-recovery";

const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
const originalStorage = Object.getOwnPropertyDescriptor(globalThis, "sessionStorage");
afterEach(() => {
    if (originalWindow) Object.defineProperty(globalThis, "window", originalWindow);
    else Reflect.deleteProperty(globalThis, "window");
    if (originalStorage) Object.defineProperty(globalThis, "sessionStorage", originalStorage);
    else Reflect.deleteProperty(globalThis, "sessionStorage");
});

test("a failed optional language bundle preserves the page while route failures still recover", () => {
    const navigations: string[] = [];
    const target = Object.assign(new EventTarget(), {
        location: { href: "https://example.test/login", replace: (url: string) => navigations.push(url) },
    });
    Object.defineProperty(globalThis, "window", { configurable: true, value: target });
    Object.defineProperty(globalThis, "sessionStorage", {
        configurable: true, value: { getItem: () => null, setItem() {} },
    });
    installChunkRecovery();
    const localeFailure = Object.assign(new Event("vite:preloadError", { cancelable: true }), {
        payload: new Error("Failed to fetch dynamically imported module: https://example.test/assets/en-US-abc123.js"),
    });
    target.dispatchEvent(localeFailure);
    expect(navigations).toHaveLength(0);
    expect(localeFailure.defaultPrevented).toBe(false);
    const routeFailure = Object.assign(new Event("vite:preloadError", { cancelable: true }), {
        payload: new Error("Failed to fetch dynamically imported module: https://example.test/assets/project-abc123.js"),
    });
    target.dispatchEvent(routeFailure);
    expect(navigations).toHaveLength(1);
    expect(navigations[0]).toContain("__chunk_recovery=");
    expect(routeFailure.defaultPrevented).toBe(true);
});
