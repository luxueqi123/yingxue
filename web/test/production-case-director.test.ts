import { expect, test } from "bun:test";
import { createHash } from "node:crypto";
import support from "../src/lib/production-case-support.json";
import { isCaseWithdrawn } from "../src/lib/case-publication-policy";
import { loadProductionCaseProject } from "../src/services/production-case-project";
import { createPrevisSceneFromTemplate } from "../src/lib/canvas/previs/previs-templates";
import { copyProductionCasePreviss } from "../src/lib/canvas/previs/production-case-director";
import { parseCanvasStorageDocument, serializeCanvasStorageDocument } from "../src/lib/canvas/canvas-storage-revision";
import { canvasContentHash } from "../src/lib/canvas/canvas-content";
import { CanvasNodeType, type CanvasNodeData } from "../src/types/canvas";
import type { CanvasProject } from "../src/stores/canvas/use-canvas-store";
import localforage from "localforage";
import { apiClient } from "../src/services/api/request";
import { createCanvasProjectWithRemoteSync, initializeRemoteUserDataSession, loadCanvasProjectForEditing, resetRemoteUserDataSync } from "../src/services/user-data-sync";
import { useCanvasStore, flushCanvasStorePersistence, withCanvasStorePersistenceSuppressed } from "../src/stores/canvas/use-canvas-store";
import { useAssetStore } from "../src/stores/use-asset-store";
import { getActiveUserScope, setActiveUserScope } from "../src/lib/user-scope";

function fixture() {
    const scene = createPrevisSceneFromTemplate("product", "本地导演台");
    scene.outputFrame = { width: 2276, height: 1280, aspect: 16/9 };
    const object = scene.objects[0];
    object.kind = "model"; object.url = "/production-library/director/model.glb"; object.modelNormalization = "preserve-source";
    object.sourceNodeId = "preview";
    object.keyframes = [{ id: "object-frame", time: 0, transform: structuredClone(object.transform), easing: "linear" }];
    object.motionClips = [{ id: "motion", name: "源动画", sourceAnimation: "walk", start: 0, duration: 2, playbackRate: 1, loop: false }];
    object.activeMotionClipId = "motion";
    object.boneTracks = [{ bone: "head", keyframes: [{ id: "bone-frame", time: 0, rotation: [0, 0, 0, 1] }] }];
    scene.cameras[0].sourceCamera = { objectId: object.id, entityId: "gltf-source-camera" };
    scene.cameras[0].keyframes = [{ id: "camera-frame", time: 0, transform: structuredClone(scene.cameras[0].transform) }];
    scene.shots[0].previewNodeId = "preview";
    scene.groundVisible = false; scene.toneMapping = "none";
    const nodes: CanvasNodeData[] = [
        { id: "director", type: CanvasNodeType.Video, title: "导演台", position: { x: 0, y: 0 }, width: 350, height: 300, metadata: {
            workflowKind: "shot", previsSceneId: scene.id, previsShotId: scene.shots[0].id, previsPreviewNodeId: "preview", referenceAssetNodeIds: ["preview"],
        } },
        { id: "preview", type: CanvasNodeType.Image, title: "原截图", position: { x: 400, y: 0 }, width: 320, height: 180, metadata: { content: "https://example.test/preview.png" } },
    ];
    return { scene, nodes };
}

async function withSnapshot(source: ReturnType<typeof fixture>, check: (id: string) => Promise<void>, snapshot: Record<string, unknown> = { previsScenes: [source.scene] }) {
    const entry = support.find(item => !isCaseWithdrawn(item.id))!;
    const previousEntry = { ...entry }, previousFetch = globalThis.fetch;
    const bytes = JSON.stringify({ version: 1, id: entry.id, title: "导演台案例", nodes: source.nodes, connections: [], ...snapshot });
    Object.assign(entry, { nodeCount: source.nodes.length, connectionCount: 0, sha256: createHash("sha256").update(bytes).digest("hex") });
    globalThis.fetch = (async () => new Response(bytes)) as typeof fetch;
    try { await check(entry.id); }
    finally { Object.assign(entry, previousEntry); globalThis.fetch = previousFetch; }
}

