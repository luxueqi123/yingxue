import { expect, test } from "bun:test";
import { realpathSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { resolveConfig } from "vite";

test("drawer and dialog share the same focus-lock registry in the browser bundle", async () => {
    const config = await resolveConfig({ configFile: resolve(import.meta.dir, "../vite.config.ts") }, "build");
    const resolveImport = config.createResolver();
    const require = createRequire(import.meta.url);
    const drawer = realpathSync(require.resolve("@rc-component/drawer/es/hooks/useFocusable.js"));
    const dialog = realpathSync(require.resolve("@rc-component/dialog/es/Dialog/Content/Panel.js"));
    const drawerFocus = await resolveImport("@rc-component/util/es/Dom/focus", drawer);
    const dialogEntry = await resolveImport("@rc-component/util", dialog);
    expect(drawerFocus).toBeTruthy();
    expect(dialogEntry).toBeTruthy();
    const dialogFocus = await resolveImport("./Dom/focus", dialogEntry!);
    expect(realpathSync(drawerFocus!)).toBe(realpathSync(dialogFocus!));
});
