import { expect, test } from "bun:test";
import { adaptLtvNativeProject } from "../src/lib/canvas/ltv-native-project";
import { prepareLtvPrevisStaticScene, bindLtvPrevisSceneAssets } from "../src/lib/canvas/previs/ltv-director-static-scene";
import type { LtvPrevisProjectImport } from "../src/lib/canvas/previs/ltv-director-project";
import { copyProductionCasePreviss } from "../src/lib/canvas/previs/production-case-director";

function fixture() {
    const composition = {
        environment: { skyColor: "#060608", groundVisible: true, groundOpacity: .4, groundHeight: 0, sceneScale: 3 },
        characters: [], props: [], characterGroups: [],
        cameras: [{ id: "camera", label: "主机位", position: { x: 0, y: 2.2, z: 10 }, lookAt: { x: 0, y: 1.2, z: 0 }, lookAtTarget: "", fov: 50, zoom: 1,
            screenshots: [{ id: "first", label: "第一张", imageUrl: "data:image/png;base64,first", createdAt: 1700000000000 }, { id: "second", label: "第二张", imageUrl: "data:image/png;base64,second", createdAt: 1700000010000 }] }],
    };
    const prepared = prepareLtvPrevisStaticScene(composition, { id: "scene", title: "导演台", now: "2026-09-30T00:00:00Z" }, new Map());
    const scene = bindLtvPrevisSceneAssets(prepared.scene, new Map(prepared.assets.map(a => [a.objectId, { url: "/production-library/ground.glb" }])));
    prepared.dispose();
    const node = { id: "director", type: "director-console-3d", position: { x: 20, y: 30 }, parentId: "group", data: { name: "作者镜头", action: "director_console_panorama_input", compositionData: composition } };
    const snapshot = { nodes: [
        { id: "group", type: "group", position: { x: 100, y: 200 }, data: { name: "分组", childNodeIds: ["director", "output"] } },
        node,
        { id: "output", type: "image", position: { x: 400, y: 30 }, parentId: "group", data: { action: "image_resource", url: ["https://example.test/output.png"] } },
    ], edges: [{ id: "output-edge", source: "director", target: "output" }] };
    const input: LtvPrevisProjectImport = { sourceComposition: structuredClone(composition), scene,
        screenshots: composition.cameras[0].screenshots.map(s => ({ sourceCameraId: "camera", sourceScreenshotId: s.id, url: `/production-library/${s.id}.png`, width: 1600, height: 900 })) };
    const imports = new Map([["director", input]]);
    return { snapshot, imports, input, node };
}
const adapt = (value: ReturnType<typeof fixture>) => adaptLtvNativeProject(value.snapshot, { channels: [] }, "case", "完整工程", {}, value.imports);

test("主适配器接入完整静态导演台，保留原分组、连线、全部截图及原始计数", () => {
    const data = fixture(), before = JSON.stringify(data.snapshot), sourceScene = JSON.stringify(data.input.scene);
    const result = adapt(data);
    expect(result.issues).toEqual([]);
    expect(result.supported).toBe(true);
    expect(result.project.adaptation.sourceNodeCount).toBe(3);
    expect(result.project.nodes).toHaveLength(5);
    expect(result.project.previsScenes).toHaveLength(1);
    const owner = result.project.nodes.find(n => n.id === "director")!;
    expect(owner).toMatchObject({ type: "video", title: "作者镜头", parentId: "group", position: { x: 120, y: 230 } });
    expect(owner.metadata).toMatchObject({ workflowKind: "shot", previsSceneId: "scene", previsShotId: "scene:shot:camera", previsPreviewNodeId: "scene:capture:camera:second" });
    expect(result.project.connections).toContainEqual({ id: "output-edge", fromNodeId: "director", toNodeId: "output" });
    expect(result.project.connections).toContainEqual({ id: "scene:preview-edge", fromNodeId: "scene:capture:camera:second", toNodeId: "director" });
    const captures = result.project.nodes.filter(n => n.id.startsWith("scene:capture:"));
    expect(captures.map(n => n.title)).toEqual(["第一张", "第二张"]);
    expect(captures.map(n => n.createdAt)).toEqual([new Date(1700000000000).toISOString(), new Date(1700000010000).toISOString()]);
    expect(captures.every(n => n.parentId === "group" && n.width / n.height === 16 / 9)).toBe(true);
    expect(captures.every(n => n.metadata!.previsSceneId === "scene" && n.metadata!.previsShotId === "scene:shot:camera")).toBe(true);
    expect(JSON.stringify(result.project)).not.toContain("base64");
    expect(JSON.stringify(data.snapshot)).toBe(before);
    expect(JSON.stringify(data.input.scene)).toBe(sourceScene);
    const copied = copyProductionCasePreviss(result.project.previsScenes, result.project.nodes, new Map(result.project.nodes.map(n => [n.id, `copy:${n.id}`])), false);
    expect(copied.metadata.get("director")!.previsPreviewNodeId).toBe("copy:scene:capture:camera:second");
    expect(copied.metadata.get(captures[0].id)!.previsShotId).toBe(copied.previsScenes![0].shots[0].id);
});

