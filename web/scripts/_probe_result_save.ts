import { readFileSync } from "node:fs";
import { loadProductionCaseProject } from "../src/services/production-case-project.ts";
const support = JSON.parse(readFileSync(new URL("../../.local/cache/native-cases-r51/support.json", import.meta.url), "utf8"));
const orig = globalThis.fetch;
globalThis.fetch = (async (url: string) => new Response(readFileSync(new URL(`../public/production-library/case-projects/${String(url).split("/").pop()}`, import.meta.url)))) as typeof fetch;
let nodes = 0, withContent = 0, withStorageKey = 0, statusSuccess = 0, statusIdle = 0, other = 0;
const statuses: Record<string, number> = {};
let err = 0;
try {
  for (const entry of support) {
    let p: any;
    try { p = await loadProductionCaseProject(entry.id); } catch { err++; continue; }
    for (const n of p.nodes) {
      if (!n.metadata?.ltvReferencePlan && !String(n.id)) continue;
      const m: any = n.metadata || {};
      if (!["image","video","audio","text"].includes(n.type)) continue;
      if (m.ltvDeferred) { /* synthetic */ }
      nodes++;
      const s = String(m.status ?? "none");
      statuses[s] = (statuses[s] || 0) + 1;
      if (s === "success") statusSuccess++; else if (s === "idle") statusIdle++; else other++;
      if (m.content) withContent++;
      if (m.storageKey) withStorageKey++;
    }
  }
} finally { globalThis.fetch = orig; }
console.log("loadErrors", err, "media-ish nodes", nodes);
console.log("statusSuccess", statusSuccess, "statusIdle", statusIdle, "other", other);
console.log("withContent", withContent, "withStorageKey", withStorageKey);
console.log("statuses", JSON.stringify(statuses));
