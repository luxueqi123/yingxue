import { afterEach, expect, test } from "bun:test";
import { createJSONStorage } from "zustand/middleware";
import { useInterfaceLocaleStore as store } from "../src/stores/use-interface-locale-store";

const originalStorage = store.persist.getOptions().storage;

test("first initialization with malformed storage releases the application readiness gate", () => {
    const entry = new URL("../src/stores/use-interface-locale-store.ts", import.meta.url).href;
    const result = Bun.spawnSync([process.execPath, "--eval", `
        globalThis.localStorage = {
            getItem: () => "{broken preference", setItem() {}, removeItem() {},
        };
        const { useInterfaceLocaleStore: store } = await import(${JSON.stringify(entry)});
        await Promise.resolve();
        const { locale, ready } = store.getState();
        if (locale !== "zh-CN" || !ready) throw new Error(JSON.stringify({ locale, ready }));
    `], { stdout: "pipe", stderr: "pipe" });
    expect(new TextDecoder().decode(result.stderr)).toBe("");
    expect(result.exitCode).toBe(0);
});

afterEach(() => {
    store.persist.setOptions({ storage: originalStorage });
    store.setState({ locale: "zh-CN", ready: true, pendingLocale: null, loadFailed: false, preference: "automatic" });
});

test("malformed persisted preference recovers to a usable default instead of a blank application", async () => {
    store.setState({ locale: "zh-CN", ready: false });
    store.persist.setOptions({ storage: createJSONStorage(() => ({
        getItem: () => "{broken preference",
        setItem: () => {},
        removeItem: () => {},
    })) });
    await store.persist.rehydrate();
    expect(store.getState().locale).toBe("zh-CN");
    expect(store.getState().ready).toBe(true);
    expect(store.getState().pendingLocale).toBeNull();
});

test("a persisted language restores its bundle and stores only the preference", async () => {
    let saved = "";
    store.setState({ locale: "zh-CN", ready: false });
    store.persist.setOptions({ storage: createJSONStorage(() => ({
        getItem: () => JSON.stringify({ state: { locale: "en-US" }, version: 0 }),
        setItem: (_key, value) => { saved = value; },
        removeItem: () => {},
    })) });
    await store.persist.rehydrate();
    await store.getState().setLocale("en-US");
    expect(store.getState().ready).toBe(true);
    expect(store.getState().locale).toBe("en-US");
    expect(JSON.parse(saved).state).toEqual({ locale: "en-US", preference: "manual" });
});
