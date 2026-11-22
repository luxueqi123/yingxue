import { afterEach, beforeEach, expect, test } from "bun:test";
import localforage from "localforage";
import { apiClient } from "../src/services/api/request";
import { canvasContentHash } from "../src/lib/canvas/canvas-content";
import { rebaseCanvasProjects, parseCanvasStorageDocument } from "../src/lib/canvas/canvas-storage-revision";
import { readCanvasSyncDrafts } from "../src/services/canvas-sync-drafts";
import {
    applyAgentCanvasPatches,
    deleteCanvasProjectsWithRemoteSync,
    refreshCanvasAfterAgent,
    initializeRemoteUserDataSession,
    installRemoteUserDataAutoSync,
    loadCanvasProjectForEditing,
    resetRemoteUserDataSync,
    saveRemoteUserDataNow,
    syncRemoteUserData,
} from "../src/services/user-data-sync";
import { createAgentCanvasSync } from "../src/services/agent-canvas-sync";
import { flushCanvasStorePersistence, useCanvasStore, type CanvasProject } from "../src/stores/canvas/use-canvas-store";
import { flushAssetStorePersistence, useAssetStore } from "../src/stores/use-asset-store";
import { useSyncProgressStore } from "../src/stores/use-sync-progress-store";
import { CanvasNodeType } from "../src/types/canvas";
import type { TimelineProject } from "../src/types/timeline";
import type { CanvasOperationsRequest } from "../src/services/api/user-data";
import { createCanvasOperationsServer } from "./helpers/canvas-operations-server";

const originalWindow = globalThis.window;
const originalAdapter = apiClient.defaults.adapter;
const originalGet = localforage.getItem;
const originalSet = localforage.setItem;
const indexed = new Map<string, string>();
let scope = "";
let sequence = 0;
let autoSave: (() => void) | undefined;
let remote = new Map<string, CanvasProject>();
let requests: Array<{ method: string; id: string; project?: CanvasProject; request?: CanvasOperationsRequest }> = [];
let beforePut: (() => Promise<void>) | undefined;
let deleteFailureId: string | undefined;
let temporaryPutFailures = 0;

function canvas(id = "canvas"): CanvasProject {
    return {
        id,
        revision: 1,
        title: id,
        createdAt: "2026-09-01T00:00:00Z",
        updatedAt: "2026-09-01T00:00:00Z",
        nodes: [{ id: "old-image", type: CanvasNodeType.Image, title: "image", position: { x: 0, y: 0 }, width: 100, height: 100 }],
        connections: [],
        chatSessions: [],
        activeChatId: null,
        backgroundMode: "dots",
        showImageInfo: false,
        viewport: { x: 0, y: 0, k: 1 },
        directorScenes: [],
    };
}

function addNode(project: CanvasProject, id: string) {
    return { ...project, nodes: [...project.nodes, { ...project.nodes[0], id, type: CanvasNodeType.Video }] };
}

function editedTimeline(durationMs = 1000): TimelineProject {
    return {
        version: 2,
        tracks: [{ id: "video-1", kind: "video", label: "原片", order: 0 }],
        clips: [{ id: "cut", nodeId: "old-image", kind: "video", trackId: "video-1", startMs: 0, durationMs, sourceStartMs: 500, sourceDurationMs: 5000 }],
        durationMs,
    };
}

test("timeline and subtitle edits survive failed save, retry and cache rehydration", async () => {
    const timeline = editedTimeline();
    const nodes = structuredClone(useCanvasStore.getState().openProject("canvas")!.nodes);
    nodes[0].type = CanvasNodeType.Video;
    nodes[0].metadata = { subtitleEntries: [{ index: 1, startMs: 0, endMs: 1000, text: "原字幕" }] };
    useCanvasStore.getState().updateProject("canvas", { nodes: structuredClone(nodes) });
    await saveRemoteUserDataNow("canvas");
    expect(remote.get("canvas")!.nodes[0].metadata!.subtitleEntries).toHaveLength(1);
    nodes[0].metadata = { subtitleEntries: [], timelineComposition: timeline };
    useCanvasStore.getState().updateProject("canvas", { timeline, nodes });
    await flushCanvasStorePersistence();
    temporaryPutFailures = 1;
    await expect(saveRemoteUserDataNow("canvas")).rejects.toThrow();
    expect(remote.get("canvas")!.timeline).toBeUndefined();
    await useCanvasStore.persist.rehydrate();
    expect(useCanvasStore.getState().openProject("canvas")!.timeline).toEqual(timeline);
    await saveRemoteUserDataNow("canvas");
    expect(remote.get("canvas")!.timeline).toEqual(timeline);
    expect(remote.get("canvas")!.nodes[0].metadata).toEqual(nodes[0].metadata);

    const empty = { ...timeline, clips: [], durationMs: 1000 };
    useCanvasStore.getState().updateProject("canvas", { timeline: empty, nodes: [{ ...nodes[0], metadata: { ...nodes[0].metadata, timelineComposition: empty } }] });
    await saveRemoteUserDataNow("canvas");
    await flushCanvasStorePersistence();
    await useCanvasStore.persist.rehydrate();
    expect(remote.get("canvas")!.timeline!.clips).toEqual([]);
    expect(remote.get("canvas")!.nodes[0].metadata!.timelineComposition!.clips).toEqual([]);
    expect(useCanvasStore.getState().openProject("canvas")!.timeline!.clips).toEqual([]);
});

