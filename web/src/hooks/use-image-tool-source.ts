import { useEffect, useState } from "react";
import { loadRasterImage, prepareRasterSource } from "@/lib/image-raster";
import type { PixelSize } from "@/lib/canvas/image-operation-plan";
import { getImageBlob } from "@/services/image-storage";

export function useImageToolSource(source: string, storageKey?: string) {
    const [result, setResult] = useState<{ source: string; storageKey?: string; size: PixelSize | null; error: string; previewUrl: string }>({ source, storageKey, size: null, error: "", previewUrl: "" });
    useEffect(() => {
        const request = new AbortController();
        let release = () => {};
        setResult({ source, storageKey, size: null, error: "", previewUrl: "" });
        void (async () => {
            try {
                // Resolve the authorized original before decoding: a display URL may redirect to a CDN with a different CORS origin.
                const prepared = await prepareRasterSource(source, storageKey ? () => getImageBlob(storageKey) : undefined);
                release = prepared.release;
                if (request.signal.aborted) { release(); return; }
                const image = await loadRasterImage(prepared.url, request.signal);
                if (!request.signal.aborted) setResult({ source, storageKey, size: { width: image.naturalWidth, height: image.naturalHeight }, error: "", previewUrl: prepared.url });
            } catch (error: unknown) {
                release();
                if (!request.signal.aborted) setResult({ source, storageKey, size: null, error: error instanceof Error ? error.message : "图片读取失败", previewUrl: "" });
            }
        })();
        return () => { request.abort(); release(); };
    }, [source, storageKey]);
    return result.source === source && result.storageKey === storageKey ? result : { source, storageKey, size: null, error: "", previewUrl: "" };
}
