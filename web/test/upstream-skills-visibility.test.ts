import { expect, spyOn, test } from "bun:test";
import { http } from "../src/services/api/request";
import { listAddedSkills, listSkills, type Skill } from "../src/services/api/skills";
import { useUserStore } from "../src/stores/use-user-store";
import { readdirSync, readFileSync } from "node:fs";

const builtinRoot = new URL("../../backend/builtin/", import.meta.url);
const seeds = readdirSync(builtinRoot, { withFileTypes: true }).filter(entry => entry.isDirectory()).map(entry => {
    const markdown = readFileSync(new URL(`${entry.name}/SKILL.md`, builtinRoot), "utf8");
    const skillId = markdown.match(/^  skillId: "([^"]+)"/m)?.[1];
    if (!skillId) throw new Error(`Missing stable skill ID: ${entry.name}`);
    return { skill_id: skillId, skill_name: entry.name, description: "builtin" };
});

test("upstream skills remain visible without a LTV publishing record, while unsupported imports remain hidden", async () => {
    const { user, hydrated } = useUserStore.getState();
    useUserStore.setState({ user: { id: "skills-member", username: "skills-member", displayName: "Member", role: "user", status: "active" }, hydrated: true });
    const upstream = seeds.map(seed => ({ skillId: seed.skill_id, skillName: seed.skill_name, description: seed.description, createdAt: "2026-09-22", updatedAt: "2026-09-22", addedCount: 0, isOwner: false }) as Skill);
    const unsupported = { ...upstream[0], skillId: "pl-unadapted-fixture" };
    const owned = { ...unsupported, skillId: "pl-owned-fixture", isOwner: true };
    const skills = [...upstream, unsupported, owned];
    const request = spyOn(http, "get").mockResolvedValue({ skills, totalCount: skills.length, categories: [], hasMore: false });
    try {
        const publicList = await listSkills({ pageSize: 80 });
        expect(publicList.skills.map(skill => skill.skillId).sort()).toEqual(upstream.map(skill => skill.skillId).sort());
        expect(publicList.totalCount).toBe(seeds.length);
        const added = await listAddedSkills();
        expect(added.skills.map(skill => skill.skillId).sort()).toEqual([...upstream, owned].map(skill => skill.skillId).sort());
    } finally {
        request.mockRestore();
        useUserStore.setState({ user, hydrated });
    }
});
