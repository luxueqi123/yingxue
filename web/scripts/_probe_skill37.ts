import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { createSkillRuntime } from "../src/services/skill-runtime.ts";

const wt = process.argv[2];
const seed = JSON.parse(readFileSync(`${wt}/backend/internal/skills/seed/production-skills.json`, "utf8").replace(/^\uFEFF/, ""));
const chain = JSON.parse(readFileSync(`${wt}/web/src/lib/production-chain-support.json`, "utf8"));
const reviewed = JSON.parse(readFileSync(`${wt}/.local/cache/reviewed-skills.json`, "utf8").replace(/^\uFEFF/, ""));
const aliases = new Map(reviewed.map((r: any) => [r.id, r.aliases || {}]));
const hash = (t: string) => createHash("sha256").update(t).digest("hex");
const seedMap = new Map(seed.map((s: any) => [s.skill_id, s]));

let linkedOk = 0, bigBreak = 0, missingRef = 0, readFail = 0, searchOk = 0, noSearch = 0;
for (const item of chain) {
    const s: any = seedMap.get(item.id);
    if (!s) { console.log("MISSING SEED", item.id); continue; }
    const files = new Map<string, string>([["SKILL.md", s.instruction], ...(s.files || []).map((f: any) => [f.path, f.content])]);
    for (const [a, src] of Object.entries(aliases.get(item.id) as any || {})) if (files.has(src as string)) files.set(a, files.get(src as string)!);
    const manifest = [...files].map(([path, content]) => ({ path, kind: "markdown", mimeType: "text/plain", size: (content as string).length, sha256: hash(content as string) }));
    const runtime = createSkillRuntime({
        getFile: async (_id: string, path: string) => {
            if (!files.has(path)) throw new Error(`Missing package file: ${path}`);
            return { file: { file: manifest.find(f => f.path === path)!, content: files.get(path)!, binary: false } };
        },
        listFiles: async () => ({ files: manifest }),
        searchFiles: async (_id: string, q: string) => ({ skillId: _id, query: q, results: [...files].filter(([, c]) => (c as string).includes(q)).map(([p]) => ({ path: p, line: 1, snippet: q })) }),
        getBundle: async () => { throw new Error("Unexpected transport"); },
    } as any);
    const skill = { skillId: s.skill_id, skillName: s.skill_name, description: s.description, versionId: hash(s.instruction), version: "probe", isAdded: true, fileCount: manifest.length, tag: s.tag, sourceType: "zip" } as any;
    const total = [...files.values()].reduce((n, v) => n + (v as string).length, 0);
    let linked = "ok";
    try { await runtime.prepare({ profile: "canvas", prompt: `${s.skill_name} ${s.description}`, skills: [skill], selectedSkillIds: [skill.skillId] } as any); linkedOk++; }
    catch (e) { linked = "blocked"; bigBreak++; console.log("LINKED-BLOCKED", s.skill_id, s.skill_name, "chars", total, "|", String((e as Error).message).slice(0, 40)); }
    // progressive chain
    const list = await runtime.executeAgentTool("onlineAgent", "canvas_list_skill_files", { skillId: s.skill_id }, [skill]);
    const entry = await runtime.executeAgentTool("onlineAgent", "canvas_get_skill", { skillId: s.skill_id }, [skill]);
    const refs = [...new Set((s.instruction.match(/(?:\.{1,2}\/)?[\w\u4e00-\u9fff./@()\-]+\.(?:mdx?|txt|json|ya?ml|csv)/gu) || []))] as string[];
    const realRefs = refs.filter(r => files.has(r) || files.has(`references/${r}`) || files.has(r.replace(/^\.\//, "")));
    for (const r of realRefs) {
        const res = await runtime.executeAgentTool("onlineAgent", "canvas_read_skill_file", { skillId: s.skill_id, path: files.has(r) ? r : (files.has(`references/${r}`) ? `references/${r}` : r.replace(/^\.\//, "")) }, [skill]);
        if (!(res as any).ok) { readFail++; console.log("READ-FAIL", s.skill_id, r, (res as any).message); }
    }
    const srch = await runtime.executeAgentTool("onlineAgent", "canvas_search_skill_files", { skillId: s.skill_id, query: "提示词" }, [skill]);
    if ((srch as any).ok) searchOk++; else noSearch++;
}
console.log(`published-37: linkedOk=${linkedOk} blocked=${bigBreak} readFail=${readFail} searchOk=${searchOk}`);
