import { readFileSync } from "node:fs";
import { loadProductionCaseProject } from "../src/services/production-case-project.ts";
const ids = ["case-1710baffb51044eaa5eb07608984b08e","case-4832ea7e6e3b4bfba484a683bf61c3dc","case-e7399bef36c6448c905acd41926d52f1"];
const orig = globalThis.fetch;
globalThis.fetch = (async (url: string) => new Response(readFileSync(new URL(`../public/production-library/case-projects/${String(url).split("/").pop()}`, import.meta.url)))) as typeof fetch;
try {
  for (const id of ids) {
    const p = await loadProductionCaseProject(id);
    console.log("=====", id);
    for (const n of p.nodes) {
      const m: any = n.metadata || {};
      const short = String(n.id).slice(0,10);
      if (["VvsXGfAdKT","UfHsGQI0SC","AYEBsk6gWK"].includes(short)) {
        console.log(`  TARGET node=${n.id} type=${n.type} title=${JSON.stringify(n.title)} status=${JSON.stringify(m.status)} content=${Boolean(m.content)} model=${JSON.stringify(m.model)} prompt=${JSON.stringify(String(m.composerContent??m.prompt??"").slice(0,80))}`);
        const ins = p.connections.filter((c:any)=>c.toNodeId===n.id).map((c:any)=>c.fromNodeId);
        console.log(`     upstream=${JSON.stringify(ins)}`);
        for (const u of ins) { const un:any = p.nodes.find((x:any)=>x.id===u); console.log(`        - ${u} type=${un?.type} status=${JSON.stringify(un?.metadata?.status)} content=${Boolean(un?.metadata?.content)} model=${JSON.stringify(un?.metadata?.model)} prompt=${JSON.stringify(String(un?.metadata?.composerContent??un?.metadata?.prompt??"").slice(0,60))}`); }
      }
    }
  }
} finally { globalThis.fetch = orig; }