test("案例预览保留完整导演台，复制重映射场景、模型、机位、镜头和画布输出引用", async () => {
    const source = fixture(), before = JSON.stringify(source);
    await withSnapshot(source, async id => {
        const preview = await loadProductionCaseProject(id, { mode: "preview" });
        expect(JSON.stringify(preview.previsScenes)).toBe(JSON.stringify([source.scene]));
        const copy = await loadProductionCaseProject(id);
        const scene = copy.previsScenes![0], original = source.scene, meta = copy.nodes[0].metadata!;
        expect(scene.id).not.toBe(original.id);
        expect(meta.previsSceneId).toBe(scene.id);
        expect(meta.previsShotId).toBe(scene.shots[0].id);
        expect(scene.activeShotId).toBe(scene.shots[0].id);
        expect(scene.shots[0].id).not.toBe(original.shots[0].id);
        expect(scene.shots[0].cameraId).toBe(scene.cameras[0].id);
        expect(scene.cameras[0].id).not.toBe(original.cameras[0].id);
        expect(scene.cameras[0].sourceCamera).toEqual({ objectId: scene.objects[0].id, entityId: "gltf-source-camera" });
        expect(scene.objects[0].id).not.toBe(original.objects[0].id);
        expect(scene.objects[0].sourceNodeId).toBe(copy.nodes[1].id);
        expect(scene.shots[0].previewNodeId).toBe(copy.nodes[1].id);
        expect(meta.previsPreviewNodeId).toBe(copy.nodes[1].id);
        expect(meta.referenceAssetNodeIds).toEqual([copy.nodes[1].id]);
        expect(scene.objects[0].activeMotionClipId).toBe(scene.objects[0].motionClips![0].id);
        expect(scene.objects[0].activeMotionClipId).not.toBe("motion");
        expect(scene.objects[0].keyframes[0].id).not.toBe("object-frame");
        expect(scene.objects[0].boneTracks![0].keyframes[0].id).not.toBe("bone-frame");
        expect(scene.cameras[0].keyframes[0].id).not.toBe("camera-frame");
        expect(scene.objects[0].transform).toEqual(original.objects[0].transform);
        expect(scene.objects[0].url).toBe(original.objects[0].url);
        expect(scene).toMatchObject({ groundVisible: false, toneMapping: "none" });
        expect(scene.outputFrame).toEqual(original.outputFrame);
        const project: CanvasProject = { ...copy, id: "copy", createdAt: original.createdAt, updatedAt: original.updatedAt, chatSessions: [], activeChatId: null, viewport: { x: 0, y: 0, k: 1 }, previsScenes: copy.previsScenes! };
        const restored = parseCanvasStorageDocument(serializeCanvasStorageDocument(parseCanvasStorageDocument(null, [project]))).state.projects[0];
        expect(restored.previsScenes).toEqual(copy.previsScenes!);
        expect(restored.nodes[0].metadata!.previsSceneId).toBe(restored.previsScenes[0].id);
        const edited = structuredClone(restored); edited.previsScenes[0].objects[0].transform.position[0] += 1;
        expect(await canvasContentHash(edited)).not.toBe(await canvasContentHash(restored));
    });
    expect(JSON.stringify(source)).toBe(before);
});

test("冻结旧案例校验原始字节后映射预演字段，复制不改源包且拒绝双合同", async () => {
    const source = fixture();
    const { previsSceneId, previsShotId, previsPreviewNodeId, ...metadata } = source.nodes[0].metadata!;
    const frozen = {
        directorScenes: [source.scene],
        nodes: [{ ...source.nodes[0], metadata: { ...metadata, directorSceneId: previsSceneId, directorShotId: previsShotId, directorPreviewNodeId: previsPreviewNodeId } }, source.nodes[1]],
    };
    const before = JSON.stringify(frozen);
    await withSnapshot(source, async (id) => {
        const preview = await loadProductionCaseProject(id, { mode: "preview" });
        expect(preview.previsScenes).toEqual([source.scene]);
        expect(preview.nodes[0].metadata?.previsSceneId).toBe(source.scene.id);
        expect(preview.nodes[0].metadata?.previsShotId).toBe(source.scene.shots[0].id);
        expect(preview.nodes[0].metadata?.previsPreviewNodeId).toBe(source.nodes[1].id);
        expect(preview.nodes[0].metadata).not.toHaveProperty("directorSceneId");
        const copy = await loadProductionCaseProject(id);
        expect(copy.nodes[0].metadata?.previsSceneId).toBe(copy.previsScenes![0].id);
        expect(copy.previsScenes![0].id).not.toBe(source.scene.id);
    }, frozen);
    expect(JSON.stringify(frozen)).toBe(before);
    await withSnapshot(source, async (id) => {
        await expect(loadProductionCaseProject(id)).rejects.toThrow("两套预演场景");
    }, { ...frozen, previsScenes: [source.scene] });
});

