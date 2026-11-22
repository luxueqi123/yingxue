import { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router";
import { creativeToolEntries, creativeToolPath } from "./creative-tool-entries";
import { useInterfaceTranslation } from "@/stores/use-interface-locale-store";
import scriptCover from "@/assets/home-tools/script-creation.webp";
import directorCover from "@/assets/home-tools/director-guide.webp";
import portraitCover from "@/assets/home-tools/portrait-studio.webp";
import titleCover from "@/assets/home-tools/creative-title.webp";
import "./creative-tools.css";

const mediaRoot = "/showcase/tool-motion/original-v1";
const toolCovers = { "script-creation": scriptCover, "director-guide": directorCover, "portrait-studio": portraitCover, "creative-title": titleCover };

function reportPrefetchFailure(error: unknown) {
    console.warn("创作工具预加载失败，将在实际导航时报告加载结果", error);
}

function ToolCard({ entry }: { entry: typeof creativeToolEntries[number] }) {
    const { t } = useInterfaceTranslation();
    const { pathname } = useLocation();
    const title = t(entry.titleKey);
    const [hovered, setHovered] = useState(false);
    const [focused, setFocused] = useState(false);
    const [playing, setPlaying] = useState(false);
    const [ready, setReady] = useState(false);
    const video = useRef<HTMLVideoElement>(null);
    useEffect(() => {
        const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
        let timer = 0;
        const sync = () => {
            window.clearTimeout(timer); setPlaying(false); setReady(false);
            if (/^\/(?:home|create)?\/?$/.test(pathname) && (hovered || focused) && !motion.matches && !document.hidden) timer = window.setTimeout(() => setPlaying(true), 200);
        };
        sync(); motion.addEventListener("change", sync); document.addEventListener("visibilitychange", sync);
        return () => { window.clearTimeout(timer); motion.removeEventListener("change", sync); document.removeEventListener("visibilitychange", sync); };
    }, [hovered, focused, pathname]);
    useEffect(() => {
        const element = video.current;
        if (!element || !playing) return;
        let disposed = false;
        element.muted = true;
        void element.play().then(() => { if (disposed) element.pause(); }).catch(() => { if (!disposed) setPlaying(false); });
        return () => { disposed = true; element.pause(); };
    }, [playing]);
    const prefetch = () => {
        void import("./creative-tool-page").catch(reportPrefetchFailure);
        const editor = entry.id === "portrait-studio" ? import("./creative-character-studio") : import("./creative-production-studio");
        void editor.catch(reportPrefetchFailure);
    };
    return <Link to={creativeToolPath(entry.id)} className="creative-release-card" aria-label={t("openTool", { name: title })} onMouseEnter={() => { setHovered(true); prefetch(); }} onMouseLeave={() => setHovered(false)} onFocus={() => { setFocused(true); prefetch(); }} onBlur={() => setFocused(false)}>
        <span className="creative-release-cover"><img src={toolCovers[entry.id]} alt="" loading="lazy" width={720} height={405} decoding="async" />
            {playing && <video ref={video} src={`${mediaRoot}/${entry.id}.webm`} muted loop playsInline className={ready ? "is-ready" : undefined} onCanPlay={() => setReady(true)} onError={() => setPlaying(false)} />}
        </span>
        <span className="creative-release-label"><strong>{title}</strong></span>
    </Link>;
}

export function HomeSpecialTools() {
    const { t } = useInterfaceTranslation();
    return <section className="home-special-tools-region" aria-label={t("creativeToolsRegion")}>
        <div className="home-special-tools-heading"><span>{t("creativeTools")}</span><Link to="/canvas?tool=director" aria-label={t("openPrevisDesk")}>{t("previsDesk")} ↗</Link></div>
        <nav className="creative-release-grid" aria-label={t("creativeToolsNav")}>{creativeToolEntries.map(entry => <ToolCard key={entry.id} entry={entry} />)}</nav>
    </section>;
}
