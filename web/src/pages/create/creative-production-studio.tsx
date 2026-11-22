import { useEffect, useRef, useState, type ReactNode } from "react";
import { Button, Input, InputNumber, Select } from "antd";
import { useQuery } from "@tanstack/react-query";
import { Link, useLocation, useNavigate } from "react-router";
import { modelDisplayName, selectableModelsByCapability, type AiConfig } from "@/stores/use-config-store";
import { creationCanvasHandoffPath } from "@/lib/canvas/canvas-asset-handoff";
import type { StudioMedia, StudioTool } from "@/lib/creative-studio";
import { saveStudioDocument, uploadStudioMedia } from "@/services/creative-studio";
import { getResourceAccess, getResourceBlob, resolveResourceAccessURL } from "@/services/api/resources";
import { createProjectUnit, listProjects, replaceProjectUnitShots } from "@/services/api/projects";
import { useCreativeStudio } from "./use-creative-studio";
import { useStudioCopy } from "./studio-copy";
import { studioWorkPath } from "@/lib/creative-studio";

export function StudioField({ label, children }: { label: string; children: ReactNode }) {
    return <label className="studio-field"><span>{label}</span>{children}</label>;
}

export function StudioModel({ config, mode, value, onChange }: { config: AiConfig; mode: "text" | "image" | "video"; value: string; onChange: (value: string) => void }) {
    const s = useStudioCopy();
    const models = selectableModelsByCapability(config, mode);
    return <StudioField label={s("model")}><Select aria-label={`${s("model")} ${mode}`} value={models.includes(value) ? value : undefined} placeholder={s("noModel")} onChange={onChange} options={models.map(model => ({ value: model, label: modelDisplayName(config, model) }))} /></StudioField>;
}

