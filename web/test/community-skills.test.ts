import { expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import registry from "../src/lib/community-skill-support.json";
import { publishedSkills } from "../src/lib/published-production-assets";
import { isVerifiedProductionSkill } from "../src/lib/verified-production-assets";

const root = resolve(import.meta.dir, "../..");
const read = (path: string) => JSON.parse(readFileSync(resolve(root, path), "utf8"));

test("community skills retain body hashes and share catalog, definition and backend identities", () => {
    const seeds = read("backend/internal/skills/seed/production-skills.json");
    const catalog = read("web/public/production-library/published-catalog.json");
    expect(registry).toHaveLength(16);
    expect(new Set(registry.map(item => item.id)).size).toBe(16);
    for (const item of registry) {
        const definition = read(`web/public/production-library/definitions/${item.id}.json`);
        const seed = seeds.find((row: {skill_id: string}) => row.skill_id === item.id);
        const entry = catalog.items.find((row: {id: string}) => row.id === item.id);
        expect(createHash("sha256").update(definition.body).digest("hex")).toBe(item.bodySha256);
        expect(seed.instruction).toBe(definition.body);
        expect(seed.effective_user.name).toBe(entry.author);
        expect(entry.author).toBe(item.author);
        expect(seed.effective_user.uid).toBe("production-library");
        expect(definition.files).toEqual([]);
        expect(definition.body).not.toMatch(/(?:references|scripts|assets)\//);
        expect(isVerifiedProductionSkill(item.id)).toBe(true);
        expect(publishedSkills[item.id].cover).toBe("");
        expect(item.generationVerified).toBe(false);
    }
    expect(registry.some(item => /[A-Za-z]/.test(item.author))).toBe(true);
    expect(registry.some(item => /[\u4e00-\u9fff]/.test(item.author))).toBe(true);
});
