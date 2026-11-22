import { readFileSync } from "node:fs";
import { loadProductionCaseProject } from "../src/services/production-case-project.ts";
const cases = ["case-1710baffb51044eaa5eb07608984b08e","case-4832ea7e6e3b4bfba484a683bf61c3dc","case-e7399bef36c6448c905acd41926d52f1"];
const orig = globalThis.fetch;
globalThis.fetch = (async (url: string) => new Response(readFileSync(new URL(`../public/production-library/case-projects/${String(url).split("/").pop()}`, import.meta.url)))) as typeof fetch;
try {
  for (const id of cases) {
    const p: any = await loadProductionCaseProject(id);
    console.log("=====", id);
    for (const n of p.nodes) {
      const m: any = n.metadata || {};
      const isSynthetic = String(n.id).includes("::native-");
      const idle = String(m.status) === "idle" && !m.content;
      if (!isSynthetic && !(idle && m.model)) continue;
      console.log(`  node=${n.id} type=${n.type} title=${JSON.stringify(n.title)} synth=${isSynthetic}`);
      console.log(`     status=${JSON.stringify(m.status)} content=${Boolean(m.content)} model=${JSON.stringify(m.model)}`);
      const pr = m.composerContent ?? m.prompt ?? m.promptTemplate ?? "";
      console.log(`     promptLen=${String(pr).length} prompt=${JSON.stringify(String(pr).slice(0,100))}`);
      console.log(`     action=${JSON.stringify(m.action)} imageList=${JSON.stringify(m.imageList ?? null)} generationType=${JSON.stringify(m.generationType)}`);
    }
  }
} finally { globalThis.fetch = orig; }
