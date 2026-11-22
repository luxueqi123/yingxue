import { readFileSync } from "node:fs";
import { loadProductionCaseProject } from "../src/services/production-case-project";
import { buildNodeGenerationContext } from "../src/components/canvas/canvas-node-generation";
import { compileCanvasGenerationPrompt } from "../src/lib/canvas/canvas-generation-prompt";

const support = JSON.parse(readFileSync(new URL("../../.local/cache/native-cases-r51/support.json", import.meta.url), "utf8"));
const originalFetch = globalThis.fetch;
globalThis.fetch = (async (url: string) => {
    const id = String(url).split("/").pop();
    return new Response(readFileSync(new URL(`../../.local/cache/native-cases-r51/projects/${id}`, import.meta.url)));
}) as typeof fetch;
let ok = 0, bad = 0, nodes = 0, failedLoad = 0;
try {
    for (const entry of support) {
        let loaded;
        try { loaded = await loadProductionCaseProject(entry.id); }
        catch (e) { failedLoad++; console.log("LOAD-FAIL", entry.id, (e as Error).message.slice(0, 30)); continue; }
        for (const node of loaded.nodes) {
            if (!node.metadata?.ltvReferencePlan) continue;
            nodes++;
            const prompt = compileCanvasGenerationPrompt(node.metadata?.composerContent || node.metadata?.prompt || "", node.type as any, node.metadata);
            try { buildNodeGenerationContext(node.id, loaded.nodes, loaded.connections, prompt, []); ok++; }
            catch (e) { bad++; console.log("FAIL", entry.id.slice(5, 13), node.id.slice(0, 10), (e as Error).message.slice(0, 26)); }
        }
    }
} finally { globalThis.fetch = originalFetch; }
console.log("cases", support.length, "loadFail", failedLoad, "plan nodes", nodes, "ok", ok, "fail", bad);
