import { afterAll, afterEach, beforeEach, expect, mock, test } from "bun:test";
import type { CanvasProject } from "@/stores/canvas/use-canvas-store";
import type { CanvasOperationsRequest } from "@/services/api/user-data";
import type { PendingCanvasMutation } from "@/services/canvas-mutation-journal";
import { ApiError } from "@/services/api/request";

const clone = <T>(value: T): T => structuredClone(value);
const records = new Map<string, PendingCanvasMutation>();
const calls: CanvasOperationsRequest[] = [];
const receipts = new Map<string, { project: { revision: number }; mutationId: string }>();
const drafts: CanvasProject[] = [];
let remote: CanvasProject;
let loseResponse = false;
let deleted = false;
let failLease = false;
let requiredToken = "";
const leaseCalls: string[] = [];
let projectState = { projects: [] as CanvasProject[], openProject: (id: string) => projectState.projects.find((item) => item.id === id) || null };
const memoryStorage = () => {
    const values = new Map<string, string>();
    return { getItem: (key: string) => values.get(key) || null, setItem: (key: string, value: string) => { values.set(key, value); }, removeItem: (key: string) => { values.delete(key); } };
};
const originalWindow = globalThis.window;
globalThis.window = { localStorage: memoryStorage(), sessionStorage: memoryStorage(), setTimeout, clearTimeout, addEventListener: () => {}, innerWidth: 1280, innerHeight: 720 } as unknown as Window & typeof globalThis;
window.localStorage.setItem("infinite-canvas:active-user-scope", "user-a");

mock.module("@/stores/canvas/use-canvas-store", () => ({
    useCanvasStore: { getState: () => projectState, setState: (update: (state: typeof projectState) => object) => { projectState = { ...projectState, ...update(projectState) }; } },
    flushCanvasStorePersistence: async () => {},
    acceptRemoteCanvasProject: (project: CanvasProject) => { projectState.projects = [project]; },
}));
mock.module("@/stores/use-asset-store", () => ({
    useAssetStore: { getState: () => ({ assets: [] }), setState: () => {} },
    flushAssetStorePersistence: async () => {}, getGenerationAssetDefaults: () => undefined,
}));
mock.module("@/services/canvas-asset-repair", () => ({ repairMissingCanvasAssets: () => ({ createdAssets: 0, updatedProjects: 0 }), repairMissingCanvasVideoPreviews: async () => {}, collectCanvasMediaAssetIds: () => [], rebindInconsistentCanvasAssets: () => ({}) }));
mock.module("@/services/user-data-sync-media", () => ({ collectLocalMediaKeys: () => [], ensureRemoteResourceReferences: async (value: unknown) => value, restoreRemoteTextNodeContents: async (value: unknown) => value, numberValue: Number }));
mock.module("@/services/canvas-sync-drafts", () => ({ preserveCanvasSyncDraft: async (value: CanvasProject) => { drafts.push(clone(value)); return drafts.length; }, readCanvasSyncDrafts: async () => drafts }));
mock.module("@/lib/query-client", () => ({ appQueryClient: { invalidateQueries: async () => {} } }));
mock.module("@/services/canvas-mutation-journal", () => ({
    CanvasMutationJournalBusyError: class extends Error {},
    readCanvasMutationJournal: async (scope: string) => [...records.values()].filter((entry) => entry.scope === scope).map(clone),
    persistCanvasMutation: async (entry: PendingCanvasMutation) => { records.set(entry.journalId, clone(entry)); },
    removeCanvasMutation: async (entry: PendingCanvasMutation) => { records.delete(entry.journalId); },
}));
mock.module("@/services/api/user-data", () => ({
    applyRemoteCanvasOperations: async (_id: string, request: CanvasOperationsRequest) => {
        expect([...records.values()].some((entry) => JSON.stringify(entry.request) === JSON.stringify(request))).toBe(true);
        calls.push(clone(request));
        if (deleted) throw new ApiError("画布不存在", { status: 404 });
        const receipt = receipts.get(request.mutationId);
        if (receipt) return receipt;
        if (requiredToken && request.operations.some((operation) => operation.type === "patch_node") && !request.editProofs?.some((proof) => proof.token === requiredToken)) throw new ApiError("租约已失效", { status: 409, reason: "canvas_edit_lease_conflict" });
        for (const operation of request.operations) {
            if (operation.type === "set_field" && operation.field === "title") {
                if (remote.title !== operation.beforeValue && remote.title !== operation.value) throw new ApiError("标题冲突", { status: 409, reason: "canvas_field_conflict" });
                remote = { ...remote, title: operation.value as string };
            } else if (operation.type === "set_field") {
                remote = { ...remote, [operation.field]: operation.value };
            } else if (operation.type === "patch_node") {
                remote = { ...remote, nodes: remote.nodes.map((node) => node.id === operation.id ? { ...node, ...operation.patch } : node) as CanvasProject["nodes"] };
            }
        }
        remote = { ...remote, revision: remote.revision! + 1, appearance: "dark" };
        const response = { project: { revision: remote.revision! }, mutationId: request.mutationId };
        receipts.set(request.mutationId, response);
        if (loseResponse) { loseResponse = false; throw new ApiError("响应丢失", { status: 0, retryable: true }); }
        return response;
    },
    getRemoteCanvasProject: async () => ({ project: clone(remote) }),
    changeCanvasEditLease: async (_id: string, proof: { nodeId: string; sessionId: string }, action: string) => {
        leaseCalls.push(action);
        if (failLease) throw new ApiError("另一个窗口拥有租约", { status: 409, reason: "canvas_edit_lease_conflict" });
        return { serverTime: new Date().toISOString(), token: "new-token", lease: { nodeId: proof.nodeId, sessionId: proof.sessionId, expiresAt: new Date(Date.now() + 30_000).toISOString() } };
    },
    upsertRemoteCanvasProject: async () => { throw new Error("ordinary save must use operations"); },
    deleteRemoteAssets: async () => {}, deleteRemoteCanvasProject: async () => {}, getRemoteAsset: async () => {}, getRemoteAssetsByIds: async () => ({ assets: [] }),
    getRemoteUserDataSnapshot: async () => ({ assets: [], projects: [clone(remote)] }), listRemoteAssetsPage: async () => {}, restoreRemoteCanvasHistory: async () => {}, upsertRemoteAsset: async () => {},
}));

