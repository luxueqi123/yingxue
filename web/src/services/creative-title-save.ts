import { uploadResourceFile, resourceFileUrl, resourceStorageKey } from "@/services/api/resources";
import { hasRemoteUserDataSyncSession, saveRemoteUserDataNow } from "@/services/user-data-sync";
import { useAssetStore } from "@/stores/use-asset-store";
import { useUserStore } from "@/stores/use-user-store";

export type TitleSaveAttempt = { userId: string; uploadKey: string; assetId?: string; kind?: "image" | "video" };
type TitleDetails = { title: string; width: number; height: number; timeMs: number; durationMs?: number };

export async function saveCreativeTitleFrame(blob: Blob, details: TitleDetails, attempt: TitleSaveAttempt) {
    if (!blob.size || blob.type !== "image/png") throw new Error("请先生成有效的 PNG 设计帧。");
    return saveTitleAsset(blob, details, attempt, "image");
}

export async function saveCreativeTitleVideo(blob: Blob, details: TitleDetails & { durationMs: number }, attempt: TitleSaveAttempt) {
    if (!blob.size || blob.type !== "video/mp4" || !Number.isFinite(details.durationMs) || details.durationMs <= 0) throw new Error("请先导出有效的 MP4 片头视频。");
    return saveTitleAsset(blob, details, attempt, "video");
}

async function saveTitleAsset(blob: Blob, details: TitleDetails, attempt: TitleSaveAttempt, kind: "image" | "video") {
    if (!details.title.trim() || details.title.length > 120 || ![details.width, details.height].every(value => Number.isInteger(value) && value > 0) || !Number.isFinite(details.timeMs) || details.timeMs < 0) throw new Error("设计帧信息不完整。");
    if (attempt.kind && attempt.kind !== kind) throw new Error("保存内容类型已变化，请重新创建保存请求。");
    attempt.kind = kind;
    const assertOwner = () => {
        if (!attempt.userId || useUserStore.getState().user?.id !== attempt.userId || !hasRemoteUserDataSyncSession()) throw new Error("登录或同步会话已变化，请重新打开片头工具。");
        if (!useAssetStore.getState().hydrated) throw new Error("素材库尚未恢复，请稍后重试。");
    };
    assertOwner();
    if (!attempt.assetId) {
        const resource = await uploadResourceFile(blob, kind, { fileName: kind === "image" ? "title-frame.png" : "title-video.mp4", width: details.width, height: details.height, durationMs: kind === "video" ? details.durationMs : undefined, idempotencyKey: attempt.uploadKey });
        assertOwner();
        if (!resource.id) throw new Error("上传未返回有效资源 ID。");
        const url = resource.publicUrl || resourceFileUrl(resource.id);
        const common = { title: details.title, tags: ["片头设计"], category: "material" as const, metadata: { source: "creative-title", sourceTimeMs: details.timeMs } };
        const data = { storageKey: resourceStorageKey(resource.id), width: resource.width || details.width, height: resource.height || details.height, bytes: resource.size || blob.size, mimeType: blob.type };
        attempt.assetId = useAssetStore.getState().addAsset(kind === "image"
            ? { ...common, kind, coverUrl: url, data: { ...data, dataUrl: url } }
            : { ...common, kind, coverUrl: "", data: { ...data, url, durationMs: resource.durationMs || details.durationMs } });
    }
    // Retry the same asset after a sync failure; a local record is not a cloud receipt.
    await saveRemoteUserDataNow();
    assertOwner();
    if (!attempt.assetId) throw new Error("素材保存未返回有效 ID。");
    return attempt.assetId;
}
