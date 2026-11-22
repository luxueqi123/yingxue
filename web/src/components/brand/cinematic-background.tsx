import { useInterfaceTranslation } from "@/stores/use-interface-locale-store";
import { useEffect, useRef, useState } from "react";
import { Pause, Play } from "lucide-react";

import "./cinematic.css";

/** 品牌页共享的静音影片；离开视口、隐藏标签页或减少动态效果时停播。 */
export function CinematicBackground({ controls = false, suspended = false, autoPlay = true, src = "/showcase/hero-film.mp4", mobileSrc = "/showcase/hero-film-mobile.mp4", poster = "/showcase/hero-film.webp" }: { controls?: boolean; suspended?: boolean; autoPlay?: boolean; src?: string; mobileSrc?: string; poster?: string }) {
    const { t } = useInterfaceTranslation();
    const videoRef = useRef<HTMLVideoElement>(null);
    const [userPaused, setUserPaused] = useState<boolean | null>(null);
    const paused = userPaused ?? !autoPlay;
    const [playing, setPlaying] = useState(false);
    const [reduced, setReduced] = useState(() => window.matchMedia("(prefers-reduced-motion: reduce)").matches);
    const [mobile, setMobile] = useState(() => window.matchMedia("(max-width: 767px)").matches);
    const [mediaReady, setMediaReady] = useState(false);
    const showVideo = mediaReady && !reduced && !suspended && !paused;

    useEffect(() => {
        // Decorative video must not compete with the first document's scripts and images.
        let timer: number | undefined;
        const ready = () => { timer = window.setTimeout(() => setMediaReady(true), 1200); };
        if (document.readyState === "complete") ready();
        else window.addEventListener("load", ready, { once: true });
        return () => { window.removeEventListener("load", ready); window.clearTimeout(timer); };
    }, []);

    useEffect(() => {
        const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
        const screen = window.matchMedia("(max-width: 767px)");
        const update = () => { setReduced(motion.matches); setMobile(screen.matches); };
        update();
        motion.addEventListener("change", update);
        screen.addEventListener("change", update);
        return () => { motion.removeEventListener("change", update); screen.removeEventListener("change", update); };
    }, []);

    useEffect(() => {
        const video = videoRef.current;
        if (!video || !showVideo) return;
        video.src = mobile ? mobileSrc : src;
        let visible = true;
        const playback = () => {
            if (document.hidden || !visible || paused || suspended) video.pause();
            else void video.play().catch(() => undefined);
        };
        const observer = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; playback(); }, { threshold: 0.05 });
        observer.observe(video);
        video.addEventListener("canplay", playback);
        document.addEventListener("visibilitychange", playback);
        playback();
        return () => {
            observer.disconnect(); video.pause();
            video.removeEventListener("canplay", playback); document.removeEventListener("visibilitychange", playback);
            // pause() alone keeps downloading; release the connection for login and workspace chunks.
            video.removeAttribute("src"); video.load();
        };
    }, [paused, reduced, mobile, src, mobileSrc, suspended, showVideo]);

    return <>
        <div className="yx-cinema" aria-hidden="true">
            <img src={poster} className="yx-cinema-poster" alt="" fetchPriority="high" />
            {showVideo && <video ref={videoRef} className="yx-cinema-video" data-playing={playing} onPlaying={() => setPlaying(true)} onEmptied={() => setPlaying(false)} onError={() => setPlaying(false)} src={mobile ? mobileSrc : src} poster={poster} muted loop playsInline preload="none" disablePictureInPicture />}
            <div className="yx-cinema-shade" />
        </div>
        {controls && !reduced && <button type="button" className="yx-cinema-control" onClick={() => setUserPaused(!paused)} aria-label={t(paused ? "uiCompletion.backgroundPlay" : "uiCompletion.backgroundPause")} aria-pressed={paused}>
            {paused ? <Play size={12} /> : <Pause size={12} />}<span>{t(paused ? "uiCompletion.backgroundPlayLabel" : "uiCompletion.backgroundFlowing")}</span>
        </button>}
    </>;
}

/** 原生首页的短寿命蓝色光点，用固定 DOM 池更新，避免鼠标移动触发 React 渲染。 */
export function CinematicCursor() {
    const containerRef = useRef<HTMLDivElement>(null);
    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;
        const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
        const pointer = window.matchMedia("(pointer: fine)");
        const nodes = Array.from(container.children) as HTMLElement[];
        const points = nodes.map(() => ({ x: 0, y: 0, born: 0 }));
        let index = 0, frame = 0, lastX = 0, lastY = 0, lastTime = 0;
        const clear = () => { cancelAnimationFrame(frame); frame = 0; points.forEach(point => { point.born = 0; }); nodes.forEach(node => { node.style.opacity = "0"; }); };
        const draw = (time: number) => {
            let active = false;
            points.forEach((point, i) => {
                const life = point.born ? Math.max(0, 1 - (time - point.born) / 280) : 0;
                nodes[i].style.opacity = String(life);
                if (life) { active = true; nodes[i].style.transform = `translate3d(${point.x - 5}px,${point.y - 5}px,0) scale(${life})`; }
            });
            frame = active ? requestAnimationFrame(draw) : 0;
        };
        const move = (event: PointerEvent) => {
            if (motion.matches || !pointer.matches || document.hidden || event.pointerType !== "mouse") return;
            const now = performance.now();
            if (Math.hypot(event.clientX - lastX, event.clientY - lastY) < 8 && now - lastTime < 30) return;
            lastX = event.clientX; lastY = event.clientY; lastTime = now;
            points[index] = { x: lastX, y: lastY, born: now };
            index = (index + 1) % points.length;
            if (!frame) frame = requestAnimationFrame(draw);
        };
        window.addEventListener("pointermove", move, { passive: true });
        document.addEventListener("visibilitychange", clear);
        motion.addEventListener("change", clear);
        pointer.addEventListener("change", clear);
        return () => { clear(); window.removeEventListener("pointermove", move); document.removeEventListener("visibilitychange", clear); motion.removeEventListener("change", clear); pointer.removeEventListener("change", clear); };
    }, []);
    return <div ref={containerRef} className="yx-cursor-trail" aria-hidden="true">{Array.from({ length: 15 }, (_, i) => <i key={i} />)}</div>;
}
