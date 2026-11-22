import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Modal } from "antd";
import { ArrowLeft, ChevronLeft, ChevronRight, ImageOff } from "lucide-react";
import { useInterfaceTranslation } from "@/stores/use-interface-locale-store";
import { publicCasePlaybackURL } from "@/lib/public-case-playback";
import { useFilmPlaybackStore } from "@/stores/use-film-playback-store";
import "./film-detail.css";

export type FilmDetailWork = { id: string; title: string; author?: string; description?: string; poster?: string; src?: string };

export function FilmDetail({ work, works, onSelect, onClose, actions, process, notice, onMediaError }: {
    work: FilmDetailWork; works: FilmDetailWork[]; onSelect: (id: string) => void; onClose: () => void;
    actions?: ReactNode; process?: ReactNode; notice?: ReactNode; onMediaError?: () => void;
}) {
    const { t } = useInterfaceTranslation();
    const mediaSource = publicCasePlaybackURL(work.src);
    const acquirePlayback = useFilmPlaybackStore(state => state.acquire);
    useEffect(() => acquirePlayback(), [acquirePlayback]);
    const video = useRef<HTMLVideoElement>(null);
    const bindVideo = useCallback((element: HTMLVideoElement | null) => {
        video.current = element;
        if (!element) return;
        void element.play().catch((error: unknown) => {
            if (video.current !== element || !(error instanceof DOMException) || error.name !== "NotAllowedError") return;
            element.muted = true;
            void element.play().catch(() => {});
        });
        return () => {
            element.pause();
            element.removeAttribute("src");
            element.load();
            video.current = null;
        };
    }, []);
    const strip = useRef<HTMLDivElement>(null);
    const [playFailed, setPlayFailed] = useState(false);
    useEffect(() => {
        setPlayFailed(false);
        const container = strip.current;
        const selected = container?.querySelector<HTMLButtonElement>('[aria-pressed="true"]');
        if (!container || !selected) return;
        const bounds = container.getBoundingClientRect();
        const button = selected.getBoundingClientRect();
        if (button.left < bounds.left || button.right > bounds.right) container.scrollLeft += button.left - bounds.left - (bounds.width - button.width) / 2;
    }, [work.id, work.src]);
    return <Modal open onCancel={onClose} footer={null} closable={false} width="100vw" title={work.title} destroyOnHidden className="film-detail-modal" style={{ top: 0, margin: 0, maxWidth: "none" }}
        styles={{ container: { padding: 0, background: "var(--film-bg)", borderRadius: 0 }, body: { padding: 0 } }}>
        {process ? <div className="film-detail-workflow">{process}</div> : <div className="film-detail">
            <div className={`film-detail-stage${process ? " is-process" : ""}`}>
                {!process ? mediaSource ? <video key={`${work.id}:${mediaSource}`} ref={bindVideo} src={mediaSource} poster={work.poster} autoPlay controls playsInline preload="metadata" aria-label={work.title}
                    onError={() => { onMediaError?.(); setPlayFailed(true); }} />
                    : work.poster ? <img src={work.poster} alt={work.title} /> : <div className="film-detail-missing"><ImageOff />{t("galleryMediaUnavailable")}</div> : <div className="film-detail-process">{process}</div>}
                <header className="film-detail-heading">
                    <div className="film-detail-identity"><button type="button" className="film-detail-back" onClick={onClose}><ArrowLeft size={16} />{t("galleryBack")}</button><span className="film-detail-author">{work.author || t("galleryLibraryAuthor")}</span><h2>{work.title}</h2></div>
                    {!process && work.description ? <div className="film-detail-description"><p>{work.description}</p></div> : null}
                </header>
                <div className="film-detail-controls">
                    {actions}
                </div>
            </div>
            {notice || (playFailed && work.src) ? <div className="film-detail-notice" role="status">{notice}{playFailed && work.src ? <span>{t("galleryPlaybackRetry")}</span> : null}</div> : null}
            {works.length > 1 ? <nav className="film-detail-navigation" aria-label={t("galleryWorkStrip")}>
                <button type="button" className="film-detail-scroll" aria-label={t("galleryPrevious")} onClick={() => strip.current?.scrollBy({ left: -Math.max(200, strip.current.clientWidth * .7), behavior: "instant" })}><ChevronLeft size={20} /></button>
                <div ref={strip} className="film-detail-strip">{works.map(entry => <button key={entry.id} type="button" className="film-detail-thumbnail" aria-label={t("galleryViewNamedCase", { name: entry.title })} aria-pressed={entry.id === work.id} onClick={() => onSelect(entry.id)} title={entry.title}>
                    {entry.poster ? <img src={entry.poster} alt="" loading="lazy" decoding="async" /> : <ImageOff size={20} />}<span>{entry.title}</span>
                </button>)}</div>
                <button type="button" className="film-detail-scroll" aria-label={t("galleryNext")} onClick={() => strip.current?.scrollBy({ left: Math.max(200, strip.current.clientWidth * .7), behavior: "instant" })}><ChevronRight size={20} /></button>
            </nav> : null}
        </div>}
    </Modal>;
}