test("缺少场景、镜头、机位、模型或截图引用时停止复制，不创建默认场景掩盖丢失", async () => {
    const mutations: Array<(value: ReturnType<typeof fixture>) => void> = [
        s => { s.nodes[0].metadata!.previsSceneId = "missing"; },
        s => { s.nodes[0].metadata!.previsShotId = "missing"; },
        s => { s.scene.activeShotId = "missing"; },
        s => { s.scene.shots[0].cameraId = "missing"; },
        s => { s.scene.shots[0].previewNodeId = "missing"; },
        s => { s.scene.cameras[0].sourceCamera!.objectId = "missing"; },
        s => { s.scene.objects[0].sourceNodeId = "missing"; },
        s => { s.scene.objects[0].activeMotionClipId = "missing"; },
        s => { s.nodes[0].metadata!.previsPreviewNodeId = "missing"; },
        s => { s.nodes[0].metadata!.referenceAssetNodeIds = ["missing"]; },
        s => { s.scene.objects.push(structuredClone(s.scene.objects[0])); },
        s => { s.scene.cameras[0].fov = 0; },
        s => { s.scene.objects[0].url = "blob:temporary"; },
        s => { s.scene.objects[0].url = "https://user:secret@example.test/model.glb"; },
        s => { s.scene.objects[0].keyframes[0].time = -1; },
    ];
    for (const mutate of mutations) {
        const source = fixture(); mutate(source);
        await withSnapshot(source, async id => { await expect(loadProductionCaseProject(id)).rejects.toThrow("案例导演台"); });
    }
    const source = fixture(), ids = new Map(source.nodes.map(n => [n.id, n.id]));
    expect(() => copyProductionCasePreviss(undefined, source.nodes, ids, false)).toThrow("案例导演台");
    expect(() => copyProductionCasePreviss([source.scene, source.scene], source.nodes, ids, false)).toThrow("案例导演台");
});

test("普通案例不增加导演台，连续复制不共享场景对象", () => {
    const source = fixture(), ids = new Map(source.nodes.map(n => [n.id, n.id]));
    expect(copyProductionCasePreviss(undefined, [], new Map(), true).previsScenes).toBeUndefined();
    const a = copyProductionCasePreviss([source.scene], source.nodes, ids, false);
    const b = copyProductionCasePreviss([source.scene], source.nodes, ids, false);
    expect(a.previsScenes![0].id).not.toBe(b.previsScenes![0].id);
    a.previsScenes![0].objects[0].transform.position[0] += 10;
    expect(b.previsScenes![0].objects[0].transform).toEqual(source.scene.objects[0].transform);
});

test("导演台正文计入原生5MiB保存上限，不能只计算画布节点", async () => {
    const source = fixture(); source.scene.shots[0].prompt = "x".repeat(5 * 1024 * 1024);
    await withSnapshot(source, async id => { await expect(loadProductionCaseProject(id)).rejects.toThrow("5 MiB"); });
});

