import { useEffect, useRef, useState } from "react";
import { Button, Input, InputNumber, Progress, Select } from "antd";
import { useLocation, useNavigate } from "react-router";
import { captureVideoFrames } from "@/lib/canvas/canvas-video-frame";
import { creationCanvasHandoffPath } from "@/lib/canvas/canvas-asset-handoff";
import { saveCreativeTitleFrame, saveCreativeTitleVideo, type TitleSaveAttempt } from "@/services/creative-title-save";
import { useUserStore } from "@/stores/use-user-store";
import { renderTitleFrame, type TitleDesign } from "./creative-title-render";
import { useInterfaceTranslation } from "@/stores/use-interface-locale-store";
import type { InterfaceMessageKey } from "@/lib/interface-locale";

export default function CreativeTitleEditor() {
    const { t } = useInterfaceTranslation();
    const navigate = useNavigate();
    const location = useLocation();
    const [source, setSource] = useState<File | null>(null);
    const [sourceUrl, setSourceUrl] = useState("");
    const [duration, setDuration] = useState(0);
    const [seconds, setSeconds] = useState(0);
    const [design, setDesign] = useState<TitleDesign>({ text: "", position: "center", style: "serif", size: 8 });
    const [preview, setPreview] = useState<{ blob: Blob; overlay: Blob; url: string; width: number; height: number; timeMs: number } | null>(null);
    const [movie, setMovie] = useState<{ blob: Blob; url: string; width: number; height: number; durationMs: number; timeMs: number } | null>(null);
    const [motionSeconds, setMotionSeconds] = useState(3);
    const [fadeSeconds, setFadeSeconds] = useState(0.5);
    const [exportProgress, setExportProgress] = useState<number | null>(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<{ key: InterfaceMessageKey; detail?: string } | null>(null);
    const lock = useRef(false);
    const alive = useRef(true);
    const saveAttempt = useRef<TitleSaveAttempt | null>(null);
    const videoSaveAttempt = useRef<TitleSaveAttempt | null>(null);
    const exportController = useRef<AbortController | null>(null);
    useEffect(() => { alive.current = true; return () => { alive.current = false; exportController.current?.abort(); }; }, []);
    useEffect(() => {
        if (!source) { setSourceUrl(""); return; }
        const url = URL.createObjectURL(source); setSourceUrl(url);
        return () => URL.revokeObjectURL(url);
    }, [source]);
    useEffect(() => () => { if (preview) URL.revokeObjectURL(preview.url); }, [preview]);
    useEffect(() => () => { if (movie) URL.revokeObjectURL(movie.url); }, [movie]);
    const invalidateMovie = () => { setMovie(null); videoSaveAttempt.current = null; setExportProgress(null); setError(null); };
    const invalidate = () => { setPreview(null); saveAttempt.current = null; invalidateMovie(); };
    const capture = async () => {
        if (!source || lock.current) return;
        lock.current = true; setBusy(true); setError(null);
        try {
            const result = await captureVideoFrames(source, [seconds * 1000]);
            const frame = result.frames[0];
            const [blob, overlay] = await Promise.all([renderTitleFrame(frame.blob, design), renderTitleFrame(frame.blob, design, true)]);
            if (!alive.current) return;
            saveAttempt.current = null;
            invalidateMovie();
            const length = Math.min(3, Math.max(0, duration - frame.timeMs / 1000));
            setMotionSeconds(length); setFadeSeconds(Math.min(0.5, length / 2));
            setPreview({ blob, overlay, url: URL.createObjectURL(blob), width: frame.width, height: frame.height, timeMs: frame.timeMs });
        } catch (cause) { if (alive.current) setError({ key: "titleCaptureFailed", detail: cause instanceof Error ? cause.message : undefined }); }
        finally { lock.current = false; if (alive.current) setBusy(false); }
    };
    const save = async (kind: "image" | "video") => {
        const result = kind === "video" ? movie : preview;
        if (!result || lock.current) return;
        lock.current = true; setBusy(true); setError(null);
        try {
            const userId = useUserStore.getState().user?.id || "";
            const attempt = kind === "video" ? videoSaveAttempt : saveAttempt;
            if (!attempt.current || attempt.current.userId !== userId) attempt.current = { userId, uploadKey: `title-${kind}:${crypto.randomUUID()}` };
            const details = { title: design.text.trim(), width: result.width, height: result.height, timeMs: result.timeMs };
            const id = kind === "video" && movie
                ? await saveCreativeTitleVideo(result.blob, { ...details, durationMs: movie.durationMs }, attempt.current)
                : await saveCreativeTitleFrame(result.blob, details, attempt.current);
            const path = creationCanvasHandoffPath([id]);
            if (alive.current && path) navigate(path, { state: { returnTo: location.pathname + location.search, returnState: location.state } });
        } catch (cause) { if (alive.current) setError({ key: "titleSaveUnconfirmed", detail: cause instanceof Error ? cause.message : undefined }); }
        finally { lock.current = false; if (alive.current) setBusy(false); }
    };
    const exportMovie = async () => {
        if (!source || !preview || lock.current) return;
        lock.current = true; setBusy(true); invalidateMovie(); setExportProgress(0);
        const controller = new AbortController(); exportController.current = controller;
        try {
            const { exportCreativeTitleVideo } = await import("@/services/creative-title-video");
            const blob = await exportCreativeTitleVideo(source, preview.overlay, { startMs: preview.timeMs, lengthMs: motionSeconds * 1000, fadeMs: fadeSeconds * 1000, durationMs: duration * 1000 }, {
                signal: controller.signal, onProgress: value => { if (alive.current) setExportProgress(value); },
            });
            if (!alive.current) return;
            setMovie({ blob, url: URL.createObjectURL(blob), width: Math.ceil(preview.width / 2) * 2, height: Math.ceil(preview.height / 2) * 2, durationMs: duration * 1000, timeMs: preview.timeMs });
        } catch (cause) { if (alive.current) setError(controller.signal.aborted ? { key: "titleExportCancelled" } : { key: "titleExportFailed", detail: cause instanceof Error ? cause.message : undefined }); }
        finally { exportController.current = null; lock.current = false; if (alive.current) { setBusy(false); setExportProgress(null); } }
    };
    return <section className="creative-title-editor" aria-label={t("titleEditor")}>
        <h2>{t("titleHeading")}</h2>
        <label>{t("titleChooseVideo")}<input type="file" accept="video/*" disabled={busy} onChange={event => {
            const file = event.target.files?.[0]; invalidate(); setSourceUrl(""); setDuration(0); setSeconds(0); setSource(file || null);
        }} /></label>
        {sourceUrl && <video key={sourceUrl} src={sourceUrl} controls preload="metadata" onLoadedMetadata={event => {
            const value = event.currentTarget.duration;
            if (Number.isFinite(value) && value > 0) setDuration(value); else setError({ key: "titleInvalidDuration" });
        }} onError={() => { setDuration(0); setError({ key: "titleDecodeFailed" }); }} />}
        <div className="creative-title-controls">
            <label>{t("titleFrameTime")}<InputNumber aria-label={t("titleFrameTime")} value={seconds} min={0} max={Math.max(0, duration - 0.001)} step={0.1} disabled={busy || !duration} onChange={value => { invalidate(); setSeconds(value || 0); }} /></label>
            <label>{t("titleTextLabel")}<Input.TextArea aria-label={t("titleText")} value={design.text} maxLength={120} disabled={busy} onChange={event => { invalidate(); setDesign({ ...design, text: event.target.value }); }} /></label>
            <label>{t("titlePosition")}<Select aria-label={t("titlePosition")} value={design.position} disabled={busy} options={[{ value: "top", label: t("titleTop") }, { value: "center", label: t("titleCenter") }, { value: "bottom", label: t("titleBottom") }]} onChange={position => { invalidate(); setDesign({ ...design, position }); }} /></label>
            <label>{t("titleFont")}<Select aria-label={t("titleFont")} value={design.style} disabled={busy} options={[{ value: "serif", label: t("titleSerif") }, { value: "sans", label: t("titleSans") }]} onChange={style => { invalidate(); setDesign({ ...design, style }); }} /></label>
            <label>{t("titleSize")}<InputNumber aria-label={t("titleSize")} value={design.size} min={3} max={15} disabled={busy} onChange={size => { invalidate(); setDesign({ ...design, size: size || 8 }); }} /></label>
        </div>
        <Button type="primary" loading={busy} disabled={!source || !duration || !design.text.trim()} onClick={() => void capture()}>{t("titleCapture")}</Button>
        {error && <p role="alert">{error.key === "titleSaveUnconfirmed" ? t(error.key, { detail: error.detail || t("titleSaveFailed") }) : <>{t(error.key)}{error.detail ? `: ${error.detail}` : ""}</>}</p>}
        {preview && <div className="creative-title-result"><img src={preview.url} alt={t("titleFramePreview")} /><p>{t("titleFrameInfo", { width: preview.width, height: preview.height, seconds: (preview.timeMs / 1000).toFixed(3) })}</p><a href={preview.url} download="title-frame.png">{t("titleDownloadFrame")}</a><Button disabled={busy} onClick={() => void save("image")}>{t("titleSaveFrame")}</Button>
            <h3>{t("titleMotion")}</h3>
            <div className="creative-title-controls"><label>{t("titleDuration")}<InputNumber aria-label={t("titleDuration")} value={motionSeconds} min={0.5} max={Math.min(10, duration - preview.timeMs / 1000)} step={0.1} disabled={busy} onChange={value => { invalidateMovie(); const length = value ?? 0.5; setMotionSeconds(length); setFadeSeconds(Math.min(fadeSeconds, length / 2)); }} /></label>
                <label>{t("titleFade")}<InputNumber aria-label={t("titleFade")} value={fadeSeconds} min={0} max={motionSeconds / 2} step={0.1} disabled={busy} onChange={value => { invalidateMovie(); setFadeSeconds(value ?? 0); }} /></label></div>
            <Button disabled={busy || duration - preview.timeMs / 1000 < 0.5} onClick={() => void exportMovie()}>{t("titleExportVideo")}</Button>
            {busy && exportProgress !== null && <div role="status" aria-label={t("titleExportProgress")}><Progress percent={exportProgress} /><Button onClick={() => exportController.current?.abort()}>{t("titleCancelExport")}</Button></div>}
        </div>}
        {movie && <div className="creative-title-result"><video src={movie.url} controls preload="metadata" aria-label={t("titleVideoPreview")} /><a href={movie.url} download="title-video.mp4">{t("titleDownloadVideo")}</a><Button disabled={busy} onClick={() => void save("video")}>{t("titleSaveVideo")}</Button></div>}
    </section>;
}
