import { expect, test } from "bun:test";
import { runInNewContext } from "node:vm";
import { compactCaseSupportModule, caseSupportDataPlugin } from "../vite-plugins/case-support-data";
import { mkdir, mkdtemp, writeFile, rm } from "node:fs/promises";
import { resolve } from "node:path";
import { createServer } from "vite";

function valueOf(code: string) {
    return runInNewContext(code.replace(/^export default /, ""));
}

test("case support delivery removes formatting without changing project values", async () => {
    const projects = Array.from({ length: 8 }, (_, index) => ({
        id: `case-${index}`, generationNodeCount: index + 1,
        referencePlans: [{ prompt: "保留字符串里的  空格、换行\n和引号\"", nodeId: `node-${index}` }],
        source: { author: "保留作者", bytes: 123, url: "https://source.invalid/film.mp4" },
    }));
    const source = JSON.stringify(projects, null, 16);
    const module = compactCaseSupportModule(source);
    expect(module.code.length).toBeLessThan(source.length / 2);
    expect(await valueOf(module.code)).toEqual(projects);
    expect(module.map.sources).toEqual([]);
    expect(module.map.mappings).toBe("");
});

test("case support JSON preserves numeric spelling and prototype-named data", async () => {
    const module = compactCaseSupportModule('[ {"negativeZero":-0,"large":9007199254740993,"__proto__":{"retained":true},"text":"  片名  "} ]');
    const data = await valueOf(module.code);
    expect(Object.is(data[0].negativeZero, -0)).toBe(true);
    expect(Object.hasOwn(data[0], "__proto__")).toBe(true);
    expect(data[0].__proto__).toEqual({ retained: true });
    expect(data[0].text).toBe("  片名  ");
    expect(module.code).toContain("9007199254740993");
    expect(module.code).toContain("-0");
});

test("invalid case support JSON fails before delivery", () => {
    expect(() => compactCaseSupportModule('[{"id":}]')).toThrow(SyntaxError);
});

test("gallery admission delivers only identifiers and generation counts", () => {
    const entries = [
        { id: "case-workflow", generationNodeCount: 3, referencePlans: [{ prompt: "large workflow" }] },
        { id: "case-assets-only", generationNodeCount: 0, source: { author: "source" } },
    ];
    expect(valueOf(compactCaseSupportModule(JSON.stringify(entries), true).code)).toEqual([
        { id: "case-workflow", generationNodeCount: 3 },
        { id: "case-assets-only", generationNodeCount: 0 },
    ]);
});

test("running Vite serves newly admitted cases after the registry changes", async () => {
    const cache = resolve(import.meta.dir, "../../.local/cache");
    await mkdir(cache, { recursive: true });
    const fixture = await mkdtemp(resolve(cache, "case-support-hot-update-"));
    const source = resolve(fixture, "src/lib/production-case-support.json");
    await mkdir(resolve(fixture, "src/lib"), { recursive: true });
    await writeFile(source, '[{"id":"case-existing"}]');
    const server = await createServer({ root: fixture, configFile: false,
        plugins: [caseSupportDataPlugin(fixture)], logLevel: "silent",
        optimizeDeps: { noDiscovery: true, include: [] },
        server: { middlewareMode: true },
    });
    try {
        const url = "/src/lib/production-case-support.json";
        expect(await valueOf((await server.transformRequest(url))!.code)).toEqual([{ id: "case-existing" }]);
        // Let the real watcher establish its initial file state before the admission.
        await new Promise(resolve => setTimeout(resolve, 150));
        await writeFile(source, '[{"id":"case-existing"},{"id":"case-admitted"}]');
        let current: unknown;
        const deadline = Date.now() + 3000;
        do {
            await new Promise(resolve => setTimeout(resolve, 50));
            current = await valueOf((await server.transformRequest(url))!.code);
            if (JSON.stringify(current).includes("case-admitted")) break;
        } while (Date.now() < deadline);
        expect(current).toEqual([{ id: "case-existing" }, { id: "case-admitted" }]);
    } finally {
        await server.close();
        if (!fixture.startsWith(cache + "/") && !fixture.startsWith(cache + "\\")) throw new Error("Unexpected fixture path");
        await rm(fixture, { recursive: true });
    }
}, 15000);