test("old save acknowledgement cannot update a replacement account cache", async () => {
    let release!: () => void;
    let entered!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const started = new Promise<void>((resolve) => { entered = resolve; });
    beforePut = async () => { entered(); await gate; };
    useCanvasStore.getState().updateProject("canvas", { timeline: editedTimeline() });
    const saving = saveRemoteUserDataNow("canvas");
    await started;
    resetRemoteUserDataSync();
    const replacement = { ...canvas(), title: "replacement account" };
    useCanvasStore.setState({ projects: [replacement] });
    release();
    await expect(saving).rejects.toThrow("账号已切换");
    expect(useCanvasStore.getState().openProject("canvas")).toEqual(replacement);
    expect(useSyncProgressStore.getState().syncingProjects.canvas?.phase).not.toBe("done");
});

test("explicit timeline save during an older request waits for the latest edit", async () => {
    let release!: () => void;
    let entered!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const started = new Promise<void>((resolve) => { entered = resolve; });
    beforePut = async () => { entered(); await gate; };
    useCanvasStore.getState().updateProject("canvas", { timeline: editedTimeline(1000) });
    const older = saveRemoteUserDataNow("canvas");
    await started;
    useCanvasStore.getState().updateProject("canvas", { timeline: editedTimeline(2000) });
    let acknowledged = false;
    const newer = saveRemoteUserDataNow("canvas").then(() => { acknowledged = true; });
    await Promise.resolve();
    expect(acknowledged).toBe(false);
    release();
    await Promise.all([older, newer]);
    expect(remote.get("canvas")!.timeline).toEqual(editedTimeline(2000));
    expect(requests.filter((request) => request.method === "patch").map((request) => request.project!.timeline!.durationMs)).toEqual([1000, 2000]);
    expect(useCanvasStore.getState().openProject("canvas")!.timeline).toEqual(editedTimeline(2000));
});

