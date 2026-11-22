import { afterEach, beforeEach, expect, mock, test } from "bun:test";
import { validateTitleDesign } from "../src/pages/create/creative-title-render";

let user = "owner", ready = true, hydrated = true, uploadFails = false, syncFails = false, switchOnUpload = false, switchOnSync = false;
let uploads = 0, saves = 0, resourceId = "resource-1";
let assets: unknown[] = [];
mock.module("@/stores/use-user-store", () => ({ useUserStore: { getState: () => ({ user: user ? { id: user } : null }) } }));
mock.module("@/stores/use-asset-store", () => ({ useAssetStore: { getState: () => ({ hydrated, addAsset: (asset: unknown) => { assets.push(asset); return "asset-1"; } }) } }));
mock.module("@/services/user-data-sync", () => ({ hasRemoteUserDataSyncSession: () => ready, saveRemoteUserDataNow: async () => { saves++; if (syncFails) throw Error("offline"); if (switchOnSync) user = "another-user"; } }));
mock.module("@/services/api/resources", () => ({
    resourceFileUrl: (id: string) => `/api/resources/${id}/file`, resourceStorageKey: (id: string) => `resource:${id}`,
    uploadResourceFile: async () => { uploads++; if (uploadFails) throw Error("upload failed"); if (switchOnUpload) user = "another-user"; return { id: resourceId, width: 320, height: 180, size: 10 }; },
}));
const { saveCreativeTitleFrame, saveCreativeTitleVideo } = await import("../src/services/creative-title-save");
const details = { title: "片名", width: 320, height: 180, timeMs: 1000 };
const frame = () => new Blob(["png fixture"], { type: "image/png" });
beforeEach(() => { user = "owner"; ready = hydrated = true; uploadFails = syncFails = switchOnUpload = switchOnSync = false; uploads = saves = 0; resourceId = "resource-1"; assets = []; });
afterEach(() => { assets = []; });

test("title layout rejects empty text, invalid styles, oversized and nonfinite font sizes", () => {
    const valid = { text: " 双语 Film ", position: "center" as const, style: "serif" as const, size: 8 };
    expect(validateTitleDesign(valid).text).toBe("双语 Film");
    for (const text of [" ", "a".repeat(121), "一\n二\n三\n四"]) expect(() => validateTitleDesign({ ...valid, text })).toThrow();
    for (const size of [NaN, Infinity, 0, 16]) expect(() => validateTitleDesign({ ...valid, size })).toThrow();
});

test("sync retry reuses the uploaded resource and local asset", async () => {
    const attempt = { userId: user, uploadKey: "title-test" };
    syncFails = true;
    await expect(saveCreativeTitleFrame(frame(), details, attempt)).rejects.toThrow("offline");
    expect(assets).toHaveLength(1);
    syncFails = false;
    expect(await saveCreativeTitleFrame(frame(), details, attempt)).toBe("asset-1");
    expect(uploads).toBe(1); expect(saves).toBe(2); expect(assets).toHaveLength(1);
});

test("missing session stops before resource upload", async () => {
    ready = false;
    await expect(saveCreativeTitleFrame(frame(), details, { userId: user, uploadKey: "test" })).rejects.toThrow();
    expect(uploads).toBe(0); expect(assets).toHaveLength(0);
});

test("failed upload never creates a fake saved asset", async () => {
    uploadFails = true;
    await expect(saveCreativeTitleFrame(frame(), details, { userId: user, uploadKey: "test" })).rejects.toThrow("upload failed");
    expect(assets).toHaveLength(0); expect(saves).toBe(0);
});

test("account switch during upload does not write the old resource into the new account", async () => {
    switchOnUpload = true;
    await expect(saveCreativeTitleFrame(frame(), details, { userId: user, uploadKey: "test" })).rejects.toThrow();
    expect(assets).toHaveLength(0); expect(saves).toBe(0);
});

test("empty or non-PNG frames and invalid metadata stop before upload", async () => {
    const attempt = { userId: user, uploadKey: "test" };
    for (const blob of [new Blob([], { type: "image/png" }), new Blob(["jpeg"], { type: "image/jpeg" })]) {
        await expect(saveCreativeTitleFrame(blob, details, attempt)).rejects.toThrow("PNG");
    }
    for (const invalid of [{ ...details, title: " " }, { ...details, width: 0 }, { ...details, height: 1.5 }, { ...details, timeMs: NaN }]) {
        await expect(saveCreativeTitleFrame(frame(), invalid, attempt)).rejects.toThrow("设计帧信息");
    }
    expect(uploads).toBe(0); expect(saves).toBe(0); expect(assets).toHaveLength(0);
});

test("missing upload resource ID never creates a local asset or sync receipt", async () => {
    resourceId = "";
    await expect(saveCreativeTitleFrame(frame(), details, { userId: user, uploadKey: "test" })).rejects.toThrow("资源 ID");
    expect(uploads).toBe(1); expect(assets).toHaveLength(0); expect(saves).toBe(0);
});

test("unhydrated asset store stops before upload", async () => {
    hydrated = false;
    await expect(saveCreativeTitleFrame(frame(), details, { userId: user, uploadKey: "test" })).rejects.toThrow("素材库尚未恢复");
    expect(uploads).toBe(0); expect(assets).toHaveLength(0);
});

test("account switch during sync does not hand the old asset to the new account canvas", async () => {
    switchOnSync = true;
    await expect(saveCreativeTitleFrame(frame(), details, { userId: user, uploadKey: "test" })).rejects.toThrow("会话已变化");
    expect(uploads).toBe(1); expect(saves).toBe(1);
});

test("MP4 is stored as native video with duration and reused after sync failure", async () => {
    const attempt = { userId: user, uploadKey: "video-test" };
    const video = new Blob(["mp4 fixture"], { type: "video/mp4" });
    syncFails = true;
    await expect(saveCreativeTitleVideo(video, { ...details, durationMs: 5000 }, attempt)).rejects.toThrow("offline");
    expect(assets[0]).toMatchObject({ kind: "video", coverUrl: "", data: { url: "/api/resources/resource-1/file", durationMs: 5000, mimeType: "video/mp4", storageKey: "resource:resource-1" } });
    syncFails = false;
    expect(await saveCreativeTitleVideo(video, { ...details, durationMs: 5000 }, attempt)).toBe("asset-1");
    expect(uploads).toBe(1); expect(assets).toHaveLength(1);
    await expect(saveCreativeTitleFrame(frame(), details, attempt)).rejects.toThrow("内容类型已变化");
});
