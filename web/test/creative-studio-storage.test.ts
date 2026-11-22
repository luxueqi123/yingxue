import { beforeEach, expect, mock, test } from "bun:test";
import { newStudioDocument } from "../src/lib/creative-studio";
import type { Asset } from "../src/stores/use-asset-store";

let owner = "owner", ready = true, hydrated = true, failSync = false, switchOnSync = false, mismatch = false;
let assets: Asset[] = [], saves = 0, reads = 0;
mock.module("@/stores/use-user-store", () => ({ useUserStore: { getState: () => ({ user: { id: owner } }) } }));
mock.module("@/stores/use-asset-store", () => ({ useAssetStore: { getState: () => ({ hydrated, assets, replaceAssets: (next: Asset[]) => { assets = next; }, updateAsset: (id: string, value: Asset) => { assets = assets.map(asset => asset.id === id ? value : asset); } }) } }));
mock.module("@/services/user-data-sync", () => ({ hasRemoteUserDataSyncSession: () => ready, saveRemoteUserDataNow: async () => { saves++; if (failSync) throw new Error("offline"); if (switchOnSync) owner = "another"; } }));
mock.module("@/services/api/user-data", () => ({ getRemoteAsset: async (id: string) => { reads++; const asset = assets.find(asset => asset.id === id)!; return { asset: mismatch ? { ...asset, metadata: {} } : JSON.parse(JSON.stringify(asset)) }; } }));
const { saveStudioDocument } = await import("../src/services/creative-studio");
beforeEach(() => { owner = "owner"; ready = hydrated = true; failSync = switchOnSync = mismatch = false; assets = []; saves = reads = 0; });

test("failed cloud save keeps one recoverable draft and retries the same document identity", async () => {
    const doc = { ...newStudioDocument("script-creation"), title: "草稿", input: "保留正文" };
    failSync = true;
    await expect(saveStudioDocument(doc, "owner")).rejects.toThrow("offline");
    expect(assets).toHaveLength(1);
    expect(assets[0].id).toBe(doc.id);
    expect(reads).toBe(0);
    failSync = false;
    const result = await saveStudioDocument(doc, "owner");
    expect(result.id).toBe(doc.id); expect(assets).toHaveLength(1); expect(reads).toBe(1);
});

test("readback mismatch never reports a cloud-save receipt", async () => {
    mismatch = true;
    await expect(saveStudioDocument(newStudioDocument("director-guide"), "owner")).rejects.toThrow("云端回读");
});

test("account change during sync stops the previous work before server readback", async () => {
    switchOnSync = true;
    await expect(saveStudioDocument(newStudioDocument("creative-title"), "owner")).rejects.toThrow("登录会话");
    expect(reads).toBe(0);
});

test("missing sync session or unhydrated state cannot create saved work", async () => {
    const doc = newStudioDocument("script-creation"); ready = false;
    await expect(saveStudioDocument(doc, "owner")).rejects.toThrow();
    ready = true; hydrated = false;
    await expect(saveStudioDocument(doc, "owner")).rejects.toThrow();
    expect(saves).toBe(0); expect(assets).toHaveLength(0);
});