test("案例复制经真实建画布与同步客户端传递导演台，模拟后端保存重开不丢失", async () => {
    const oldWindow = globalThis.window, oldAdapter = apiClient.defaults.adapter;
    const oldGet = localforage.getItem, oldSet = localforage.setItem;
    const oldScope = getActiveUserScope(), oldProjects = useCanvasStore.getState().projects, oldAssets = useAssetStore.getState().assets;
    const durable = new Map<string, unknown>(), preferences = new Map<string, string>();
    localforage.getItem = (async (key: string) => durable.get(key) ?? null) as typeof localforage.getItem;
    localforage.setItem = (async (key: string, value: unknown) => { durable.set(key, structuredClone(value)); return value; }) as typeof localforage.setItem;
    Object.defineProperty(globalThis, "window", { configurable: true, value: { setTimeout: () => 1, clearTimeout: () => {}, localStorage: { getItem: (key: string) => preferences.get(key) ?? null, setItem: (key: string, value: string) => preferences.set(key, value), removeItem: (key: string) => preferences.delete(key) } } });
    let remote: CanvasProject | undefined;
    const assets = new Map<string, unknown>();
    apiClient.defaults.adapter = async config => {
        if (config.url?.startsWith("/assets/") && config.method === "get") {
            const asset = assets.get(config.url.slice("/assets/".length));
            return asset
                ? { data: { code: 0, data: { asset: structuredClone(asset) }, msg: "" }, status: 200, statusText: "OK", headers: {}, config }
                : { data: { code: 404, data: null, msg: "Asset not found" }, status: 404, statusText: "Not Found", headers: {}, config };
        }
        if (config.url === "/assets/batch" && config.method === "post") {
            const requested = JSON.parse(config.data).ids as string[];
            if (requested.some(id => !assets.has(id))) throw new Error("Unsaved asset reference");
            return { data: { code: 0, data: { assets: requested.map(id => structuredClone(assets.get(id))) }, msg: "" }, status: 200, statusText: "OK", headers: {}, config };
        }
        if (config.url?.startsWith("/assets/") && config.method === "put") {
            const asset = JSON.parse(config.data).asset;
            assets.set(asset.id, asset);
            return { data: { code: 0, data: { asset }, msg: "" }, status: 200, statusText: "OK", headers: {}, config };
        }
        if (!config.url?.startsWith("/canvas-projects/")) throw new Error(`Unexpected request ${config.url}`);
        if (config.method === "patch" && config.url.endsWith("/operations")) {
            const request = JSON.parse(config.data);
            for (const operation of request.operations) {
                if (operation.type === "create_canvas") remote = { id: operation.id, nodes: [], connections: [], ...operation.patch } as CanvasProject;
                else if (operation.type === "create_node") remote!.nodes.push(operation.node);
                else if (operation.type === "create_connection") remote!.connections.push(operation.connection);
                else if (operation.type === "set_field") Object.assign(remote!, { [operation.field]: operation.value });
                else throw new Error(`Unsupported fixture operation: ${operation.type}`);
            }
            remote = { ...remote!, revision: (remote!.revision || 0) + 1 };
            return { data: { code: 0, data: { project: { revision: remote.revision }, mutationId: request.mutationId }, msg: "" }, status: 200, statusText: "OK", headers: {}, config };
        }
        if (config.method === "put") remote = { ...JSON.parse(config.data).project, revision: 1 };
        else if (config.method !== "get" || config.url !== `/canvas-projects/${remote?.id}`) throw new Error("Unexpected request");
        return { data: { code: 0, data: { project: structuredClone(remote) }, msg: "" }, status: 200, statusText: "OK", headers: {}, config };
    };
    try {
        resetRemoteUserDataSync(); setActiveUserScope("director-case-test-owner");
        useCanvasStore.setState({ projects: [] }); useAssetStore.setState({ assets: [] });
        await initializeRemoteUserDataSession("director-case-test-owner");
        await withSnapshot(fixture(), async id => {
            const copy = await loadProductionCaseProject(id);
            const result = await createCanvasProjectWithRemoteSync(copy.title, undefined, copy);
            expect(result.syncError).toBeUndefined();
            expect(remote!.previsScenes).toEqual(copy.previsScenes!);
            expect(remote!.nodes[0].metadata!.previsSceneId).toBe(remote!.previsScenes[0].id);
            await flushCanvasStorePersistence();
            resetRemoteUserDataSync();
            withCanvasStorePersistenceSuppressed(() => useCanvasStore.setState({ projects: [] }));
            await initializeRemoteUserDataSession("director-case-test-owner");
            const reopened = await loadCanvasProjectForEditing(result.id);
            expect(reopened!.previsScenes).toEqual(copy.previsScenes!);
            expect(reopened!.nodes[0].metadata!.previsPreviewNodeId).toBe(reopened!.nodes[1].id);
        });
    } finally {
        resetRemoteUserDataSync(); await flushCanvasStorePersistence(); apiClient.defaults.adapter = oldAdapter;
        setActiveUserScope(oldScope);
        withCanvasStorePersistenceSuppressed(() => useCanvasStore.setState({ projects: oldProjects }));
        useAssetStore.setState({ assets: oldAssets });
        localforage.getItem = oldGet; localforage.setItem = oldSet;
        if (oldWindow === undefined) Reflect.deleteProperty(globalThis, "window");
        else Object.defineProperty(globalThis, "window", { configurable: true, value: oldWindow });
    }
});