beforeEach(async () => {
    resetRemoteUserDataSync();
    scope = `canvas-revision-test-${++sequence}`;
    indexed.clear();
    requests = [];
    autoSave = undefined;
    beforePut = undefined;
    deleteFailureId = undefined;
    temporaryPutFailures = 0;
    remote = new Map([
        ["canvas", canvas()],
        ["other", canvas("other")],
    ]);
    const applyOperations = createCanvasOperationsServer(remote);
    Object.defineProperty(globalThis, "window", {
        configurable: true,
        value: {
            innerWidth: 1440,
            innerHeight: 1000,
            setTimeout: (callback: () => void) => {
                autoSave = callback;
                return 1;
            },
            clearTimeout: () => {
                autoSave = undefined;
            },
            localStorage: { getItem: () => scope, setItem: () => undefined },
        },
    });
    localforage.getItem = (async (key: string) => indexed.get(key) ?? null) as typeof localforage.getItem;
    localforage.setItem = (async (key: string, value: string) => {
        indexed.set(key, value);
        return value;
    }) as typeof localforage.setItem;
    apiClient.defaults.adapter = async (config) => {
        const method = config.method || "get";
        const parts = String(config.url).split("/");
        const isOperation = parts.at(-1) === "operations";
        const id = parts.at(isOperation ? -2 : -1)!;
        const body = config.data ? JSON.parse(config.data) : undefined;
        const record = { method, id, project: body?.project, request: isOperation ? body as CanvasOperationsRequest : undefined };
        requests.push(record);
        let data: unknown;
        let status = 200;
        if (id === "snapshot") data = { projects: structuredClone([...remote.values()]), assets: [] };
        else if (method === "delete") {
            if (id === deleteFailureId) status = 403;
            else {
                remote.delete(id);
                data = { id };
            }
        } else if (id === "batch" && method === "post") {
            data = {
                assets: [
                    {
                        id: "invalid-mime-asset",
                        kind: "image",
                        title: "历史素材",
                        coverUrl: "",
                        tags: [],
                        createdAt: "2026-09-01",
                        updatedAt: "2026-09-01",
                        data: { dataUrl: "https://example.com/image.png", width: 100, height: 100, bytes: 1, mimeType: "image/*" },
                    },
                ],
            };
        } else if (id === "restore" && method === "post") {
            const current = remote.get("canvas")!;
            if (body.revision !== current.revision) status = 409;
            else {
                const saved = { ...canvas(), title: "historical content", revision: current.revision! + 1 };
                remote.set("canvas", saved);
                data = { project: saved };
            }
        } else if (method === "patch" && isOperation) {
            await beforePut?.();
            if (temporaryPutFailures > 0) {
                temporaryPutFailures -= 1;
                status = 503;
            } else {
                const response = applyOperations(id, body);
                record.project = { ...structuredClone(response.project), revision: body.baseRevision };
                data = response;
            }
        } else if (method === "put") {
            await beforePut?.();
            const project = body.project as CanvasProject;
            const current = remote.get(id);
            if (temporaryPutFailures > 0) {
                temporaryPutFailures -= 1;
                status = 503;
            } else if (project.revision !== (current?.revision ?? 0)) status = 409;
            else {
                const saved = { ...structuredClone(project), revision: project.revision! + 1 };
                remote.set(id, saved);
                data = { project: saved };
            }
        } else data = { project: structuredClone(remote.get(id)) };
        return { config, status, statusText: "", headers: {}, data: { code: status === 200 ? 0 : status, data, msg: status === 409 ? "版本冲突" : "ok" } };
    };
    useCanvasStore.setState({ projects: [] });
    useAssetStore.setState({ assets: [] });
    installRemoteUserDataAutoSync();
    await syncRemoteUserData(scope);
});

async function waitForSyncState(predicate: () => boolean) {
    const deadline = Date.now() + 1_000;
    while (!predicate()) {
        if (Date.now() >= deadline) throw new Error("同步测试状态等待超时");
        await new Promise<void>((resolve) => globalThis.setTimeout(resolve, 0));
    }
}

afterEach(async () => {
    resetRemoteUserDataSync();
    await Promise.all([flushCanvasStorePersistence(), flushAssetStorePersistence()]);
    apiClient.defaults.adapter = originalAdapter;
    localforage.getItem = originalGet;
    localforage.setItem = originalSet;
    if (originalWindow === undefined) delete (globalThis as { window?: unknown }).window;
    else Object.defineProperty(globalThis, "window", { configurable: true, value: originalWindow });
});

test("a fresh device fits cloud nodes instead of adopting the backend neutral viewport", async () => {
    const project = canvas();
    project.nodes[0].position = { x: 12000, y: -8000 };
    remote.set(project.id, project);
    resetRemoteUserDataSync();
    useCanvasStore.setState({ projects: [] });
    await syncRemoteUserData(scope);
    const loaded = await loadCanvasProjectForEditing(project.id);
    expect(loaded!.viewport.x + 12050 * loaded!.viewport.k).toBeCloseTo(720);
    expect(loaded!.viewport.y - 7950 * loaded!.viewport.k).toBeCloseTo(500);
    expect(loaded!.nodes).toEqual(project.nodes);
    expect(remote.get(project.id)!.viewport).toEqual({ x: 0, y: 0, k: 1 });
});

test.each(["load", "agent"] as const)("%s restores legacy text and acknowledges the repair only after a real operation receipt", async (entry) => {
    const project = canvas();
    project.nodes = [{ ...project.nodes[0], type: CanvasNodeType.Text, metadata: {
        storageKey: "resource:text-file", content: "/api/resources/text-file/file", prompt: "原始剧本正文",
    } }];
    remote.set(project.id, structuredClone(project));
    resetRemoteUserDataSync();
    useCanvasStore.setState({ projects: [] });
    await initializeRemoteUserDataSession(scope);
    const loaded = entry === "load" ? await loadCanvasProjectForEditing(project.id) : await refreshCanvasAfterAgent(project.id);
    expect(loaded!.nodes[0].metadata!.content).toBe("原始剧本正文");
    expect(remote.get(project.id)!.nodes[0].metadata!.content).toBe("/api/resources/text-file/file");
    expect(useSyncProgressStore.getState().syncingProjects[project.id]?.phase).toBe("pending");
    await saveRemoteUserDataNow(project.id);
    const patch = requests.flatMap(request => request.request?.operations || []).find(operation => operation.type === "patch_node");
    expect(patch).toMatchObject({ before: { "metadata.content": "/api/resources/text-file/file" }, patch: { "metadata.content": "原始剧本正文" } });
    expect(remote.get(project.id)!.nodes[0].metadata!.content).toBe("原始剧本正文");
    expect(useSyncProgressStore.getState().syncingProjects[project.id]?.phase).toBe("done");
    await flushCanvasStorePersistence();
    await useCanvasStore.persist.rehydrate();
    expect(useCanvasStore.getState().openProject(project.id)!.nodes[0].metadata!.content).toBe("原始剧本正文");
});

