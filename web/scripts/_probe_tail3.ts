import { readFileSync } from "node:fs";
import { loadProductionCaseProject } from "../src/services/production-case-project.ts";
const ids = ["case-1710baffb51044eaa5eb07608984b08e","case-4832ea7e6e3b4bfba484a683bf61c3dc","case-e7399bef36c6448c905acd41926d52f1"];
const orig = globalThis.fetch;
globalThis.fetch = (async (url: string) => new Response(readFileSync(new URL(`../public/production-library/case-projects/${String(url).split("/").pop()}`, import.meta.url)))) as typeof fetch;
try {
  for (const id of ids) {
    const p = await loadProductionCaseProject(id);
    console.log("=====", id, "nodes", p.nodes.length);
    for (const n of p.nodes) {
      const m: any = n.metadata || {};
      const isNative = n.id.startsWith("::native-") || m.ltvSourceNodeId;
      if (!isNative && m.ltvReferencePlan == null) continue;
      console.log(`  node=${n.id} type=${n.type} title=${JSON.stringify(n.title)} status=${m.status ?? "-"} hasContent=${Boolean(m.content)} prompt=${JSON.stringify(String(m.composerContent||m.prompt||"").slice(0,40))} model=${m.model||"-"} deferred=${Boolean(m.ltvDeferred)}`);
    }
  }
} finally { globalThis.fetch = orig; }
