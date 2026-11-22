import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router";
import { useAssetStore } from "@/stores/use-asset-store";
import { useUserStore } from "@/stores/use-user-store";
import { useEffectiveConfig } from "@/stores/use-config-store";
import { newStudioDocument, applyStudioResult, studioPrompt, type StudioDocument, type StudioTool, type StudioMedia } from "@/lib/creative-studio";
import { assertStudioSession, materializeStudioResult, saveStudioDocument, studioDocumentFromAsset } from "@/services/creative-studio";
import { submitBackendGenerationTask } from "@/services/api/generation-task";
import { cancelGenerationTask, listGenerationTasks, queryGenerationTask, waitForGenerationTask, type GenerationTask } from "@/services/api/task-center";
import { parseBackendGenerationResult } from "@/services/api/generation-task";
import { getSkill } from "@/services/api/skills";
import { skillRuntime } from "@/services/skill-runtime";
import { findCreativeTool } from "./creative-tool-entries";

export function useCreativeStudio(tool: StudioTool) {
    const owner = useUserStore(state => state.user?.id || "");
    const config = useEffectiveConfig();
    const assets = useAssetStore(state => state.assets);
    const hydrated = useAssetStore(state => state.hydrated);
    const [params, setParams] = useSearchParams();
    const [doc, setDoc] = useState(() => newStudioDocument(tool));
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    const [saved, setSaved] = useState(false);
    const [task, setTask] = useState<GenerationTask | null>(null);
    const lock = useRef(false);
    const mounted = useRef(true);
    const controller = useRef<AbortController | null>(null);
    const current = useRef(doc); current.current = doc;
    const opened = useRef("");
    const documents = assets.flatMap(asset => asset.kind === "text" ? [studioDocumentFromAsset(asset)].filter((item): item is StudioDocument => Boolean(item && item.tool === tool)) : []);
    useEffect(() => { mounted.current = true; return () => { mounted.current = false; controller.current?.abort(); }; }, []);
    useEffect(() => {
        if (!hydrated) return;
        const id = params.get("work");
        const key = `${owner}:${id || "new"}`;
        if (key === opened.current) return;
        opened.current = key;
        const existing = id ? documents.find(item => item.id === id) : null;
        if (id && !existing) { const empty = newStudioDocument(tool); current.current = empty; setDoc(empty); setSaved(false); setTask(null); setError("作品不存在或当前账号无权访问。"); return; }
        const value = existing || newStudioDocument(tool);
        setDoc(value); setSaved(Boolean(existing)); setError(""); setTask(null);
    }, [owner, hydrated, params, documents, tool]);
    useEffect(() => {
        if (!owner || !hydrated || !params.get("work")) return;
        let disposed = false;
        void listGenerationTasks(100).then(tasks => {
            if (disposed || useUserStore.getState().user?.id !== owner) return;
            const recovered = tasks.flatMap(task => {
                try {
                    const metadata = JSON.parse(task.inputJson || "{}").metadata;
                    return metadata?.source === "creative-studio" && metadata.documentId === current.current.id && typeof metadata.studioStage === "string" ? [{ taskId: task.id, stage: metadata.studioStage as string, targetId: typeof metadata.studioTargetId === "string" ? metadata.studioTargetId : undefined }] : [];
                } catch { return []; }
            });
            const known = new Set(current.current.runs.map(run => run.taskId));
            const missing = recovered.filter(run => !known.has(run.taskId));
            if (missing.length) { const value = { ...current.current, runs: [...current.current.runs, ...missing] }; current.current = value; setDoc(value); setSaved(false); }
        }).catch(cause => { if (!disposed) setError(cause instanceof Error ? cause.message : String(cause)); });
        return () => { disposed = true; };
    }, [owner, hydrated, params.get("work")]);
    const change = (value: StudioDocument) => { current.current = value; setDoc(value); setSaved(false); };
    const save = async (value = current.current) => {
        const result = await saveStudioDocument(value, owner);
        if (mounted.current) { current.current = result; setDoc(result); setSaved(true); opened.current = `${owner}:${result.id}`; setParams({ work: result.id }, { replace: true }); }
        return result;
    };
    const perform = async (operation: () => Promise<void>) => {
        if (lock.current) return;
        lock.current = true; setBusy(true); setError("");
        try { assertStudioSession(owner); await operation(); }
        catch (cause) { if (mounted.current) setError(cause instanceof Error ? cause.message : String(cause)); }
        finally { lock.current = false; if (mounted.current) setBusy(false); }
    };
    const acceptTask = async (completed: GenerationTask, value: StudioDocument, stage: string, targetId?: string) => {
        assertStudioSession(owner);
        if (completed.status !== "succeeded") throw new Error(completed.error || `任务状态：${completed.status}`);
        let next = value;
        if (stage === "image" || stage === "video") {
            const media = await materializeStudioResult(completed, value.title || "创作作品", owner);
            next = { ...value, media: [...value.media.filter(item => item.id !== media.id), media], ...(targetId ? { shots: value.shots.map(shot => shot.id === targetId ? { ...shot, [stage]: media } : shot) } : {}) };
        } else next = applyStudioResult(value, stage, parseBackendGenerationResult(completed).text || "", targetId);
        change(next);
        await save(next);
    };
    const generate = (stage: string, model: string, instruction = "", targetId?: string, references?: StudioMedia[]) => perform(async () => {
        const mode = stage === "image" || stage === "video" ? stage : "text";
        if (!model.trim()) throw new Error("请选择已配置的生成模型。");
        const lastRun = current.current.runs.at(-1);
        if (lastRun) {
            const previous = await queryGenerationTask(lastRun.taskId);
            if (previous.status === "queued" || previous.status === "running") { setTask(previous); throw new Error("此作品已有生成任务，请恢复结果或先取消任务。"); }
        }
        const value = await save();
        let prompt = studioPrompt(value, stage, instruction, targetId);
        let skillMetadata: Record<string, unknown> = {};
        const skillId = findCreativeTool(tool)?.skillId;
        if (mode === "text" && skillId) {
            const { skill } = await getSkill(skillId);
            const prepared = await skillRuntime.prepare({ profile: tool === "director-guide" ? "director" : "creation", prompt, skills: [skill], selectedSkillIds: [skillId] });
            prompt = prepared.prompt; skillMetadata = prepared.metadata;
        }
        const selected = references || value.media.filter(item => item.source === "reference");
        const abort = new AbortController(); controller.current = abort;
        const submitted = await submitBackendGenerationTask({ mode, prompt, config: { ...config, model, count: "1", ...(mode === "video" ? { videoSeconds: targetId ? String(value.shots.find(shot => shot.id === targetId)?.duration || 5) : value.fields.duration || "5" } : {}) }, signal: abort.signal,
            referenceImages: selected.filter(item => item.kind === "image").map(item => ({ id: item.id, name: item.name, type: item.mimeType || "image/png", dataUrl: item.url, storageKey: item.storageKey })),
            referenceAudios: selected.filter(item => item.kind === "audio").map(item => ({ id: item.id, name: item.name, type: item.mimeType || "audio/mpeg", url: item.url, storageKey: item.storageKey })),
            referenceVideos: selected.filter(item => item.kind === "video").map(item => ({ id: item.id, name: item.name, type: item.mimeType || "video/mp4", url: item.url, storageKey: item.storageKey })),
            clientOperationId: `studio:${value.id}:${value.runs.length}:${stage}:${targetId || "all"}`,
            metadata: { ...skillMetadata, source: "creative-studio", documentId: value.id, studioTool: tool, studioStage: stage, ...(targetId ? { studioTargetId: targetId } : {}) },
        });
        assertStudioSession(owner);
        if (mounted.current) setTask(submitted);
        const running = { ...value, runs: [...value.runs, { taskId: submitted.id, stage, targetId }] };
        change(running); await save(running);
        const completed = await waitForGenerationTask(submitted.id, { initialTask: submitted, signal: abort.signal, useTextEvents: mode === "text", onTaskUpdate: update => { if (mounted.current) setTask(update); } });
        if (mounted.current) await acceptTask(completed, running, stage, targetId);
    });
    const recover = (run: StudioDocument["runs"][number]) => perform(async () => {
        const abort = new AbortController(); controller.current = abort;
        const existing = await queryGenerationTask(run.taskId, { signal: abort.signal });
        setTask(existing);
        const completed = existing.status === "queued" || existing.status === "running" ? await waitForGenerationTask(run.taskId, { initialTask: existing, signal: abort.signal, onTaskUpdate: update => { if (mounted.current) setTask(update); } }) : existing;
        if (mounted.current) await acceptTask(completed, current.current, run.stage, run.targetId);
    });
    return { doc, change, documents, busy, error, saved, task, config, owner, hydrated, save: () => perform(async () => { await save(); }), perform, generate, recover,
        cancel: async () => { if (!task) return; try { const result = await cancelGenerationTask(task.id); if (mounted.current) setTask(result); } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); } },
        open: (id?: string) => { if (busy) return; if (!id) { const value = newStudioDocument(tool); current.current = value; setDoc(value); setSaved(false); setTask(null); setError(""); opened.current = `${owner}:new`; } setParams(id ? { work: id } : {}); },
    };
}
