type AssetOrigin = { metadata?: Record<string, unknown>; data?: unknown; coverUrl?: string };

export function isCaseMediaReference(value: unknown): boolean {
    if (typeof value !== "string") return false;
    if (value.startsWith("/production-library/case-media/")) return true;
    try {
        const url = new URL(value);
        return (url.protocol === "https:" || url.protocol === "http:") && url.hostname === "libtv-res.liblib.art";
    } catch {
        return false;
    }
}

export function isPersonalLibraryAsset(asset: AssetOrigin): boolean {
    if (asset.metadata?.taskId) return true;
    const source = asset.metadata?.source;
    if (source === "case-import") return false;
    if (source !== "canvas-upload") return true;
    const data = asset.data && typeof asset.data === "object" ? asset.data as Record<string, unknown> : {};
    return ![data.url, data.dataUrl, asset.coverUrl].some(isCaseMediaReference);
}
