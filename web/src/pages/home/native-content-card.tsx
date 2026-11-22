import { useEffect, useRef, useState } from "react";
import { ArrowUpRight, Play } from "lucide-react";
import type { LtvHomeItem } from "@/services/production-library";
import { useInterfaceTranslation } from "@/stores/use-interface-locale-store";

export function NativeContentCard({ item, onOpen }: { item: LtvHomeItem; onOpen: () => void }) {
    const { t } = useInterfaceTranslation();
    const [hovered, setHovered] = useState(false);
    const [playing, setPlaying] = useState(false);
    const video = useRef<HTMLVideoElement>(null);
    useEffect(() => {
        const element = video.current;
        if (!hovered || !element) return;
        void element.play().catch(() => setPlaying(false));
        return () => { element.pause(); };
    }, [hovered]);
    const preview = () => {
        if (item.media && !matchMedia("(prefers-reduced-motion: reduce)").matches) setHovered(true);
    };
    const stop = () => { setHovered(false); setPlaying(false); };
    return <button type="button" className="ltv-content-card" onClick={onOpen} onPointerEnter={event => { if (event.pointerType === "mouse") preview(); }} onPointerLeave={stop} onFocus={preview} onBlur={stop} aria-label={t("createUiViewNamed", { name: item.name })}>
        <span className="ltv-content-image">
            <img src={item.cover} alt={item.name} loading="lazy" decoding="async" />
            {hovered && item.media && <video ref={video} src={item.media} muted loop playsInline preload="none" onPlaying={() => setPlaying(true)} onError={() => setPlaying(false)} className={playing ? "is-playing" : ""} />}
            <span className="ltv-card-corner">{item.media ? <Play size={10} fill="currentColor" /> : <ArrowUpRight size={12} />}<span>{t(item.media ? "createUiPreviewWork" : "galleryViewWork")}</span></span>
            <span className="ltv-content-overlay"><span>{item.author || t("createUiYingxueLibrary")}</span><span>{t("galleryViewWork")}<ArrowUpRight size={14} /></span></span>
        </span>
        <span className="ltv-content-caption"><strong>{item.name}</strong><span>{t(item.available ? "createUiEditableWork" : "createUiWork")}</span></span>
    </button>;
}
