import { expect, test } from "bun:test";
import { resolve } from "node:path";

test("real Edge collaboration layer shares connections and projects live presence", async () => {
    const { chromium } = await import(resolve(import.meta.dir, "../../canvas-agent/node_modules/playwright-core/index.mjs"));
    const built = await Bun.build({ entrypoints: [resolve(import.meta.dir, "fixtures/canvas-collaboration.harness.tsx")], target: "browser", format: "esm", define: { "import.meta.env": "{}", "process.env.NODE_ENV": JSON.stringify("development") } });
    if (!built.success) throw new Error(built.logs.join("\n"));
    const source = await built.outputs.find((item) => item.path.endsWith(".js"))!.text();
    const browser = await chromium.launch({ channel: "msedge", headless: true });
    try {
        const context = await browser.newContext();
        await context.route("**/*", (route: any) => route.fulfill({ status: 200, contentType: "text/html", body: "<!doctype html><title>collaboration owner test</title>" }));
        const page = await context.newPage();
        await page.goto("https://canvas-collaboration.test/");
        const names = await page.evaluate(async (bundle: string) => {
            const owner = await import(URL.createObjectURL(new Blob([bundle], { type: "text/javascript" })));
            return owner.runBrowserCases();
        }, source);
        expect(names).toHaveLength(5);
    } finally { await browser.close(); }
}, 60_000);