test("无截图场景仍可编辑，不伪造预览素材或空资源要求", () => {
    const data = fixture(); data.node.data.compositionData.cameras[0].screenshots = [];
    data.input.sourceComposition = structuredClone(data.node.data.compositionData); data.input.screenshots = [];
    const result = adapt(data);
    expect(result.issues).toEqual([]);
    expect(result.project.nodes).toHaveLength(3);
    expect(result.project.nodes.find(n => n.id === "director")!.metadata!.previsPreviewNodeId).toBeUndefined();
});

test("源截图显式无全景状态保留且相机身份不能串用", () => {
    const data = fixture();
    Object.assign(data.node.data.compositionData.cameras[0].screenshots[0], { cameraId: "camera", hasPanorama: false, panoramaSource: "none" });
    data.input.sourceComposition = structuredClone(data.node.data.compositionData);
    const result = adapt(data);
    expect(result.adoptable).toBe(true);
    expect(result.project.nodes.find(node => node.id === "scene:capture:camera:first")?.metadata?.previsCaptureSource).toEqual({ cameraId: "camera", hasPanorama: false, panoramaSource: "none" });
    for (const patch of [{ cameraId: "other" }, { hasPanorama: true }, { panoramaSource: "upload" }]) {
        const changed = fixture();
        Object.assign(changed.node.data.compositionData.cameras[0].screenshots[0], patch);
        changed.input.sourceComposition = structuredClone(changed.node.data.compositionData);
        expect(adapt(changed).issues.some(issue => issue.code === "director-adaptation-required")).toBe(true);
    }
});

test("缺产物、过期源、未落盘模型和缺截图都不解除导演台待接入状态", () => {
    const missing = fixture(); missing.imports.clear();
    expect(adapt(missing).issues).toContainEqual({ code: "unsupported-node", detail: "director-console-3d", nodeId: "director" });
    const changes: Array<(data: ReturnType<typeof fixture>) => void> = [
        d => { d.input.sourceComposition = {}; },
        d => { d.input.scene.objects[0].url = undefined; },
        d => { d.input.scene.objects = []; },
        d => { delete d.input.scene.outputFrame; },
        d => { d.input.scene.outputFrame!.aspect = 1; },
        d => { d.input.scene.cameras[0].id = "other"; },
        d => { d.input.screenshots.pop(); },
        d => { d.input.screenshots[0].url = "data:image/png;base64,secret"; },
        d => { d.input.screenshots[0].width = 0; },
        d => { d.input.screenshots.push({ ...d.input.screenshots[0] }); },
        d => { Object.assign(d.node.data.compositionData, { animation: {} }); d.input.sourceComposition = structuredClone(d.node.data.compositionData); },
        d => { Object.assign(d.node.data, { previewImageUrl: "https://example.test/extra.png" }); },
    ];
    for (const change of changes) {
        const data = fixture(); change(data);
        const result = adapt(data);
        expect(result.adoptable).toBe(false);
        expect(result.issues.some(i => i.code === "director-adaptation-required")).toBe(true);
        expect(result.project.previsScenes).toBeUndefined();
        expect(result.project.nodes.some(n => n.id === "director")).toBe(false);
    }
});

test("导演台上下游未适配的制作语义与标识冲突不会当成普通视频引用", () => {
    const incoming = fixture(); incoming.snapshot.edges.push({ id: "in", source: "output", target: "director" });
    expect(adapt(incoming).issues.some(i => i.code === "director-adaptation-required")).toBe(true);
    const generated = fixture(); generated.snapshot.nodes[2].data.action = "image_generate";
    expect(adapt(generated).issues.some(i => i.code === "director-adaptation-required")).toBe(true);
    const collision = fixture(); collision.snapshot.nodes[2].id = "scene:capture:camera:first";
    expect(adapt(collision).issues.some(i => i.code === "director-adaptation-required")).toBe(true);
    const extra = fixture(); extra.imports.set("missing-node", extra.input);
    expect(adapt(extra).issues.some(i => i.code === "director-adaptation-required" && i.nodeId === "missing-node")).toBe(true);
});
