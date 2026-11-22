import { readFileSync } from "node:fs";
import { loadProductionCaseProject } from "../src/services/production-case-project.ts";
const ids = ["case-1710baffb51044eaa5eb07608984b08e","case-4832ea7e6e3b4bfba484a683bf61c3dc","case-e7399bef36c6448c905acd41926d52f1"];
const orig = globalThis.fetch;
globalThis.fetch = (async (url: string) => new Response(readFileSync(new URL(`../public/production-library/case-projects/${String(url).split("/").pop()}`, import.meta.url)))) as typeof fetch;
try {
  for (const id of ids) {
    const p = await loadProductionCaseProject(id);
    console.log("=====", id, "nodes", p.nodes.length, "connections", p.connections.length);
    for (const n of p.nodes) {
      const m: any = n.metadata || {};
      const src = m.ltvSourceNodeId || "";
      if (src === "v-6351gP8Xz8" || src === "i-Uz7kogezHG" || /UfHsGQI0SC|AYEBsk6gWK/.test(src) || /6351gP8Xz8|Uz7kogezHG|UfHsGQI0SC|AYEBsk6gWK/.test(n.id)) {
        console.log(`  HIT node=${n.id} src=${src} type=${n.type} status=${JSON.stringify(m.status)} content=${Boolean(m.content)} model=${JSON.stringify(m.model)} title=${JSON.stringify(n.title)}`);
      }
    }
    const defs = p.nodes.filter((n: any) => String(n.id).startsWith("::"));
    console.log("  synthetic nodes:", defs.map((n:any)=>`${n.id}(${n.type})`).join(", ") || "none");
  }
} finally { globalThis.fetch = orig; }
