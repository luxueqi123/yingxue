import native from "./native-production-assets.json";
import type { ProductionCatalog } from "../services/production-library";
import { isCasePublic } from "./case-publication-policy";
import { validateNativeProductionRegistry } from "./production-project-registry-contract";

// Gallery metadata must not import the full case workflow registry.
export const nativeProductionRecords = validateNativeProductionRegistry(native);

export function appendNativeProductionItems(catalog: ProductionCatalog): ProductionCatalog {
    const existing = new Set(catalog.items.map(item => item.id));
    if (nativeProductionRecords.some(entry => existing.has(entry.item.id))) throw new Error("原生资源与原目录标识重复");
    // An explicit published selection owns the case gallery. Keep native templates
    // available without adding reference demos to the selected release.
    const nativeItems = nativeProductionRecords.map(entry => entry.item).filter(item => item.kind !== "case" || !catalog.publishedCaseIds);
    const items = [...nativeItems, ...catalog.items].filter(isCasePublic);
    return { ...catalog, items, stats: { ...catalog.stats, cases: items.filter(item => item.kind === "case").length,
        templates: items.filter(item => item.kind === "template").length,
        localCases: items.filter(item => item.kind === "case" && item.mediaStatus === "local").length } };
}
