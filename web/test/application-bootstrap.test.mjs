import { expect, test } from "bun:test";
import { runInNewContext } from "node:vm";
import { fileURLToPath } from "node:url";

import { isIsolatedDevRepro } from "../src/lib/dev-repro";

// Execute the real entry point; replace only its font, network and UI side effects.
async function prepareEntry(dev, pathname) {
    const build = await Bun.build({
        entrypoints: [fileURLToPath(new URL("../src/main.tsx", import.meta.url))],
        target: "browser",
        format: "iife",
        define: { "import.meta.env.DEV": JSON.stringify(dev) },
        plugins: [
            {
                name: "entry-side-effects",
                setup(builder) {
                    builder.onResolve({ filter: /^(@fontsource-variable\/|@\/services\/appearance-bootstrap$|@\/layouts\/user-layout$|@\/pages\/(home|create)$|\.\/(welcome-)?application$)/ }, ({ path }) => ({ path, namespace: "entry-test" }));
                    builder.onLoad({ filter: /.*/, namespace: "entry-test" }, ({ path }) => {
                        if (path.startsWith("@fontsource-variable/")) return { contents: "", loader: "js" };
                        if (path === "@/layouts/user-layout" || path === "@/pages/home") return { contents: "", loader: "js" };
                        if (path === "@/pages/create") return { contents: 'events.push("creation");', loader: "js" };
                        if (path === "@/services/appearance-bootstrap") {
                            return { contents: 'export function bootstrapAppearance() { events.push("appearance"); return appearanceReady; }', loader: "js" };
                        }
                        if (path === "./welcome-application") {
                            return { contents: `events.push(${JSON.stringify(path)}); entryLoaded();`, loader: "js" };
                        }
                        return { contents: `export function mountApplication() { events.push(${JSON.stringify(path)}); entryLoaded(); }`, loader: "js" };
                    });
                },
            },
        ],
    });
    expect(build.success).toBe(true);

    const events = [];
    let resolveAppearance;
    let entryLoaded;
    const appearanceReady = new Promise((resolve) => (resolveAppearance = resolve));
    const loaded = new Promise((resolve) => (entryLoaded = resolve));
    const listeners = new Map();
    const replacedPaths = [];
    const window = {
        location: { pathname, href: `http://localhost${pathname}`, reload() {} },
        addEventListener(name, listener) { listeners.set(name, listener); },
        setTimeout() {},
        sessionStorage: { getItem() { return null; }, setItem() {}, removeItem() {} },
        history: { state: null, replaceState(_state, _title, path) { replacedPaths.push(path); } },
        localStorage: { removeItem() {} },
    };
    runInNewContext(await build.outputs[0].text(), { window, URL, events, appearanceReady, entryLoaded });
    expect(typeof listeners.get("vite:preloadError")).toBe("function");
    return { events, resolveAppearance, loaded, replacedPaths };
}

for (const pathname of ["/dev/previs-repro", "/dev/membership"]) {
    test(`DEV preview loads without calling the appearance backend: ${pathname}`, async () => {
        const entry = await prepareEntry(true, pathname);
        await entry.loaded;
        expect(entry.events).toEqual(["./application"]);
    });
}

for (const [dev, pathname] of [
    [false, "/dev/previs-repro"],
    [false, "/dev/membership"],
    [true, "/login"],
    [false, "/login"],
    [true, "/dev/previs-repro/"],
    [true, "/dev/previs-repro-other"],
]) {
    test(`appearance loads in parallel with normal startup: dev=${dev} path=${pathname}`, async () => {
        const entry = await prepareEntry(dev, pathname);
        await entry.loaded;
        expect(entry.events).toEqual(["appearance", "./application"]);
        entry.resolveAppearance();
    });
}

for (const pathname of ["/welcome", "/welcome/"]) {
    test(`retired welcome entry opens the public lobby without waiting for appearance: ${pathname}`, async () => {
        const entry = await prepareEntry(false, pathname);
        await entry.loaded;
        expect(entry.events).toEqual(["appearance", "./application"]);
        expect(entry.replacedPaths).toEqual(["/home"]);
    });
}

test("provider isolation shares the exact DEV-only route boundary", () => {
    for (const path of ["/dev/previs-repro", "/dev/membership"]) {
        expect(isIsolatedDevRepro(true, path)).toBe(true);
        expect(isIsolatedDevRepro(false, path)).toBe(false);
    }
    for (const path of ["/", "/login", "/dev/previs-repro/", "/dev/previs-repro-other", "/dev/membership/", "/membership"]) {
        expect(isIsolatedDevRepro(true, path)).toBe(false);
    }
});

for (const pathname of ["/", "/home"]) {
    test(`lobby input starts alongside the application before appearance is ready: ${pathname}`, async () => {
        const entry = await prepareEntry(false, pathname);
        await entry.loaded;
        expect(entry.events).toContain("creation");
        expect(entry.events).toContain("./application");
        entry.resolveAppearance();
    });
}
