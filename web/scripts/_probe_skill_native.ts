
// 本地 Agent 原生整包链路：真实 base64 bundle 进出，逐文件字节核对
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { createSkillRuntime } from "../src/services/skill-runtime.ts";
const wt = process.argv[2] as string;
const seed = JSON.parse(readFileSync(`${wt}/backend/internal/skills/seed/production-skills.json`, "utf8").replace(/^\uFEFF/, ""));
const chain = JSON.parse(readFileSync(`${wt}/web/src/lib/production-chain-support.json`, "utf8"));
const reviewed = JSON.parse(readFileSync(`${wt}/.local/cache/reviewed-skills.json`, "utf8").replace(/^\uFEFF/, ""));
const aliases = new Map<string, Record<string, string>>(reviewed.map((r: any) => [r.id, r.aliases || {}]));
const hash = (t: string) => createHash("sha256").update(t).digest("hex");
const seedMap = new Map<string, any>(seed.map((s: any) => [s.skill_id, s]));
let ok = 0, fail = 0, byteMismatch = 0, fileCount = 0;
for (const item of chain) {
  const s: any = seedMap.get(item.id)!;
  const files = new Map<string, string>([["SKILL.md", s.instruction], ...(s.files || []).map((f: any) => [f.path, f.content])]);
  for (const [a, src] of Object.entries(aliases.get(item.id) || {})) if (files.has(src)) files.set(a, files.get(src)!);
  const manifest = [...files].map(([path, content]) => ({ path, kind: "markdown", mimeType: "text/plain", size: content.length, contentBase64: Buffer.from(content, "utf8").toString("base64") }));
  const bundle = { skillId: s.skill_id, versionId: hash(s.instruction), version: "probe", files: manifest, contentHash: hash([...files].map(([p, c]) => p + c).join("")) };
  const runtime = createSkillRuntime({
    getFile: async () => { throw new Error("linked path must not be used for localAgent"); },
    listFiles: async () => ({ files: manifest.map(f => ({ path: f.path, kind: f.kind, mimeType: f.mimeType, size: f.size })) as any }),
    searchFiles: async () => ({ results: [] }),
    getBundle: async () => ({ bundle }),
  } as any);
  const skill = { skillId: s.skill_id, skillName: s.skill_name, description: s.description, versionId: bundle.versionId, version: "p", isAdded: true, fileCount: manifest.length, tag: s.tag, sourceType: "zip" } as any;
  try {
    const r: any = await runtime.prepare({ profile: "localAgent", prompt: `${s.skill_name}`, skills: [skill], selectedSkillIds: [s.skill_id] } as any);
    if (r.delivery !== "native-package") { fail++; console.log("DELIVERY", s.skill_id, r.delivery); continue; }
    const pkg = r.skills[0];
    if (pkg.files.length !== manifest.length) { fail++; console.log("FILECOUNT", s.skill_id, pkg.files.length, manifest.length); continue; }
    let bad = 0;
    for (const f of pkg.files) {
      const expected = files.get(f.path);
      if (expected === undefined) { bad++; console.log("EXTRA", s.skill_id, f.path); continue; }
      const decoded = Buffer.from(f.contentBase64, "base64").toString("utf8");
      if (decoded !== expected) { bad++; console.log("BYTE-DIFF", s.skill_id, f.path, decoded.length, expected.length); }
      fileCount++;
    }
    if (bad) { byteMismatch += bad; fail++; } else ok++;
  } catch (e) { fail++; console.log("FAIL", s.skill_id, s.skill_name, String((e as Error).message).slice(0, 60)); }
}
console.log(`localAgent native-package: ok=${ok} fail=${fail} byteMismatch=${byteMismatch} filesChecked=${fileCount}`);
