import io
p="web/src/lib/canvas/canvas-generation-task-sync.ts"
s=io.open(p,encoding="utf-8").read()
old = '''/**
 * 生成任务的远程视频只有在浏览器已拿到可复用的 Blob 后才进入成功态。
 * 节点仍保存稳定的资源文件地址，Blob 只作为本地缓存和后续字节处理的加速层。
 */
async function cacheGeneratedRemoteVideo(result: GeneratedVideoResult & { storageKey: string }): Promise<UploadedFile> {
    const blob = await getCachedResourceBlob(result.storageKey);
    if (!blob) throw new Error("生成视频资源缓存失败，未标记为成功");
    const url = await resolveMediaUrl(result.storageKey, result.dataUrl || "");
    if (!url) throw new Error("生成视频资源地址为空，未标记为成功");
    return {
        url,
        storageKey: result.storageKey,
        width: result.width,
        height: result.height,
        durationMs: result.durationMs,
        bytes: result.bytes || blob.size,
        mimeType: result.mimeType || blob.type || "video/mp4",
    };
}'''
new = '''/**
 * 生成任务的远程视频优先复用浏览器已缓存的 Blob（字节处理与体积统计更快），
 * 但缓存不可用（游客会话、IndexedDB 受限、OSS 无 CORS）时仍必须回落到稳定资源地址，
 * 不能因为本地缓存拿不到就把已经产出的视频判成失败。
 */
async function cacheGeneratedRemoteVideo(result: GeneratedVideoResult & { storageKey: string }): Promise<UploadedFile> {
    const blob = await getCachedResourceBlob(result.storageKey).catch(() => null);
    const url = await resolveMediaUrl(result.storageKey, result.dataUrl || "");
    if (!url) throw new Error("生成视频资源地址为空，未标记为成功");
    return {
        url,
        storageKey: result.storageKey,
        width: result.width,
        height: result.height,
        durationMs: result.durationMs,
        bytes: result.bytes || blob?.size || 0,
        mimeType: result.mimeType || blob?.type || "video/mp4",
    };
}'''
assert old in s, "old block not found"
s=s.replace(old,new)
io.open(p,"w",encoding="utf-8",newline="").write(s)
print("patched cacheGeneratedRemoteVideo")