const sync = await import("@/services/user-data-sync");
const { canvasEditLeases } = await import("@/services/canvas-edit-leases");
const { useSyncProgressStore } = await import("@/stores/use-sync-progress-store");

beforeEach(() => {
    sync.resetRemoteUserDataSync();
    records.clear(); calls.length = 0; receipts.clear(); drafts.length = 0; loseResponse = false; deleted = false; failLease = false; requiredToken = ""; leaseCalls.length = 0;
    remote = { id: "canvas", revision: 1, title: "old", createdAt: "", updatedAt: "", nodes: [], connections: [], chatSessions: [], activeChatId: null, viewport: { x: 0, y: 0, k: 1 }, backgroundMode: "dots", showImageInfo: false, previsScenes: [] };
    projectState.projects = [clone(remote)];
});
afterEach(() => { sync.resetRemoteUserDataSync(); });
afterAll(() => { globalThis.window = originalWindow; mock.restore(); });

test("service replays a lost response with original body after session reload and saves later edits", async () => {
    await sync.initializeRemoteUserDataSession("user-a");
    projectState.projects = [{ ...projectState.projects[0]!, title: "submitted" }];
    loseResponse = true;
    await expect(sync.saveRemoteUserDataNow()).rejects.toThrow("响应丢失");
    const original = clone(calls[0]!);
    expect(records.size).toBe(1);
    projectState.projects = [{ ...projectState.projects[0]!, title: "later-local-edit" }];
    await sync.initializeRemoteUserDataSession("user-a");
    await sync.saveRemoteUserDataNow();
    expect(calls[1]).toEqual(original);
    expect(calls[2]!.mutationId).not.toBe(original.mutationId);
    expect(remote.title).toBe("later-local-edit");
    expect(projectState.projects[0]!.appearance).toBe("dark");
    expect(receipts.size).toBe(2);
    expect(records.size).toBe(0);
});

test("recovering another tab journal retains its submitted title and this tab unrelated edit", async () => {
    const baseline = clone(remote);
    const prepared = { ...baseline, title: "other-tab-title" };
    records.set("foreign", { journalId: "foreign", scope: "user-a", projectId: "canvas", clientId: "another-tab", baseline, localBaseline: baseline, prepared, localPrepared: prepared, request: { mutationId: "foreign", baseRevision: 1, operations: [{ type: "set_field", field: "title", beforeValue: "old", value: "other-tab-title" }] }, createdAt: "2026-10-29T00:00:00Z" });
    projectState.projects = [{ ...baseline, showImageInfo: true }];
    await sync.initializeRemoteUserDataSession("user-a");
    await sync.saveRemoteUserDataNow();
    expect(projectState.projects[0]!.title).toBe("other-tab-title");
    expect(projectState.projects[0]!.showImageInfo).toBe(true);
    expect(calls.every((request) => request.operations.every((operation) => operation.type !== "set_field" || operation.field !== "title" || operation.value !== "old"))).toBe(true);
});

test("recovering an identified foreign journal does not overwrite a concurrent local title", async () => {
    const baseline = clone(remote);
    const prepared = { ...baseline, title: "other-tab-title" };
    records.set("foreign", { journalId: "foreign", scope: "user-a", projectId: "canvas", clientId: "another-tab", baseline, localBaseline: baseline, prepared, localPrepared: prepared, request: { mutationId: "foreign", baseRevision: 1, operations: [{ type: "set_field", field: "title", beforeValue: "old", value: "other-tab-title" }] }, createdAt: "2026-10-29T00:00:00Z" });
    projectState.projects = [{ ...baseline, title: "this-tab-title" }];
    await sync.initializeRemoteUserDataSession("user-a");
    await expect(sync.saveRemoteUserDataNow()).rejects.toThrow("冲突");
    expect(remote.title).toBe("other-tab-title");
    expect(projectState.projects[0]!.title).toBe("this-tab-title");
    expect(records.size).toBe(1);
});

