import { useEffect, useRef, useState } from "react";

/** Decorative clips share the card's real theme; keep a matching still on failure. */
export function HomeToolVideo({ theme, paused }: { theme: string; paused: boolean }) {
    const host = useRef<HTMLSpanElement>(null);
    const video = useRef<HTMLVideoElement>(null);
    const [visible, setVisible] = useState(false);
    const [reduced, setReduced] = useState(true);
    const [hidden, setHidden] = useState(false);
    const [ready, setReady] = useState(false);
    const [failed, setFailed] = useState(false);
    useEffect(() => {
        const media = window.matchMedia("(prefers-reduced-motion: reduce)");
        const motion = () => setReduced(media.matches);
        const visibility = () => setHidden(document.hidden);
        const observer = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting), { threshold: 0.08 });
        if (host.current) observer.observe(host.current);
        motion(); visibility();
        media.addEventListener("change", motion); document.addEventListener("visibilitychange", visibility);
        return () => { observer.disconnect(); media.removeEventListener("change", motion); document.removeEventListener("visibilitychange", visibility); };
    }, []);
    const play = visible && !reduced && !hidden && !paused && !failed;
    useEffect(() => {
        const element = video.current;
        if (!element) return;
        let disposed = false;
        element.playbackRate = 0.8;
        if (play) void element.play().then(() => { if (disposed) element.pause(); }).catch(() => {});
        else element.pause();
        return () => { disposed = true; element.pause(); };
    }, [play, ready]);
    const root = `/showcase/tool-motion/v2/${theme}`;
    return <span ref={host} className="home-tool-media" aria-hidden="true">
        <img src={`${root}.webp`} alt="" loading="lazy" />
        {!reduced && !failed && <video ref={video} className={ready ? "is-ready" : undefined} src={visible ? `${root}.mp4` : undefined} muted playsInline loop preload="none" onLoadedData={() => setReady(true)} onError={() => setFailed(true)} />}
    </span>;
}
