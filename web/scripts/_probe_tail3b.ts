import { readFileSync } from "node:fs";
import { loadProductionCaseProject } from "../src/services/production-case-project.ts";
const targets: Record<string,string[]> = {
  "case-1710baffb51044eaa5eb07608984b08e": ["v-6351gP8Xz8","i-Uz7kogezHG"],
  "case-4832ea7e6e3b4bfba484a683bf61c3dc": ["UfHsGQI0SC"],
  "case-e7399bef36c6448c905acd41926d52f1": ["AYEBsk6gWK"],
};
const orig = globalThis.fetch;
globalThis.fetch = (async (url: string) => new Response(readFileSync(new URL(`../public/production-library/case-projects/${String(url).split("/").pop()}`, import.meta.url)))) as typeof fetch;
try {
  for (const [id, wants] of Object.entries(targets)) {
    const p = await loadProductionCaseProject(id);
    console.log("=====", id);
    for (const w of wants) {
      const n: any = p.nodes.find((x: any) => x.id === w);
      if (!n) { console.log(`  MISSING ${w}`); continue; }
      const m = n.metadata || {};
      console.log(`  ${w} type=${n.type} title=${JSON.stringify(n.title)}`);
      console.log(`     status=${JSON.stringify(m.status)} content=${Boolean(m.content)} model=${JSON.stringify(m.model)}`);
      console.log(`     prompt=${JSON.stringify(String(m.composerContent ?? m.prompt ?? "").slice(0,120))}`);
      const ins = p.connections.filter((c: any) => c.toNodeId === w).map((c: any) => c.fromNodeId);
      console.log(`     upstream=${JSON.stringify(ins)}`);
      for (const u of ins) { const un: any = p.nodes.find((x:any)=>x.id===u); console.log(`        - ${u} type=${un?.type} status=${JSON.stringify(un?.metadata?.status)} content=${Boolean(un?.metadata?.content)} model=${JSON.stringify(un?.metadata?.model)}`); }
    }
  }
} finally { globalThis.fetch = orig; }
