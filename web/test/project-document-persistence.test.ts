import { expect, test } from "bun:test";
import localforage from "localforage";
import { applyCanvasOperations, type CanvasSnapshot } from "../src/lib/canvas/canvas-operation-contract";
import { readProjectDocument, writeProjectDocumentOps } from "../src/lib/canvas/canvas-project-documents";
import { apiClient } from "../src/services/api/request";
import { initializeRemoteUserDataSession, loadCanvasProjectForEditing, resetRemoteUserDataSync, saveRemoteUserDataNow } from "../src/services/user-data-sync";
import { useCanvasStore, flushCanvasStorePersistence, withCanvasStorePersistenceSuppressed, type CanvasProject } from "../src/stores/canvas/use-canvas-store";
import { useAssetStore } from "../src/stores/use-asset-store";
import { getActiveUserScope, setActiveUserScope } from "../src/lib/user-scope";
import { createCanvasOperationsServer } from "./helpers/canvas-operations-server";

test("制作文档经过真实同步客户端保存回读，失败保留待保存，账号缓存隔离", async () => {
    const oldWindow = globalThis.window;
    const oldAdapter = apiClient.defaults.adapter;
    const oldGet = localforage.getItem;
    const oldSet = localforage.setItem;
    const oldScope = getActiveUserScope();
    const oldProjects = useCanvasStore.getState().projects;
    const oldAssets = useAssetStore.getState().assets;
    const durable = new Map<string, unknown>();
    const preferences = new Map<string, string>();
    localforage.getItem = (async (key: string) => durable.get(key) ?? null) as typeof localforage.getItem;
    localforage.setItem = (async (key: string, value: unknown) => { durable.set(key, structuredClone(value)); return value; }) as typeof localforage.setItem;
    Object.defineProperty(globalThis, "window", { configurable: true, value: { setTimeout: () => 1, clearTimeout: () => {}, localStorage: { getItem: (key: string) => preferences.get(key) ?? null, setItem: (key: string, value: string) => preferences.set(key, value), removeItem: (key: string) => preferences.delete(key) } } });
    let remote: CanvasProject | undefined;
    const remoteProjects = new Map<string, CanvasProject>();
    const applyOperations = createCanvasOperationsServer(remoteProjects);
    let fail = false;
    let writes = 0;
    apiClient.defaults.adapter = async (config) => {
        if (config.url === "/canvas-projects/document-canvas/operations" && config.method === "patch") {
            if (fail) throw new Error("模拟保存失败");
            const response = applyOperations("document-canvas", JSON.parse(config.data));
            remote = response.project;
            writes++;
            return { data: { code: 0, data: response, msg: "" }, status: 200, statusText: "OK", headers: {}, config };
        }
        if (config.url !== "/canvas-projects/document-canvas") throw new Error(`Unexpected request ${config.url}`);
        if (config.method === "put") {
            if (fail) throw new Error("模拟保存失败");
            const incoming = JSON.parse(config.data).project as CanvasProject;
            remote = { ...incoming, revision: (remote?.revision ?? 0) + 1 };
            remoteProjects.set("document-canvas", remote);
            writes++;
        } else if (config.method !== "get") throw new Error("Unexpected method");
        return { data: { code: 0, data: { project: structuredClone(remote) }, msg: "" }, status: 200, statusText: "OK", headers: {}, config };
    };
    try {
        setActiveUserScope("document-owner-a");
        useCanvasStore.setState({ projects: [] });
        useAssetStore.setState({ assets: [] });
        await initializeRemoteUserDataSession("document-owner-a");
        const snapshot: CanvasSnapshot = { projectId: "document-canvas", title: "制作", nodes: [], connections: [], selectedNodeIds: [], viewport: { x: 0, y: 0, k: 1 } };
        const next = applyCanvasOperations(snapshot, writeProjectDocumentOps(snapshot, { path: "Final_Video_Spec.md", mode: "create", content: "画幅16:9\n时长8秒" }));
        const project: CanvasProject = { id: snapshot.projectId, title: snapshot.title, nodes: next.nodes, connections: [], chatSessions: [], activeChatId: null, viewport: snapshot.viewport, createdAt: "2026-09-15T00:00:00Z", updatedAt: "2026-09-15T00:00:00Z", revision: 0, backgroundMode: "dots", showImageInfo: false, directorScenes: [] };
        useCanvasStore.setState({ projects: [project] });
        await flushCanvasStorePersistence();
        await saveRemoteUserDataNow();
        expect(remote?.nodes[0].metadata?.projectDocumentPath).toBe("Final_Video_Spec.md");
        resetRemoteUserDataSync();
        withCanvasStorePersistenceSuppressed(() => useCanvasStore.setState({ projects: [] }));
        await initializeRemoteUserDataSession("document-owner-a");
        const loaded = await loadCanvasProjectForEditing(project.id);
        expect(readProjectDocument({ ...snapshot, nodes: loaded!.nodes }, { path: "Final_Video_Spec.md" }).content).toBe("画幅16:9\n时长8秒");
        const revised = applyCanvasOperations({ ...snapshot, nodes: loaded!.nodes }, writeProjectDocumentOps({ ...snapshot, nodes: loaded!.nodes }, { path: "Final_Video_Spec.md", mode: "append", content: "\n已确认" }));
        useCanvasStore.getState().updateProject(project.id, { nodes: revised.nodes });
        fail = true;
        await expect(saveRemoteUserDataNow()).rejects.toThrow("模拟保存失败");
        expect(remote?.nodes[0].metadata?.content).not.toContain("已确认");
        fail = false;
        await saveRemoteUserDataNow();
        expect(remote?.nodes[0].metadata?.content).toContain("已确认");
        expect(writes).toBe(2);
        await flushCanvasStorePersistence();
        resetRemoteUserDataSync();
        setActiveUserScope("document-owner-b");
        withCanvasStorePersistenceSuppressed(() => useCanvasStore.setState({ projects: [] }));
        await useCanvasStore.persist.rehydrate();
        expect(useCanvasStore.getState().projects).toEqual([]);
        setActiveUserScope("document-owner-a");
        await useCanvasStore.persist.rehydrate();
        expect(useCanvasStore.getState().projects[0].nodes[0].metadata?.content).toContain("已确认");
    } finally {
        resetRemoteUserDataSync();
        await flushCanvasStorePersistence();
        apiClient.defaults.adapter = oldAdapter;
        setActiveUserScope(oldScope);
        withCanvasStorePersistenceSuppressed(() => useCanvasStore.setState({ projects: oldProjects }));
        useAssetStore.setState({ assets: oldAssets });
        localforage.getItem = oldGet;
        localforage.setItem = oldSet;
        if (oldWindow === undefined) Reflect.deleteProperty(globalThis, "window");
        else Object.defineProperty(globalThis, "window", { configurable: true, value: oldWindow });
    }
});
