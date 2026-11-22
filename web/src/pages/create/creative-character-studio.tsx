import { useEffect, useRef, useState } from "react";
import { App, Button, Input, Select, Tabs } from "antd";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation, useNavigate, useSearchParams } from "react-router";
import { bindCharacterVoice, createCharacter, getCharacter, listCharacters, replaceCharacterRepresentations, updateCharacter, type ProjectCharacterDetail } from "@/services/api/projects";
import { listGenerationTasks, queryGenerationTask, waitForGenerationTask } from "@/services/api/task-center";
import { submitBackendGenerationTask } from "@/services/api/generation-task";
import { assertStudioSession, materializeStudioResult, uploadStudioMedia } from "@/services/creative-studio";
import { resourceFileUrl, resourceIdFromStorageKey } from "@/services/api/resources";
import { getRemoteAsset } from "@/services/api/user-data";
import { useAssetStore } from "@/stores/use-asset-store";
import { useUserStore } from "@/stores/use-user-store";
import { useEffectiveConfig } from "@/stores/use-config-store";
import { useInterfaceTranslation } from "@/stores/use-interface-locale-store";
import { creationCanvasHandoffPath } from "@/lib/canvas/canvas-asset-handoff";
import { CHARACTER_VOICE_UPLOAD_ACCEPT, isSupportedCharacterVoiceFile } from "@/lib/character-voice-formats";
import type { StudioMedia } from "@/lib/creative-studio";
import { studioWorkPath } from "@/lib/creative-studio";
import { StudioField, StudioModel } from "./creative-production-studio";
import { useStudioCopy } from "./studio-copy";

type CharacterState = { id: string; name: string; attributes: Record<string, string>; media?: StudioMedia; taskId?: string };
const fields = ["role", "appearance", "physique", "clothing", "personality", "props", "consistencyPrompt", "multiViewPrompt"] as const;
const labels = ["projectUi.characterFieldRole", "projectUi.characterFieldAppearance", "projectUi.characterFieldPhysique", "projectUi.characterFieldClothing", "projectUi.characterFieldPersonality", "projectUi.characterFieldProps", "projectUi.characterFieldConsistency", "projectUi.characterFieldTurnaround"] as const;

