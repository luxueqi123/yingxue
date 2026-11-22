import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";

type CaseEntry = { id: string; kind: string; author?: string };
const load = (name: string): CaseEntry[] => {
    const value = JSON.parse(readFileSync(new URL(`../public/production-library/${name}`, import.meta.url), "utf8"));
    return (value.items || value.entries).filter((item: CaseEntry) => item.kind === "case");
};
test("all case catalog copies use the same nonempty display author for each identity", () => {
    const metadata = load("case-metadata.json");
    const expected = new Map(metadata.map(item => [item.id, item.author]));
    expect(expected.size).toBe(metadata.length);
    expect(metadata.every(item => Boolean(item.author?.trim()))).toBe(true);
    for (const name of ["catalog.json", "published-catalog.json"]) {
        const rows = load(name);
        expect(new Set(rows.map(item => item.id)).size).toBe(expected.size);
        expect(rows.every(item => expected.has(item.id) && expected.get(item.id) === item.author)).toBe(true);
    }
});
test("case authors retain the requested Chinese and English nickname mix", () => {
    const rows = load("published-catalog.json");
    expect(rows.some(item => /[\u4e00-\u9fff]/.test(item.author || ""))).toBe(true);
    expect(rows.some(item => /^[A-Za-z][A-Za-z '\-]+$/.test(item.author || ""))).toBe(true);
});
