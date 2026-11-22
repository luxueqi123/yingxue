import { readFileSync } from "node:fs";
const r = JSON.parse(readFileSync(new URL("../../.local/cache/native-cases-r51/reports.json", import.meta.url), "utf8"));
const support = JSON.parse(readFileSync(new URL("../../.local/cache/native-cases-r51/support.json", import.meta.url), "utf8"));
const ids = new Set(support.map((s: any) => s.id));
console.log("reports type", Array.isArray(r) ? "array" : typeof r, Array.isArray(r) ? r.length : Object.keys(r).length);
const arr = Array.isArray(r) ? r : (r.reports || r.cases || []);
const sel = arr.filter((x: any) => ids.has(x.id));
console.log("published reports:", sel.length);
const st: Record<string, number> = {};
for (const s of sel) st[s.status || "?"] = (st[s.status || "?"] || 0) + 1;
console.log("statuses:", JSON.stringify(st));
let needCfg = 0, needInput = 0, both = 0, neither = 0, nodesCfg = 0, nodesInput = 0;
for (const s of sel) {
  const reqs = s.requirements || [];
  const cfg = reqs.some((x: any) => x.category === "configuration");
  const inp = reqs.some((x: any) => x.category === "input");
  nodesCfg += reqs.filter((x: any) => x.category === "configuration").length;
  nodesInput += reqs.filter((x: any) => x.category === "input").length;
  if (cfg && inp) both++; else if (cfg) needCfg++; else if (inp) needInput++; else neither++;
}
console.log(`published cases: needConfigOnly=${needCfg} needInputOnly=${needInput} both=${both} neither=${neither}`);
console.log(`published nodes needing: configuration=${nodesCfg} input=${nodesInput}`);
