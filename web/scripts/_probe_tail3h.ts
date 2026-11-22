import { readFileSync } from "node:fs";
import { loadProductionCaseProject } from "../src/services/production-case-project.ts";
import { buildNodeGenerationContext } from "../src/components/canvas/canvas-node-generation.ts";
import { compileCanvasGenerationPrompt } from "../src/lib/canvas/canvas-generation-prompt.ts";
const support = JSON.parse(readFileSync(new URL("../../.local/cache/native-cases-r51/support.json", import.meta.url), "utf8"));
const orig = globalThis.fetch;
globalThis.fetch = (async (url: string) => new Response(readFileSync(new URL(`../../.local/cache/native-cases-r51/projects/${String(url).split("/").pop()}`, import.meta.url)))) as typeof fetch;
let ok = 0, bad = 0;
try {
  for (const entry of support) {
    const loaded: any = await loadProductionCaseProject(entry.id);
    for (const node of loaded.nodes) {
      if (!node.metadata?.ltvReferencePlan) continue;
      const prompt = compileCanvasGenerationPrompt(node.metadata?.composerContent || node.metadata?.prompt || "", node.type as any, node.metadata);
      try { buildNodeGenerationContext(node.id, loaded.nodes, loaded.connections, prompt, []); ok++; }
      catch (e) {
        bad++;
        const ins = loaded.connections.filter((c:any)=>c.toNodeId===node.id).map((c:any)=>c.fromNodeId);
        console.log(`--- FAIL ${entry.id} blocked=${node.id} title=${JSON.stringify(node.title)}`);
        for (const u of ins) {
          const un: any = loaded.nodes.find((x:any)=>x.id===u); const um: any = un?.metadata||{};
          const synthetic = String(u).includes("::native-") || Boolean(um.ltvDeferred) || um.action === "image_resource";
          console.log(`      upstream ${u} type=${un?.type} title=${JSON.stringify(un?.title)}`);
          console.log(`        synthetic=${synthetic} action=${JSON.stringify(um.action ?? null)} status=${JSON.stringify(um.status ?? null)} content=${Boolean(um.content)} model=${JSON.stringify(um.model ?? null)} promptLen=${String(um.composerContent ?? um.prompt ?? "").length}`);
        }
      }
    }
  }
} finally { globalThis.fetch = orig; }
console.log("TOTAL ok", ok, "fail", bad);