test("deleted canvas rejects receipt replay, retains draft and never emits create_canvas", async () => {
    await sync.initializeRemoteUserDataSession("user-a");
    projectState.projects = [{ ...remote, title: "submitted" }];
    loseResponse = true;
    await expect(sync.saveRemoteUserDataNow()).rejects.toThrow("响应丢失");
    deleted = true;
    await expect(sync.saveRemoteUserDataNow()).rejects.toThrow("画布不存在");
    expect(records.size).toBe(1);
    expect(drafts[0]!.title).toBe("submitted");
    expect(useSyncProgressStore.getState().syncingProjects.canvas.phase).toBe("conflict");
    expect(calls.flatMap((request) => request.operations).some((operation) => operation.type === "create_canvas")).toBe(false);
});

test("a definite same-field rejection rebases the current editor onto the confirmed cloud revision", async () => {
    await sync.initializeRemoteUserDataSession("user-a");
    projectState.projects = [{ ...remote, title: "my-title" }];
    remote = { ...remote, title: "remote-title", revision: 2 };
    await sync.saveRemoteUserDataNow();
    expect(projectState.projects[0]!.title).toBe("my-title");
    expect(remote.title).toBe("my-title");
    expect(calls).toHaveLength(2);
    expect(calls[1]!.mutationId).not.toBe(calls[0]!.mutationId);
    expect(calls[1]!.baseRevision).toBe(2);
    expect(calls[1]!.operations).toEqual([{ type: "set_field", field: "title", beforeValue: "remote-title", value: "my-title" }]);
    expect(records.size).toBe(0);
    await sync.loadCanvasProjectForEditing("canvas", { latest: true });
    expect(projectState.projects[0]!.title).toBe("my-title");
    expect(records.size).toBe(0);
});

test("unknown outcome cannot be discarded by an explicit latest load", async () => {
    await sync.initializeRemoteUserDataSession("user-a");
    projectState.projects = [{ ...remote, title: "submitted" }];
    loseResponse = true;
    await expect(sync.saveRemoteUserDataNow()).rejects.toThrow("响应丢失");
    const request = clone([...records.values()][0]!.request);
    await expect(sync.loadCanvasProjectForEditing("canvas", { latest: true })).rejects.toThrow("结果未确认");
    expect([...records.values()][0]!.request).toEqual(request);
    expect(projectState.projects[0]!.title).toBe("submitted");
});

test("committed receipt replays after lease transfer without acquiring another lease", async () => {
    remote = { ...remote, nodes: [{ id: "node", title: "old-node" }] as CanvasProject["nodes"] };
    projectState.projects = [clone(remote)];
    await sync.initializeRemoteUserDataSession("user-a");
    canvasEditLeases.input("canvas", "node");
    projectState.projects = [{ ...remote, nodes: [{ ...remote.nodes[0]!, title: "submitted-node" }] }];
    loseResponse = true;
    await expect(sync.saveRemoteUserDataNow()).rejects.toThrow("响应丢失");
    const original = clone(calls[0]!);
    const acquired = leaseCalls.length;
    failLease = true;
    await sync.initializeRemoteUserDataSession("user-a");
    await sync.saveRemoteUserDataNow();
    expect(calls[1]).toEqual(original);
    expect(leaseCalls).toHaveLength(acquired);
    expect(projectState.projects[0]!.nodes[0]!.title).toBe("submitted-node");
});

test("uncommitted expired proof is replaced durably after explicit rejection without changing operations identity", async () => {
    remote = { ...remote, nodes: [{ id: "node", title: "old-node" }] as CanvasProject["nodes"] };
    const prepared = { ...remote, nodes: [{ ...remote.nodes[0]!, title: "submitted-node" }] };
    const request: CanvasOperationsRequest = { mutationId: "expired-proof", baseRevision: 1, operations: [{ type: "patch_node", id: "node", patch: { title: "submitted-node" }, before: { title: "old-node" } }], editProofs: [{ nodeId: "node", sessionId: "old-session", token: "old-token" }] };
    records.set("expired-proof", { journalId: "expired-proof", scope: "user-a", projectId: "canvas", request, prepared, localPrepared: prepared, localBaseline: remote, baseline: remote, createdAt: "2026-10-29T00:00:00Z" });
    projectState.projects = [prepared];
    requiredToken = "new-token";
    await sync.initializeRemoteUserDataSession("user-a");
    await sync.saveRemoteUserDataNow();
    expect(calls).toHaveLength(2);
    expect(calls[0]!.editProofs![0]!.token).toBe("old-token");
    expect(calls[1]!.editProofs![0]!.token).toBe("new-token");
    expect(calls[1]!.mutationId).toBe(request.mutationId);
    expect(calls[1]!.operations).toEqual(request.operations);
    expect(leaseCalls).toEqual(["acquire", "release"]);
    expect(records.size).toBe(0);
});
