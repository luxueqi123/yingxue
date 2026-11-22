import legacy from "./production-case-support.json";
import { isCaseWithdrawn } from "./case-publication-policy";
import { nativeProductionRecords } from "./native-production-registry";
import { validateNativeProductionRegistry } from "./production-project-registry-contract";
import type { ProductionProjectEntry } from "./production-project-registry-contract";

export { validateNativeProductionRegistry };
export type { NativeProductionMediaAsset, NativeProductionRecord, ProductionProjectEntry } from "./production-project-registry-contract";

export { nativeProductionRecords, appendNativeProductionItems } from "./native-production-registry";

export function productionProjectEntry(id: string): ProductionProjectEntry | undefined {
    if (isCaseWithdrawn(id)) return undefined;
    return nativeProductionRecords.find(entry => entry.project.id === id)?.project || legacy.find(entry => entry.id === id);
}

