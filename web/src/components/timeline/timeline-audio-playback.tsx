import { useEffect, useRef, useState } from "react";

import { timelineAudioPlayback } from "@/lib/timeline/timeline-audio";
import { timelineMediaGain } from "@/lib/timeline/timeline-media-gain";
import type { TimelineClip } from "@/types/timeline";

type TimelineAudioPlaybackProps = {
    clip: TimelineClip;
    source: string | null;
    timeMs: number;
    playing: boolean;
    muted: boolean;
    speed?: number;
    sourceError?: string;
};

/** Shared media-element transport for editor and canvas timeline previews. */
export function TimelineAudioPlayback({ clip, source, timeMs, playing, muted, speed = 1, sourceError = "" }: TimelineAudioPlaybackProps) {
    const [error, setError] = useState("");
    const ref = useRef<HTMLAudioElement | null>(null);
    const state = timelineAudioPlayback(clip, timeMs, playing, muted);
    const currentState = useRef(state);
    currentState.current = state;

    useEffect(() => setError(""), [source]);

    useEffect(() => {
        const audio = ref.current;
        return () => { if (audio) timelineMediaGain.release(audio); };
    }, [source]);

    useEffect(() => {
        const audio = ref.current;
        if (!audio) return;
        try {
            timelineMediaGain.apply(audio, state.volume);
            if (state.shouldPlay) void timelineMediaGain.resume(audio).catch(() => { audio.pause(); setError("音量增益启动失败，请重新点击播放"); });
        }
        catch { audio.pause(); setError("音量增益初始化失败，请检查浏览器和媒体跨域支持"); return; }
        audio.muted = state.muted;
        audio.playbackRate = speed;
        if (!audio.seeking && audio.readyState >= HTMLMediaElement.HAVE_METADATA && Math.abs(audio.currentTime - state.sourceSeconds) > (state.shouldPlay ? 0.35 : 0.001)) {
            audio.currentTime = Math.min(state.sourceSeconds, Math.max(0, (audio.duration || 0) - 0.05));
        }
    }, [source, state.volume, state.muted, state.sourceSeconds, state.shouldPlay, speed]);

    useEffect(() => {
        const audio = ref.current;
        if (!audio || !source) return;
        let cancelled = false;
        setError("");
        if (state.shouldPlay) {
            void (async () => {
                timelineMediaGain.apply(audio, currentState.current.volume);
                await timelineMediaGain.resume(audio);
                if (!cancelled) await audio.play();
            })().catch(() => { if (!cancelled) setError("音频播放失败，请检查素材、音量增益或重新点击播放"); });
        } else audio.pause();
        return () => { cancelled = true; audio.pause(); };
    }, [source, state.shouldPlay]);

    return <>
        <audio ref={ref} src={source ?? undefined} preload="auto" crossOrigin="anonymous"
            onLoadedMetadata={() => {
                if (ref.current) ref.current.currentTime = Math.min(currentState.current.sourceSeconds, Math.max(0, (ref.current.duration || 0) - 0.05));
            }}
            onSeeked={() => {
                const audio = ref.current;
                if (!audio) return;
                const target = Math.min(currentState.current.sourceSeconds, Math.max(0, (audio.duration || 0) - 0.05));
                if (Math.abs(audio.currentTime - target) > (currentState.current.shouldPlay ? 0.35 : 0.001)) audio.currentTime = target;
            }}
            onError={() => setError("音频素材解码失败")}/>
        {(sourceError || error) && <span role="alert" className="text-xs text-[var(--director-danger)]">{clip.directMedia?.title || clip.title || clip.nodeId || clip.id}：{sourceError || error}</span>}
    </>;
}
