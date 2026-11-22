import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { createSkillRuntime } from "../src/services/skill-runtime.ts";
const wt = process.argv[2];
const seed = JSON.parse(readFileSync(`${wt}/backend/internal/skills/seed/production-skills.json`, "utf8").replace(/^\uFEFF/, ""));
const chain = JSON.parse(readFileSync(`${wt}/web/src/lib/production-chain-support.json`, "utf8"));
const hash = (t: string) => createHash("sha256").update(t).digest("hex");
const seedMap = new Map(seed.map((s: any) => [s.skill_id, s]));
let ok = 0, fail = 0, requiredMissing = 0, neverRead = 0;
const omittedReport: string[] = [];
for (const item of chain) {
    const s: any = seedMap.get(item.id)!;
    const files = new Map<string, string>([["SKILL.md", s.instruction], ...(s.files || []).map((f: any) => [f.path, f.content])]);
    const manifest = [...files].map(([path, content]) => ({ path, kind: "markdown", mimeType: "text/plain", size: (content as string).length, sha256: hash(content as string) }));
    const reads: string[] = [];
    const runtime = createSkillRuntime({
        getFile: async (_i: string, path: string) => { reads.push(path); return { file: { file: manifest.find(f => f.path === path)!, content: files.get(path)!, binary: false } }; },
        listFiles: async () => ({ files: manifest }),
        searchFiles: async () => ({ results: [] }),
        getBundle: async () => { throw new Error("x"); },
    } as any);
    const skill = { skillId: s.skill_id, skillName: s.skill_name, description: s.description, versionId: "v", version: "p", isAdded: true, fileCount: manifest.length, tag: s.tag, sourceType: "zip" } as any;
    try {
        const r: any = await runtime.prepare({ profile: "canvas", prompt: `${s.skill_name}`, skills: [skill], selectedSkillIds: [s.skill_id] } as any);
        ok++;
        const block = /<skill-reference-only>([\s\S]*?)<\/skill-reference-only>/.exec(r.prompt);
        const omitted = block ? [...block[1].matchAll(/^- (.+)$/gmu)].map(m => m[1]) : [];
        if (omitted.length) omittedReport.push(`${s.skill_id} ${s.skill_name}: 内联 ${manifest.length - omitted.length}/${manifest.length}，列出 ${omitted.length} 个查阅型文件`);
        // required files that were read must be inlined verbatim
        for (const p of reads) {
            const content = files.get(p)!;
            const isOmitted = omitted.includes(p);
            const inlined = r.prompt.includes(content);
            if (isOmitted && !inlined) continue;          // declared as reference-only: acceptable
            if (!inlined) { requiredMissing++; console.log("MISSING-INLINE", s.skill_id, p); }
        }
        const inlineCount = manifest.filter(f => r.prompt.includes(files.get(f.path)!)).length;
        if (inlineCount === 0) { neverRead++; console.log("NOTHING-INLINED", s.skill_id); }
    } catch (e) { fail++; console.log("FAIL", s.skill_id, s.skill_name, "|", String((e as Error).message).slice(0, 50)); }
}
console.log(`\npublished-37: ok=${ok} fail=${fail} silentLoss=${requiredMissing} emptyContext=${neverRead}`);
console.log("--- omitted (查阅型参考未内联) ---");
for (const line of omittedReport) console.log("  " + line);