test("deletion skips editing and invalid MIME assets, including an uncached canvas", async () => {
    const project = canvas();
    project.nodes[0].metadata = { assetId: "invalid-mime-asset" };
    remote.set(project.id, project);
    await initializeRemoteUserDataSession(scope);
    await expect(loadCanvasProjectForEditing(project.id)).rejects.toThrow("具体 MIME");
    useCanvasStore.getState().deleteProjects(["other"]);
    await flushCanvasStorePersistence();
    requests = [];

    await deleteCanvasProjectsWithRemoteSync([" canvas ", "canvas", "other"]);

    expect(requests.map(({ method, id }) => ({ method, id }))).toEqual([
        { method: "delete", id: "canvas" },
        { method: "delete", id: "other" },
    ]);
    expect(remote.size).toBe(0);
    expect(useCanvasStore.getState().projects).toEqual([]);
    await useCanvasStore.persist.rehydrate();
    expect(useCanvasStore.getState().projects).toEqual([]);
});

test("batch deletion retains failed canvases and persists successful deletions", async () => {
    await initializeRemoteUserDataSession(scope);
    deleteFailureId = "other";

    await expect(deleteCanvasProjectsWithRemoteSync(["canvas", "other"])).rejects.toThrow();

    expect([...remote.keys()]).toEqual(["other"]);
    expect(useCanvasStore.getState().projects.map((project) => project.id)).toEqual(["other"]);
    await useCanvasStore.persist.rehydrate();
    expect(useCanvasStore.getState().projects.map((project) => project.id)).toEqual(["other"]);
});

test("stale viewport, no-op restore and open do not submit old content", async () => {
    const old = useCanvasStore.getState().openProject("canvas")!;
    remote.set("canvas", { ...addNode(canvas(), "afternoon-video"), revision: 2 });
    useCanvasStore.getState().updateProject("canvas", { viewport: { x: 100, y: 40, k: 2 } });
    useCanvasStore.getState().updateProject("canvas", { nodes: structuredClone(old.nodes), connections: [] });
    expect(autoSave).toBeUndefined();
    expect(useCanvasStore.getState().openProject("canvas")!.updatedAt).toBe(old.updatedAt);
    await flushCanvasStorePersistence();
    await saveRemoteUserDataNow();
    const latest = await loadCanvasProjectForEditing("canvas");
    expect(latest.nodes.map((node) => node.id)).toEqual(["old-image", "afternoon-video"]);
    expect(latest.revision).toBe(2);
    expect(latest.viewport).toEqual({ x: 100, y: 40, k: 2 });
    await saveRemoteUserDataNow();
    expect(requests.filter((request) => request.method === "put")).toHaveLength(0);
});

test("load latest, save and reload stay synced when Agent history replays an unversioned delta", async () => {
    remote.set("canvas", { ...canvas(), revision: 9 });
    await loadCanvasProjectForEditing("canvas", { latest: true });
    useCanvasStore.getState().renameProject("canvas", "已保存的标题");
    await saveRemoteUserDataNow("canvas");
    expect(remote.get("canvas")!.revision).toBe(10);

    for (let reload = 0; reload < 3; reload++) {
        resetRemoteUserDataSync();
        await useCanvasStore.persist.rehydrate();
        await initializeRemoteUserDataSession(scope);
        await loadCanvasProjectForEditing("canvas");
        let resolve!: () => void;
        let reject!: (error: unknown) => void;
        const reconciled = new Promise<void>((done, fail) => {
            resolve = done;
            reject = fail;
        });
        const sync = createAgentCanvasSync({
            canvasId: "canvas",
            batchMs: 0,
            applyPatches: (patches) => applyAgentCanvasPatches("canvas", patches),
            refresh: async () => {
                await refreshCanvasAfterAgent("canvas");
                resolve();
            },
            onError: reject,
        });
        try {
            sync.receive({
                eventId: "historical-event",
                runId: "completed-run",
                seq: 1,
                type: "canvas_updated",
                createdAt: "2026-09-17",
                payload: {
                    canvasId: "canvas",
                    canvasPatch: { canvasId: "canvas", updatedAt: "2026-09-17", nodes: [{ before: null, after: { ...canvas().nodes[0], id: "stale-node" } }], connections: [] },
                },
            });
            await reconciled;
            expect(useSyncProgressStore.getState().syncingProjects.canvas.phase).toBe("done");
            await saveRemoteUserDataNow("canvas");
            expect(useCanvasStore.getState().openProject("canvas")).toMatchObject({ revision: 10, title: "已保存的标题", nodes: canvas().nodes });
            expect(await readCanvasSyncDrafts("canvas")).toHaveLength(0);
        } finally {
            sync.dispose();
        }
    }
    expect(requests.filter((request) => request.method === "patch")).toHaveLength(1);
});