function downloadText(name: string, text: string) {
    const url = URL.createObjectURL(new Blob([text], { type: "text/plain;charset=utf-8" }));
    const link = document.createElement("a"); link.href = url; link.download = `${name || "screenplay"}.txt`; link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function CreativeProductionStudio({ tool }: { tool: StudioTool }) {
    const studio = useCreativeStudio(tool);
    const { doc, change, busy, config } = studio;
    const s = useStudioCopy();
    const routeNavigate = useNavigate();
    const location = useLocation();
    const navigate = (path: string) => routeNavigate(path, { state: { returnTo: studioWorkPath(location.pathname, location.search, doc.id), returnState: location.state } });
    const [instruction, setInstruction] = useState("");
    const [presetName, setPresetName] = useState("");
    const [projectId, setProjectId] = useState("");
    const [seconds, setSeconds] = useState(0);
    const [mediaURLs, setMediaURLs] = useState<Record<string, string>>({});
    const [mediaError, setMediaError] = useState("");
    const mediaAlive = useRef(true);
    const mediaRecoveries = useRef(new Set<string>());
    const ownedMediaURLs = useRef(new Map<string, string>());
    useEffect(() => { mediaAlive.current = true; return () => { mediaAlive.current = false; ownedMediaURLs.current.forEach(URL.revokeObjectURL); }; }, []);
    const recoverMedia = async (media: StudioMedia) => {
        if (mediaRecoveries.current.has(media.storageKey)) return;
        mediaRecoveries.current.add(media.storageKey);
        try {
            const blob = await getResourceBlob(media.storageKey);
            if (!blob) throw new Error("参考素材尚未保存为资源。");
            if (!mediaAlive.current) return;
            const url = URL.createObjectURL(blob); ownedMediaURLs.current.set(media.storageKey, url);
            setMediaURLs(current => ({ ...current, [media.storageKey]: url }));
        } catch (error) { if (mediaAlive.current) setMediaError(error instanceof Error ? error.message : "参考素材读取失败"); }
    };
    const mediaKeys = JSON.stringify(doc.media.map(media => media.storageKey));
    useEffect(() => {
        let disposed = false;
        setMediaError("");
        void Promise.all((JSON.parse(mediaKeys) as string[]).map(async key => [key, resolveResourceAccessURL((await getResourceAccess(key, "browser-process")).url)] as const)).then(entries => {
            if (!disposed) setMediaURLs(Object.fromEntries(entries.map(([key, url]) => [key, ownedMediaURLs.current.get(key) || url])));
        }).catch(error => { if (!disposed) setMediaError(error instanceof Error ? error.message : "参考素材读取失败"); });
        return () => { disposed = true; };
    }, [mediaKeys, studio.owner]);
    const video = useRef<HTMLVideoElement>(null);
    const [textModel, setTextModel] = useState(config.textModel);
    const [imageModel, setImageModel] = useState(config.imageModel);
    const [videoModel, setVideoModel] = useState(config.videoModel);
    const text = textModel || config.textModel;
    const image = imageModel || config.imageModel;
    const movie = videoModel || config.videoModel;
    const projects = useQuery({ queryKey: ["studio-projects", studio.owner], queryFn: () => listProjects({ page: 1, pageSize: 50 }), enabled: Boolean(studio.owner) && tool !== "creative-title" });
    const field = (key: string, value: string) => change({ ...doc, fields: { ...doc.fields, [key]: value } });
    const addMedia = async (file: File) => { const media = await uploadStudioMedia(file, file.name, studio.owner); change({ ...doc, media: [...doc.media, media] }); };
    const sendToCanvas = (assetIds?: string[]) => studio.perform(async () => {
        const saved = await saveStudioDocument(doc, studio.owner);
        const path = creationCanvasHandoffPath(assetIds ?? [saved.id]);
        if (path) routeNavigate(path, { state: { returnTo: studioWorkPath(location.pathname, location.search, saved.id), returnState: location.state } });
    });
    const saveProject = () => studio.perform(async () => {
        if (!projectId || !(doc.result || doc.shots.length)) throw new Error("请选择项目，并先完成可保存的正文。");
        await saveStudioDocument(doc, studio.owner);
        // Create a chapter rather than silently overwrite an existing chapter or storyboard.
        const sourceText = doc.result || doc.shots.map((shot, i) => `${i + 1}. ${shot.scene}\n${shot.action}\n${shot.dialogue}\n${shot.camera}\n${shot.prompt}`).join("\n\n");
        const result = await createProjectUnit(projectId, { kind: "chapter", title: doc.title || "创作作品", sourceText });
        if (tool === "director-guide") await replaceProjectUnitShots(projectId, result.unit.id, doc.shots.map(shot => ({ title: shot.scene || shot.action.slice(0, 40), description: shot.action, durationMs: Math.round(shot.duration * 1000), revision: { plotDescription: shot.scene, action: shot.action, dialogue: shot.dialogue, cameraMovement: shot.camera, durationMs: Math.round(shot.duration * 1000), imagePrompt: shot.prompt, videoPrompt: shot.prompt } })), []);
        navigate(`/projects/${encodeURIComponent(projectId)}/chapters/${encodeURIComponent(result.unit.id)}`);
    });
    const lastImage = [...doc.media].reverse().find(item => item.kind === "image");
    const sourceVideo = doc.media.find(item => item.kind === "video" && item.source === "reference");
    const generatedVideo = [...doc.media].reverse().find(item => item.kind === "video" && item.source === "generated");
    const captureFrame = () => studio.perform(async () => {
        const element = video.current;
        if (!element || element.readyState < 2) throw new Error("请先等待视频画面就绪。");
        const canvas = document.createElement("canvas"); canvas.width = element.videoWidth; canvas.height = element.videoHeight;
        const context = canvas.getContext("2d"); if (!context) throw new Error("截帧画布不可用。");
        context.drawImage(element, 0, 0);
        const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(value => value ? resolve(value) : reject(new Error("截帧失败。")), "image/png"));
        const media = await uploadStudioMedia(blob, "frame.png", studio.owner);
        change({ ...doc, fields: { ...doc.fields, frameTime: String(element.currentTime) }, media: [...doc.media, media] });
    });
    const blendVideo = () => studio.perform(async () => {
        const element = video.current;
        if (!element || !sourceVideo || !generatedVideo) throw new Error("请先选择原片并生成片头动效。");
        const duration = element.duration;
        const read = async (media: StudioMedia) => { const blob = await getResourceBlob(media.storageKey); if (!blob) throw new Error("视频尚未保存为资源。"); if (blob.size > 200 * 1024 * 1024) throw new Error("视频超过本机融合大小限制。"); return blob; };
        const { blendGeneratedTitleVideo } = await import("@/services/creative-title-video");
        const blob = await blendGeneratedTitleVideo(await read(sourceVideo), await read(generatedVideo), { start: seconds, length: Math.min(Number(doc.fields.duration || 5), duration - seconds), duration, width: element.videoWidth, height: element.videoHeight });
        const media = await uploadStudioMedia(blob, `${doc.title || "title"}.mp4`, studio.owner);
        change({ ...doc, media: [...doc.media, { ...media, source: "generated" }] });
    });
    const presets = doc.presets.filter(item => item.kind === (tool === "director-guide" ? "director" : "style"));
    return <div className="production-studio">
        <aside className="studio-library">
            <Button onClick={() => studio.open()} disabled={busy}>{s("new")}</Button>
            <h2>{s("works")}</h2>
            {studio.documents.map(item => <button type="button" aria-pressed={item.id === doc.id} key={item.id} disabled={busy} onClick={() => studio.open(item.id)}>{item.title || "—"}</button>)}
        </aside>
        <main className="studio-workspace">
            <header className="studio-toolbar"><Input aria-label={s("title")} placeholder={s("title")} value={doc.title} disabled={busy} onChange={event => change({ ...doc, title: event.target.value })} /><span role="status">{studio.saved ? s("saved") : s("dirty")}</span><Button loading={busy} disabled={!studio.hydrated} onClick={() => void studio.save()}>{s("save")}</Button></header>
            {studio.error && <div className="studio-error" role="alert">{studio.error}</div>}
            {mediaError && <div className="studio-error" role="alert">{mediaError}</div>}
            <fieldset disabled={busy} inert={busy} className="studio-settings">
                <legend>{s("settings")}</legend>
                <div className="studio-form-grid">
                    {tool === "script-creation" && <>
                        <StudioField label={s("mode")}><Select value={doc.fields.mode || "原创"} options={[{ value: "原创", label: s("original") }, { value: "改编", label: s("adapt") }]} onChange={value => field("mode", value)} /></StudioField>
                        <StudioField label={s("genre")}><Input value={doc.fields.genre || ""} onChange={event => field("genre", event.target.value)} /></StudioField>
                        <StudioField label={s("structure")}><Input value={doc.fields.structure || ""} onChange={event => field("structure", event.target.value)} /></StudioField>
                        <StudioField label={s("episodes")}><InputNumber min={1} max={100} value={Number(doc.fields.episodes || 1)} onChange={value => field("episodes", String(value || 1))} /></StudioField>
                        <StudioField label={s("seconds")}><InputNumber min={10} max={7200} value={Number(doc.fields.duration || 60)} onChange={value => field("duration", String(value || 60))} /></StudioField>
                        <StudioField label={s("relationships")}><Input value={doc.fields.characters || ""} onChange={event => field("characters", event.target.value)} /></StudioField>
                    </>}
                    {tool === "director-guide" && <>
                        <StudioField label={s("mode")}><Select value={doc.fields.mode || "电影"} options={[{ value: "电影", label: s("film") }, { value: "MV", label: "MV" }]} onChange={value => field("mode", value)} /></StudioField>
                        <StudioField label={s("director")}><Input value={doc.fields.director || ""} onChange={event => field("director", event.target.value)} /></StudioField>
                        <StudioField label={s("rhythm")}><Input value={doc.fields.rhythm || ""} onChange={event => field("rhythm", event.target.value)} /></StudioField>
                        <StudioField label={s("optics")}><Input value={doc.fields.camera || ""} onChange={event => field("camera", event.target.value)} /></StudioField>
                        <StudioField label={s("lighting")}><Input value={doc.fields.lighting || ""} onChange={event => field("lighting", event.target.value)} /></StudioField>
                        <StudioField label={s("styling")}><Input value={doc.fields.styling || ""} onChange={event => field("styling", event.target.value)} /></StudioField>
                    </>}
                    {tool === "creative-title" && <>
                        <StudioField label={s("titleStyle")}><Input.TextArea value={doc.fields.style || ""} onChange={event => field("style", event.target.value)} /></StudioField>
                        <StudioField label={s("titleMotion")}><Input.TextArea value={doc.fields.motion || ""} onChange={event => field("motion", event.target.value)} /></StudioField>
                        <StudioField label={s("seconds")}><InputNumber min={1} max={20} value={Number(doc.fields.duration || 5)} onChange={value => field("duration", String(value || 5))} /></StudioField>
                    </>}
                    <StudioModel config={config} mode={tool === "creative-title" ? "image" : "text"} value={tool === "creative-title" ? image : text} onChange={tool === "creative-title" ? setImageModel : setTextModel} />
                </div>
                <div className="studio-preset-row"><Input aria-label={s("presetName")} placeholder={s("presetName")} value={presetName} onChange={event => setPresetName(event.target.value)} /><Button disabled={!presetName.trim()} onClick={() => { change({ ...doc, presets: [...doc.presets, { id: crypto.randomUUID(), name: presetName.trim(), prompt: JSON.stringify(doc.fields), kind: tool === "director-guide" ? "director" : "style" }] }); setPresetName(""); }}>{s("presetSave")}</Button>
                    {presets.map(preset => <span key={preset.id}><Button onClick={() => { const value = JSON.parse(preset.prompt) as Record<string, string>; change({ ...doc, fields: value }); }}>{preset.name}</Button><Button type="text" aria-label={`${s("remove")} ${preset.name}`} onClick={() => change({ ...doc, presets: doc.presets.filter(item => item.id !== preset.id) })}>×</Button></span>)}
                </div>
                <StudioField label={s("input")}><Input.TextArea rows={6} value={doc.input} onChange={event => change({ ...doc, input: event.target.value })} /></StudioField>
                <div className="studio-actions">
                    {tool !== "creative-title" && <label className="studio-upload">{s("import")}<input type="file" accept="text/plain,text/markdown,.txt,.md" onChange={event => { const file = event.target.files?.[0]; if (file) void studio.perform(async () => { if (file.size > 4 * 1024 * 1024) throw new Error("文本文件不能超过4MB。"); change({ ...doc, input: await file.text() }); }); }} /></label>}
                    {tool === "creative-title" ? <><Button type="primary" disabled={!doc.title.trim() || !lastImage || !image} onClick={() => void studio.generate("image", image, "", undefined, [lastImage!])}>{s("design")}</Button><StudioModel config={config} mode="video" value={movie} onChange={setVideoModel} /><Button disabled={!lastImage || !movie} onClick={() => void studio.generate("video", movie, doc.fields.motion, undefined, [lastImage!])}>{s("motion")}</Button></> : <Button type="primary" disabled={!doc.input.trim() || !text} onClick={() => void studio.generate("generate", text)}>{s("generate")}</Button>}
                </div>
            </fieldset>
            <section className="studio-reference-panel"><h2>{s("reference")}</h2><label className="studio-upload">{s("upload")}<input type="file" disabled={busy} accept={tool === "creative-title" ? "image/*,video/*" : "image/*,video/*,audio/*"} onChange={event => { const file = event.target.files?.[0]; if (file) void studio.perform(() => addMedia(file)); }} /></label>
                <div className="studio-media-grid">{doc.media.map(media => <figure key={media.id}>
                    {media.kind === "image" ? <img src={mediaURLs[media.storageKey]} alt={media.name} loading="lazy" onError={() => void recoverMedia(media)} />
                        : media.kind === "video" ? <video crossOrigin="anonymous" ref={media.id === sourceVideo?.id ? video : undefined} src={mediaURLs[media.storageKey]} controls preload="metadata" onError={() => void recoverMedia(media)} />
                            : <audio src={mediaURLs[media.storageKey]} controls preload="metadata" onError={() => void recoverMedia(media)} />}
                    <figcaption>{media.name}</figcaption><Button disabled={busy} onClick={() => change({ ...doc, media: doc.media.filter(item => item.id !== media.id) })}>{s("remove")}</Button>
                    {media.kind !== "audio" && <Button disabled={busy} onClick={() => void sendToCanvas([media.id])}>{s("canvas")}</Button>}
                </figure>)}</div>
                {tool === "creative-title" && sourceVideo && <div className="studio-actions"><InputNumber aria-label={s("seconds")} min={0} value={seconds} onChange={value => { setSeconds(value || 0); if (video.current) video.current.currentTime = value || 0; }} /><Button disabled={busy} onClick={() => void captureFrame()}>{s("frame")}</Button><Button disabled={busy || !generatedVideo} onClick={() => void blendVideo()}>{s("blend")}</Button></div>}
            </section>
            {tool === "script-creation" && <section className="studio-result-panel"><h2>{s("result")}</h2><Input.TextArea aria-label={s("result")} value={doc.result} rows={22} disabled={busy} onChange={event => change({ ...doc, result: event.target.value })} /><div className="studio-actions"><Input aria-label={s("instruction")} placeholder={s("instruction")} value={instruction} disabled={busy} onChange={event => setInstruction(event.target.value)} /><Button disabled={busy || !doc.result || !instruction.trim()} onClick={() => void studio.generate("refine", text, instruction)}>{s("refine")}</Button><Button disabled={!doc.result} onClick={() => downloadText(doc.title, doc.result)}>{s("export")}</Button></div></section>}
            {tool === "director-guide" && <section className="studio-result-panel"><h2>{s("shots")}</h2><div className="studio-actions"><Input aria-label={s("instruction")} placeholder={s("instruction")} value={instruction} disabled={busy} onChange={event => setInstruction(event.target.value)} /><Button disabled={busy || !doc.shots.length || !instruction.trim()} onClick={() => void studio.generate("optimize", text, instruction)}>{s("optimize")}</Button><Button disabled={busy} onClick={() => change({ ...doc, shots: [...doc.shots, { id: crypto.randomUUID(), scene: "", action: "", dialogue: "", camera: "", prompt: "", duration: 5 }] })}>{s("addShot")}</Button><Link to="/canvas?tool=director">3D ↗</Link></div>
                <div className="studio-form-grid"><StudioModel config={config} mode="image" value={image} onChange={setImageModel} /><StudioModel config={config} mode="video" value={movie} onChange={setVideoModel} /></div>
                {doc.shots.map((shot, index) => <fieldset key={shot.id} disabled={busy} className="studio-shot"><legend>{index + 1}</legend><div className="studio-form-grid">{(["scene", "action", "dialogue", "camera", "prompt"] as const).map(key => <StudioField key={key} label={s(key)}><Input.TextArea value={shot[key]} rows={key === "prompt" ? 4 : 2} onChange={event => change({ ...doc, shots: doc.shots.map(item => item.id === shot.id ? { ...item, [key]: event.target.value } : item) })} /></StudioField>)}<StudioField label={s("seconds")}><InputNumber value={shot.duration} min={1} max={120} onChange={value => change({ ...doc, shots: doc.shots.map(item => item.id === shot.id ? { ...item, duration: value || 5 } : item) })} /></StudioField></div><div className="studio-actions"><Button disabled={!instruction.trim() || !text} onClick={() => void studio.generate("optimize", text, instruction, shot.id)}>{s("optimizeOne")}</Button><Button disabled={!shot.prompt.trim() || !image} onClick={() => void studio.generate("image", image, "", shot.id, doc.media.filter(item => item.kind === "image").slice(-1))}>{s("image")}</Button><Button disabled={!shot.prompt.trim() || !movie} onClick={() => void studio.generate("video", movie, "", shot.id, shot.image ? [shot.image] : [])}>{s("video")}</Button><Button onClick={() => change({ ...doc, shots: doc.shots.filter(item => item.id !== shot.id) })}>{s("remove")}</Button></div></fieldset>)}
            </section>}
            {tool !== "creative-title" && <div className="studio-actions"><Select aria-label={s("chooseProject")} value={projectId || undefined} placeholder={s("chooseProject")} onChange={setProjectId} options={projects.data?.projects.map(({ project }) => ({ value: project.id, label: project.name }))} /><Button disabled={busy || !projectId || !(doc.result || doc.shots.length)} onClick={() => void saveProject()}>{s("project")}</Button></div>}
            {tool !== "creative-title" && <Button disabled={busy || !(doc.result || doc.shots.length)} onClick={() => void sendToCanvas()}>{s("canvas")}</Button>}
            {doc.runs.length > 0 && <section className="studio-history"><h2>{s("history")}</h2>{studio.task && <p role="status">{studio.task.status} {studio.task.progress ?? ""} {studio.task.error || ""}{(studio.task.status === "queued" || studio.task.status === "running") && <Button onClick={() => void studio.cancel()}>{s("cancel")}</Button>}</p>}{doc.runs.slice().reverse().map(run => <div key={run.taskId}><code>{run.taskId}</code><span>{run.stage}</span><Button disabled={busy} onClick={() => void studio.recover(run)}>{s("restore")}</Button></div>)}</section>}
        </main>
    </div>;
}
