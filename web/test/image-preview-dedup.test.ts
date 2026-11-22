import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { translate } from "../src/i18n";

// Run the actual storage module with local dependencies, without leaking module mocks to other tests.
function fixture() {
    const source = readFileSync(new URL("../src/services/image-storage.ts", import.meta.url), "utf8").replace(/^import .*;\r?$/gm, "");
    const js = new Bun.Transpiler({ loader: "ts" }).transformSync(source).replace(/\bexport /g, "");
    let scope = "a", serial = 0, fail = false, changeScope = false;
    const keys: string[] = [];
    const local = new Map<string, Blob>();
    const resources = new Map<string, string>();
    const load = new Function("localforage", "nanoid", "loadRasterImage", "getActiveUserScope", "uploadResourceFile", "primeResourceBlobCache", "resourceStorageKey", "resourceFileUrl", "ResourceUploadError", "translate", js + "\nreturn { uploadImage }; ");
    const module = load(
        { createInstance: () => ({ setItem: async (key: string, blob: Blob) => local.set(key, blob) }) },
        () => String(++serial), async () => { if (changeScope) scope = "changed"; return { naturalWidth: 400, naturalHeight: 171 }; },
        () => scope, async (_blob: Blob, _kind: string, meta: {idempotencyKey: string}) => {
            keys.push(meta.idempotencyKey);
            if (fail) throw new Error("offline");
            if (!resources.has(meta.idempotencyKey)) resources.set(meta.idempotencyKey, String(resources.size+1));
            return { id: resources.get(meta.idempotencyKey), width:400, height:171 };
        }, async () => {}, (id: string) => "resource:"+id, (id: string) => "/api/resources/"+id+"/file", class extends Error {}, translate,
    ) as { uploadImage: (blob: Blob, progress?: undefined, options?: {deduplicateByContent: boolean}) => Promise<{storageKey: string; url: string; pendingRemoteUpload?: boolean}> };
    return { ...module, keys, local, resources, scope: (value: string) => { scope=value; }, fail: (value: boolean) => { fail=value; }, changeScope: () => { changeScope=true; } };
}

test("预览按账号、MIME 和内容去重，普通上传继续保持独立身份", async () => {
    const f=fixture(), blob=new Blob(["frame"],{type:"image/jpeg"});
    const a=await f.uploadImage(blob,undefined,{deduplicateByContent:true});
    const b=await f.uploadImage(blob,undefined,{deduplicateByContent:true});
    expect(a.storageKey).toBe(b.storageKey);
    expect(f.keys[0]).toMatch(/^image:a:sha256:[a-f0-9]{64}$/);
    expect(f.resources.size).toBe(1);
    await f.uploadImage(new Blob(["other"],{type:"image/jpeg"}),undefined,{deduplicateByContent:true});
    await f.uploadImage(new Blob(["frame"],{type:"image/png"}),undefined,{deduplicateByContent:true});
    f.scope("b"); await f.uploadImage(blob,undefined,{deduplicateByContent:true});
    expect(new Set(f.keys).size).toBe(4);
    const normalA=await f.uploadImage(blob), normalB=await f.uploadImage(blob);
    expect(normalA.storageKey).not.toBe(normalB.storageKey);
});

test("预览断网降级与重传沿用同一键，账号切换后不提交也不写本地", async () => {
    const f=fixture(), blob=new Blob(["frame"],{type:"image/jpeg"});
    f.fail(true);
    const offline=await f.uploadImage(blob,undefined,{deduplicateByContent:true});
    expect(offline.pendingRemoteUpload).toBe(true);
    expect(f.local.get(offline.storageKey)).toBe(blob);
    f.fail(false); await f.uploadImage(blob,undefined,{deduplicateByContent:true});
    expect(f.keys[0]).toBe(f.keys[1]);
    URL.revokeObjectURL(offline.url);
    const switched=fixture(); switched.changeScope();
    await expect(switched.uploadImage(blob,undefined,{deduplicateByContent:true})).rejects.toThrow("账号已变化");
    expect(switched.keys).toHaveLength(0);
    expect(switched.local.size).toBe(0);
});