test("a stale save auto-reconciles when the cloud already contains the identical local content", async () => {
    useCanvasStore.getState().renameProject("canvas", "same content saved elsewhere");
    beforePut = async () => {
        const current = useCanvasStore.getState().openProject("canvas")!;
        remote.set("canvas", { ...structuredClone(current), revision: current.revision! + 1 });
    };

    await expect(saveRemoteUserDataNow("canvas")).resolves.toBeUndefined();

    expect(useCanvasStore.getState().openProject("canvas")).toMatchObject({ title: "same content saved elsewhere", revision: 2 });
    expect(useSyncProgressStore.getState().syncingProjects.canvas).toMatchObject({ phase: "done", message: "云端内容一致，已自动校准版本" });
    expect(await readCanvasSyncDrafts("canvas")).toHaveLength(0);
});

test("a stale save rebases disjoint Agent edits and keeps saving", async () => {
    remote.set("canvas", { ...addNode(canvas(), "remote-video"), revision: 2 });
    useCanvasStore.getState().updateProject("canvas", { nodes: addNode(canvas(), "local-video").nodes });
    useCanvasStore.getState().renameProject("other", "other edit");

    await expect(saveRemoteUserDataNow()).resolves.toBeUndefined();

    expect(remote.get("canvas")!.nodes.map((node) => node.id)).toEqual(["old-image", "remote-video", "local-video"]);
    expect(remote.get("canvas")!.revision).toBe(3);
    expect(remote.get("other")!.title).toBe("other edit");
    expect(useSyncProgressStore.getState().syncingProjects.canvas.phase).toBe("done");

    useCanvasStore.getState().renameProject("canvas", "more local edits");
    await expect(saveRemoteUserDataNow("canvas")).resolves.toBeUndefined();
    expect(remote.get("canvas")!.title).toBe("more local edits");
    expect(useSyncProgressStore.getState().syncingProjects.canvas.phase).toBe("done");
});

test("a stale local node deletion survives a remote updatedAt-only refresh", async () => {
    useCanvasStore.getState().updateProject("canvas", { nodes: [] });
    let refreshed = false;
    beforePut = async () => {
        if (refreshed) return;
        refreshed = true;
        const current = remote.get("canvas")!;
        remote.set("canvas", {
            ...current,
            revision: current.revision! + 1,
            nodes: current.nodes.map((node) => ({ ...node, updatedAt: "2026-10-29T01:00:00Z" })),
        });
    };

    await expect(saveRemoteUserDataNow("canvas")).resolves.toBeUndefined();

    expect(remote.get("canvas")!.nodes).toEqual([]);
    expect(remote.get("canvas")!.revision).toBe(3);
    expect(useCanvasStore.getState().openProject("canvas")!.nodes).toEqual([]);
    expect(useSyncProgressStore.getState().syncingProjects.canvas.phase).toBe("done");
});

test("transient cloud failures schedule a bounded automatic retry", async () => {
    temporaryPutFailures = 1;
    useCanvasStore.getState().renameProject("canvas", "retry me");
    expect(autoSave).toBeDefined();

    autoSave?.();
    await waitForSyncState(() => requests.filter((request) => request.method === "patch" && request.id === "canvas").length === 1 && useSyncProgressStore.getState().syncingProjects.canvas.message.includes("自动重试"));
    expect(autoSave).toBeDefined();
    expect(useSyncProgressStore.getState().syncingProjects.canvas.message).toContain("自动重试");

    autoSave?.();
    await waitForSyncState(() => remote.get("canvas")?.title === "retry me" && useSyncProgressStore.getState().syncingProjects.canvas.phase === "done");
    expect(requests.filter((request) => request.method === "patch" && request.id === "canvas")).toHaveLength(2);
    expect(useSyncProgressStore.getState().syncingProjects.canvas.phase).toBe("done");
});

