import { afterAll, afterEach, beforeEach, expect, spyOn, test } from "bun:test";
import { Window } from "happy-dom";

const dom = new Window({ url: "https://canvas.test/" });
const originals = new Map<string, PropertyDescriptor | undefined>();
for (const [key, value] of Object.entries({ window: dom, document: dom.document, navigator: dom.navigator, IS_REACT_ACT_ENVIRONMENT: true })) {
    originals.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
}
const { act } = await import("react");
const { createRoot } = await import("react-dom/client");
const source = await import("../src/services/canvas-image-layer-source");
const storage = await import("../src/services/image-storage");
const assets = await import("../src/services/project-asset-sync");
const { createCanvasStateWriter } = await import("../src/lib/canvas/canvas-editor-state");
const { useCanvasImageLayerMaterials } = await import("../src/pages/canvas/use-canvas-image-layer-materials");
const { CanvasNodeType } = await import("../src/types/canvas");
type CanvasNode = import("../src/types/canvas").CanvasNodeData;
type Connection = import("../src/types/canvas").CanvasConnection;
const crop = spyOn(source, "cropImageLayerMaterial");
const upload = spyOn(storage, "uploadImage");
const persist = spyOn(assets, "ensureCanvasNodeAsset");
const cropped = { dataUrl: "cropped", width: 100, height: 200, bytes: 10, mimeType: "image/png", bounds: { left: 0, top: 0, width: 100, height: 200 } };
let reactRoot: ReturnType<typeof createRoot> | undefined;
let extract: ReturnType<typeof useCanvasImageLayerMaterials>;

function node(id: string, x: number, y: number): CanvasNode {
    return { id, type: CanvasNodeType.Image, title: id, position: { x, y }, width: 300, height: 200 };
}
function fixture() {
    const layer: CanvasNode = { ...node("layer", 600, 0), metadata: { content: "/layer", storageKey: "resource:layer", status: "success", imageLayer: { groupId: "root", outputIndex: 1 } } };
    const root: CanvasNode = { ...node("root", 0, 0), metadata: { imageLayerGroup: { width: 100, height: 200, compositeStatus: "ready", layers: [{ nodeId: layer.id, x: 0, y: 0, visible: true }] } } };
    return { root, layer, nodes: [root, layer] };
}
async function mount(nodes: CanvasNode[]) {
    const nodesRef = { current: nodes };
    const connectionsRef = { current: [] as Connection[] };
    const writeNodes = createCanvasStateWriter(nodesRef, () => {});
    function Probe() {
        extract = useCanvasImageLayerMaterials({ projectId: "layer-placement", enabled: true, nodes: nodesRef.current, nodesRef, setNodes: writeNodes, setConnections: createCanvasStateWriter(connectionsRef, () => {}) });
        return null;
    }
    const host = document.createElement("div"); document.body.append(host);
    reactRoot = createRoot(host);
    await act(async () => { reactRoot!.render(<Probe />); });
    return { nodesRef, connectionsRef };
}
function unobscured(nodes: CanvasNode[]) {
    for (let index = 0; index < nodes.length; index++) for (const other of nodes.slice(index + 1)) {
        const current = nodes[index];
        expect(current.position.x + current.width <= other.position.x || other.position.x + other.width <= current.position.x || current.position.y + current.height <= other.position.y || other.position.y + other.height <= current.position.y).toBe(true);
    }
}
beforeEach(() => {
    crop.mockReset(); upload.mockReset(); persist.mockReset();
    crop.mockResolvedValue(cropped);
    let sequence = 0;
    upload.mockImplementation(async () => ({ url: `/material-${++sequence}`, storageKey: `resource:material-${sequence}`, width: 100, height: 200, bytes: 10, mimeType: "image/png" }));
    persist.mockImplementation(async ({ node }) => ({ assetId: `asset-${node.id}`, linked: true }));
});
afterEach(async () => { await act(async () => { reactRoot?.unmount(); }); reactRoot = undefined; document.body.innerHTML = ""; });
afterAll(() => {
    crop.mockRestore(); upload.mockRestore(); persist.mockRestore(); dom.happyDOM.abort();
    for (const [key, descriptor] of originals) if (descriptor) Object.defineProperty(globalThis, key, descriptor); else Reflect.deleteProperty(globalThis, key);
});

