import { afterEach, beforeEach, expect, test } from "bun:test";

import { apiClient } from "@/services/api/request";
import { addSkill, invalidateAddedSkillsCache, likeSkill, listAddedSkills, listSkillPickerPage, listSkills, removeSkill, unlikeSkill, type Skill } from "@/services/api/skills";

test("the chooser asks for one server page even when more catalog pages exist", async () => {
    const original = apiClient.request;
    const reads: URLSearchParams[] = [];
    apiClient.request = (async (config) => {
        reads.push(new URLSearchParams(config.url?.split("?")[1]));
        return { data: { code: 0, data: {
            skills: [{ skillId: "upstream-example", skillName: "分镜" }],
            totalCount: 685, page: 2, pageSize: 24, hasMore: true, categories: [],
        } } };
    }) as typeof original;
    try {
        const result = await listSkillPickerPage({ scope: "favorites", search: "分镜", page: 2 });
        expect(reads.map(params => Object.fromEntries(params))).toEqual([{ scope: "favorites", search: "分镜", page: "2", pageSize: "24" }]);
        expect(result.skills.map(skill => skill.skillId)).toEqual(["upstream-example"]);
        expect(result.hasMore).toBe(true);
    } finally {
        apiClient.request = original;
    }
});

test("cached skill library preserves category and uncategorized filters", async () => {
    const original = apiClient.request;
    const base = { description: "", createdAt: "2026-09-27", updatedAt: "2026-09-27", addedCount: 0 };
    const skills = [
        { ...base, skillId: "native-a", skillName: "A", libraryCategoryId: "cat-a" },
        { ...base, skillId: "native-b", skillName: "B", libraryCategoryId: "cat-b" },
        { ...base, skillId: "native-c", skillName: "C" },
    ] as Skill[];
    let reads = 0;
    apiClient.request = (async (config: { method?: string }) => {
        if (config.method?.toLowerCase() === "get") reads += 1;
        return { data: { code: 0, data: { skills, totalCount: skills.length, categories: [] } } };
    }) as typeof original;
    try {
        await addSkill("native-a");
        expect((await listSkills({ scope: "mine", libraryCategoryId: "cat-a" })).skills.map(s => s.skillId)).toEqual(["native-a"]);
        expect((await listSkills({ scope: "mine", libraryUncategorized: true })).skills.map(s => s.skillId)).toEqual(["native-c"]);
        expect((await listSkills({ scope: "mine" })).totalCount).toBe(3);
        expect(reads).toBe(1);
        await expect(listSkills({ libraryCategoryId: "cat-a" })).rejects.toThrow();
        await expect(listSkills({ scope: "mine", libraryCategoryId: "cat-a", libraryUncategorized: true })).rejects.toThrow();
    } finally {
        await addSkill("native-a");
        apiClient.request = original;
    }
});

test("add, remove and favorite writes invalidate the corresponding scoped lists", async () => {
    const original = apiClient.request;
    let added = false;
    let liked = false;
    const skill = { skillId: "native-live", skillName: "Live", tag: "drama", addedCount: 1, createdAt: "2026-11-08", updatedAt: "2026-11-08" };
    apiClient.request = (async (config) => {
        const url = config.url || "";
        const writing = config.method === "post" || config.method === "delete";
        if (writing && url.endsWith("/add")) added = config.method === "post";
        if (writing && url.endsWith("/like")) liked = config.method === "post";
        const scope = new URLSearchParams(url.split("?")[1]).get("scope");
        const skills = scope === "mine" && !added || scope === "favorites" && !liked ? [] : [{ ...skill, isAdded: added, isLike: liked }];
        return { data: { code: 0, data: writing ? { skill: skills[0] } : { skills, totalCount: skills.length, categories: [] }, msg: "ok" } };
    }) as typeof original;
    invalidateAddedSkillsCache();
    try {
        expect((await listSkills({ scope: "mine" })).totalCount).toBe(0);
        expect((await listSkills({ scope: "favorites" })).totalCount).toBe(0);
        await addSkill(skill.skillId);
        expect((await listSkills({ scope: "mine" })).totalCount).toBe(1);
        await likeSkill(skill.skillId);
        expect((await listSkills({ scope: "favorites" })).totalCount).toBe(1);
        expect((await listSkills()).skills[0].isLike).toBe(true);
        await unlikeSkill(skill.skillId);
        expect((await listSkills({ scope: "favorites" })).totalCount).toBe(0);
        expect((await listSkills()).skills[0].isLike).toBe(false);
        await removeSkill(skill.skillId);
        expect((await listSkills({ scope: "mine" })).totalCount).toBe(0);
    } finally {
        invalidateAddedSkillsCache();
        apiClient.request = original;
    }
});

