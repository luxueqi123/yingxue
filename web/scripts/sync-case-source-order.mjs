import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve, dirname } from "node:path";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const scope = JSON.parse(readFileSync(resolve(root, "docs/design/ltv-featured-200-scope.json"), "utf8"));
const ranks = new Map([...scope.initial, ...scope.reserves].map(entry => [entry.id, entry.rank]));
for (const entry of scope.effectiveLocalSelection) ranks.set(entry.id, entry.sourceRank || entry.rank);
if ([...ranks.values()].some(rank => !Number.isSafeInteger(rank) || rank < 1)) throw new Error("Invalid captured source order");
const target = resolve(process.argv[2] || resolve(root, "web/public/production-library/published-catalog.json"));
const catalog = JSON.parse(readFileSync(target, "utf8"));
catalog.publishedCaseIds = scope.effectiveLocalSelection.map(entry => entry.id);
if (catalog.publishedCaseIds.length !== 200 || catalog.publishedCaseIds.some(id => !catalog.items.some(item => item.kind === "case" && item.id === id))) throw new Error("Incomplete published selection");
let ranked = 0;
for (const item of catalog.items) {
    if (item.kind === "case" && ranks.has(item.id)) { item.sourceRank = ranks.get(item.id); ranked++; }
}
writeFileSync(target, JSON.stringify(catalog) + "\n");
if (process.argv[3] === "--showcase") {
    const published = new Set(catalog.publishedCaseIds);
    const works = catalog.items.filter(item => published.has(item.id)).sort((a, b) => a.sourceRank - b.sourceRank).map(item => {
        if (!item.localMedia?.startsWith("/production-library/case-media/") || !item.localMedia.includes(item.localMediaInfo?.sha256)) throw new Error("Showcase requires the bound final film");
        return { id: item.id.slice(5), title: item.name, author: item.author, description: item.description, poster: item.localCover || item.cover, src: item.localMedia, source: item.source };
    });
    writeFileSync(resolve(root, "web/src/lib/entry-showcase-work-data.json"), JSON.stringify({ version: 1, works }) + "\n");
}
console.log(JSON.stringify({ rankedCases: ranked, capturedOrder: scope.sourceOrder, sourceMediaWrites: 0 }));
