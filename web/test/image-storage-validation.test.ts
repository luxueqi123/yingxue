import { afterAll, beforeEach, expect, mock, test } from "bun:test";

let scope = "image-upload-validation";
let decodeFails = false;
let uploadFailure: Error | undefined;
let duringUpload: (() => void) | undefined;
const uploads: Array<{ blob: Blob; kind: string; options: Record<string, unknown> }> = [];
const stored = new Map<string, Blob>();
const revoked: string[] = [];
const originalImage = globalThis.Image;
const originalCreate = URL.createObjectURL;
const originalRevoke = URL.revokeObjectURL;

class PermanentUploadError extends Error { permanent = true; }
mock.module("localforage", () => ({ default: { createInstance: () => ({ setItem: async (key: string, blob: Blob) => stored.set(key, blob) }) } }));
mock.module("@/lib/user-scope", () => ({ getActiveUserScope: () => scope }));
mock.module("@/i18n", () => ({ translate: (key: string) => key }));
mock.module("@/services/resource-blob-cache", () => ({ primeResourceBlobCache: async () => {}, getCachedResourceBlob: async () => null }));
mock.module("@/services/api/resources", () => ({
    ResourceUploadError: PermanentUploadError,
    resourceStorageKey: (id: string) => `resource:${id}`,
    resourceFileUrl: (id: string) => `/api/resources/${id}/file`,
    resourceIdFromStorageKey: (key: string) => key.startsWith("resource:") ? key.slice(9) : undefined,
    isResourceUrl: () => false,
    resolveResourceAccessURL: (url: string) => url,
    getResourceAccess: async () => ({ url: "" }),
    importResourceFromUrl: async () => { throw new Error("not used"); },
    uploadResourceFile: async (blob: Blob, kind: string, options: Record<string, unknown>) => {
        uploads.push({ blob, kind, options });
        duringUpload?.();
        if (uploadFailure) throw uploadFailure;
        return { id: "decoded-image", width: 0, height: 0, size: blob.size, mimeType: blob.type };
    },
}));

const { uploadImage } = await import("../src/services/image-storage");
beforeEach(() => {
    scope = "image-upload-validation";
    decodeFails = false;
    uploadFailure = undefined;
    duringUpload = undefined;
    uploads.length = 0;
    stored.clear();
    revoked.length = 0;
    URL.createObjectURL = () => "blob:image-upload-validation";
    URL.revokeObjectURL = (url: string) => { revoked.push(url); };
    globalThis.Image = class {
        naturalWidth = 37;
        naturalHeight = 53;
        onload?: () => void;
        onerror?: () => void;
        set src(value: string) {
            if (value) queueMicrotask(() => decodeFails ? this.onerror?.() : this.onload?.());
        }
    } as unknown as typeof Image;
});
afterAll(() => {
    globalThis.Image = originalImage;
    URL.createObjectURL = originalCreate;
    URL.revokeObjectURL = originalRevoke;
    mock.restore();
});

test("undecodable image is rejected before upload or local persistence, and releases its preview", async () => {
    decodeFails = true;
    await expect(uploadImage(new File(["invalid"], "invalid.png", { type: "image/png" }))).rejects.toThrow("imageUpload.decodeFailed");
    expect(uploads).toHaveLength(0);
    expect(stored.size).toBe(0);
    expect(revoked).toEqual(["blob:image-upload-validation"]);
});

test("valid uploads keep the original bytes and actual decoded dimensions", async () => {
    const file = new File(["original image bytes"], "actual.png", { type: "image/png" });
    const result = await uploadImage(file);
    expect(uploads[0]?.blob).toBe(file);
    expect(uploads[0]?.options).toMatchObject({ width: 37, height: 53, fileName: "actual.png" });
    expect(result).toMatchObject({ width: 37, height: 53, bytes: file.size, storageKey: "resource:decoded-image" });
    expect(revoked).toEqual(["blob:image-upload-validation"]);
});

test("permanent remote rejection releases its preview and never reports a local fallback", async () => {
    uploadFailure = new PermanentUploadError("quota exhausted");
    await expect(uploadImage(new File(["image"], "actual.png", { type: "image/png" }))).rejects.toBe(uploadFailure);
    expect(stored.size).toBe(0);
    expect(revoked).toEqual(["blob:image-upload-validation"]);
});

test("account changes during upload cannot retain a result or local data in the next account", async () => {
    duringUpload = () => { scope = "next-account"; };
    await expect(uploadImage(new File(["image"], "actual.png", { type: "image/png" }))).rejects.toThrow("媒体所属账号已切换");
    expect(stored.size).toBe(0);
    expect(revoked).toEqual(["blob:image-upload-validation"]);
});

test("temporary failures retain original local bytes and explicitly report pending remote upload", async () => {
    uploadFailure = new Error("network unavailable");
    const file = new File(["image"], "actual.png", { type: "image/png" });
    const result = await uploadImage(file);
    expect(result.pendingRemoteUpload).toBe(true);
    expect(result.remoteUploadError).toBe("network unavailable");
    expect(stored.get(result.storageKey)).toBe(file);
    expect(revoked).toEqual([]);
});
