import { expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { publishedSkills } from "../src/lib/published-production-assets";
import { nativeProductionRecords } from "../src/lib/production-project-registry";
import { productionWorkflows } from "../src/lib/production-workflows";

test("108 张专属主题封面完整、一对一、与入口真实引用一致", () => {
    const root = resolve(import.meta.dir, "../public");
    const manifest = JSON.parse(readFileSync(resolve(root, "production-library/editorial-covers/manifest.json"), "utf8"));
    expect(manifest.version).toBe(1);
    expect(manifest.entries).toHaveLength(108);
    expect(new Set(manifest.entries.map((entry: { id: string }) => entry.id)).size).toBe(108);
    expect(new Set(manifest.entries.map((entry: { sha256: string }) => entry.sha256)).size).toBe(108);
    const counts: Record<string, number> = {};
    for (const entry of manifest.entries) {
        counts[entry.kind] = (counts[entry.kind] || 0) + 1;
        expect(entry.cover).toBe(`/production-library/editorial-covers/${entry.id}.webp`);
        expect(entry.purpose).toBe("original-thematic-cover-not-generated-video");
        const file = resolve(root, entry.cover.slice(1));
        expect(existsSync(file)).toBe(true);
        expect(createHash("sha256").update(readFileSync(file)).digest("hex")).toBe(entry.sha256);
        const reference = entry.kind === "skill" ? publishedSkills[entry.id]?.cover
            : entry.kind === "template" ? nativeProductionRecords.find(record => record.item.id === entry.id)?.item.cover
            : productionWorkflows.find(workflow => `workflow-${workflow.id}` === entry.id)?.image;
        expect(reference).toBe(entry.cover);
    }
    expect(counts).toEqual({ skill: 72, template: 30, workflow: 6 });
});
