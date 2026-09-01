import type { UploadedImage } from "@/services/image-storage";
import type { NewAsset } from "@/stores/use-asset-store";

/**
 * Build an image asset from an uploaded image without coupling callers to the
 * create page. This is shared by the creation flow and the prompt library.
 */
export function creationImageAsset({ title, uploaded, metadata, source = "创作页" }: { title: string; uploaded: UploadedImage; metadata?: Record<string, unknown>; source?: string }): NewAsset {
    return {
        kind: "image",
        title: title.trim() || "创作图片",
        coverUrl: uploaded.url,
        tags: ["创作"],
        status: "confirmed",
        source: source.trim() || "创作页",
        metadata: { source: "create-page", ...metadata },
        data: {
            dataUrl: uploaded.url,
            storageKey: uploaded.storageKey,
            width: uploaded.width,
            height: uploaded.height,
            bytes: uploaded.bytes,
            mimeType: uploaded.mimeType || "image/png",
        },
    };
}
