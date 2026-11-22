import { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router";
import { ArrowRight, ChevronLeft, ChevronRight, Pause, Play } from "lucide-react";
import "./home-highlights.css";
import { useInterfaceTranslation } from "@/stores/use-interface-locale-store";
import { useFilmPlaybackStore } from "@/stores/use-film-playback-store";

const root = "/showcase/home-motion/v1/";
const campaigns = [
    { id: "cases", title: "spotlightTitle", eyebrow: "spotlightEyebrow", description: "spotlightDescription", action: "spotlightAction", href: "#ltv-show-title", clips: ["ranking-01-web", "ranking-02-web", "ranking-03-web"], posters: ["ranking-01-poster", "ranking-02-poster", "ranking-03-poster"] },
    { id: "canvas", title: "canvasCampaignTitle", eyebrow: "canvasCampaignEyebrow", description: "canvasCampaignDescription", action: "enterCanvas", href: "/canvas", clips: ["site-launch-book-film-mobile"], posters: ["site-launch-book-film-poster"] },
    { id: "skills", title: "skillsCampaignTitle", eyebrow: "skillsCampaignEyebrow", description: "skillsCampaignDescription", action: "skillsCampaignAction", href: "/skills", clips: ["challenge-paper-bird-web"], posters: ["challenge-paper-bird-poster-4k"] },
] as const;

function Scene({ campaign, active, stopped, reduced, onComplete }: { campaign: typeof campaigns[number]; active: boolean; stopped: boolean; reduced: boolean; onComplete: () => void }) {
    const [clip, setClip] = useState(0);
    const video = useRef<HTMLVideoElement>(null);
    const completed = useRef(false);
    const callback = useRef(onComplete);
    callback.current = onComplete;
    const advance = useRef(() => {});
    advance.current = () => {
        if (!active || stopped || reduced || completed.current) return;
        completed.current = true;
        if (clip + 1 < campaign.clips.length) setClip(value => value + 1);
        else callback.current();
    };
    useEffect(() => { completed.current = false; }, [clip]);
    useEffect(() => {
        const element = video.current;
        if (!element || !active || reduced) return;
        element.src = `${root}${campaign.clips[clip]}.mp4`;
        return () => {
            element.pause();
            element.removeAttribute("src");
            element.load();
        };
    }, [active, reduced, clip, campaign]);
    useEffect(() => {
        const element = video.current;
        if (!element || !active || reduced) return;
        if (stopped) { element.pause(); return; }
        let timer = 0;
        let lastTime = element.currentTime;
        let disposed = false;
        const arm = () => { window.clearTimeout(timer); timer = window.setTimeout(() => advance.current(), 8000); };
        const progress = () => { if (element.currentTime !== lastTime) { lastTime = element.currentTime; arm(); } };
        // Let the stroke and paper turn begin before starting the book's film.
        const delay = window.setTimeout(() => { arm(); void element.play().then(() => { if (disposed) element.pause(); }).catch(() => {}); }, campaign.id === "canvas" && element.currentTime === 0 ? 1180 : 0);
        element.addEventListener("timeupdate", progress);
        return () => { disposed = true; window.clearTimeout(delay); window.clearTimeout(timer); element.removeEventListener("timeupdate", progress); element.pause(); };
    }, [active, stopped, reduced, clip, campaign.id]);
    const book = campaign.id === "canvas";
    return <span className={`home-motion-scene${active ? " is-active" : ""}${reduced ? " is-reduced" : ""}${stopped ? " is-stopped" : ""}`} data-clip={clip}>
        <span className={book ? "home-motion-book" : "home-motion-media"}>
            <video key={clip} ref={video} className="is-current" aria-hidden="true" muted playsInline preload="none" poster={active ? `${root}${campaign.posters[clip]}.jpg` : undefined} onEnded={() => advance.current()} onError={() => advance.current()} />
            {book && <svg className="home-motion-turning-page" viewBox="0 0 960 200" preserveAspectRatio="none"><path className="home-motion-paper" d="M78 18Q463 4 918 15L896 184Q464 198 58 178Z" /><g className="home-motion-sketch"><path d="M172 53h176v78H172z M196 112l36-30 28 19 33-37 36 48 M387 41h182v84H387z M409 104c33-52 86-50 132 0 M458 61v50 M608 34h204v96H608z M631 108l43-44 37 29 35-43 43 58 M172 146h123 M386 141h152 M609 145h109" /><path className="home-motion-stroke" d="M137 155C245 130 339 143 430 111C524 79 621 94 739 52" /></g></svg>}
        </span>
        <svg className="home-motion-overlay" viewBox="0 0 1600 200" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
            {campaign.id === "cases" && <>{[0, 1, 2].map(position => <text key={position} className={`home-motion-number${position === clip ? " is-current" : ""}`} x="650" y="170">{String(position + 1).padStart(2, "0")}</text>)}<path className="home-motion-heart" d="M779 126C811 96 840 119 831 143C822 168 785 177 779 181C773 177 736 168 727 143C718 119 747 96 779 126Z" />{[0, 1, 2].map(position => <rect key={position} className={position === clip ? "home-motion-tick is-current" : "home-motion-tick"} x={1450 + position * 34} y="166" width={position === clip ? 26 : 18} height="4" rx="2" />)}</>}
            {campaign.id === "skills" && <><path className="home-motion-story" d="M118 144C320 129 474 154 642 137C790 122 914 92 1060 113C1234 138 1386 92 1588 106" />{[710, 890, 1060, 1250, 1450].map((x, i) => <circle className="home-motion-node" key={x} cx={x} cy={[131, 113, 113, 126, 98][i]} r="5" style={{ animationDelay: `${i * .28}s` }} />)}</>}
        </svg>
    </span>;
}

export function HomeHighlights() {
    const { t } = useInterfaceTranslation();
    const { pathname } = useLocation();
    const homeActive = /^\/(?:home\/?)?$/.test(pathname);
    const previewActive = useFilmPlaybackStore(state => state.activePreviews > 0);
    const [index, setIndex] = useState(0);
    const [paused, setPaused] = useState(false);
    const [focused, setFocused] = useState(false);
    const [hovered, setHovered] = useState(false);
    const [reduced, setReduced] = useState(true);
    const [hidden, setHidden] = useState(false);
    useEffect(() => {
        const media = window.matchMedia("(prefers-reduced-motion: reduce)");
        const motion = () => setReduced(media.matches);
        const visibility = () => setHidden(document.hidden);
        motion(); visibility(); media.addEventListener("change", motion); document.addEventListener("visibilitychange", visibility);
        return () => { media.removeEventListener("change", motion); document.removeEventListener("visibilitychange", visibility); };
    }, []);
    const move = (step: number) => setIndex(value => (value + step + campaigns.length) % campaigns.length);
    const stopped = paused || focused || hovered || hidden;
    return <section className="home-highlights" data-campaign={campaigns[index].id} aria-label={t("homeRecommendations")} aria-roledescription={t("carousel")}
        onPointerEnter={event => { if (event.pointerType === "mouse") setHovered(true); }} onPointerLeave={() => setHovered(false)}
        onFocusCapture={() => setFocused(true)} onBlurCapture={event => { if (!event.currentTarget.contains(event.relatedTarget)) setFocused(false); }}
        onKeyDown={event => { if (event.altKey || event.ctrlKey || event.metaKey) return; if (event.key === "ArrowLeft" || event.key === "ArrowRight") { event.preventDefault(); move(event.key === "ArrowLeft" ? -1 : 1); } }}>
        {campaigns.map((campaign, position) => {
            const current = index === position;
            const actionProps = { className: "home-highlight-content", tabIndex: current ? 0 : -1, "aria-label": t(campaign.action) };
            const content = (
                <span className="home-highlight-copy">
                    <span className="home-highlight-eyebrow">{t(campaign.eyebrow)}</span>
                    <h2>{t(campaign.title)}</h2>
                    <p>{t(campaign.description)}</p>
                    <span className="home-highlight-action">{t(campaign.action)}<ArrowRight size={15} aria-hidden="true" /></span>
                </span>
            );
            return (
                <div key={campaign.id} className={`home-highlight-slide${current ? " is-current" : ""}`} data-theme={campaign.id} aria-hidden={!current} inert={!current} role="group" aria-roledescription={t("carouselSlide")} aria-label={`${position + 1} / ${campaigns.length}`}>
                    <Scene key={`${campaign.id}-${current}`} campaign={campaign} active={homeActive && current && !previewActive} stopped={stopped} reduced={reduced} onComplete={() => setIndex(value => value === position ? (value + 1) % campaigns.length : value)} />
                    {campaign.id === "cases" ? (
                        <a {...actionProps} href={campaign.href}>{content}</a>
                    ) : (
                        <Link {...actionProps} to={campaign.href}>{content}</Link>
                    )}
                </div>
            );
        })}
        <button className="home-highlight-arrow is-previous" type="button" aria-label={t("previousRecommendation")} onClick={() => move(-1)}><ChevronLeft size={19} /></button>
        <button className="home-highlight-arrow is-next" type="button" aria-label={t("nextRecommendation")} onClick={() => move(1)}><ChevronRight size={19} /></button>
        <div className="home-highlight-controls" role="group" aria-label={t("recommendationControls")}>{campaigns.map((item, position) => <button key={item.id} className="home-highlight-dot" type="button" aria-label={t("switchRecommendation", { title: t(item.title) })} aria-pressed={position === index} onClick={() => setIndex(position)}><span /></button>)}{!reduced && <button className="home-highlight-pause" type="button" aria-label={t(paused ? "resumeRecommendations" : "pauseRecommendations")} onClick={() => setPaused(value => !value)}>{paused ? <Play size={13} /> : <Pause size={13} />}</button>}</div>
    </section>;
}
