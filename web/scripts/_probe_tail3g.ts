import { readFileSync } from "node:fs";
import { loadProductionCaseProject } from "../src/services/production-case-project.ts";
const want: Record<string,string[]> = {
  "case-1710baffb51044eaa5eb07608984b08e": ["f1mMrso_V5AAaDGkH4T4t"],
  "case-4832ea7e6e3b4bfba484a683bf61c3dc": ["-aQM11SV8LsM9cfMt5kzc"],
  "case-e7399bef36c6448c905acd41926d52f1": ["XAIzC3w_twPzl0nbod2wd"],
};
const orig = globalThis.fetch;
globalThis.fetch = (async (url: string) => new Response(readFileSync(new URL(`../public/production-library/case-projects/${String(url).split("/").pop()}`, import.meta.url)))) as typeof fetch;
try {
  for (const [id, ids] of Object.entries(want)) {
    const p: any = await loadProductionCaseProject(id);
    for (const nid of ids) {
      const n: any = p.nodes.find((x:any)=>x.id===nid);
      if (!n) { console.log(id, nid, "NOT FOUND"); continue; }
      const m: any = n.metadata || {};
      console.log(`===== ${id} / ${nid}`);
      console.log(`  type=${n.type} title=${JSON.stringify(n.title)} status=${JSON.stringify(m.status)} content=${Boolean(m.content)} storageKey=${JSON.stringify(m.storageKey ?? null)}`);
      console.log(`  model=${JSON.stringify(m.model)} promptLen=${String(m.composerContent ?? m.prompt ?? "").length}`);
      console.log(`  prompt=${JSON.stringify(String(m.composerContent ?? m.prompt ?? "").slice(0,120))}`);
      console.log(`  metadataKeys=${Object.keys(m).join(",")}`);
    }
  }
} finally { globalThis.fetch = orig; }
