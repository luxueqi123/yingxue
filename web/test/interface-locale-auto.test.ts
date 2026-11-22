import { expect, test } from "bun:test";

const entry = new URL("../src/stores/use-interface-locale-store.ts", import.meta.url).href;

function runStartup(body: string, options: { country?: string; languages?: string[]; saved?: string; failure?: boolean; delayed?: boolean; timeout?: boolean } = {}) {
    const script = `
        const options = ${JSON.stringify(options)};
        let saved = options.saved ?? null;
        globalThis.window = {};
        Object.defineProperty(globalThis, "navigator", { value: { languages: options.languages || ["en-US"], language: "en-US" }, configurable: true });
        globalThis.localStorage = { getItem: () => saved, setItem: (_key, value) => { saved = value; }, removeItem() {} };
        let requests = 0, finish;
        globalThis.fetch = (url, init) => {
            requests++;
            if (url !== "/cdn-cgi/trace" || init.credentials !== "omit" || init.cache !== "no-store") throw new Error("Unexpected location request");
            if (options.failure) return Promise.reject(new Error("offline"));
            if (options.timeout) return new Promise((_resolve, reject) => init.signal.addEventListener("abort", () => reject(init.signal.reason)));
            const result = () => new Response("ip=203.0.113.1\\nloc=" + (options.country || "JP") + "\\n");
            if (options.delayed) return new Promise(resolve => { finish = () => resolve(result()); });
            return Promise.resolve(result());
        };
        const { useInterfaceLocaleStore: store } = await import(${JSON.stringify(entry)});
        await Promise.resolve();
        const ready = (locale) => new Promise(resolve => {
            const matches = state => state.ready && (!locale || state.locale === locale);
            if (matches(store.getState())) return resolve();
            const unsubscribe = store.subscribe(state => { if (matches(state)) { unsubscribe(); resolve(); } });
        });
        ${body}
    `;
    const result = Bun.spawnSync([process.execPath, "--eval", script], { stdout: "pipe", stderr: "pipe", timeout: 5000 });
    expect(new TextDecoder().decode(result.stderr)).toBe("");
    expect(result.exitCode).toBe(0);
}

test("a new visitor defaults to the language of the IP region across all ten resources", () => {
    for (const [country, locale] of [["CN", "zh-CN"], ["HK", "zh-HK"], ["TW", "zh-TW"], ["US", "en-US"], ["JP", "ja-JP"], ["KR", "ko-KR"], ["ES", "es-ES"], ["BR", "pt-BR"], ["FR", "fr-FR"], ["DE", "de-DE"]]) {
        runStartup(`
            await ready(${JSON.stringify(locale)});
            const state = store.getState();
            if (!state.ready || state.locale !== ${JSON.stringify(locale)} || requests !== 1) throw new Error(JSON.stringify({ locale: state.locale, ready: state.ready, requests }));
            const preference = JSON.parse(saved).state;
            if (JSON.stringify(preference) !== JSON.stringify({ locale: ${JSON.stringify(locale)}, preference: "automatic" })) throw new Error(JSON.stringify(preference));
        `, { country });
    }
});

test("existing manual and legacy choices take priority without an IP request", () => {
    for (const state of [{ locale: "ko-KR" }, { locale: "ko-KR", preference: "manual" }]) {
        runStartup(`
            await ready("ko-KR");
            if (!store.getState().ready || store.getState().locale !== "ko-KR" || requests !== 0) throw new Error("Manual language changed");
        `, { country: "JP", saved: JSON.stringify({ state, version: 0 }) });
    }
});

test("a late IP response cannot override a manual choice made in the meantime", () => {
    runStartup(`
        if (requests !== 1) throw new Error("Location request not started");
        await store.getState().setLocale("es-ES");
        finish();
        await Bun.sleep(50);
        if (store.getState().locale !== "es-ES" || store.getState().preference !== "manual") throw new Error("Location replaced manual choice");
    `, { delayed: true });
});

test("unavailable or unsupported IP region falls back to the browser language", () => {
    for (const options of [{ failure: true, languages: ["zh-Hant-TW"] }, { country: "ZZ", languages: ["xx-XX", "zh-TW"] }]) {
        runStartup(`
            await ready("zh-TW");
            if (!store.getState().ready || store.getState().locale !== "zh-TW") throw new Error("Browser fallback failed");
        `, options);
    }
});

test("automatic preferences follow a changed IP region and corrupt storage still initializes", () => {
    for (const saved of [JSON.stringify({ state: { locale: "zh-CN", preference: "automatic" }, version: 0 }), "{broken preference"]) {
        runStartup(`
            await ready("ko-KR");
            if (store.getState().locale !== "ko-KR" || store.getState().preference !== "automatic") throw new Error("Automatic initialization failed");
        `, { country: "KR", saved });
    }
});

test("a location timeout releases startup with the browser language", () => {
    runStartup(`
        const guard = setTimeout(() => { throw new Error("Location blocked startup"); }, 3000);
        await ready("es-ES");
        clearTimeout(guard);
        if (store.getState().locale !== "es-ES" || requests !== 1) throw new Error("Timeout fallback failed");
    `, { timeout: true, languages: ["es-MX"] });
});

test("a pending IP lookup keeps the lobby language ready and still applies the region later", () => {
    runStartup(`
        if (!store.getState().ready || store.getState().locale !== "zh-CN" || requests !== 1) throw new Error("IP lookup blocked the lobby");
        finish();
        await ready("ja-JP");
        if (store.getState().preference !== "automatic") throw new Error("Automatic preference changed");
    `, { delayed: true });
});
