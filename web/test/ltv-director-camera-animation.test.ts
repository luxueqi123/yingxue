import { expect, test } from "bun:test";
import { Group } from "three";
import { planLtvPrevisCameraAnimation } from "../src/lib/canvas/previs/ltv-director-camera-animation";
import { prepareLtvPrevisCameraAnimatedScene, prepareLtvPrevisStaticScene, bindLtvPrevisSceneAssets } from "../src/lib/canvas/previs/ltv-director-static-scene";
import { buildLtvPrevisProjectNode } from "../src/lib/canvas/previs/ltv-director-project";
import { copyProductionCasePreviss } from "../src/lib/canvas/previs/production-case-director";
import { resolvePrevisViewFraming } from "../src/lib/canvas/previs/previs-view-modes";

function fixture() {
    const source = {
        characters: [], props: [], characterGroups: [], emptyObjects: [],
        environment: { skyColor: "#060608", groundVisible: false, groundOpacity: 0.4, groundHeight: 0, sceneScale: 3 },
        cameras: [{ id: "camera", label: "主机位", position: { x: 0, y: 2, z: 0 }, lookAt: { x: 0, y: 2, z: -10 }, lookAtTarget: "", fov: 50, zoom: 1, screenshots: [] }],
        animation: { version: 1, duration: 10, motionPaths: [], characterTracks: [], propTracks: [], groupTracks: [], activeCameraTrackId: "track", cameraTracks: [{
            id: "track", name: "主机位轨道", targetId: "camera", interpolation: "catmullRom", keyframes: [
                { time: 0, position: { x: 0, y: 2, z: 0 }, lookAt: { x: 0, y: 2, z: -10 }, fov: 50 },
                { time: 4, position: { x: 10, y: 2, z: 0 }, lookAt: { x: 0, y: 2, z: -10 }, fov: 50 },
            ], motionPath: { id: "path", name: "原路径", enabled: true, start: 0, end: 4, orientToPath: true,
                points: [{ x: 0, y: 0, z: 0 }, { x: 10, y: 0, z: 0 }],
                bezierPoints: [{ anchor: { x: 0, y: 0, z: 0 }, handleMode: "vertex" }, { anchor: { x: 10, y: 0, z: 0 }, handleMode: "vertex" }],
                offset: { x: 0, y: -1, z: 0 } },
        }] },
    };
    const identity = { id: "scene", title: "动态导演台", now: "2026-10-01T00:00:00Z" };
    return { source, identity };
}

test("an authored empty camera track retains identity, duration and camera framing through native copy", () => {
    const { source, identity } = fixture();
    const track = { id: "empty-track", name: "原空机位轨道", targetId: "camera", interpolation: "linear", keyframes: [] };
    Object.assign(source.animation, { duration: 5, activeCameraTrackId: track.id, cameraTracks: [track] });
    const before = JSON.stringify(source);
    const plan = planLtvPrevisCameraAnimation(source);
    expect(plan.motions.size).toBe(0);
    expect(plan.activeCameraId).toBe("camera");
    const prepared = prepareLtvPrevisCameraAnimatedScene(source, identity, new Map<string, Group>());
    try {
        const camera = prepared.scene.cameras[0];
        expect(camera).toHaveProperty("ltvEmptyCameraTrack", track);
        expect(camera.keyframes).toEqual([]);
        expect(camera.ltvCameraMotion).toBeUndefined();
        expect(prepared.scene.shots[0].duration).toBe(5);
        const initial = resolvePrevisViewFraming({ scene: prepared.scene, mode: "camera", playhead: 0 });
        for (const playhead of [2.5, 5]) expect(resolvePrevisViewFraming({ scene: prepared.scene, mode: "camera", playhead })).toEqual(initial);
        const resources = new Map(prepared.assets.map(asset => [asset.objectId, { url: "/resources/empty-track-ground.glb" }]));
        const saved = JSON.parse(JSON.stringify(bindLtvPrevisSceneAssets(prepared.scene, resources)));
        const copied = copyProductionCasePreviss([saved], [], new Map(), false).previsScenes![0];
        expect(copied.cameras[0]).toHaveProperty("ltvEmptyCameraTrack", track);
        expect(copied.shots[0].duration).toBe(5);
        expect(copied.activeShotId).toBe(copied.shots[0].id);
        expect(copied.cameras[0].id).not.toBe(camera.id);
        const original = { id: "node", type: "director-console-3d", data: { action: "director_console_panorama_input", compositionData: source } };
        const input = { sourceComposition: source, scene: saved, screenshots: [] };
        const layout = { position: { x: 0, y: 0 }, width: 320, height: 180 };
        expect(buildLtvPrevisProjectNode(original, input, layout).scene.cameras[0]).toHaveProperty("ltvEmptyCameraTrack", track);
        const missingTrack = structuredClone(saved);
        delete missingTrack.cameras[0].ltvEmptyCameraTrack;
        expect(() => buildLtvPrevisProjectNode(original, { ...input, scene: missingTrack }, layout)).toThrow();
        const moved = structuredClone(saved);
        moved.cameras[0].transform.position[0] += 1;
        expect(() => buildLtvPrevisProjectNode(original, { ...input, scene: moved }, layout)).toThrow();
        expect(JSON.stringify(source)).toBe(before);
    } finally { prepared.dispose(); }
});

