
// 模拟网站加载：真实调用 loadProductionCatalog，fetch 指向工作区 public 目录
import { readFileSync, existsSync } from "node:fs";
const base = new URL("../public/", import.meta.url);
const orig = globalThis.fetch;
const requests: string[] = [];
globalThis.fetch = (async (url: string, init?: any) => {
  const path = String(url);
  requests.push(path);
  const file = new URL("." + path, base);
  if (!existsSync(file)) return new Response("not found", { status: 404 });
  return new Response(readFileSync(file), { status: 200 });
}) as typeof fetch;
const { loadProductionCatalog } = await import("../src/services/production-library.ts");
try {
  const catalog = await loadProductionCatalog();
  const cases = catalog.items.filter(i => i.kind === "case");
  const skills = catalog.items.filter(i => i.kind === "skill");
  console.log("requests:", requests.join(" , "));
  console.log("items:", catalog.items.length, "| cases:", cases.length, "| skills:", skills.length);
  console.log("stats.cases:", catalog.stats.cases, "| stats.localCases:", catalog.stats.localCases);
  console.log("case available=true 数量:", cases.filter(c => c.available).length);
  console.log("有封面:", cases.filter(c => c.cover).length, "| 唯一封面:", new Set(cases.map(c => c.cover)).size);
  console.log("localCover 引用:", cases.filter(c => c.localCover).length);
  console.log("mediaWarning:", catalog.mediaWarning ?? "-");
  const dup = cases.map(c => c.id).filter((v, i, a) => a.indexOf(v) !== i);
  console.log("重复 id:", dup.length);
  const sample = cases[0];
  console.log("样例:", sample.id, "|", sample.name, "|", sample.cover?.slice(0, 60), "|", sample.available);
  // 被舍弃的 665 是否绝不出现
  const allIds = JSON.parse(readFileSync(new URL("../../.local/cache/native-cases-r51/decisions.json", import.meta.url), "utf8"));
  const keys = Array.isArray(allIds) ? allIds.length : Object.keys(allIds).length;
  console.log("decisions.json 顶层条目:", keys);
} finally { globalThis.fetch = orig; }
