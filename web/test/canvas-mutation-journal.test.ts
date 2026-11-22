import { expect, test } from "bun:test";
import { resolve } from "node:path";

// Run the actual owner and IndexedDB transactions in Edge; no dev server or production API.
test("journal persists across pages, isolates accounts, and CAS protects cross-tab checkpoints", async () => {
    const playwrightPath = resolve(import.meta.dir, "../../canvas-agent/node_modules/playwright-core/index.mjs");
    const { chromium } = await import(playwrightPath);
    const build = await Bun.build({ entrypoints: [resolve(import.meta.dir, "../src/services/canvas-mutation-journal.ts")], target: "browser", format: "esm" });
    if (!build.success) throw new Error(build.logs.join("\n"));
    const bundle = await build.outputs[0]!.text();
    console.info("journal browser: launching Edge");
    const browser = await chromium.launch({ channel: "msedge", headless: true, timeout: 15_000 });
    try {
        const context = await browser.newContext();
        await context.route("**/*", (route: { fulfill: (options: object) => Promise<void> }) => route.fulfill({ status: 200, contentType: "text/html", body: "<!doctype html><title>journal owner test</title>" }));
        const first = await context.newPage();
        const second = await context.newPage();
        const install = async (page: typeof first) => {
            await page.goto("https://canvas-journal.test/", { timeout: 15_000, waitUntil: "domcontentloaded" });
            await page.evaluate(async (source: string) => {
                (globalThis as any).journal = await import(URL.createObjectURL(new Blob([source], { type: "text/javascript" })));
            }, bundle);
        };
        await Promise.all([install(first), install(second)]);
        console.info("journal browser: two pages ready");
        const entry = (id: string, scope: string) => ({ journalId: id, scope, projectId: "canvas", request: { mutationId: id, baseRevision: 1, operations: [{ type: "set_field", field: "title", beforeValue: "old", value: id }] }, prepared: { id: "canvas", nodes: [] }, localPrepared: { id: "canvas", nodes: [] }, createdAt: "2026-10-29T00:00:00Z" });
        await first.evaluate(async (value: object) => (globalThis as any).journal.persistCanvasMutation(value), entry("a-original", "user-a"));
        await second.evaluate(async (value: object) => (globalThis as any).journal.persistCanvasMutation(value), entry("b-original", "user-b"));
        await install(first); // The JS runtime and its pending maps are gone.
        console.info("journal browser: persisted entries reopened");
        const recovered = await first.evaluate(async () => (globalThis as any).journal.readCanvasMutationJournal("user-a"));
        expect(recovered).toHaveLength(1);
        expect(recovered[0].request).toEqual(entry("a-original", "user-a").request);
        expect(await second.evaluate(async () => (await (globalThis as any).journal.readCanvasMutationJournal("user-b")).map((item: any) => item.journalId))).toEqual(["b-original"]);
        const states = await Promise.all([first, second].map((page) => page.evaluate(async () => (await (globalThis as any).journal.readCanvasMutationJournal("user-a"))[0])));
        const results = await Promise.all([first, second].map((page, i) => page.evaluate(async ({ state, i }: any) => {
            state.request = { ...state.request, mutationId: `next-${i}`, baseRevision: 2 };
            try {
                await (globalThis as any).journal.persistCanvasMutation(state);
                return { ok: true, mutationId: state.request.mutationId };
            } catch (error) {
                return { ok: false, error: (error as Error).message };
            }
        }, { state: states[i], i })));
        expect(results.filter((result) => result.ok)).toHaveLength(1);
        expect(results.filter((result) => !result.ok)[0].error).toContain("另一个标签页");
        // A stale tab cannot erase the winning checkpoint with its old version.
        const staleRemoval = await first.evaluate(async (state: object) => {
            try { await (globalThis as any).journal.removeCanvasMutation(state); return "removed"; }
            catch (error) { return (error as Error).message; }
        }, states[0]);
        expect(staleRemoval).toContain("另一个标签页");
        const latest = await second.evaluate(async () => (await (globalThis as any).journal.readCanvasMutationJournal("user-a"))[0]);
        expect(latest.request.mutationId).toBe(results.find((result) => result.ok).mutationId);
        await second.evaluate(async (state: object) => (globalThis as any).journal.removeCanvasMutation(state), latest);
        expect(await first.evaluate(async () => (globalThis as any).journal.readCanvasMutationJournal("user-a"))).toEqual([]);
        expect(await first.evaluate(async () => (globalThis as any).journal.readCanvasMutationJournal("user-b"))).toHaveLength(1);
    } finally {
        await browser.close();
    }
}, 60_000);
