
// 网站入口不得出现任何被舍弃案例；保留项必须逐条可见
import { readFileSync, existsSync } from "node:fs";
const base = new URL("../public/", import.meta.url);
const orig = globalThis.fetch;
globalThis.fetch = (async (url: string) => {
  const file = new URL("." + String(url), base);
  if (!existsSync(file)) return new Response("nf", { status: 404 });
  return new Response(readFileSync(file), { status: 200 });
}) as typeof fetch;
try {
  const { loadProductionCatalog } = await import("../src/services/production-library.ts");
  const catalog = await loadProductionCatalog();
  const shownCases = new Set(catalog.items.filter(i => i.kind === "case").map(i => i.id));
  const decisions = JSON.parse(readFileSync(new URL("../../.local/cache/native-cases-r51/decisions.json", import.meta.url), "utf8"));
  const discarded = (decisions.discardedCases || []).map((d: any) => d.id);
  const kept = (decisions.keptCaseIds || decisions.kept || []);
  console.log("site shown cases:", shownCases.size);
  console.log("decisions.discardedCases:", discarded.length, "| kept list:", Array.isArray(kept) ? kept.length : typeof kept);
  const leaked = discarded.filter((id: string) => shownCases.has(id));
  console.log("discarded leaked into site:", leaked.length, leaked.slice(0, 3));
  const support = JSON.parse(readFileSync(new URL("../src/lib/production-case-support.json", import.meta.url), "utf8"));
  const missing = support.map((s: any) => s.id).filter((id: string) => !shownCases.has(id));
  console.log("published but not shown:", missing.length, missing.slice(0, 3));
  console.log("shown but not published:", [...shownCases].filter(id => !support.some((s: any) => s.id === id)).length);
} finally { globalThis.fetch = orig; }