test("edits during a save retain the right ancestor revision and are saved next", async () => {
    let release!: () => void;
    let started!: () => void;
    const waiting = new Promise<void>((resolve) => {
        release = resolve;
    });
    const entered = new Promise<void>((resolve) => {
        started = resolve;
    });
    beforePut = async () => {
        started();
        await waiting;
    };
    useCanvasStore.getState().updateProject("canvas", { nodes: addNode(canvas(), "first-video").nodes });
    const saving = saveRemoteUserDataNow();
    await entered;
    useCanvasStore.getState().updateProject("canvas", { nodes: addNode(useCanvasStore.getState().openProject("canvas")!, "second-video").nodes });
    release();
    await saving;
    expect(requests.filter((request) => request.method === "patch").map((request) => request.request!.baseRevision)).toEqual([1, 2]);
    expect(remote.get("canvas")!.revision).toBe(3);
    expect(remote.get("canvas")!.nodes.map((node) => node.id)).toEqual(["old-image", "first-video", "second-video"]);
    expect(useCanvasStore.getState().openProject("canvas")!.remoteContentHash).toBe(await canvasContentHash(useCanvasStore.getState().openProject("canvas")!));
    expect(requests.filter((request) => request.method === "patch").every((request) => !JSON.stringify(request.request).includes('"viewport"') && !JSON.stringify(request.request).includes('"remoteContentHash"'))).toBe(true);
});

test("login archives unsynced changes before replacing cache and keeps user scopes separate", async () => {
    useCanvasStore.getState().renameProject("canvas", "unsaved draft");
    await flushCanvasStorePersistence();
    resetRemoteUserDataSync();
    await useCanvasStore.persist.rehydrate();
    await syncRemoteUserData(scope);
    expect(useCanvasStore.getState().openProject("canvas")!.title).toBe("canvas");
    expect((await readCanvasSyncDrafts("canvas"))[0].project.title).toBe("unsaved draft");
    expect(await readCanvasSyncDrafts("canvas", "another-user")).toEqual([]);
    expect(requests.some((request) => request.method === "put")).toBe(false);
});

test("failed draft storage prevents replacement by the latest server content", async () => {
    const working = localforage.setItem;
    useCanvasStore.getState().renameProject("canvas", "must survive");
    localforage.setItem = (async (key: string, value: unknown) => {
        if (key.includes("sync-drafts")) throw new Error("disk full");
        return working(key, value);
    }) as typeof localforage.setItem;
    await expect(loadCanvasProjectForEditing("canvas", { latest: true })).rejects.toThrow("disk full");
    expect(useCanvasStore.getState().openProject("canvas")!.title).toBe("must survive");
});

test("local storage rebase cannot pair old edits with another tab's newer revision", () => {
    const base = canvas();
    const local = addNode(base, "unsaved-local");
    const durable = { ...addNode(base, "remote-video"), revision: 2 };
    const document = parseCanvasStorageDocument(null, [durable]);
    const rebased = rebaseCanvasProjects({ document, baseProjects: [base], localProjects: [local], baseRevision: 0 }).document.state.projects[0];
    expect(rebased.revision).toBe(1);
    expect(rebased.nodes.at(-1)!.id).toBe("unsaved-local");
});

test("loading aligns live editor content before publishing its server revision", async () => {
    remote.set("canvas", { ...addNode(canvas(), "new-cloud-node"), revision: 2 });
    let applied = false;
    await loadCanvasProjectForEditing("canvas", {
        onLoad: (project) => {
            expect(useCanvasStore.getState().openProject("canvas")!.revision).toBe(1);
            expect(project.revision).toBe(2);
            expect(project.nodes.at(-1)!.id).toBe("new-cloud-node");
            applied = true;
        },
    });
    expect(applied).toBe(true);
    expect(useCanvasStore.getState().openProject("canvas")!.revision).toBe(2);
});

