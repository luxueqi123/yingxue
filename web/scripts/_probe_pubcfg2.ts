import { readFileSync } from "node:fs";
const r = JSON.parse(readFileSync(new URL("../../.local/cache/native-cases-r51/reports.json", import.meta.url), "utf8"));
const support = JSON.parse(readFileSync(new URL("../../.local/cache/native-cases-r51/support.json", import.meta.url), "utf8"));
const ids = new Set(support.map((s: any) => s.id));
const sel = r.filter((x: any) => ids.has(x.id));
console.log("keys:", Object.keys(sel[0]).join(","));
const st: Record<string, number> = {};
for (const s of sel) st[s.readiness?.status ?? s.status ?? "?"] = (st[s.readiness?.status ?? s.status ?? "?"] || 0) + 1;
console.log("statuses:", JSON.stringify(st));
let cfg = 0, inp = 0, both = 0, none = 0, nCfg = 0, nInp = 0;
for (const s of sel) {
  const reqs = s.readiness?.requirements || s.requirements || [];
  const c = reqs.some((x: any) => x.category === "configuration"), i = reqs.some((x: any) => x.category === "input");
  nCfg += reqs.filter((x: any) => x.category === "configuration").length;
  nInp += reqs.filter((x: any) => x.category === "input").length;
  if (c && i) both++; else if (c) cfg++; else if (i) inp++; else none++;
}
console.log(`needConfigOnly=${cfg} needInputOnly=${inp} both=${both} neither=${none}`);
console.log(`nodes needing configuration=${nCfg} input=${nInp}`);
