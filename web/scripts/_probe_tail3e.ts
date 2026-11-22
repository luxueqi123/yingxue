import { readFileSync } from "node:fs";
import { loadProductionCaseProject } from "../src/services/production-case-project.ts";
import { buildNodeGenerationContext } from "../src/components/canvas/canvas-node-generation.ts";
import { compileCanvasGenerationPrompt } from "../src/lib/canvas/canvas-generation-prompt.ts";
const support = JSON.parse(readFileSync(new URL("../../.local/cache/native-cases-r51/support.json", import.meta.url), "utf8"));
const orig = globalThis.fetch;
globalThis.fetch = (async (url: string) => new Response(readFileSync(new URL(`../../.local/cache/native-cases-r51/projects/${String(url).split("/").pop()}`, import.meta.url)))) as typeof fetch;
try {
  for (const entry of support) {
    let loaded: any;
    try { loaded = await loadProductionCaseProject(entry.id); } catch (e) { console.log("LOAD-FAIL", entry.id, (e as Error).message); continue; }
    for (const node of loaded.nodes) {
      if (!node.metadata?.ltvReferencePlan) continue;
      const prompt = compileCanvasGenerationPrompt(node.metadata?.composerContent || node.metadata?.prompt || "", node.type as any, node.metadata);
      try { buildNodeGenerationContext(node.id, loaded.nodes, loaded.connections, prompt, []); }
      catch (e) {
        const m: any = node.metadata || {};
        console.log("FAIL case=", entry.id, "node=", node.id, "type=", node.type, "title=", JSON.stringify(node.title));
        console.log("   status=", JSON.stringify(m.status), "content=", Boolean(m.content), "model=", JSON.stringify(m.model));
        console.log("   msg=", (e as Error).message);
        const ins = loaded.connections.filter((c: any) => c.toNodeId === node.id).map((c: any) => c.fromNodeId);
        console.log("   upstream=", JSON.stringify(ins));
        for (const u of ins) { const un: any = loaded.nodes.find((x:any)=>x.id===u); console.log("      -", u, "type=", un?.type, "status=", JSON.stringify(un?.metadata?.status), "content=", Boolean(un?.metadata?.content), "model=", JSON.stringify(un?.metadata?.model), "title=", JSON.stringify(un?.title)); }
      }
    }
  }
} finally { globalThis.fetch = orig; }