test("a joined project load preserves edits made while its cache write finishes", async () => {
    await flushCanvasStorePersistence();
    const working = localforage.setItem;
    let release!: () => void;
    let started!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const entered = new Promise<void>((resolve) => { started = resolve; });
    let blocked = false;
    localforage.setItem = (async (key: string, value: string) => {
        if (!blocked && key.includes("canvas_store")) {
            blocked = true;
            started();
            await gate;
        }
        return working.call(localforage, key, value);
    }) as typeof localforage.setItem;
    const loading = loadCanvasProjectForEditing("canvas");
    let applied: CanvasProject | undefined;
    const joined = loadCanvasProjectForEditing("canvas", { onLoad: (project) => { applied = project; } });
    try {
        await entered;
        const current = useCanvasStore.getState().openProject("canvas")!;
        useCanvasStore.getState().updateProject("canvas", {
            nodes: current.nodes.map((node) => ({ ...node, title: "edited during load" })),
        });
    } finally {
        release();
    }
    await Promise.all([loading, joined]);
    expect(applied?.nodes[0].title).toBe("edited during load");
    await saveRemoteUserDataNow("canvas");
    expect(remote.get("canvas")!.nodes[0].title).toBe("edited during load");
});

test("viewport-only updates during latest load still adopt cloud content", async () => {
    remote.set("canvas", { ...addNode(canvas(), "remote-video"), revision: 2 });
    useCanvasStore.getState().updateProject("canvas", { nodes: addNode(canvas(), "local-video").nodes });
    const working = localforage.setItem;
    let release!: () => void;
    let started!: () => void;
    const waiting = new Promise<void>((resolve) => {
        release = resolve;
    });
    const entered = new Promise<void>((resolve) => {
        started = resolve;
    });
    localforage.setItem = (async (key: string, value: unknown) => {
        if (key.includes("sync-drafts:")) {
            started();
            await waiting;
        }
        return working(key, value);
    }) as typeof localforage.setItem;
    const loading = loadCanvasProjectForEditing("canvas", { latest: true });
    await entered;
    useCanvasStore.getState().updateProject("canvas", { viewport: { x: 40, y: 12, k: 1.5 } });
    release();
    const loaded = await loading;
    expect(loaded.nodes.at(-1)!.id).toBe("remote-video");
    expect(useCanvasStore.getState().openProject("canvas")!.revision).toBe(2);
    expect(useCanvasStore.getState().openProject("canvas")!.viewport).toEqual({ x: 40, y: 12, k: 1.5 });
});

test("edits arriving during draft backup prevent replacement of the live canvas", async () => {
    useCanvasStore.getState().renameProject("canvas", "first local edit");
    const working = localforage.setItem;
    let release!: () => void;
    let started!: () => void;
    const waiting = new Promise<void>((resolve) => {
        release = resolve;
    });
    const entered = new Promise<void>((resolve) => {
        started = resolve;
    });
    localforage.setItem = (async (key: string, value: unknown) => {
        if (key.includes("sync-drafts:")) {
            started();
            await waiting;
        }
        return working(key, value);
    }) as typeof localforage.setItem;
    const loading = loadCanvasProjectForEditing("canvas", { latest: true });
    await entered;
    useCanvasStore.getState().renameProject("canvas", "second local edit");
    release();
    await expect(loading).rejects.toThrow("画布仍在更新");
    expect(useCanvasStore.getState().openProject("canvas")!.title).toBe("second local edit");
});

test("unknown revision cannot borrow the latest revision to submit stale content", async () => {
    const local = useCanvasStore.getState().openProject("canvas")!;
    useCanvasStore.setState((state) => ({ projects: state.projects.map((project) => (project.id === local.id ? { ...local, revision: undefined, title: "legacy draft" } : project)) }));
    await expect(saveRemoteUserDataNow()).rejects.toThrow("缺少画布版本");
    expect(requests.filter((request) => request.method === "put")).toHaveLength(0);
    expect(useSyncProgressStore.getState().syncingProjects.canvas.phase).toBe("conflict");
    expect((await readCanvasSyncDrafts("canvas"))[0].project.title).toBe("legacy draft");
});

test("HTTP environments without Web Crypto still distinguish unsaved content", async () => {
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, "crypto")!;
    Object.defineProperty(globalThis, "crypto", { configurable: true, value: undefined });
    try {
        const baseline = await canvasContentHash(canvas());
        expect(baseline).toBe(await canvasContentHash({ ...canvas(), viewport: { x: 100, y: 0, k: 2 } }));
        expect(baseline).not.toBe(await canvasContentHash(addNode(canvas(), "new-video")));
    } finally {
        Object.defineProperty(globalThis, "crypto", descriptor);
    }
});

