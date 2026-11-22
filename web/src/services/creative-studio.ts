import type { StudioDocument, StudioMedia } from "@/lib/creative-studio";
import { useAssetStore, type TextAsset } from "@/stores/use-asset-store";
import { useUserStore } from "@/stores/use-user-store";
import { hasRemoteUserDataSyncSession, saveRemoteUserDataNow } from "./user-data-sync";
import { getRemoteAsset } from "./api/user-data";
import { getResourceBlob, uploadResourceFile, resourceStorageKey, resourceFileUrl, resourceIdFromStorageKey } from "./api/resources";
import { parseBackendGenerationResult } from "./api/generation-task";
import type { GenerationTask } from "./api/task-center";
import { canonicalize } from "json-canonicalize";

export function assertStudioSession(owner: string) {
    if (!owner || useUserStore.getState().user?.id !== owner || !hasRemoteUserDataSyncSession()) throw new Error("登录会话已变化，请重新打开工具。");
    if (!useAssetStore.getState().hydrated) throw new Error("作品尚未恢复，请稍后重试。");
}

export function studioDocumentFromAsset(asset: TextAsset): StudioDocument | null {
    const value = asset.metadata?.creativeStudio as StudioDocument | undefined;
    if (asset.metadata?.source !== "creative-studio" || !value || value.version !== 1 || value.id !== asset.id || !["script-creation", "director-guide", "creative-title"].includes(value.tool) || !Array.isArray(value.shots) || !Array.isArray(value.media) || !Array.isArray(value.runs) || !Array.isArray(value.presets) || !value.fields) return null;
    return value;
}

export async function saveStudioDocument(doc: StudioDocument, owner: string) {
    assertStudioSession(owner);
    const value = { ...doc, updatedAt: new Date().toISOString() };
    const content = doc.result || doc.shots.map((shot, index) => `${index + 1}. ${shot.scene}\n${shot.action}\n${shot.dialogue}\n${shot.camera}`).join("\n\n") || doc.input || doc.title;
    const asset: TextAsset = { id: doc.id, kind: "text", title: doc.title.trim() || "创作草稿", coverUrl: "", category: "material", tags: [], status: "draft", data: { content }, createdAt: doc.createdAt, updatedAt: value.updatedAt, metadata: { source: "creative-studio", creativeStudio: value } };
    // Use the existing scoped store and cloud revision pipeline, including its conflict handling.
    const store = useAssetStore.getState();
    if (store.assets.some(item => item.id === doc.id)) store.updateAsset(doc.id, asset);
    else store.replaceAssets([...store.assets, asset]);
    await saveRemoteUserDataNow();
    assertStudioSession(owner);
    const saved = (await getRemoteAsset(doc.id)).asset;
    assertStudioSession(owner);
    if (saved.kind !== "text" || canonicalize(studioDocumentFromAsset(saved)) !== canonicalize(value)) throw new Error("云端回读与当前草稿不一致，请保留页面并重试保存。");
    return value;
}

export async function uploadStudioMedia(file: File | Blob, name: string, owner: string): Promise<StudioMedia> {
    assertStudioSession(owner);
    const kind = file.type.startsWith("image/") ? "image" : file.type.startsWith("video/") ? "video" : file.type.startsWith("audio/") ? "audio" : null;
    if (!kind) throw new Error("请选择图片、视频或音频文件。");
    let dimensions: { width: number; height: number } | undefined;
    if (kind === "image") {
        const image = await createImageBitmap(file);
        try { dimensions = { width: image.width, height: image.height }; } finally { image.close(); }
    }
    assertStudioSession(owner);
    const resource = await uploadResourceFile(file, kind, { fileName: name, ...dimensions });
    assertStudioSession(owner);
    const url = resource.publicUrl || resourceFileUrl(resource.id);
    const storageKey = resourceStorageKey(resource.id);
    const common = { title: name, coverUrl: kind === "image" ? url : "", category: "material" as const, tags: [], metadata: { source: "creative-studio-upload" } };
    const data = { storageKey, bytes: resource.size, mimeType: resource.mimeType || file.type, width: resource.width || dimensions?.width || 0, height: resource.height || dimensions?.height || 0 };
    const id = useAssetStore.getState().addAsset(kind === "image" ? { ...common, kind, data: { ...data, dataUrl: url } } : kind === "video" ? { ...common, kind, data: { ...data, url, durationMs: resource.durationMs } } : { ...common, kind, data: { ...data, url, durationMs: resource.durationMs } });
    await saveRemoteUserDataNow(); assertStudioSession(owner);
    return { id, storageKey, url, name, kind, mimeType: data.mimeType, source: "reference" };
}

export async function materializeStudioResult(task: GenerationTask, title: string, owner: string): Promise<StudioMedia> {
    assertStudioSession(owner);
    const result = parseBackendGenerationResult(task);
    const image = result.images?.[0];
    const video = result.video;
    const media = image || video;
    if (!media?.storageKey || !resourceIdFromStorageKey(media.storageKey)) throw new Error("生成结果尚未保存为正式资源，请在任务完成后恢复结果。");
    const kind = image ? "image" : "video";
    const url = image?.dataUrl || video?.dataUrl || "";
    if (!url) throw new Error("生成结果没有可访问的媒体地址。");
    const common = { title, coverUrl: image ? url : "", category: "material" as const, tags: [], metadata: { source: "creative-studio-result", taskId: task.id } };
    let width = media.width || 0, height = media.height || 0;
    if (image && (!width || !height)) {
        const blob = await getResourceBlob(media.storageKey);
        if (!blob) throw new Error("生成图片尚未保存为正式资源。");
        const bitmap = await createImageBitmap(blob);
        try { width = bitmap.width; height = bitmap.height; } finally { bitmap.close(); }
        assertStudioSession(owner);
    }
    const data = { storageKey: media.storageKey, width, height, bytes: media.bytes || 0, mimeType: media.mimeType || (image ? "image/png" : "video/mp4") };
    const id = await useAssetStore.getState().addGenerationAsset(`creative-studio:${task.id}:0`, image ? { ...common, kind: "image", data: { ...data, dataUrl: url } } : { ...common, kind: "video", data: { ...data, url, durationMs: video?.durationMs } });
    await saveRemoteUserDataNow();
    assertStudioSession(owner);
    return { id, url, storageKey: media.storageKey, kind, name: title, mimeType: data.mimeType, source: "generated" };
}