export default function CreativeCharacterStudio() {
    const s = useStudioCopy(); const { t } = useInterfaceTranslation();
    const owner = useUserStore(state => state.user?.id || "");
    const config = useEffectiveConfig(); const client = useQueryClient(); const navigate = useNavigate(); const location = useLocation(); const { message } = App.useApp();
    const [params, setParams] = useSearchParams();
    const workId = params.get("work") || "";
    const opened = useRef("");
    const [loadAttempt, setLoadAttempt] = useState(0);
    const [page, setPage] = useState(1); const [query, setQuery] = useState(""); const [search, setSearch] = useState("");
    const [character, setCharacter] = useState<ProjectCharacterDetail | null>(null);
    const [name, setName] = useState(""); const [states, setStates] = useState<CharacterState[]>([]); const [stateId, setStateId] = useState("");
    const [model, setModel] = useState(""); const [busy, setBusy] = useState(false); const [error, setError] = useState(""); const [saved, setSaved] = useState(false);
    const lock = useRef(false); const mounted = useRef(true);
    useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
    const library = useQuery({ queryKey: ["studio-characters", owner, page, search], queryFn: () => listCharacters({ page, pageSize: 12, query: search }), enabled: Boolean(owner) });
    const active = states.find(state => state.id === stateId);
    const display = (value: ProjectCharacterDetail) => {
        const raw = value.character.definition.studioStates;
        const stored = Array.isArray(raw) ? raw.filter((item): item is CharacterState => Boolean(item && typeof item === "object" && typeof item.id === "string" && typeof item.name === "string" && item.attributes)) : [];
        const initial = { id: crypto.randomUUID(), name: value.asset.title, attributes: Object.fromEntries(fields.map(key => [key, String(value.character.definition[key] || "")])) };
        const next = stored.length ? stored : [initial];
        const activeId = value.character.definition.studioActiveStateId;
        setCharacter(value); setName(value.asset.title); setStates(next); setStateId(next.some(item => item.id === activeId) ? String(activeId) : next[0].id); setSaved(true);
    };
    useEffect(() => { setCharacter(null); setStates([]); setName(""); setStateId(""); }, [owner]);
    useEffect(() => {
        const key = `${owner}:${workId}`;
        if (!owner || !workId || opened.current === key) return;
        let disposed = false;
        opened.current = "";
        setBusy(true); setError(""); setCharacter(null); setStates([]); setName(""); setStateId("");
        void client.fetchQuery({ queryKey: ["studio-character", owner, workId], queryFn: () => getCharacter(workId), staleTime: 0 }).then(value => {
            if (disposed || useUserStore.getState().user?.id !== owner) return;
            display(value); opened.current = key;
        }).catch(cause => {
            if (!disposed) setError(cause instanceof Error ? cause.message : String(cause));
        }).finally(() => { if (!disposed) setBusy(false); });
        return () => { disposed = true; };
    }, [owner, workId, client, loadAttempt]);
    const perform = async (operation: () => Promise<void>) => {
        if (lock.current) return; lock.current = true; setBusy(true); setError("");
        try { assertStudioSession(owner); await operation(); }
        catch (cause) { if (mounted.current) setError(cause instanceof Error ? cause.message : String(cause)); }
        finally { lock.current = false; if (mounted.current) setBusy(false); }
    };
    const save = async (nextStates = states) => {
        if (!name.trim()) throw new Error("请填写角色名称。");
        const current = nextStates.find(state => state.id === stateId) || nextStates[0];
        if (!current) throw new Error("请先创建角色状态。");
        assertStudioSession(owner);
        const definition = { ...character?.character.definition, ...current.attributes, studioStates: nextStates, studioActiveStateId: current.id };
        let value = character ? await updateCharacter(character.asset.id, { name, definition }) : await createCharacter({ name, definition });
        if (current.media) {
            const resourceId = resourceIdFromStorageKey(current.media.storageKey);
            if (!resourceId) throw new Error("角色状态图片尚未保存为资源。");
            const expected = [{ role: "primary", resourceId }, ...(current.media.source === "generated" && current.attributes.multiViewPrompt?.trim() ? [{ role: "turnaround_sheet", resourceId }] : [])];
            const visual = value.character.representations.filter(item => item.role === "primary" || item.role === "turnaround_sheet");
            if (visual.length !== expected.length || expected.some(item => !visual.some(actual => actual.role === item.role && actual.resourceId === item.resourceId))) {
                assertStudioSession(owner);
                value = await replaceCharacterRepresentations(value.asset.id, [...value.character.representations.filter(item => item.role !== "primary" && item.role !== "turnaround_sheet").map(item => ({ role: item.role, resourceId: item.resourceId })), ...expected]);
            }
        }
        assertStudioSession(owner);
        if (mounted.current) {
            setCharacter(value); setSaved(true); opened.current = `${owner}:${value.asset.id}`;
            setParams(previous => { const next = new URLSearchParams(previous); next.set("work", value.asset.id); return next; }, { replace: true });
        }
        void client.invalidateQueries({ queryKey: ["studio-characters", owner] });
        return value;
    };
    const applyImage = async (taskId: string, state: CharacterState, value: ProjectCharacterDetail) => {
        const initial = await queryGenerationTask(taskId);
        const task = initial.status === "running" || initial.status === "queued" ? await waitForGenerationTask(taskId, { initialTask: initial }) : initial;
        assertStudioSession(owner);
        if (task.status !== "succeeded") throw new Error(task.error || `任务状态：${task.status}`);
        const media = await materializeStudioResult(task, `${name} · ${state.name}`, owner);
        const resourceId = resourceIdFromStorageKey(media.storageKey);
        if (!resourceId) throw new Error("角色图尚未保存为资源。");
        const current = await getCharacter(value.asset.id);
        const nextStates = states.map(item => item.id === state.id ? { ...state, media, taskId } : item);
        await updateCharacter(value.asset.id, { name, definition: { ...current.character.definition, ...state.attributes, studioStates: nextStates, studioActiveStateId: state.id } });
        const role = state.attributes.multiViewPrompt?.trim() ? "turnaround_sheet" : "primary";
        const representations = current.character.representations.filter(item => item.role !== "turnaround_sheet" && item.role !== "primary").map(item => ({ role: item.role, resourceId: item.resourceId }));
        const result = await replaceCharacterRepresentations(value.asset.id, [...representations, { role: "primary", resourceId }, ...(role === "turnaround_sheet" ? [{ role, resourceId }] : [])]);
        assertStudioSession(owner);
        if (mounted.current) { setStates(nextStates); setCharacter(result); setSaved(true); }
        void client.invalidateQueries({ queryKey: ["studio-characters", owner] });
    };
    const generate = () => perform(async () => {
        if (!active || !Object.values(active.attributes).some(value => value.trim())) throw new Error("请填写角色外貌或造型。");
        const selected = model || config.imageModel;
        if (!selected) throw new Error("请选择图片模型。");
        if (character) {
            const pending = (await listGenerationTasks(100, { activeOnly: true })).find(task => {
                try { const metadata = JSON.parse(task.inputJson || "{}").metadata; return metadata?.source === "creative-character-studio" && metadata.characterAssetId === character.asset.id && metadata.studioStateId === active.id; } catch { return false; }
            });
            if (pending) { setStates(states.map(item => item.id === active.id ? { ...item, taskId: pending.id } : item)); throw new Error("这个角色已有生成任务，请点击恢复结果。"); }
        }
        if (active.taskId) { const old = await queryGenerationTask(active.taskId); if (old.status === "queued" || old.status === "running") throw new Error("这个角色已有生成任务，请恢复该任务。"); }
        const value = await save();
        const reference = active.media || states.find(item => item.media)?.media;
        const task = await submitBackendGenerationTask({ mode: "image", config: { ...config, model: selected, count: "1" }, clientOperationId: `character:${value.asset.id}:${active.id}:${value.character.versionId}`, prompt: `角色名称：${name}\n保持参考人物身份一致，根据以下完整造型设定生成角色图；只改变明确指定的特征。\n${Object.entries(active.attributes).map(([key, val]) => `${key}: ${val}`).join("\n")}`,
            referenceImages: reference ? [{ id: reference.id, name: reference.name, type: "image/png", dataUrl: reference.url, storageKey: reference.storageKey }] : [], metadata: { source: "creative-character-studio", characterAssetId: value.asset.id, studioStateId: active.id } });
        const running = states.map(item => item.id === active.id ? { ...item, taskId: task.id } : item);
        await updateCharacter(value.asset.id, { name, definition: { ...value.character.definition, studioStates: running, studioActiveStateId: active.id } });
        if (mounted.current) setStates(running);
        await applyImage(task.id, active, value);
    });
    const setAttribute = (key: string, val: string) => { setStates(states.map(state => state.id === stateId ? { ...state, attributes: { ...state.attributes, [key]: val } } : state)); setSaved(false); };
    const extraFields = ["age", "skin", "eyes", "nose", "lips", "face", "hair", "height", "body", "wardrobe", "makeup", "expression"] as const;
    return <div className="production-studio character-studio">
        <aside className="studio-library"><Button disabled={busy} onClick={() => { const state = { id: crypto.randomUUID(), name: s("defaultState"), attributes: {} }; setCharacter(null); setName(""); setStates([state]); setStateId(state.id); setSaved(false); setError(""); opened.current = ""; setParams(previous => { const next = new URLSearchParams(previous); next.delete("work"); return next; }); }}>{s("characterNew")}</Button><h2>{s("characters")}</h2><Input.Search value={query} onChange={event => setQuery(event.target.value)} onSearch={value => { setPage(1); setSearch(value); }} />
            {library.isError && <div role="alert">{String(library.error)}<Button onClick={() => void library.refetch()}>↻</Button></div>}
            {library.data?.characters.map(item => <button key={item.asset.id} aria-pressed={character?.asset.id === item.asset.id} disabled={busy} onClick={() => setParams(previous => { const next = new URLSearchParams(previous); next.set("work", item.asset.id); return next; })}>{item.asset.title}</button>)}<div className="studio-actions"><Button disabled={page === 1 || busy} onClick={() => setPage(page - 1)}>{s("previous")}</Button><Button disabled={!library.data?.hasMore || busy} onClick={() => setPage(page + 1)}>{s("next")}</Button></div>
        </aside>
        <main className="studio-workspace"><header className="studio-toolbar"><Input aria-label={s("title")} placeholder={s("title")} value={name} disabled={busy} onChange={event => { setName(event.target.value); setSaved(false); }} /><span role="status">{saved ? s("saved") : s("dirty")}</span><Button loading={busy} disabled={!active} onClick={() => void perform(async () => { await save(); message.success(s("saved")); })}>{s("save")}</Button></header>
            {error && <div className="studio-error" role="alert">{error}{!active && workId && <Button disabled={busy} onClick={() => setLoadAttempt(value => value + 1)}>{t("stateReload")}</Button>}</div>}
            <div className="studio-actions"><Select aria-label={s("state")} value={stateId || undefined} disabled={busy} options={states.map(state => ({ value: state.id, label: state.name }))} onChange={id => { setStateId(id); setSaved(false); }} /><Button disabled={busy || !active} onClick={() => { if (!active) return; const state = { id: crypto.randomUUID(), name: `${active.name} ${states.length + 1}`, attributes: { ...active.attributes }, media: active.media }; setStates([...states, state]); setStateId(state.id); setSaved(false); }}>{s("stateNew")}</Button></div>
            {active && <><div className="studio-form-grid"><StudioField label={s("state")}><Input value={active.name} disabled={busy} onChange={event => { setStates(states.map(state => state.id === stateId ? { ...state, name: event.target.value } : state)); setSaved(false); }} /></StudioField><StudioModel config={config} mode="image" value={model || config.imageModel} onChange={setModel} /></div><Tabs items={[{ key: "basic", label: t("projectUi.characterFieldAppearance"), children: <div className="studio-form-grid">{fields.map((key, i) => <StudioField key={key} label={t(labels[i])}><Input.TextArea rows={3} disabled={busy} value={active.attributes[key] || ""} onChange={event => setAttribute(key, event.target.value)} /></StudioField>)}</div> }, { key: "details", label: s("settings"), children: <div className="studio-form-grid">{extraFields.map(key => <StudioField key={key} label={s(key)}><Input disabled={busy} value={active.attributes[key] || ""} onChange={event => setAttribute(key, event.target.value)} /></StudioField>)}</div> }]} />
                <div className="studio-actions"><Button type="primary" loading={busy} disabled={!name.trim()} onClick={() => void generate()}>{s("image")}</Button>
                    {active.taskId && <Button disabled={busy || !character} onClick={() => void perform(async () => { if (character && active.taskId) await applyImage(active.taskId, active, character); })}>{s("restore")}</Button>}
                    <label className="studio-upload">{s("importCharacter")}<input disabled={busy} type="file" accept="image/*" onChange={event => { const file = event.target.files?.[0]; if (file) void perform(async () => { const media = await uploadStudioMedia(file, file.name, owner); const next = states.map(item => item.id === stateId ? { ...item, media } : item); setStates(next); const value = await save(next); const resourceId = resourceIdFromStorageKey(media.storageKey); if (!resourceId) throw new Error("图片资源无效。"); const result = await replaceCharacterRepresentations(value.asset.id, [...value.character.representations.filter(item => item.role !== "primary").map(item => ({ role: item.role, resourceId: item.resourceId })), { role: "primary", resourceId }]); setCharacter(result); }); }} /></label>
                    <label className="studio-upload">{s("voice")}<input disabled={busy || !character} type="file" accept={CHARACTER_VOICE_UPLOAD_ACCEPT} onChange={event => { const file = event.target.files?.[0]; if (file && character) void perform(async () => { if (!isSupportedCharacterVoiceFile(file)) throw new Error("声音格式不受支持。"); const media = await uploadStudioMedia(file, file.name, owner); const resourceId = resourceIdFromStorageKey(media.storageKey); if (!resourceId) throw new Error("声音资源无效。"); setCharacter(await bindCharacterVoice(character.asset.id, { sampleResourceId: resourceId, voiceName: file.name })); }); }} /></label>
                    <Button disabled={busy || !character} onClick={() => void perform(async () => { if (!character) return; const value = await save(); const remote = (await getRemoteAsset(value.asset.id)).asset; assertStudioSession(owner); const store = useAssetStore.getState(); store.replaceAssets([...store.assets.filter(item => item.id !== remote.id), remote]); const path = creationCanvasHandoffPath([remote.id]); if (path) navigate(path, { state: { returnTo: studioWorkPath(location.pathname, location.search, value.asset.id), returnState: location.state } }); })}>{s("canvas")}</Button></div>
                {(active.media || character?.character.representations.length) ? <div className="studio-media-grid">{active.media ? <figure><img src={active.media.url} alt={name} /></figure> : character?.character.representations.map(item => <figure key={item.id}><img src={resourceFileUrl(item.resourceId)} alt={item.role} loading="lazy" /></figure>)}</div> : null}
                {character?.character.voice?.profile.sampleResourceId && <audio controls src={resourceFileUrl(character.character.voice.profile.sampleResourceId)} preload="metadata" />}
            </>}
        </main>
    </div>;
}
