import { Play } from "lucide-react";
import { useReducedMotion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { cn } from "@/lib/utils";
import { useAppearanceStore } from "@/stores/use-appearance-store";
import "./auth-hero-media.css";

/** 独立页和弹窗共用后台影片配置；关闭弹窗或隐藏品牌区时不加载、播放影片。 */
export function AuthHeroMedia({ active = true, hiddenQuery, className }: { active?: boolean; hiddenQuery?: string; className?: string }) {
    const appearance = useAppearanceStore((state) => state.appearance);
    const reducedMotion = useReducedMotion();
    const { t } = useTranslation();
    const videoRef = useRef<HTMLVideoElement>(null);
    const [hidden, setHidden] = useState(() => Boolean(hiddenQuery && typeof window !== "undefined" && window.matchMedia(hiddenQuery).matches));
    const [manualURL, setManualURL] = useState("");
    const [playing, setPlaying] = useState(false);
    const [failedVideoURL, setFailedVideoURL] = useState("");
    const [failedPosterURL, setFailedPosterURL] = useState("");
    const visible = active && !hidden;
    const src = appearance.authVideoUrl;
    const videoActive = visible && Boolean(src) && failedVideoURL !== src && (manualURL === src || (appearance.authVideoAutoplay && !reducedMotion));

    useEffect(() => {
        if (!hiddenQuery) return;
        const query = window.matchMedia(hiddenQuery);
        const update = () => setHidden(query.matches);
        update();
        query.addEventListener("change", update);
        return () => query.removeEventListener("change", update);
    }, [hiddenQuery]);

    useEffect(() => {
        setManualURL("");
        setPlaying(false);
    }, [visible, src, appearance.authVideoAutoplay]);

    useEffect(() => {
        const video = videoRef.current;
        if (!video || !videoActive) return;
        const syncPlayback = () => {
            if (document.hidden) video.pause();
            else void video.play().catch(() => setPlaying(false));
        };
        syncPlayback();
        document.addEventListener("visibilitychange", syncPlayback);
        return () => {
            document.removeEventListener("visibilitychange", syncPlayback);
            video.pause();
        };
    }, [videoActive, src]);

    if (!visible) return null;
    return <div className={cn("auth-hero-media", className)}>
        {videoActive ? <video ref={videoRef} src={src} poster={appearance.authVideoPosterUrl || undefined} autoPlay muted loop playsInline preload="metadata" aria-hidden
            onPlaying={() => setPlaying(true)} onPause={() => setPlaying(false)} onError={() => { setFailedVideoURL(src); setPlaying(false); }} />
            : appearance.authVideoPosterUrl && failedPosterURL !== appearance.authVideoPosterUrl ? <img src={appearance.authVideoPosterUrl} alt="" decoding="async" onError={() => setFailedPosterURL(appearance.authVideoPosterUrl)} /> : null}
        {src && <button type="button" className="auth-hero-media-control" disabled={playing} aria-pressed={playing} onClick={() => {
            setFailedVideoURL("");
            setManualURL(src);
            void videoRef.current?.play().catch(() => setPlaying(false));
        }}><Play aria-hidden />{playing ? t("auth.videoPlaying") : t("auth.playVideo")}</button>}
    </div>;
}