test("empty camera track admission never discards authored paths, unsupported fields or bad references", () => {
    const empty = { id: "empty-track", name: "原空机位轨道", targetId: "camera", interpolation: "linear", keyframes: [] };
    for (const change of [{ targetId: "missing" }, { interpolation: "unsupported" }, { enabled: false }, { motionPath: {} }, { keyframes: [{ time: 0 }] }]) {
        const { source } = fixture();
        Object.assign(source.animation, { activeCameraTrackId: empty.id, cameraTracks: [{ ...empty, ...change }] });
        expect(() => planLtvPrevisCameraAnimation(source)).toThrow();
    }
    const { source } = fixture();
    Object.assign(source.animation, { activeCameraTrackId: empty.id, cameraTracks: [empty, { ...empty, id: "second-track" }] });
    expect(() => planLtvPrevisCameraAnimation(source)).toThrow();
});

test("full camera-only source preparation preserves source authoring fields and duration without changing source", () => {
    const { source, identity } = fixture(), before = JSON.stringify(source);
    const prepared = prepareLtvPrevisCameraAnimatedScene(source, identity, new Map<string, Group>());
    try {
        expect(prepared.scene.shots[0].duration).toBe(10);
        expect(prepared.scene.activeShotId).toBe("scene:shot:camera");
        expect(prepared.scene.cameras[0].ltvCameraMotion?.sourceTrack).toMatchObject({ id: "track", interpolation: "catmullRom", orientToPath: true, pathId: "path" });
        expect(prepared.scene.cameras[0].ltvCameraMotion?.sourceTrack?.keyframes).toHaveLength(2);
        expect(resolvePrevisViewFraming({ scene: prepared.scene, mode: "camera", playhead: 2 })?.position).toEqual([15, 6, 0]);
        expect(JSON.stringify(source)).toBe(before);
        expect(() => prepareLtvPrevisStaticScene(source, identity, new Map())).toThrow("源动画");
    } finally { prepared.dispose(); }
});

test("stable resources, project assembly, copying and JSON reopen retain complete native animation", () => {
    const { source, identity } = fixture(), prepared = prepareLtvPrevisCameraAnimatedScene(source, identity, new Map());
    try {
        const scene = bindLtvPrevisSceneAssets(prepared.scene, new Map(prepared.assets.map(asset => [asset.objectId, { url: `/production-library/${asset.objectId}.glb` }])));
        const node = { id: "director", type: "director-console-3d", data: { action: "director_console_panorama_input", compositionData: source } };
        const imported = { scene, sourceComposition: source, screenshots: [] };
        const result = buildLtvPrevisProjectNode(node, imported, { position: { x: 0, y: 0 }, width: 400, height: 300 });
        const copied = copyProductionCasePreviss([result.scene], result.nodes, new Map(result.nodes.map(item => [item.id, `copy:${item.id}`])), false);
        const reopened = JSON.parse(JSON.stringify(copied.previsScenes![0]));
        expect(resolvePrevisViewFraming({ scene: reopened, mode: "camera", playhead: 8 })?.position).toEqual([30, 6, 0]);
        expect(reopened.cameras[0].ltvCameraMotion.sourceTrack.interpolation).toBe("catmullRom");
        expect(result.nodes[0].metadata?.previsShotId).toBe(scene.activeShotId);
        for (const mutate of [(s: typeof scene) => { delete s.cameras[0].ltvCameraMotion; }, (s: typeof scene) => { s.shots[0].duration = 5; }, (s: typeof scene) => { s.cameras[0].ltvCameraMotion!.path.end = 2; }, (s: typeof scene) => { s.cameras[0].target[0] = 100; }, (s: typeof scene) => { s.cameras[0].fov = 70; }]) {
            const changed = structuredClone(scene); mutate(changed);
            expect(() => buildLtvPrevisProjectNode(node, { ...imported, scene: changed }, { position: { x: 0, y: 0 }, width: 400, height: 300 })).toThrow();
        }
    } finally { prepared.dispose(); }
});

