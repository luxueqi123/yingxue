import { useEffect, useState, type ReactNode } from "react";

import { CachedResourceImage } from "@/components/cached-resource-image";
import { getActiveUserScope } from "@/lib/user-scope";
import { resolveMediaUrl, resolveVideoMediaUrl } from "@/services/file-storage";
import { useInterfaceTranslation } from "@/stores/use-interface-locale-store";
import type { Asset } from "@/stores/use-asset-store";

type AssetMediaPreviewProps = {
    asset?: Asset | null;
    alt: string;
    className?: string;
    fallback?: ReactNode;
    /** 解析授权地址期间显示的内容，缺省与 fallback 相同。 */
    loadingFallback?: ReactNode;
    /** 图片或视频首帧可以显示时调用，供卡片结束加载骨架。 */
    onLoad?: () => void;
    onError?: () => void;
};

export function AssetMediaPreview({ asset, alt, className = "", fallback = null, loadingFallback = fallback, onLoad, onError }: AssetMediaPreviewProps) {
    if (!asset) return fallback;

    if (asset.kind === "video") {
        const poster = asset.coverUrl && asset.coverUrl !== asset.data.url ? asset.coverUrl : undefined;
        return (
            <AssetMediaPlayer
                asset={asset}
                poster={poster}
                label={alt}
                className={className}
                fallback={fallback}
                loadingFallback={loadingFallback}
                onLoadedMetadata={(event) => {
                    // 主动触发首帧附近的解码，避免只有 metadata 时长期停留在空白画面。
                    const video = event.currentTarget;
                    // 有封面时显示的是 poster，preload=metadata 下不一定再触发 loadeddata。
                    if (poster) onLoad?.();
                    else if (video.currentTime === 0 && video.duration > 0) video.currentTime = Math.min(0.001, video.duration);
                }}
                onLoadedData={onLoad}
                onError={onError}
            />
        );
    }

    const storageKey = asset.kind === "image" ? asset.data.storageKey : undefined;
    const imageUrl = asset.coverUrl || (asset.kind === "image" ? asset.data.dataUrl : "");
    if (!imageUrl && !storageKey) return fallback;
    return <CachedResourceImage storageKey={storageKey} src={imageUrl} alt={alt} loading="lazy" decoding="async" className={className} fallback={fallback} loadingFallback={loadingFallback} onLoad={onLoad} onError={onError} />;
}

/** Resolve saved media by resource identity; persisted signed URLs may have expired. */
export function AssetMediaPlayer({ asset, label = asset.title, className, poster, controls = false, fallback, loadingFallback = null, onLoadedMetadata, onLoadedData, onError }: {
    asset: Extract<Asset, { kind: "audio" | "video" }>;
    label?: string;
    className?: string;
    poster?: string;
    controls?: boolean;
    fallback?: ReactNode;
    loadingFallback?: ReactNode;
    onLoadedMetadata?: (event: React.SyntheticEvent<HTMLVideoElement>) => void;
    onLoadedData?: () => void;
    onError?: () => void;
}) {
    const { t } = useInterfaceTranslation();
    const scope = getActiveUserScope();
    const { storageKey, url: storedUrl } = asset.data;
    const identity = JSON.stringify([scope, asset.id, asset.kind, storageKey, storedUrl]);
    const [resolved, setResolved] = useState<{ identity: string; url: string }>();
    const [failed, setFailed] = useState("");
    useEffect(() => {
        let cancelled = false;
        const resolve = asset.kind === "video" ? resolveVideoMediaUrl : resolveMediaUrl;
        void resolve(storageKey, storedUrl).then((url) => {
            if (cancelled || getActiveUserScope() !== scope) return;
            if (url) setResolved({ identity, url });
            else setFailed(identity);
        }, () => {
            if (!cancelled && getActiveUserScope() === scope) setFailed(identity);
        });
        return () => { cancelled = true; };
    }, [identity, scope, storageKey, storedUrl, asset.kind]);
    if (failed === identity) return fallback ?? <span role="status">{t("library.tasks.row.previewUnavailable")}</span>;
    const url = resolved?.identity === identity ? resolved.url : !storageKey ? storedUrl : "";
    if (!url) return loadingFallback;
    const fail = () => { setFailed(identity); onError?.(); };
    return asset.kind === "audio"
        ? <audio src={url} controls={controls} preload="metadata" aria-label={label} className={className} onLoadedData={onLoadedData} onError={fail} />
        : <video src={url} poster={poster} controls={controls} muted={!controls} playsInline preload="metadata" aria-label={label} className={className} onLoadedMetadata={onLoadedMetadata} onLoadedData={onLoadedData} onError={fail} />;
}
