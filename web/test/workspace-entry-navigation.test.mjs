import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import vm from "node:vm";

test("opening or refreshing workspace routes preserves their URL and return state", async () => {
    const main = readFileSync(new URL("../src/main.tsx", import.meta.url), "utf8")
        .replace(/^import .*;\r?\n/gm, "")
        .replace(/import\.meta\.env\.DEV/g, "false")
        .replace(/import\(/g, "loadModule(");
    for (const path of ["/home", "/create", "/studio?tab=cases", "/canvas/case-copy", "/projects/new", "/plugins/eagle", "/settings?continue=1", "/assets", "/tasks", "/admin", "/wallet", "/prompts", "/skills", "/share/canvas/token", "/login?next=%2Fcanvas", "/"]) {
        const location = new URL(path, "https://workspace.example");
        const state = { usr: { returnTo: "/studio?tab=cases", returnState: { casePreview: { id: "case-18" } } }, idx: 2 };
        const replacements = [], mounts = [];
        vm.runInNewContext(main, {
            window: { location, history: { state, replaceState: (...args) => replacements.push(args) } },
            installChunkRecovery() {},
            runLocalRuntimeBootstrap(_context, start) { start(); },
            handleEntryLoadError(error) { throw error; },
            isIsolatedDevRepro() { return false; },
            bootstrapAppearance() {},
            loadModule() { return Promise.resolve({ mountApplication() { mounts.push(true); } }); },
        });
        await Promise.resolve();
        assert.deepEqual(replacements, [], path + " must not be redirected during startup");
        assert.equal(mounts.length, 1, path + " should mount the router");
    }
});