test("history restore preserves the draft and installs a new revision without an extra content PUT", async () => {
    useCanvasStore.getState().updateProject("canvas", { nodes: addNode(canvas(), "unsaved-video").nodes });
    let applied = false;
    const restored = await loadCanvasProjectForEditing("canvas", {
        historyRestore: { snapshotId: "historical", revision: 1 },
        onLoad: (project) => {
            expect(useCanvasStore.getState().openProject("canvas")!.revision).toBe(1);
            expect(project.revision).toBe(2);
            applied = true;
        },
    });
    expect(applied).toBe(true);
    expect(restored.title).toBe("historical content");
    expect((await readCanvasSyncDrafts("canvas")).some((draft) => draft.project.nodes.some((node) => node.id === "unsaved-video"))).toBe(true);
    await saveRemoteUserDataNow("canvas");
    expect(requests.filter((request) => request.method === "post")).toHaveLength(1);
    expect(requests.filter((request) => request.method === "put")).toHaveLength(0);
});

test("a stale history restore preserves both current cloud content and local edits", async () => {
    remote.set("canvas", { ...addNode(canvas(), "new-cloud-video"), revision: 2 });
    useCanvasStore.getState().renameProject("canvas", "local draft");
    await expect(loadCanvasProjectForEditing("canvas", { historyRestore: { snapshotId: "historical", revision: 1 } })).rejects.toThrow("版本冲突");
    expect(remote.get("canvas")!.nodes.at(-1)!.id).toBe("new-cloud-video");
    expect(useCanvasStore.getState().openProject("canvas")!.title).toBe("local draft");
    expect((await readCanvasSyncDrafts("canvas"))[0].project.title).toBe("local draft");
});

test("reopened dirty cache with the same ancestor stays pending until actually saved", async () => {
    useCanvasStore.getState().renameProject("canvas", "offline draft");
    await flushCanvasStorePersistence();
    await initializeRemoteUserDataSession(scope);
    const loaded = await loadCanvasProjectForEditing("canvas");
    expect(loaded.title).toBe("offline draft");
    expect(useSyncProgressStore.getState().syncingProjects.canvas.phase).toBe("pending");
    expect(remote.get("canvas")!.title).toBe("canvas");
    await saveRemoteUserDataNow("canvas");
    expect(remote.get("canvas")!.title).toBe("offline draft");
    expect(remote.get("canvas")!.revision).toBe(2);
});

test("reopened cache preserves offline node deletion against its verified cloud ancestor", async () => {
    useCanvasStore.getState().updateProject("canvas", { nodes: [] });
    await flushCanvasStorePersistence();
    await initializeRemoteUserDataSession(scope);
    const loaded = await loadCanvasProjectForEditing("canvas");
    expect(loaded.nodes).toEqual([]);
    expect(remote.get("canvas")!.nodes).toHaveLength(1);
    expect(useSyncProgressStore.getState().syncingProjects.canvas.phase).toBe("pending");
    await saveRemoteUserDataNow("canvas");
    expect(remote.get("canvas")!.nodes).toEqual([]);
    expect(remote.get("canvas")!.revision).toBe(2);
});

test("reopened cache keeps offline text and cloud additions when the ancestor has advanced", async () => {
    const local = useCanvasStore.getState().openProject("canvas")!;
    useCanvasStore.getState().renameProject("canvas", "offline draft");
    useCanvasStore.getState().updateProject("canvas", {
        nodes: local.nodes.map((node) => ({ ...node, title: "offline node" })),
    });
    await flushCanvasStorePersistence();
    remote.set("canvas", { ...addNode(canvas(), "cloud-only"), revision: 2 });
    await initializeRemoteUserDataSession(scope);
    const loaded = await loadCanvasProjectForEditing("canvas");
    expect(loaded.title).toBe("offline draft");
    expect(loaded.nodes[0].title).toBe("offline node");
    expect(loaded.nodes.map((node) => node.id)).toEqual(["old-image", "cloud-only"]);
    expect(loaded.revision).toBe(2);
    expect(remote.get("canvas")!.title).toBe("canvas");
    await saveRemoteUserDataNow("canvas");
    expect(remote.get("canvas")!.title).toBe("offline draft");
    expect(remote.get("canvas")!.nodes[0].title).toBe("offline node");
    expect(remote.get("canvas")!.nodes).toHaveLength(2);
    expect(remote.get("canvas")!.revision).toBe(3);
});

test("failed draft backup prevents a history restore request", async () => {
    const working = localforage.setItem;
    localforage.setItem = (async (key: string, value: unknown) => {
        if (key.includes("sync-drafts:")) throw new Error("disk full");
        return working(key, value);
    }) as typeof localforage.setItem;
    await expect(loadCanvasProjectForEditing("canvas", { historyRestore: { snapshotId: "historical", revision: 1 } })).rejects.toThrow("disk full");
    expect(requests.some((request) => request.method === "post")).toBe(false);
    expect(remote.get("canvas")!.revision).toBe(1);
});