test("layer extraction follows a moved and resized source, retains edits, and links the saved material", async () => {
    const { root, nodes } = fixture();
    const { nodesRef, connectionsRef } = await mount(nodes);
    let finish!: (value: typeof cropped) => void;
    crop.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    const pending = extract(root);
    nodesRef.current = nodesRef.current.map(item => item.id === root.id ? { ...item, title: "Renamed while extracting", position: { x: 2400, y: 900 }, width: 500 } : item);
    finish(cropped); await pending;
    const group = nodesRef.current.find(item => item.metadata?.isBatchRoot)!;
    expect(group.position).toEqual({ x: 2996, y: 900 });
    expect(nodesRef.current[0]).toMatchObject({ title: "Renamed while extracting", position: { x: 2400, y: 900 }, width: 500, metadata: { imageLayerMaterials: { status: "ready", groupId: group.id } } });
    expect(nodesRef.current[1]).toEqual(nodes[1]);
    const material = nodesRef.current.find(item => item.metadata?.imageLayerMaterial)!;
    expect(material.metadata).toMatchObject({ assetId: `asset-${material.id}`, imageLayerMaterial: { sourceLayerId: "layer", sourceGroupId: "root" } });
    expect(connectionsRef.current).toMatchObject([{ fromNodeId: "root", toNodeId: group.id }, { fromNodeId: group.id, toNodeId: material.id }]);
    unobscured(nodesRef.current);
});

test("the complete material group avoids an obstacle added while extraction was pending", async () => {
    const { root, nodes } = fixture();
    const { nodesRef } = await mount(nodes);
    let finish!: (value: typeof cropped) => void;
    crop.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    const pending = extract(root);
    const obstacle = { ...node("late-obstacle", 1050, 0), height: 900 };
    nodesRef.current = [...nodesRef.current, obstacle];
    finish(cropped); await pending;
    expect(nodesRef.current.find(item => item.id === obstacle.id)).toEqual(obstacle);
    unobscured(nodesRef.current);
});

test("repeated material groups avoid previous outputs without moving them", async () => {
    const { root, nodes } = fixture();
    const { nodesRef } = await mount(nodes);
    await extract(root);
    const first = structuredClone(nodesRef.current);
    await extract(nodesRef.current[0]);
    expect(nodesRef.current.slice(1, first.length)).toEqual(first.slice(1));
    expect(nodesRef.current).toHaveLength(6);
    unobscured(nodesRef.current);
});

test("a layer edited during extraction rejects the stale group", async () => {
    const { root, nodes } = fixture();
    const { nodesRef, connectionsRef } = await mount(nodes);
    let finish!: (value: typeof cropped) => void;
    crop.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    const pending = extract(root);
    nodesRef.current = nodesRef.current.map(item => item.id === "layer" ? { ...item, metadata: { ...item.metadata, content: "/new-layer" } } : item);
    finish(cropped); await pending;
    expect(nodesRef.current).toHaveLength(2);
    expect(nodesRef.current[0].metadata?.imageLayerMaterials?.status).toBe("error");
    expect(connectionsRef.current).toEqual([]);
});

test("failed remote persistence creates no material group", async () => {
    const { root, nodes } = fixture();
    const { nodesRef, connectionsRef } = await mount(nodes);
    upload.mockRejectedValueOnce(new Error("upload rejected"));
    await extract(root);
    expect(nodesRef.current).toHaveLength(2);
    expect(nodesRef.current[0].metadata?.imageLayerMaterials).toMatchObject({ status: "error" });
    expect(connectionsRef.current).toEqual([]);
    expect(persist).not.toHaveBeenCalled();
});
