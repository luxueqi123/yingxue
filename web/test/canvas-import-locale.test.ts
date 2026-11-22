import { loadInterfaceLocale as preloadInterfaceLocale } from "../src/lib/interface-locale";
await preloadInterfaceLocale("en-US");

import { expect, test } from "bun:test";
import { interfaceTranslator } from "../src/lib/interface-locale";
import { getLibTVImportReport, readLibTVJSONFile } from "../src/lib/canvas/libtv-import";
import type { LibTVImportResult } from "../src/services/api/libtv";

test("import report translates only UI labels and preserves original warning and node content", () => {
    const result = {
        warnings: [{ id: "source-id", message: "原始警告 {name}" }],
        skippedNodes: [{ id: "node-id", name: "中文节点", reason: "原始原因" }],
        skippedConnections: [{ id: "edge-id", reason: "连线原因" }],
    } as LibTVImportResult;
    const before = JSON.stringify(result);
    const report = getLibTVImportReport(result, interfaceTranslator("en-US"));
    expect(report[0]).toEqual({ key: "warning-0", label: "Warning · source-id", message: "原始警告 {name}" });
    expect(report[1].label).toBe("Skipped node · 中文节点 · node-id");
    expect(report[2].label).toBe("Skipped connection · edge-id");
    expect(JSON.stringify(result)).toBe(before);
    expect(getLibTVImportReport(result)[0].label).toBe("警告 · source-id");
});

test("local JSON validation is translated without accepting unsupported or oversized files", async () => {
    const en = interfaceTranslator("en-US");
    await expect(readLibTVJSONFile({ name: "bad.zip", size: 1, text: async () => "{}" }, en)).rejects.toThrow("ZIP");
    await expect(readLibTVJSONFile({ name: "bad.json", size: 9 * 1024 * 1024, text: async () => "{}" }, en)).rejects.toThrow("8 MiB");
    await expect(readLibTVJSONFile({ name: "bad.json", size: 1, text: async () => "[" }, en)).rejects.toThrow("Invalid JSON");
    await expect(readLibTVJSONFile({ name: "bad.json", size: 2, text: async () => "{}" }, en)).rejects.toThrow("projectMeta");
    const source = JSON.stringify({ projectMeta: { name: "中文原名" }, nodeList: [], connectionList: [] });
    expect(await readLibTVJSONFile({ name: "原工程.json", size: source.length, text: async () => source }, en)).toBe(source);
});
