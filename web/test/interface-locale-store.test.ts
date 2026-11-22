import { afterEach, expect, mock, test } from "bun:test";

let complete: (value?: unknown) => void;
let reject: (reason?: unknown) => void;
const loaded = new Set(["zh-CN"]);
const locales = ["zh-CN", "zh-HK", "zh-TW", "en-US", "ja-JP", "ko-KR", "es-ES", "pt-BR"];
mock.module("../src/lib/interface-locale", () => ({
    interfaceLocales: locales,
    interfaceTranslator: () => (key: string) => key,
    isInterfaceLocale: (value: unknown) => locales.includes(value as string),
    getLoadedInterfaceLocale: (locale: string) => loaded.has(locale) ? {} : undefined,
    loadInterfaceLocale: () => new Promise((resolve, fail) => { complete = resolve; reject = fail; }),
}));

const { useInterfaceLocaleStore: store } = await import("../src/stores/use-interface-locale-store");
afterEach(() => {
    loaded.delete("en-US");
    store.setState({ locale: "zh-CN", ready: true, pendingLocale: null, loadFailed: false, preference: "automatic" });
});

test("commits only after the bundle loads and persists only the preference", async () => {
    const change = store.getState().setLocale("en-US");
    expect(store.getState().locale).toBe("zh-CN");
    expect(store.getState().pendingLocale).toBe("en-US");
    loaded.add("en-US"); complete();
    expect(await change).toBe(true);
    expect(store.getState().locale).toBe("en-US");
    expect(store.persist.getOptions().partialize?.(store.getState())).toEqual({ locale: "en-US", preference: "manual" });
});

test("failed import retains the active language and can be retried", async () => {
    const first = store.getState().setLocale("en-US");
    reject(new Error("offline"));
    expect(await first).toBe(false);
    expect(store.getState().locale).toBe("zh-CN");
    expect(store.getState().loadFailed).toBe(true);
    const second = store.getState().setLocale("en-US");
    loaded.add("en-US"); complete();
    expect(await second).toBe(true);
    expect(store.getState().loadFailed).toBe(false);
});

test("a late load does not override a newer explicit language choice", async () => {
    const previous = store.getState().setLocale("en-US");
    await store.getState().setLocale("zh-CN");
    loaded.add("en-US"); complete();
    expect(await previous).toBe(false);
    expect(store.getState().locale).toBe("zh-CN");
});

test("failed startup restore has an actual loaded default language", async () => {
    store.setState({ locale: "en-US", ready: false });
    const restore = store.getState().setLocale("en-US");
    reject(new Error("offline during startup"));
    await restore;
    expect(store.getState().ready).toBe(true);
    expect(store.getState().locale).toBe("zh-CN");
});
