import { translate } from "@/i18n";

export type ResourceStorageLocation = "oss" | "local" | "none";

export function resourceStorageLocation(storageKey?: string): ResourceStorageLocation {
    if (!storageKey) return "none";
    return storageKey.startsWith("resource:") ? "oss" : "local";
}

export function resourceStorageLabel(storageKey?: string) {
    const location = resourceStorageLocation(storageKey);
    if (location === "oss") return translate("assetsUi.storageUploaded");
    if (location === "local") return translate("assetsUi.storageLocal");
    return translate("assetsUi.storageUnsynced");
}

export function resourceStorageTitle(storageKey?: string) {
    const location = resourceStorageLocation(storageKey);
    if (location === "oss") return translate("assetsUi.storageUploadedTitle");
    if (location === "local") return translate("assetsUi.storageLocalTitle");
    return translate("assetsUi.storageUnsyncedTitle");
}