test("node preview retains its own identity, not a fabricated active-camera capture", () => {
    const { source, identity } = fixture(), prepared = prepareLtvPrevisCameraAnimatedScene(source, identity, new Map());
    try {
        const scene = bindLtvPrevisSceneAssets(prepared.scene, new Map(prepared.assets.map(asset => [asset.objectId, { url: `/production-library/${asset.objectId}.glb` }])));
        const node = { id: "director", type: "director-console-3d", data: { action: "director_console_panorama_input", compositionData: source, previewImageUrl: "https://source.test/preview.jpg" } };
        const input = { sourceComposition: source, scene, screenshots: [], preview: { sourceUrl: node.data.previewImageUrl, url: "/production-library/preview.jpg", width: 800, height: 450 } };
        const layout = { position: { x: 0, y: 0 }, width: 400, height: 300 };
        const result = buildLtvPrevisProjectNode(node, input, layout);
        expect(result.nodes[0].metadata?.previsPreviewNodeId).toBe("scene:node-preview");
        expect(result.nodes[1].metadata?.previsShotId).toBeUndefined();
        expect(result.scene.shots[0].previewNodeId).toBeUndefined();
        expect(result.nodes[1].width / result.nodes[1].height).toBe(16 / 9);
        expect(() => buildLtvPrevisProjectNode(node, { ...input, preview: undefined }, layout)).toThrow();
        expect(() => buildLtvPrevisProjectNode(node, { ...input, preview: { ...input.preview, sourceUrl: "other" } }, layout)).toThrow();
        expect(() => buildLtvPrevisProjectNode(node, { ...input, preview: { ...input.preview, url: "data:image/png;base64,x" } }, layout)).toThrow();
    } finally { prepared.dispose(); }
});

test("source empty locator retains identity and world position without inventing geometry", () => {
    const { source, identity } = fixture();
    const composition = { ...source, emptyObjects: [{ id: "locator", label: "空对象1", position: { x: 0, y: 1.2, z: 0 } }] };
    const before = JSON.stringify(composition);
    const prepared = prepareLtvPrevisCameraAnimatedScene(composition, identity, new Map());
    try {
        const empty = prepared.scene.objects.find(object => object.id === "scene:empty:locator")!;
        expect(empty.name).toBe("空对象1");
        expect(empty.transform.position[1]).toBeCloseTo(3.6, 12);
        expect(prepared.assets.find(asset => asset.objectId === empty.id)!.model.children).toHaveLength(0);
        const scene = bindLtvPrevisSceneAssets(prepared.scene, new Map(prepared.assets.map(asset => [asset.objectId, { url: `/production-library/${asset.objectId}.glb` }])));
        const node = { id: "director", type: "director-console-3d", data: { action: "director_console_panorama_input", compositionData: composition } };
        const input = { sourceComposition: composition, scene, screenshots: [] };
        const layout = { position: { x: 0, y: 0 }, width: 400, height: 300 };
        expect(buildLtvPrevisProjectNode(node, input, layout).scene.objects).toHaveLength(2);
        const changed = structuredClone(scene); changed.objects.find(object => object.id === empty.id)!.transform.position[1] = 0;
        expect(() => buildLtvPrevisProjectNode(node, { ...input, scene: changed }, layout)).toThrow();
        const referenced = structuredClone(composition); referenced.cameras[0].lookAtTarget = "locator";
        expect(() => prepareLtvPrevisCameraAnimatedScene(referenced, identity, new Map())).toThrow("空对象机位目标");
        expect(JSON.stringify(composition)).toBe(before);
    } finally { prepared.dispose(); }
});

test("unknown source features and competing clocks never pass the dynamic entry by field stripping", () => {
    for (const modify of [
        (s: any) => { s.animation.propTracks = [{ id: "prop" }]; },
        (s: any) => { s.animation.cameraTracks[0].speedCurve = []; },
        (s: any) => { s.animation.cameraTracks[0].motionPath.bezierPoints[0].timeRatio = 0.5; },
        (s: any) => { s.animation.cameraTracks[0].keyframes[1].fov = 70; },
        (s: any) => { s.animation.cameraTracks[0].keyframes[1].quaternion = [0, 0, 0, 1]; },
        (s: any) => { s.animation.activeCameraTrackId = "missing"; },
        (s: any) => { s.animation.cameraTracks.push(structuredClone(s.animation.cameraTracks[0])); },
        (s: any) => { s.cameras[0].followTargetId = "actor"; },
        (s: any) => { s.animation.cameraTracks[0].keyframes.reverse(); },
    ]) {
        const { source, identity } = fixture(); modify(source);
        expect(() => planLtvPrevisCameraAnimation(source)).toThrow();
        expect(() => prepareLtvPrevisCameraAnimatedScene(source, identity, new Map())).toThrow();
    }
});