test("added Skills retries a transient backend proxy failure", async () => {
    const original = apiClient.request;
    let attempts = 0;
    apiClient.request = (async () => {
        attempts += 1;
        if (attempts === 1) {
            throw {
                isAxiosError: true,
                message: "Request failed with status code 502",
                response: { status: 502, data: "Bad Gateway", headers: {} },
            };
        }
        return { data: { code: 0, data: { skills: [] }, msg: "ok" }, status: 200, headers: {} };
    }) as typeof apiClient.request;

    try {
        await expect(listAddedSkills()).resolves.toEqual({ skills: [] });
        expect(attempts).toBe(2);
    } finally {
        apiClient.request = original;
    }
});

test("marketplace categories count the full admitted scope before search and pagination", async () => {
    const original = apiClient.request;
    apiClient.request = (async () => ({ data: { code: 0, data: {
        skills: [
            { skillId: "native-a", skillName: "A", tag: "drama", addedCount: 2 },
            { skillId: "native-b", skillName: "B", tag: "drama", addedCount: 1 },
            { skillId: "native-c", skillName: "C", tag: "ecommerce", addedCount: 0 },
        ], totalCount: 3, categories: [{ value: "drama", label: "影视" }, { value: "ecommerce", label: "电商" }],
    } } })) as typeof original;
    try {
        await addSkill("native-a");
        const result = await listSkills({ scope: "public", search: "A", pageSize: 1 });
        expect(result.skills.map(skill => skill.skillId)).toEqual(["native-a"]);
        expect(result.categories.map(category => category.count)).toEqual([2, 1]);
    } finally {
        await addSkill("native-a");
        apiClient.request = original;
    }
});

test("platform curation filters reach every server page and have separate cache entries", async () => {
    const original = apiClient.request;
    const reads: URLSearchParams[] = [];
    apiClient.request = (async (config: { method?: string; url?: string }) => {
        if (config.method?.toLowerCase() !== "get") return { data: { code: 0, data: {} } };
        const params = new URLSearchParams(config.url?.split("?")[1]);
        reads.push(params);
        const root = params.get("platformRootId");
        return { data: { code: 0, data: { skills: [{ skillId: `native-${root}-${params.get("page")}`, skillName: "A", tag: "drama", addedCount: 0 }], totalCount: root === "root-a" ? 81 : 1, categories: [] } } };
    }) as typeof original;
    try {
        await addSkill("native-a");
        const first = await listSkills({ scope: "public", platformRootId: "root-a", platformCategoryId: "category-a" });
        expect(first.skills.map(skill => skill.skillId)).toEqual(["native-root-a-1", "native-root-a-2"]);
        const second = await listSkills({ scope: "public", platformRootId: "root-b", platformUncategorized: true });
        expect(second.skills.map(skill => skill.skillId)).toEqual(["native-root-b-1"]);
        expect(reads.map(params => [params.get("platformRootId"), params.get("platformCategoryId"), params.get("platformUncategorized"), params.get("page")])).toEqual([
            ["root-a", "category-a", null, "1"],
            ["root-a", "category-a", null, "2"],
            ["root-b", null, "true", "1"],
        ]);
    } finally {
        await addSkill("native-a");
        apiClient.request = original;
    }
});

test("a pending skills response cannot replace the cache after installation", async () => {
    const original = apiClient.request;
    let resolveStale: ((value: unknown) => void) | undefined;
    const staleResponse = new Promise((resolve) => {
        resolveStale = resolve;
    });
    let reads = 0;
    const envelope = (skills: unknown[]) => ({ data: { code: 0, data: { skills }, msg: "ok" }, status: 200, headers: {} });
    apiClient.request = (async (config) => {
        if (config.method === "post") return envelope([]);
        reads += 1;
        return reads === 1 ? staleResponse : envelope([{ skillId: "preset", isAdded: true }]);
    }) as typeof apiClient.request;

    try {
        await addSkill("preset"); // Invalidate a cache left by another reader.
        const pending = listAddedSkills();
        await addSkill("preset");
        const fresh = await listAddedSkills();
        resolveStale?.(envelope([]));
        await pending;
        expect(fresh.skills).toEqual([{ skillId: "preset", isAdded: true }]);
        expect((await listAddedSkills()).skills).toEqual(fresh.skills);
        expect(reads).toBe(2);
    } finally {
        resolveStale?.(envelope([]));
        await addSkill("preset"); // Clear fixture cache before restoring the real client.
        apiClient.request = original;
    }
});

import { useUserStore } from "@/stores/use-user-store";
const skillUser = { id: "skill-user", username: "member", displayName: "Member", role: "user" as const, status: "active" as const };
beforeEach(() => useUserStore.setState({ user: skillUser, hydrated: true }));
afterEach(() => useUserStore.setState({ user: null, hydrated: false }));
