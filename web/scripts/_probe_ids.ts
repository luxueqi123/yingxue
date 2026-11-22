import { readFileSync } from "node:fs";
const raw = JSON.parse(readFileSync(new URL("../public/production-library/case-projects/case-1710baffb51044eaa5eb07608984b08e.json", import.meta.url), "utf8"));
console.log("top keys", Object.keys(raw).join(","));
const nodes = raw.nodes || raw.project?.nodes || [];
console.log("nodes", nodes.length, "sample ids", nodes.slice(0,5).map((n:any)=>n.id));
const s = JSON.stringify(raw);
console.log("has jyhXu:", s.includes("jyhXu"), "has f1mMr:", s.includes("f1mMr"));
